/**
 * SessionStop Hook - Check branch status for conflicts and sync
 *
 * This hook fires when a Claude Code session ends and checks:
 * 1. If the current branch is up to date with the remote
 * 2. If there are any merge conflicts in the working directory
 *
 * Returns an error if issues are detected, requiring manual resolution.
 *
 * @module hooks/check-branch-status
 */

import type { SessionStopInput, SessionStopHookOutput } from '../../../shared/types/types.js';
import { createDebugLogger } from '../../../shared/hooks/utils/debug.js';
import { runHook } from '../../../shared/hooks/utils/io.js';
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
 * Check if there are merge conflicts in the working directory
 */
async function checkMergeConflicts(cwd: string): Promise<{
  hasConflicts: boolean;
  conflictedFiles: string[];
}> {
  // Check for files with merge conflict markers
  const statusResult = await gitExec('git diff --check', cwd);

  // Also check git status for unmerged paths
  const unmergedResult = await gitExec('git ls-files --unmerged', cwd);
  const hasUnmerged = unmergedResult.stdout.length > 0;

  // Get list of conflicted files
  const conflictFilesResult = await gitExec('git diff --name-only --diff-filter=U', cwd);
  const conflictedFiles = conflictFilesResult.stdout
    ? conflictFilesResult.stdout.split('\n').filter(Boolean)
    : [];

  return {
    hasConflicts: hasUnmerged || conflictedFiles.length > 0,
    conflictedFiles,
  };
}

/**
 * Check if branch is up to date with remote
 */
async function checkBranchSync(cwd: string): Promise<{
  isSynced: boolean;
  behindBy: number;
  aheadBy: number;
  remoteBranch: string;
}> {
  // Get current branch
  const branchResult = await gitExec('git branch --show-current', cwd);
  const currentBranch = branchResult.stdout;

  if (!currentBranch) {
    return {
      isSynced: true,
      behindBy: 0,
      aheadBy: 0,
      remoteBranch: '',
    };
  }

  // Fetch latest from remote
  await gitExec('git fetch', cwd);

  // Get tracking branch
  const trackingResult = await gitExec(
    `git rev-parse --abbrev-ref ${currentBranch}@{upstream}`,
    cwd
  );

  if (!trackingResult.success) {
    // No tracking branch set up
    return {
      isSynced: true,
      behindBy: 0,
      aheadBy: 0,
      remoteBranch: '',
    };
  }

  const remoteBranch = trackingResult.stdout;

  // Check how many commits behind/ahead we are
  const revListResult = await gitExec(
    `git rev-list --left-right --count ${currentBranch}...${remoteBranch}`,
    cwd
  );

  if (!revListResult.success) {
    return {
      isSynced: true,
      behindBy: 0,
      aheadBy: 0,
      remoteBranch,
    };
  }

  // Parse output: "ahead\tbehind"
  const [aheadStr, behindStr] = revListResult.stdout.split('\t');
  const aheadBy = parseInt(aheadStr || '0', 10);
  const behindBy = parseInt(behindStr || '0', 10);

  return {
    isSynced: behindBy === 0,
    behindBy,
    aheadBy,
    remoteBranch,
  };
}

/**
 * SessionStop hook handler
 *
 * Checks branch status and merge conflicts at session end.
 * Returns blocking error if issues are found.
 *
 * @param input - SessionStop hook input from Claude Code
 * @returns Hook output with error if issues detected
 */
async function handler(input: SessionStopInput): Promise<SessionStopHookOutput> {
  const logger = createDebugLogger(input.cwd, 'check-branch-status', true);

  try {
    await logger.logInput({ session_id: input.session_id });

    // Check if we're in a git repository
    const gitCheck = await gitExec('git rev-parse --is-inside-work-tree', input.cwd);
    if (!gitCheck.success) {
      await logger.logOutput({ skipped: true, reason: 'Not a git repository' });
      return {};
    }

    const issues: string[] = [];

    // Check for merge conflicts
    const conflictCheck = await checkMergeConflicts(input.cwd);
    if (conflictCheck.hasConflicts) {
      issues.push(
        `⚠️  Merge conflicts detected in ${conflictCheck.conflictedFiles.length} file(s):\n` +
        conflictCheck.conflictedFiles.map(f => `  - ${f}`).join('\n')
      );
    }

    // Check branch sync status
    const syncCheck = await checkBranchSync(input.cwd);
    if (!syncCheck.isSynced && syncCheck.remoteBranch) {
      issues.push(
        `⚠️  Branch is ${syncCheck.behindBy} commit(s) behind ${syncCheck.remoteBranch}\n` +
        `  (You are ${syncCheck.aheadBy} commit(s) ahead)`
      );
    }

    await logger.logOutput({
      has_conflicts: conflictCheck.hasConflicts,
      conflicted_files: conflictCheck.conflictedFiles,
      is_synced: syncCheck.isSynced,
      behind_by: syncCheck.behindBy,
      ahead_by: syncCheck.aheadBy,
      remote_branch: syncCheck.remoteBranch,
    });

    // If there are issues, return blocking error
    if (issues.length > 0) {
      const errorMessage = [
        '🚨 Branch Status Issues Detected:',
        '',
        ...issues,
        '',
        'Please resolve these issues before ending the session:',
        '  - Pull latest changes: git pull',
        '  - Resolve conflicts: git mergetool or manually edit conflicted files',
      ].join('\n');

      return {
        systemMessage: errorMessage,
      };
    }

    // All checks passed
    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStop',
        additionalContext: '✓ Branch is up to date with no conflicts',
      },
    };
  } catch (error) {
    await logger.logError(error as Error);

    return {
      systemMessage: `Branch status check error: ${error}`,
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
