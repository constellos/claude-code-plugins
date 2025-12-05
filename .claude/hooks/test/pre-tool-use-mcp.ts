/**
 * Test hook: PreToolUse for MCP tools (mcp__*)
 * Logs MCP tool invocation to stderr and allows execution.
 */
import type { PreToolUseHandler } from '@constellos/claude-code-kit/types/hooks';

const handler: PreToolUseHandler = (input) => {
  console.error(`[TEST] PreToolUse MCP: ${input.tool_name}`);
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  };
};

export default handler;
