/**
 * Built-in SubagentStart hook
 * Saves agent context for later retrieval at SubagentStop
 */

import type { SubagentStartInput, SubagentStartHookOutput } from '../lib/types.js';
import { saveAgentStartContext } from '../lib/subagent-state.js';

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
