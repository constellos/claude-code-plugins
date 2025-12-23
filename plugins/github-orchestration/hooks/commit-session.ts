/**
 * Auto-commit session work before ending
 *
 * Stop hook that automatically commits any uncommitted changes at session end.
 * Ensures work is saved and provides a clean git state before exiting.
 *
 * This hook:
 * - Checks for unstaged and uncommitted changes
 * - Creates a commit with session metadata
 * - Adds git trailers with session ID and timestamp
 * - Non-blocking: allows session end even if commit fails
 *
 * @module commit-session
 */

import type { StopInput, StopHookOutput } from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Execute a shell command
 *
 * @param command - Command to execute
 * @param cwd - Working directory
 * @returns Command result with success flag and output
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
 * Check if there are uncommitted changes
 *
 * @param cwd - Working directory
 * @returns True if there are uncommitted changes
 */
async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  const result = await execCommand('git status --porcelain', cwd);
  return result.success && result.stdout.length > 0;
}

/**
 * Get current branch name
 *
 * @param cwd - Working directory
 * @returns Branch name or null
 */
async function getCurrentBranch(cwd: string): Promise<string | null> {
  const result = await execCommand('git rev-parse --abbrev-ref HEAD', cwd);
  return result.success ? result.stdout : null;
}

/**
 * Stop hook handler
 *
 * Auto-commits any uncommitted changes at session end.
 *
 * @param input - Stop hook input from Claude Code
 * @returns Hook output with commit status
 *
 * @example
 * ```typescript
 * // This hook is automatically called by Claude Code when session ends
 * ```
 */
async function handler(input: StopInput): Promise<StopHookOutput> {
  const logger = createDebugLogger(input.cwd, 'commit-session', true);

  try {
    await logger.logInput({
      session_id: input.session_id,
    });

    // Check for uncommitted changes
    const hasChanges = await hasUncommittedChanges(input.cwd);

    if (!hasChanges) {
      await logger.logOutput({ skipped: true, reason: 'No uncommitted changes' });
      return {};
    }

    // Get current branch
    const branch = await getCurrentBranch(input.cwd);

    // Stage all changes
    await execCommand('git add -A', input.cwd);

    // Get session timestamp
    const timestamp = new Date().toISOString();

    // Create commit message with session metadata
    const commitMessage = `Session work

Auto-commit at session end to preserve work in progress.

Session-ID: ${input.session_id}
Session-Timestamp: ${timestamp}${branch ? `\nBranch: ${branch}` : ''}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`;

    // Commit changes
    const commitResult = await execCommand(
      `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
      input.cwd
    );

    if (!commitResult.success) {
      await logger.logOutput({
        success: false,
        error: commitResult.stderr,
      });

      return {
        systemMessage: `⚠️ Failed to auto-commit session work: ${commitResult.stderr}`,
      };
    }

    // Get commit SHA
    const shaResult = await execCommand('git rev-parse HEAD', input.cwd);
    const sha = shaResult.success ? shaResult.stdout.substring(0, 7) : 'unknown';

    await logger.logOutput({
      success: true,
      commit_sha: sha,
    });

    return {
      systemMessage: `✅ Auto-committed session work: ${sha}`,
    };
  } catch (error) {
    await logger.logError(error as Error);

    // Non-blocking - allow session end even if commit fails
    return {
      systemMessage: `⚠️ Auto-commit error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
