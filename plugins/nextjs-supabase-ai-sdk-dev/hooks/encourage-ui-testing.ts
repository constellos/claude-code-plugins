/**
 * UI testing encouragement hook
 *
 * SubagentStop hook that detects when ui-developer or ui-reviewer agents complete
 * and encourages the main agent to delegate to ui-tester for viewport verification.
 *
 * This hook promotes a complete UI development workflow:
 * - ui-developer implements the UI
 * - ui-reviewer validates visual quality
 * - ui-tester verifies at mobile (375px) and desktop (1440px) viewports
 *
 * @module encourage-ui-testing
 */

import type { SubagentStopInput, SubagentStopHookOutput } from '../../../shared/types/types.js';
import { runHook } from '../../../shared/hooks/utils/io.js';
import { getAgentEdits } from '../../../shared/hooks/utils/subagent-state.js';

/**
 * SubagentStop hook handler for UI testing encouragement
 *
 * Detects when ui-developer or ui-reviewer agents complete and encourages
 * the main agent to delegate to ui-tester for viewport verification.
 *
 * The hook is non-blocking - errors are logged but do not prevent session continuation.
 *
 * @param input - SubagentStop hook input containing agent transcript path and metadata
 * @returns Hook output with systemMessage encouragement if UI agent detected, empty object otherwise
 *
 * @example
 * ```typescript
 * // This hook is automatically called by Claude Code when any subagent completes.
 * // When ui-developer or ui-reviewer finishes, it returns:
 * const result = await handler({
 *   agent_id: 'agent-abc123',
 *   agent_transcript_path: '/path/.claude/logs/agent-abc123.jsonl',
 *   cwd: '/path/to/project',
 *   session_id: 'session-xyz',
 *   transcript_path: '/path/.claude/logs/session-xyz.jsonl',
 *   permission_mode: 'default',
 *   hook_event_name: 'SubagentStop',
 *   stop_hook_active: false,
 * });
 * // result.systemMessage contains the encouragement to use ui-tester
 * ```
 */
async function handler(input: SubagentStopInput): Promise<SubagentStopHookOutput> {
  try {
    // Get agent information from transcript
    const edits = await getAgentEdits(input.agent_transcript_path);
    const agentType = edits.subagentType;

    // Only trigger for ui-developer or ui-reviewer agents
    if (agentType !== 'ui-developer' && agentType !== 'ui-reviewer') {
      return {};
    }

    return {
      systemMessage: `UI work completed by ${agentType}. Consider delegating to the ui-tester agent to verify the implementation at mobile (375px) and desktop (1440px) viewports.`,
    };
  } catch {
    // Non-blocking - if we can't determine agent type, just skip
    return {};
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
