/**
 * Built-in SubagentStop hook for claude-code-kit-ts plugin
 *
 * Analyzes the agent's transcript to extract file operations and cleanup saved context.
 * This hook processes the agent's work and removes the temporary state saved at SubagentStart.
 *
 * @module hooks/subagent-stop
 */

import type { SubagentStopInput, SubagentStopHookOutput } from '../lib/types.js';
import { getAgentEdits } from '../lib/subagent-state.js';

/**
 * SubagentStop hook handler
 *
 * Calls getAgentEdits() which:
 * 1. Parses the agent's transcript
 * 2. Extracts file operations (new files, edits, deletions)
 * 3. Retrieves the original Task call details
 * 4. Cleans up the saved context from .claude/state/active-subagents.json
 *
 * @param input - SubagentStop hook input from Claude Code
 * @returns Empty hook output (always allows continuation)
 */
const handler = async (input: SubagentStopInput): Promise<SubagentStopHookOutput> => {
  // Analyze agent edits (also cleans up saved context)
  await getAgentEdits(input.agent_transcript_path);

  return {};
};

export default handler;
