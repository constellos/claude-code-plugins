/**
 * SubagentStart Hook - Log and save agent context
 *
 * This hook fires when a subagent (Task tool) begins execution. It saves the
 * agent's context for later retrieval in the SubagentStop hook.
 *
 * @module hooks/log-subagent-start
 */

import type { SubagentStartInput, SubagentStartHookOutput } from 'claude-code-kit-ts';
import { saveAgentStartContext, createDebugLogger } from 'claude-code-kit-ts';

/**
 * SubagentStart hook handler
 *
 * Saves agent context to .claude/state/active-subagents.json for retrieval
 * when the agent completes.
 *
 * @param input - SubagentStart hook input from Claude Code
 * @returns Hook output (always continues execution)
 *
 * @example
 * This hook is automatically called by Claude Code when an agent starts.
 * The saved context includes:
 * - agent_id: Unique identifier for the agent
 * - agent_type: Type of agent (e.g., "Explore", "Plan")
 * - prompt: The prompt passed to the Task tool
 * - tool_use_id: ID of the Task tool use that spawned the agent
 */
export default async function (
  input: SubagentStartInput
): Promise<SubagentStartHookOutput> {
  const logger = createDebugLogger(input.cwd, 'log-subagent-start', true);

  try {
    await logger.logInput(input);

    // Save agent context for retrieval in SubagentStop
    await saveAgentStartContext(input);

    await logger.logOutput({ message: 'Agent context saved successfully' });

    return {
      continue: true,
    };
  } catch (error) {
    await logger.logError(error as Error);

    // Don't block execution if context saving fails
    return {
      continue: true,
      systemMessage: `Warning: Failed to save agent context: ${error}`,
    };
  }
}
