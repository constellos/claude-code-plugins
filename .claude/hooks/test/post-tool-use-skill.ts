/**
 * Test hook: PostToolUse for Skill tool
 * Logs skill invocation to stderr.
 */
import type { PostToolUseHandler } from '@constellos/claude-code-kit/types/hooks';

const handler: PostToolUseHandler = (input) => {
  const toolInput = input.tool_input as { skill?: string } | undefined;
  const skillName = toolInput?.skill || 'unknown';

  console.error(`[TEST] PostToolUse Skill: ${skillName}`);

  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
    },
  };
};

export default handler;
