/**
 * SessionStart Hook - Pull latest main branch
 *
 * This hook fires at the start of each Claude Code session and automatically
 * fetches and merges the latest changes from the main branch to keep the
 * working branch up to date.
 *
 * @module hooks/pull-latest-main
 */

import type { SessionStartInput, SessionStartHookOutput } from '../../../shared/lib/types.js';
import { createDebugLogger } from '../../../shared/lib/debug.js';
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
    const { stdout, stderr } = await execAsync(command, { cwd, timeout: 60000 });
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
 * SessionStart hook handler
 *
 * Fetches origin and merges main branch into the current branch.
 * Provides context about the sync status to Claude.
 *
 * @param input - SessionStart hook input from Claude Code
 * @returns Hook output with sync status as additional context
 */
export default async function (
  input: SessionStartInput
): Promise<SessionStartHookOutput> {
  const logger = createDebugLogger(input.cwd, 'pull-latest-main', true);

  try {
    await logger.logInput({ source: input.source, session_id: input.session_id });

    // Check if we're in a git repository
    const gitCheck = await gitExec('git rev-parse --is-inside-work-tree', input.cwd);
    if (!gitCheck.success) {
      await logger.logOutput({ skipped: true, reason: 'Not a git repository' });
      return {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: 'Git sync skipped: Not in a git repository.',
        },
      };
    }

    // Get current branch name
    const branchResult = await gitExec('git branch --show-current', input.cwd);
    const currentBranch = branchResult.stdout || 'unknown';

    // Fetch latest from origin
    const fetchResult = await gitExec('git fetch origin', input.cwd);
    if (!fetchResult.success) {
      await logger.logOutput({
        success: false,
        stage: 'fetch',
        error: fetchResult.stderr,
      });
      return {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: `Git fetch failed: ${fetchResult.stderr}`,
        },
      };
    }

    // Check if main branch exists on origin
    const mainCheck = await gitExec('git rev-parse --verify origin/main', input.cwd);
    if (!mainCheck.success) {
      // Try master as fallback
      const masterCheck = await gitExec('git rev-parse --verify origin/master', input.cwd);
      if (!masterCheck.success) {
        await logger.logOutput({
          skipped: true,
          reason: 'No main or master branch found on origin',
        });
        return {
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: 'Git sync skipped: No main/master branch found on origin.',
          },
        };
      }
    }

    const mainBranch = mainCheck.success ? 'origin/main' : 'origin/master';

    // Check if there are uncommitted changes
    const statusResult = await gitExec('git status --porcelain', input.cwd);
    const hasUncommittedChanges = statusResult.stdout.length > 0;

    // Merge main into current branch
    const mergeResult = await gitExec(`git merge ${mainBranch} --no-edit`, input.cwd);

    if (!mergeResult.success) {
      // Check if it's a merge conflict
      if (mergeResult.stderr.includes('CONFLICT') || mergeResult.stdout.includes('CONFLICT')) {
        // Abort the merge to leave the repo in a clean state
        await gitExec('git merge --abort', input.cwd);
        await logger.logOutput({
          success: false,
          stage: 'merge',
          error: 'Merge conflict detected, merge aborted',
        });
        return {
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: `Git merge conflict detected when merging ${mainBranch} into ${currentBranch}. Merge was aborted. Please resolve manually.`,
          },
        };
      }

      await logger.logOutput({
        success: false,
        stage: 'merge',
        error: mergeResult.stderr,
      });
      return {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: `Git merge failed: ${mergeResult.stderr}`,
        },
      };
    }

    // Check if merge brought in new commits
    const mergeOutput = mergeResult.stdout;
    const alreadyUpToDate = mergeOutput.includes('Already up to date');

    await logger.logOutput({
      success: true,
      current_branch: currentBranch,
      main_branch: mainBranch,
      already_up_to_date: alreadyUpToDate,
      had_uncommitted_changes: hasUncommittedChanges,
    });

    if (alreadyUpToDate) {
      return {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: `Branch "${currentBranch}" is already up to date with ${mainBranch}.`,
        },
      };
    }

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `Successfully merged ${mainBranch} into "${currentBranch}". ${hasUncommittedChanges ? 'Note: There were uncommitted changes in the working directory.' : ''}`,
      },
    };
  } catch (error) {
    await logger.logError(error as Error);

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `Git sync error: ${error}`,
      },
    };
  }
}
