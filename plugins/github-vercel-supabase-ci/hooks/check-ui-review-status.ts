/**
 * UI review status check hook
 *
 * SubagentStop hook that checks if the subagent's commit has failing UI review checks.
 * Blocks subagent completion if critical UI issues are found in the ui-review workflow.
 *
 * @module check-ui-review-status
 */

import type { SubagentStopInput, SubagentStopHookOutput } from '../../../shared/types/types.js';
import { runHook } from '../../../shared/hooks/utils/io.js';
import { createDebugLogger } from '../../../shared/hooks/utils/debug.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * GitHub workflow run from gh CLI
 */
interface GitHubWorkflowRun {
  name: string;
  status: string;
  conclusion: string;
}

/**
 * Check if subagent made a commit
 *
 * @param agentId - Agent ID from SubagentStop input
 * @param cwd - Current working directory
 * @returns Promise resolving to commit SHA if agent made a commit, null otherwise
 */
async function getAgentCommitSha(agentId: string, cwd: string): Promise<string | null> {
  try {
    // Check recent commits for Agent-ID trailer
    const { stdout } = await execAsync(
      `git log -10 --format="%H %B" --grep="Agent-ID: ${agentId}"`,
      { cwd, timeout: 10000 }
    );

    if (!stdout.trim()) {
      return null;
    }

    // Extract SHA from first line
    const match = stdout.match(/^([a-f0-9]{40})/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Check UI review workflow status for a commit
 *
 * @param commitSha - Commit SHA to check
 * @param cwd - Current working directory
 * @returns Promise resolving to { status: 'success' | 'failure' | 'pending' | 'not_found', message?: string }
 */
async function checkUiReviewStatus(
  commitSha: string,
  cwd: string
): Promise<{ status: string; message?: string }> {
  try {
    // Get workflow runs for this commit
    const { stdout } = await execAsync(
      `gh run list --commit ${commitSha} --json conclusion,name,status`,
      { cwd, timeout: 30000 }
    );

    const runs = JSON.parse(stdout) as GitHubWorkflowRun[];

    // Find UI Review workflow
    const uiReviewRun = runs.find((run) => run.name === 'UI Review');

    if (!uiReviewRun) {
      return { status: 'not_found' };
    }

    // Check status
    if (uiReviewRun.status === 'completed') {
      if (uiReviewRun.conclusion === 'success') {
        return { status: 'success', message: 'UI review passed' };
      } else if (uiReviewRun.conclusion === 'failure') {
        return {
          status: 'failure',
          message: 'UI review failed - critical issues found',
        };
      } else {
        return {
          status: 'failure',
          message: `UI review ${uiReviewRun.conclusion}`,
        };
      }
    } else {
      return { status: 'pending', message: 'UI review in progress' };
    }
  } catch (error) {
    const err = error as { message?: string };
    return {
      status: 'not_found',
      message: `Failed to check UI review status: ${err.message}`,
    };
  }
}

/**
 * SubagentStop hook handler for UI review status check
 *
 * Checks if the subagent's commit has failing UI review checks and blocks
 * if critical issues are found.
 *
 * @param input - SubagentStop hook input from Claude Code
 * @returns Hook output with blocking decision if UI review failed
 */
async function handler(input: SubagentStopInput): Promise<SubagentStopHookOutput> {
  const logger = createDebugLogger(input.cwd, 'check-ui-review-status', true);

  try {
    await logger.logInput({
      agent_id: input.agent_id,
    });

    // Check if agent made a commit
    const commitSha = await getAgentCommitSha(input.agent_id, input.cwd);

    if (!commitSha) {
      await logger.logOutput({
        success: true,
        status: 'no_commit',
        message: 'Agent did not make a commit, skipping UI review check',
      });

      return {};
    }

    await logger.logOutput({
      status: 'checking',
      commit_sha: commitSha,
    });

    // Check UI review workflow status
    const reviewStatus = await checkUiReviewStatus(commitSha, input.cwd);

    await logger.logOutput({
      commit_sha: commitSha,
      review_status: reviewStatus.status,
      review_message: reviewStatus.message,
    });

    // Block if UI review failed
    if (reviewStatus.status === 'failure') {
      return {
        decision: 'block',
        reason: 'UI review failed with critical issues',
        systemMessage:
          `❌ UI Review Failed\n\n` +
          `Commit: ${commitSha}\n` +
          `Status: ${reviewStatus.message}\n\n` +
          `Critical UI issues were found during automated review. ` +
          `Please fix the issues before proceeding.\n\n` +
          `To view details:\n` +
          `  gh run view --commit ${commitSha}\n\n` +
          `To see screenshots:\n` +
          `  gh run download --name ui-screenshots-${commitSha}`,
      };
    }

    // Warn if pending
    if (reviewStatus.status === 'pending') {
      return {
        systemMessage:
          `⏳ UI Review In Progress\n\n` +
          `Commit: ${commitSha}\n` +
          `Status: ${reviewStatus.message}\n\n` +
          `UI review is still running. Check status with:\n` +
          `  gh run list --commit ${commitSha}`,
      };
    }

    // Success or not found - allow continuation
    return {
      systemMessage:
        reviewStatus.status === 'success'
          ? `✅ UI Review Passed\n\nCommit: ${commitSha}\nNo critical issues found.`
          : `UI review workflow not found for commit ${commitSha}`,
    };
  } catch (error) {
    await logger.logError(error as Error);

    const err = error as { message?: string };

    // Don't block on hook errors
    return {
      systemMessage:
        `UI review status check encountered an error: ${err.message}\n\n` +
        `Allowing agent to continue, but please verify UI review manually.`,
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
