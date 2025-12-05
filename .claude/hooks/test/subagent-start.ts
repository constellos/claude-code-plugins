/**
 * Test hook: SubagentStart
 * Logs when a subagent is spawned.
 */
import type { SubagentStartHandler } from '@constellos/claude-code-kit/types/hooks';

const handler: SubagentStartHandler = (input) => {
  console.error(`[TEST] SubagentStart: ${input.agent_type} (${input.agent_id})`);

  return {
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
    },
  };
};

export default handler;
