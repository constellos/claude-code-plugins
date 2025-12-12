/**
 * Built-in SubagentStart hook
 * Saves agent context for later retrieval at SubagentStop
 */

import type { SubagentStartInput, SubagentStartHookOutput } from '../lib/types.js';
import { saveAgentStartContext } from '../lib/subagent-state.js';
import { createDebugLogger } from '../lib/debug.js';

interface DebugInput extends SubagentStartInput {
  debug?: boolean;
}

const handler = async (input: DebugInput): Promise<SubagentStartHookOutput> => {
  const debug = input.debug === true;
  const logger = createDebugLogger(input.cwd, 'SubagentStart', debug);

  try {
    await logger.log('SubagentStart triggered', {
      agent_id: input.agent_id,
      agent_type: input.agent_type,
      session_id: input.session_id,
    });

    // Save context for SubagentStop
    const context = await saveAgentStartContext({
      agent_id: input.agent_id,
      agent_type: input.agent_type,
      session_id: input.session_id,
      cwd: input.cwd,
      transcript_path: input.transcript_path,
    });

    await logger.log('Agent context saved', context);

    return {
      hookSpecificOutput: {
        hookEventName: 'SubagentStart',
      },
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    await logger.error('Failed to save agent context', err);

    // Don't block on error - just return empty output
    return {};
  }
};

export default handler;
