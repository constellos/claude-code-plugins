/**
 * Built-in SubagentStop hook
 * Analyzes agent transcript and logs file operations
 */

import type { SubagentStopInput, SubagentStopHookOutput } from '../lib/types.js';
import { getAgentEdits } from '../lib/subagent-state.js';
import { createDebugLogger } from '../lib/debug.js';

interface DebugInput extends SubagentStopInput {
  debug?: boolean;
}

const handler = async (input: DebugInput): Promise<SubagentStopHookOutput> => {
  const debug = input.debug === true;
  const logger = createDebugLogger(input.cwd, 'SubagentStop', debug);

  try {
    await logger.log('SubagentStop triggered', {
      agent_id: input.agent_id,
      agent_transcript_path: input.agent_transcript_path,
    });

    // Analyze agent edits
    const edits = await getAgentEdits(input.agent_transcript_path);

    await logger.log('Agent edits analyzed', {
      subagentType: edits.subagentType,
      newFiles: edits.agentNewFiles.length,
      editedFiles: edits.agentEditedFiles.length,
      deletedFiles: edits.agentDeletedFiles.length,
    });

    // Log detailed results
    if (edits.agentNewFiles.length > 0) {
      await logger.log('New files created', edits.agentNewFiles);
    }
    if (edits.agentEditedFiles.length > 0) {
      await logger.log('Files edited', edits.agentEditedFiles);
    }
    if (edits.agentDeletedFiles.length > 0) {
      await logger.log('Files deleted', edits.agentDeletedFiles);
    }

    return {};
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    await logger.error('Failed to analyze agent edits', err);

    // Don't block on error
    return {};
  }
};

export default handler;
