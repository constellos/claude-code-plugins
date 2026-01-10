/**
 * Stacked PR workflow completion hook
 *
 * SubagentStop hook that completes the stacked PR workflow when a subagent
 * finishes working on an isolated branch. This hook:
 *
 * 1. Checks if the subagent was working on a stacked branch
 * 2. Commits changes on the subagent branch
 * 3. Pushes to remote
 * 4. Checkouts the base branch (reverts local to clean state)
 * 5. Creates a PR with auto-merge enabled
 * 6. Waits for CI (configurable)
 * 7. Waits for merge and pulls changes (configurable)
 *
 * The workflow ensures the main session stays on a clean branch while
 * subagent work is isolated in separate PRs.
 *
 * @module stacked-pr-subagent-stop
 */

import type { SubagentStopInput, SubagentStopHookOutput } from '../shared/types/types.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { getTaskEdits } from '../shared/hooks/utils/task-state.js';
import { awaitCIWithFailFast } from '../shared/hooks/utils/ci-status.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getStackedBranchEntry,
  updateStackedBranchEntry,
  loadSessionConfig,
  checkoutBranch,
  pushBranch,
  stageAndCommit,
  createPRWithAutoMerge,
  waitForPRMerge,
  pullLatest,
  cleanupSubagentBranch,
} from '../shared/hooks/utils/stacked-branches.js';

/** Default timeout for CI waiting (10 minutes) */
const DEFAULT_CI_TIMEOUT = 600000;

interface TaskSubissueEntry {
  prompt: string;
  description: string;
  subagentType: string;
  parentIssueNumber: number;
  subissueNumber: number;
  subissueUrl: string;
  branch: string;
  createdAt: string;
  planTaskId?: string;
  nativeSubissue?: boolean;
}

interface TaskSubissueState {
  [taskId: string]: TaskSubissueEntry;
}

/**
 * Find subissue number for the current branch from task-subissues.json
 *
 * Looks for a subissue that was created for this branch.
 *
 * @param cwd - Current working directory
 * @param branch - Branch name to match
 * @returns Subissue number if found, null otherwise
 */
async function findSubissueForBranch(cwd: string, branch: string): Promise<number | null> {
  const stateFile = path.join(cwd, '.claude', 'logs', 'task-subissues.json');

  try {
    const data = await fs.readFile(stateFile, 'utf-8');
    const state: TaskSubissueState = JSON.parse(data);

    // Find subissue matching this branch
    for (const entry of Object.values(state)) {
      if (entry.branch === branch && entry.subissueNumber) {
        return entry.subissueNumber;
      }
    }
  } catch {
    // State file doesn't exist or is invalid
  }

  return null;
}

/**
 * Format commit message for subagent work
 */
function formatCommitMessage(options: {
  agentType: string;
  prompt: string;
  filesEdited: number;
  filesNew: number;
  filesDeleted: number;
}): string {
  const { agentType, prompt, filesEdited, filesNew, filesDeleted } = options;

  // Create concise title from prompt
  const promptLines = prompt.split('\n').map(l => l.trim()).filter(Boolean);
  let title = promptLines[0] || 'Subagent task completed';

  // Truncate title if too long
  if (title.length > 60) {
    title = title.slice(0, 57) + '...';
  }

  const lines: string[] = [];
  lines.push(`[${agentType}] ${title}`);
  lines.push('');
  lines.push('Auto-generated from stacked PR workflow.');
  lines.push('');
  lines.push(`Files: ${filesNew} new, ${filesEdited} edited, ${filesDeleted} deleted`);

  return lines.join('\n');
}

/**
 * Format PR title for subagent work
 */
function formatPRTitle(agentType: string, prompt: string): string {
  const promptLines = prompt.split('\n').map(l => l.trim()).filter(Boolean);
  let title = promptLines[0] || 'Subagent task';

  if (title.length > 60) {
    title = title.slice(0, 57) + '...';
  }

  return `[${agentType}] ${title}`;
}

/**
 * Format PR body for subagent work
 */
function formatPRBody(options: {
  agentType: string;
  prompt: string;
  baseBranch: string;
  filesNew: string[];
  filesEdited: string[];
  filesDeleted: string[];
  subissueNumber?: number | null;
}): string {
  const { agentType, prompt, baseBranch, filesNew, filesEdited, filesDeleted, subissueNumber } = options;

  const lines: string[] = [];
  lines.push('## Summary');
  lines.push('');
  lines.push(`Auto-generated PR from stacked PR workflow (${agentType} agent).`);
  lines.push('');
  lines.push('### Task');
  lines.push('');
  lines.push('```');
  lines.push(prompt.slice(0, 500) + (prompt.length > 500 ? '...' : ''));
  lines.push('```');
  lines.push('');
  lines.push('### Changes');
  lines.push('');

  if (filesNew.length > 0) {
    lines.push(`**New files (${filesNew.length}):**`);
    for (const f of filesNew.slice(0, 10)) {
      lines.push(`- \`${f}\``);
    }
    if (filesNew.length > 10) {
      lines.push(`- ... and ${filesNew.length - 10} more`);
    }
    lines.push('');
  }

  if (filesEdited.length > 0) {
    lines.push(`**Edited files (${filesEdited.length}):**`);
    for (const f of filesEdited.slice(0, 10)) {
      lines.push(`- \`${f}\``);
    }
    if (filesEdited.length > 10) {
      lines.push(`- ... and ${filesEdited.length - 10} more`);
    }
    lines.push('');
  }

  if (filesDeleted.length > 0) {
    lines.push(`**Deleted files (${filesDeleted.length}):**`);
    for (const f of filesDeleted.slice(0, 10)) {
      lines.push(`- \`${f}\``);
    }
    if (filesDeleted.length > 10) {
      lines.push(`- ... and ${filesDeleted.length - 10} more`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`Base: \`${baseBranch}\``);
  lines.push('');

  // Add Closes #X to auto-close the linked subissue when PR merges
  if (subissueNumber) {
    lines.push(`Closes #${subissueNumber}`);
    lines.push('');
  }

  lines.push('*This PR was auto-generated by the stacked PR workflow.*');

  return lines.join('\n');
}

/**
 * SubagentStop hook handler for stacked PR workflow
 *
 * @param input - SubagentStop hook input from Claude Code
 * @returns Hook output with decision if blocking
 */
async function handler(
  input: SubagentStopInput
): Promise<SubagentStopHookOutput> {
  const logger = createDebugLogger(input.cwd, 'stacked-pr-subagent-stop', true);

  try {
    await logger.logInput({
      agent_id: input.agent_id,
      agent_transcript_path: input.agent_transcript_path,
    });

    // Check if this agent has a stacked branch entry
    const entry = await getStackedBranchEntry(input.cwd, input.agent_id);

    if (!entry || entry.status !== 'active') {
      await logger.logOutput({
        skipped: true,
        reason: 'No active stacked branch for this agent',
      });
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
      // Cleanup and return to base branch
      await cleanupSubagentBranch(input.cwd, entry);
      return {};
    }

    const {
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

    // If no changes, cleanup and return
    if (allModifiedFiles.length === 0) {
      await logger.logOutput({
        skipped: true,
        reason: 'No files modified by agent',
      });
      await cleanupSubagentBranch(input.cwd, entry);
      return {};
    }

    // Stage and commit changes on subagent branch
    const commitMessage = formatCommitMessage({
      agentType: subagentType,
      prompt: agentPrompt,
      filesEdited: agentEditedFiles.length,
      filesNew: agentNewFiles.length,
      filesDeleted: agentDeletedFiles.length,
    });

    const commitResult = await stageAndCommit(input.cwd, allModifiedFiles, commitMessage);

    if (!commitResult.success) {
      await logger.logOutput({
        success: false,
        stage: 'commit',
        error: commitResult.error,
      });
      await updateStackedBranchEntry(input.cwd, input.agent_id, {
        status: 'failed',
        error: commitResult.error,
      });
      // Still checkout base branch to keep main clean
      await checkoutBranch(input.cwd, entry.baseBranch);
      return {};
    }

    // Update state with commit info
    await updateStackedBranchEntry(input.cwd, input.agent_id, {
      commitSha: commitResult.commitSha || null,
      modifiedFiles: allModifiedFiles,
    });

    // Push branch to remote
    const pushResult = await pushBranch(input.cwd, entry.branchName);

    if (!pushResult.success) {
      await logger.logOutput({
        success: false,
        stage: 'push',
        error: pushResult.error,
      });
      await updateStackedBranchEntry(input.cwd, input.agent_id, {
        status: 'failed',
        error: pushResult.error,
      });
      // Still checkout base branch
      await checkoutBranch(input.cwd, entry.baseBranch);
      return {};
    }

    // CRITICAL: Checkout base branch BEFORE creating PR
    // This keeps the main session on a clean branch
    const checkoutResult = await checkoutBranch(input.cwd, entry.baseBranch);

    if (!checkoutResult.success) {
      await logger.logOutput({
        success: false,
        stage: 'checkout-base',
        error: checkoutResult.error,
      });
      // This is a problem - we're stuck on the subagent branch
      return {
        decision: 'block',
        reason: `Failed to return to base branch: ${checkoutResult.error}`,
      };
    }

    // Look up any subissue that was created for this branch
    // This allows the PR to auto-close the subissue when merged
    const subissueNumber = await findSubissueForBranch(input.cwd, entry.branchName);

    // Create PR with auto-merge
    const prTitle = formatPRTitle(subagentType, agentPrompt);
    const prBody = formatPRBody({
      agentType: subagentType,
      prompt: agentPrompt,
      baseBranch: entry.baseBranch,
      filesNew: agentNewFiles,
      filesEdited: agentEditedFiles,
      filesDeleted: agentDeletedFiles,
      subissueNumber,
    });

    const prResult = await createPRWithAutoMerge(input.cwd, {
      head: entry.branchName,
      base: entry.baseBranch,
      title: prTitle,
      body: prBody,
    });

    if (!prResult.success) {
      await logger.logOutput({
        success: false,
        stage: 'create-pr',
        error: prResult.error,
      });
      await updateStackedBranchEntry(input.cwd, input.agent_id, {
        status: 'failed',
        error: prResult.error,
      });
      return {};
    }

    // Update state with PR info
    await updateStackedBranchEntry(input.cwd, input.agent_id, {
      prNumber: prResult.prNumber || null,
      prUrl: prResult.prUrl || null,
      status: 'ci-pending',
    });

    // Get configuration for CI waiting
    const config = await loadSessionConfig(input.cwd);
    const waitForCI = config?.stackedPrConfig?.waitForCI ?? true;
    const waitForMerge = config?.stackedPrConfig?.waitForMerge ?? true;

    let ciPassed = false;

    // Wait for CI if configured
    if (waitForCI && prResult.prNumber) {
      const ciResult = await awaitCIWithFailFast(
        { prNumber: prResult.prNumber, timeout: DEFAULT_CI_TIMEOUT },
        input.cwd
      );

      if (!ciResult.success) {
        await logger.logOutput({
          success: false,
          stage: 'ci',
          error: ciResult.blockReason,
          prNumber: prResult.prNumber,
          prUrl: prResult.prUrl,
        });
        await updateStackedBranchEntry(input.cwd, input.agent_id, {
          status: 'failed',
          error: ciResult.blockReason,
        });
        // Don't block - CI failure is logged, user can fix manually
        return {
          systemMessage: `⚠️ CI failed for PR #${prResult.prNumber}: ${ciResult.blockReason}\nPR: ${prResult.prUrl}`,
        };
      }

      ciPassed = true;
    }

    // Wait for merge if CI passed and configured
    if (waitForMerge && ciPassed && prResult.prNumber) {
      const mergeResult = await waitForPRMerge(input.cwd, prResult.prNumber);

      if (mergeResult.success) {
        // Pull merged changes
        await pullLatest(input.cwd, entry.baseBranch);

        await updateStackedBranchEntry(input.cwd, input.agent_id, {
          status: 'merged',
        });

        await logger.logOutput({
          success: true,
          stage: 'merged',
          prNumber: prResult.prNumber,
          prUrl: prResult.prUrl,
          filesModified: allModifiedFiles.length,
        });

        return {
          systemMessage: `✅ Subagent PR #${prResult.prNumber} merged and changes pulled.\nPR: ${prResult.prUrl}`,
        };
      } else {
        await logger.logOutput({
          success: false,
          stage: 'merge-wait',
          error: mergeResult.error,
          prNumber: prResult.prNumber,
        });
        // Don't block - merge might take longer
      }
    }

    // Success - PR created (possibly still pending merge)
    await logger.logOutput({
      success: true,
      stage: 'pr-created',
      prNumber: prResult.prNumber,
      prUrl: prResult.prUrl,
      filesModified: allModifiedFiles.length,
      ciPassed,
      waitingForMerge: waitForMerge && ciPassed,
    });

    return {
      systemMessage: `🔀 Created PR #${prResult.prNumber} for subagent work.\nPR: ${prResult.prUrl}`,
    };
  } catch (error) {
    await logger.logError(error as Error);

    // Try to return to base branch on error
    try {
      const entry = await getStackedBranchEntry(input.cwd, input.agent_id);
      if (entry) {
        await checkoutBranch(input.cwd, entry.baseBranch);
        await updateStackedBranchEntry(input.cwd, input.agent_id, {
          status: 'failed',
          error: String(error),
        });
      }
    } catch {
      // Ignore cleanup errors
    }

    // Don't block on errors
    return {};
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
