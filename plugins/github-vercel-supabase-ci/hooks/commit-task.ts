/**
 * SubagentStop Hook - Auto-commit agent work with task context
 *
 * This hook fires when a subagent completes and automatically creates a commit
 * with only the files edited by that specific agent. It includes the task prompt
 * and metadata as git trailers.
 *
 * Requires Claude Code 2.0.42+ for agent_transcript_path field.
 * See: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
 *
 * @module hooks/commit-task
 */

import type { SubagentStopInput, SubagentStopHookOutput } from '../../../shared/types/types.js';
import { createDebugLogger } from '../../../shared/hooks/utils/debug.js';
import { runHook } from '../../../shared/hooks/utils/io.js';
import { getTaskEdits } from '../../../shared/hooks/utils/task-state.js';
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
 * Format commit message with task prompt and git trailers
 */
function formatCommitMessage(options: {
  agentType: string;
  agentId: string;
  prompt: string;
  filesEdited: number;
  filesNew: number;
  filesDeleted: number;
}): string {
  const { agentType, agentId, prompt, filesEdited, filesNew, filesDeleted } = options;

  // Create concise title from prompt (first line or first 50 chars)
  const promptLines = prompt.split('\n').map(l => l.trim()).filter(Boolean);
  let title = promptLines[0] || 'Agent task completed';

  // Truncate title if too long (72 chars is git convention)
  if (title.length > 72) {
    title = title.slice(0, 69) + '...';
  }

  // Build commit message with title, body, and git trailers
  const lines: string[] = [];

  // Title with agent type prefix
  lines.push(`[${agentType}] ${title}`);
  lines.push('');

  // Body: Full prompt (if longer than title)
  if (promptLines.length > 1 || prompt.length > 100) {
    lines.push('Task prompt:');
    lines.push(prompt);
    lines.push('');
  }

  // Git trailers for metadata
  lines.push(`Agent-Type: ${agentType}`);
  lines.push(`Agent-ID: ${agentId}`);
  lines.push(`Files-Edited: ${filesEdited}`);
  lines.push(`Files-New: ${filesNew}`);
  lines.push(`Files-Deleted: ${filesDeleted}`);

  return lines.join('\n');
}

/**
 * SubagentStop hook handler for auto-committing agent work
 *
 * Analyzes the agent's transcript, extracts file edits and task prompt,
 * and creates a commit with only the files edited by this specific agent.
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

    // Get task edits (file operations and prompt)
    let taskEdits;
    try {
      taskEdits = await getTaskEdits(input.agent_transcript_path);
    } catch (error) {
      await logger.logOutput({
        skipped: true,
        reason: 'Could not analyze task edits',
        error: String(error),
      });
      return {};
    }

    const {
      agentSessionId,
      subagentType,
      agentPrompt,
      agentNewFiles,
      agentEditedFiles,
      agentDeletedFiles,
    } = taskEdits;

    // Combine all modified files
    const allModifiedFiles = [
      ...agentNewFiles,
      ...agentEditedFiles,
      ...agentDeletedFiles,
    ];

    if (allModifiedFiles.length === 0) {
      await logger.logOutput({ skipped: true, reason: 'No files modified by agent' });
      return {};
    }

    // Stage only the files modified by this agent
    for (const file of allModifiedFiles) {
      // For deleted files, use git rm; for others, use git add
      const isDeleted = agentDeletedFiles.includes(file);
      const cmd = isDeleted ? `git rm "${file}"` : `git add "${file}"`;

      const addResult = await gitExec(cmd, input.cwd);
      if (!addResult.success) {
        // Log warning but continue with other files
        await logger.logOutput({
          warning: `Could not stage file: ${file}`,
          error: addResult.stderr,
        });
      }
    }

    // Check if anything was actually staged
    const statusResult = await gitExec('git diff --cached --name-only', input.cwd);
    if (!statusResult.stdout) {
      await logger.logOutput({ skipped: true, reason: 'No changes staged for commit' });
      return {};
    }

    // Format commit message with trailers
    const commitMessage = formatCommitMessage({
      agentType: subagentType,
      agentId: agentSessionId,
      prompt: agentPrompt,
      filesEdited: agentEditedFiles.length,
      filesNew: agentNewFiles.length,
      filesDeleted: agentDeletedFiles.length,
    });

    // Create commit with properly escaped message
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
      agent_type: subagentType,
      files_modified: allModifiedFiles.length,
      files_edited: agentEditedFiles.length,
      files_new: agentNewFiles.length,
      files_deleted: agentDeletedFiles.length,
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
