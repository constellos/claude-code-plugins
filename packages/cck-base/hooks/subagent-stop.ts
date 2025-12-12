/**
 * Built-in SubagentStop hook
 * Analyzes agent transcript and processes file operations
 */

import type { SubagentStopInput, SubagentStopHookOutput } from '../lib/types.js';
import { getAgentEdits } from '../lib/subagent-state.js';

const handler = async (input: SubagentStopInput): Promise<SubagentStopHookOutput> => {
  // Analyze agent edits (also cleans up saved context)
  await getAgentEdits(input.agent_transcript_path);

  return {};
};

export default handler;
