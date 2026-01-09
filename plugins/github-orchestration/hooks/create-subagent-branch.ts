/**
 * Stacked PR branch creation hook
 *
 * SubagentStart hook that creates isolated branches for subagents when
 * stacked PR mode is enabled. Each subagent works on its own branch,
 * which gets pushed and PR'd on SubagentStop.
 *
 * This hook:
 * - Checks if stacked PR mode is enabled (env var, config, or auto-detect)
 * - Skips read-only agent types (Explore, Plan)
 * - Creates a new branch: {baseBranch}-subagent-{shortAgentId}
 * - Saves state to .claude/logs/stacked-branches.json
 *
 * The SubagentStop hook (stacked-pr-subagent-stop.ts) will then:
 * - Commit changes on the subagent branch
 * - Push to remote
 * - Create PR with auto-merge
 * - Checkout base branch (keeping main clean)
 * - Wait for CI and merge
 *
 * @module create-subagent-branch
 */

import type { SubagentStartInput, SubagentStartHookOutput } from '../shared/types/types.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import {
  isStackedPRModeEnabled,
  getCurrentBranch,
  generateSubagentBranchName,
  createAndCheckoutBranch,
  createStackedBranchEntry,
} from '../shared/hooks/utils/stacked-branches.js';

/**
 * SubagentStart hook handler that creates isolated branches
 *
 * When stacked PR mode is enabled, creates a new branch for the subagent
 * to work on. This isolates subagent changes from the main session.
 *
 * @param input - SubagentStart hook input with agent metadata
 * @returns Hook output (empty object, non-blocking)
 */
async function handler(input: SubagentStartInput): Promise<SubagentStartHookOutput> {
  const logger = createDebugLogger(input.cwd, 'create-subagent-branch', true);

  try {
    await logger.logInput({
      agent_id: input.agent_id,
      agent_type: input.agent_type,
      session_id: input.session_id,
    });

    // Check if stacked PR mode is enabled for this agent
    const enabled = await isStackedPRModeEnabled({
      agent_type: input.agent_type,
      cwd: input.cwd,
    });

    if (!enabled) {
      await logger.logOutput({
        skipped: true,
        reason: 'Stacked PR mode not enabled or agent type skipped',
      });
      return {
        hookSpecificOutput: {
          hookEventName: 'SubagentStart',
        },
      };
    }

    // Get current branch (this is the main session's branch)
    const baseBranch = await getCurrentBranch(input.cwd);
    if (!baseBranch) {
      await logger.logOutput({
        skipped: true,
        reason: 'Not in a git repository',
      });
      return {
        hookSpecificOutput: {
          hookEventName: 'SubagentStart',
        },
      };
    }

    // Generate subagent branch name
    const branchName = generateSubagentBranchName(baseBranch, input.agent_id);

    // Create and checkout the branch
    const createResult = await createAndCheckoutBranch(input.cwd, branchName, baseBranch);

    if (!createResult.success) {
      await logger.logOutput({
        success: false,
        error: createResult.error,
      });
      // Don't block - just log the error and continue without stacked PR mode
      return {
        hookSpecificOutput: {
          hookEventName: 'SubagentStart',
        },
      };
    }

    // Save to stacked branches state
    await createStackedBranchEntry(input.cwd, {
      agentId: input.agent_id,
      parentSessionId: input.session_id,
      branchName,
      baseBranch,
      createdAt: new Date().toISOString(),
      prNumber: null,
      prUrl: null,
      status: 'active',
      modifiedFiles: [],
      commitSha: null,
    });

    await logger.logOutput({
      success: true,
      branchName,
      baseBranch,
      agent_id: input.agent_id,
      agent_type: input.agent_type,
    });

    return {
      hookSpecificOutput: {
        hookEventName: 'SubagentStart',
      },
    };
  } catch (error) {
    await logger.logError(error as Error);
    // Don't block on errors - just log and continue
    return {
      hookSpecificOutput: {
        hookEventName: 'SubagentStart',
      },
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
