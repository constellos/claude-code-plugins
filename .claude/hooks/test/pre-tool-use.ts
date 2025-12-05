/**
 * Test hook: PreToolUse for Write/Edit tools
 * Logs tool invocation to stderr and allows execution.
 */
import type { PreToolUseHandler } from '@constellos/claude-code-kit/types/hooks';

const handler: PreToolUseHandler = (input) => {
  console.error(`[TEST] PreToolUse: ${input.tool_name}`);
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  };
};

export default handler;
