/**
 * PostToolUse Hook - Trigger CI review agent on commits
 *
 * This hook fires after git commit commands and provides guidance to Claude
 * to invoke a code review agent. For commits from subagents, the agent prompt
 * is used as context. For manual commits, the plan/issue content is used.
 *
 * @module hooks/review-commit
 */

import type { PostToolUseInputTyped, PostToolUseHookOutput } from '../../../shared/types/types.js';
import { createDebugLogger } from '../../../shared/hooks/utils/debug.js';
import { runHook } from '../../../shared/hooks/utils/io.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execAsync = promisify(exec);

interface PlanIssueState {
  [sessionId: string]: {
    planPath: string;
    issueNumber: number;
    issueUrl: string;
    branch: string;
    createdAt: string;
    lastUpdated: string;
  };
}

/**
 * Execute a shell command
 */
async function execCommand(
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
 * Check if command is a git commit
 */
function isGitCommit(command: string): boolean {
  return /git\s+commit/.test(command);
}

/**
 * Get the most recent commit message
 */
async function getLatestCommitMessage(cwd: string): Promise<string> {
  const result = await execCommand('git log -1 --format=%B', cwd);
  return result.success ? result.stdout : '';
}

/**
 * Extract git trailers from commit message
 */
function extractGitTrailers(commitMessage: string): Record<string, string> {
  const trailers: Record<string, string> = {};
  const lines = commitMessage.split('\n');

  // Git trailers are at the end of the commit message
  // Format: "Key: Value"
  let inTrailers = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) {
      if (inTrailers) break; // Empty line before trailers means we're done
      continue;
    }

    const match = line.match(/^([A-Za-z-]+):\s*(.+)$/);
    if (match) {
      trailers[match[1]] = match[2];
      inTrailers = true;
    } else if (inTrailers) {
      break; // Non-trailer line, stop parsing
    }
  }

  return trailers;
}

/**
 * Load plan issue state
 */
async function loadPlanIssueState(cwd: string): Promise<PlanIssueState> {
  const stateFile = path.join(cwd, '.claude', 'logs', 'plan-issues.json');

  try {
    const data = await fs.readFile(stateFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * Get plan content for current session
 */
async function getPlanContent(cwd: string, sessionId: string): Promise<string | null> {
  const state = await loadPlanIssueState(cwd);
  const planInfo = state[sessionId];

  if (!planInfo?.planPath) {
    return null;
  }

  try {
    const content = await fs.readFile(planInfo.planPath, 'utf-8');
    return content;
  } catch {
    return null;
  }
}

/**
 * Get issue content from GitHub
 */
async function getIssueContent(cwd: string, issueNumber: number): Promise<string | null> {
  try {
    const result = await execCommand(`gh issue view ${issueNumber} --json title,body --jq '.title + "\\n\\n" + .body'`, cwd);
    return result.success ? result.stdout : null;
  } catch {
    return null;
  }
}

/**
 * PostToolUse hook handler for commit review
 *
 * Detects git commit commands and provides guidance to invoke a review agent.
 *
 * @param input - PostToolUse hook input from Claude Code
 * @returns Hook output with review agent guidance
 */
async function handler(input: PostToolUseInputTyped): Promise<PostToolUseHookOutput> {
  const logger = createDebugLogger(input.cwd, 'review-commit', true);

  try {
    // Only process Bash tool calls
    if (input.tool_name !== 'Bash') {
      return {};
    }

    // Type narrowing: at this point, input is Bash
    const command = (input as Extract<PostToolUseInputTyped, { tool_name: 'Bash' }>).tool_input.command;

    // Only process git commit commands
    if (!isGitCommit(command)) {
      return {};
    }

    await logger.logInput({
      session_id: input.session_id,
      command,
    });

    // Check if we're in a git repository
    const gitCheck = await execCommand('git rev-parse --is-inside-work-tree', input.cwd);
    if (!gitCheck.success) {
      await logger.logOutput({ skipped: true, reason: 'Not a git repository' });
      return {};
    }

    // Get the commit message
    const commitMessage = await getLatestCommitMessage(input.cwd);
    if (!commitMessage) {
      await logger.logOutput({ skipped: true, reason: 'No commit found' });
      return {};
    }

    // Extract git trailers to determine if this was a subagent commit
    const trailers = extractGitTrailers(commitMessage);
    const isSubagentCommit = 'Agent-Type' in trailers;

    await logger.logOutput({
      is_subagent_commit: isSubagentCommit,
      trailers,
    });

    // For subagent commits, the prompt is already in the commit message
    // For manual commits, try to get plan/issue content
    let reviewContext = '';

    if (isSubagentCommit) {
      // Extract prompt from commit message (before trailers)
      const promptMatch = commitMessage.match(/Task prompt:\n([\s\S]+?)\n\nAgent-Type:/);
      if (promptMatch) {
        reviewContext = promptMatch[1].trim();
      }
    } else {
      // Try to get plan content
      const planContent = await getPlanContent(input.cwd, input.session_id);
      if (planContent) {
        reviewContext = `Plan content:\n\n${planContent}`;
      } else {
        // Try to get issue content from state
        const state = await loadPlanIssueState(input.cwd);
        const planInfo = state[input.session_id];
        if (planInfo?.issueNumber) {
          const issueContent = await getIssueContent(input.cwd, planInfo.issueNumber);
          if (issueContent) {
            reviewContext = `GitHub issue #${planInfo.issueNumber}:\n\n${issueContent}`;
          }
        }
      }
    }

    // Build review guidance
    const guidance = reviewContext
      ? `🔍 **Commit Created - Review Recommended**

A commit was just created. Consider running a code review to ensure quality.

**Commit context:**
${reviewContext}

**Recommended action:**
Use the Task tool to invoke a code review agent:
\`\`\`
Task: Review the latest commit changes against the requirements above
Agent: code-reviewer (or general-purpose)
\`\`\``
      : `🔍 **Commit Created - Review Recommended**

A commit was just created. Consider running a code review to ensure quality.

**Recommended action:**
Use the Task tool to invoke a code review agent to check the latest commit.`;

    await logger.logOutput({
      has_context: reviewContext.length > 0,
      context_length: reviewContext.length,
    });

    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: guidance,
      },
    };
  } catch (error) {
    await logger.logError(error as Error);
    // Non-blocking - just skip review guidance on error
    return {};
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
