/**
 * Built-in SubagentStart hook for claude-code-kit-ts plugin
 *
 * Saves agent context when a subagent starts for later retrieval at SubagentStop.
 * This enables the SubagentStop hook to access the original Task tool call details
 * and extract file operations performed by the agent.
 *
 * @module hooks/subagent-start
 */

import type { SubagentStartInput, SubagentStartHookOutput } from '../lib/types.js';
import { saveAgentStartContext } from '../lib/subagent-state.js';

/**
 * SubagentStart hook handler
 *
 * Saves agent metadata to .claude/state/active-subagents.json including:
 * - agent_id: Unique identifier for the agent instance
 * - agent_type: Type of agent (e.g., "Explore", "Plan")
 * - session_id: Parent session ID
 * - transcript_path: Path to parent transcript
 *
 * @param input - SubagentStart hook input from Claude Code
 * @returns Hook output confirming successful execution
 */
const handler = async (input: SubagentStartInput): Promise<SubagentStartHookOutput> => {
  // Save context for SubagentStop
  await saveAgentStartContext({
    agent_id: input.agent_id,
    agent_type: input.agent_type,
    session_id: input.session_id,
    cwd: input.cwd,
    transcript_path: input.transcript_path,
  });

  return {
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
    },
  };
};

export default handler;
