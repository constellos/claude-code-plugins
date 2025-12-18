/**
 * SubagentStop Hook - Auto-commit agent work
 *
 * This hook fires when a subagent completes and automatically creates a commit
 * using the agent's final message as the commit message.
 *
 * Requires Claude Code 2.0.42+ for agent_transcript_path field.
 * See: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
 *
 * @module hooks/commit-task
 */

import type { SubagentStopInput, SubagentStopHookOutput } from '../../../shared/types/types.js';
import { createDebugLogger } from '../../../shared/hooks/utils/debug.js';
import { runHook } from '../../../shared/hooks/utils/io.js';
import { parseTranscript, type AssistantMessage, type TextContent, type Message } from '../../../shared/hooks/utils/transcripts.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Execute a git command and return the result
 */
async function gitExec(
  command: string,
  cwd: string
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd, timeout: 30000 });
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      success: false,
      stdout: err.stdout?.trim() || '',
      stderr: err.stderr?.trim() || err.message || '',
    };
  }
}

/**
 * Extract the final text message from agent transcript
 */
function extractFinalMessage(messages: Message[]): string | null {
  // Find the last assistant message with text content
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type === 'assistant') {
      const assistantMsg = msg as AssistantMessage;
      const content = assistantMsg.message?.content;
      if (Array.isArray(content)) {
        // Find text content in the message
        for (const item of content) {
          if (item.type === 'text') {
            const textContent = item as TextContent;
            if (textContent.text && textContent.text.trim()) {
              return textContent.text.trim();
            }
          }
        }
      }
    }
  }
  return null;
}

/**
 * Clean and format a commit message from agent output
 * Extracts the first meaningful line/paragraph for the commit title
 */
function formatCommitMessage(agentMessage: string, agentType: string): string {
  // Remove common prefixes
  const message = agentMessage
    .replace(/^(I've |I have |I |Done[.!]? |Completed[.!]? |Finished[.!]? )/i, '')
    .trim();

  // Split into lines
  const lines = message.split('\n').map((l) => l.trim()).filter(Boolean);

  if (lines.length === 0) {
    return `[${agentType}] Agent task completed`;
  }

  // Use the first line as the title
  let title = lines[0];

  // Truncate if too long (50 chars is git convention for title)
  if (title.length > 72) {
    title = title.slice(0, 69) + '...';
  }

  // If there are more lines, add them as body
  if (lines.length > 1) {
    const body = lines.slice(1).join('\n');
    // Truncate body if too long
    const truncatedBody = body.length > 500 ? body.slice(0, 497) + '...' : body;
    return `[${agentType}] ${title}\n\n${truncatedBody}`;
  }

  return `[${agentType}] ${title}`;
}

/**
 * SubagentStop hook handler for auto-committing agent work
 *
 * Reads the agent's transcript, extracts the final message, and creates
 * a commit with that message if there are staged or unstaged changes.
 *
 * @param input - SubagentStop hook input from Claude Code
 * @returns Hook output (empty on success, blocking on critical error)
 */
async function handler(
  input: SubagentStopInput
): Promise<SubagentStopHookOutput> {
  const logger = createDebugLogger(input.cwd, 'commit-task', true);

  try {
    await logger.logInput({
      agent_id: input.agent_id,
      agent_transcript_path: input.agent_transcript_path,
    });

    // Check if we're in a git repository
    const gitCheck = await gitExec('git rev-parse --is-inside-work-tree', input.cwd);
    if (!gitCheck.success) {
      await logger.logOutput({ skipped: true, reason: 'Not a git repository' });
      return {};
    }

    // Check for changes to commit
    const statusResult = await gitExec('git status --porcelain', input.cwd);
    if (!statusResult.stdout) {
      await logger.logOutput({ skipped: true, reason: 'No changes to commit' });
      return {};
    }

    // Parse agent transcript to get final message
    let agentType = 'agent';
    let finalMessage: string | null = null;

    try {
      const transcript = await parseTranscript(input.agent_transcript_path);
      agentType = transcript.agentId ? `agent-${transcript.agentId.slice(0, 8)}` : 'agent';

      // Try to determine agent type from parent Task call
      const firstMsg = transcript.messages[0];
      if (firstMsg?.slug) {
        agentType = firstMsg.slug;
      }

      finalMessage = extractFinalMessage(transcript.messages);
    } catch (parseError) {
      await logger.logOutput({
        warning: 'Could not parse agent transcript',
        error: String(parseError),
      });
    }

    // Format commit message
    const commitMessage = finalMessage
      ? formatCommitMessage(finalMessage, agentType)
      : `[${agentType}] Agent task completed`;

    // Stage all changes
    const addResult = await gitExec('git add -A', input.cwd);
    if (!addResult.success) {
      await logger.logOutput({
        success: false,
        stage: 'add',
        error: addResult.stderr,
      });
      return {};
    }

    // Create commit
    // Use heredoc-style to handle multiline commit messages safely
    const escapedMessage = commitMessage.replace(/'/g, "'\\''");
    const commitResult = await gitExec(`git commit -m '${escapedMessage}'`, input.cwd);

    if (!commitResult.success) {
      // Check if it's just "nothing to commit"
      if (commitResult.stdout.includes('nothing to commit') ||
          commitResult.stderr.includes('nothing to commit')) {
        await logger.logOutput({ skipped: true, reason: 'Nothing to commit after staging' });
        return {};
      }

      await logger.logOutput({
        success: false,
        stage: 'commit',
        error: commitResult.stderr,
      });
      return {};
    }

    // Get the commit hash
    const hashResult = await gitExec('git rev-parse --short HEAD', input.cwd);
    const commitHash = hashResult.stdout || 'unknown';

    await logger.logOutput({
      success: true,
      commit_hash: commitHash,
      commit_message: commitMessage.split('\n')[0], // Just the title
      files_changed: statusResult.stdout.split('\n').length,
    });

    return {};
  } catch (error) {
    await logger.logError(error as Error);
    // Don't block on commit errors - just log and continue
    return {};
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
