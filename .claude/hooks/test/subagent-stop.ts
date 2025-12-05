/**
 * Test hook: SubagentStop
 * Logs when a subagent completes.
 */
import type { SubagentStopHandler } from '@constellos/claude-code-kit/types/hooks';

const handler: SubagentStopHandler = (input) => {
  console.error(`[TEST] SubagentStop: agent_id=${input.agent_id}`);

  return {
    hookSpecificOutput: {
      hookEventName: 'SubagentStop',
    },
  };
};

export default handler;
