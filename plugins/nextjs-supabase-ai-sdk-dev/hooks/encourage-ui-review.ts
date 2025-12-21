/**
 * UI review encouragement hook
 *
 * PostToolUse[Task] hook that detects when ui-developer agent completes
 * and encourages the main agent to invoke ui-reviewer for visual inspection.
 *
 * @module encourage-ui-review
 */

import type { PostToolUseInput, PostToolUseHookOutput } from '../shared/types/types.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';

/**
 * PostToolUse[Task] hook handler for UI review encouragement
 *
 * Detects when ui-developer agent completes and encourages main agent
 * to invoke ui-reviewer for visual inspection of UI changes.
 *
 * @param input - PostToolUse hook input from Claude Code
 * @returns Hook output with encouragement message if ui-developer detected
 *
 * @example
 * ```typescript
 * // This hook is automatically called by Claude Code
 * // after any Task tool use completes
 * ```
 */
async function handler(input: PostToolUseInput): Promise<PostToolUseHookOutput> {
  const logger = createDebugLogger(input.cwd, 'encourage-ui-review', true);

  try {
    await logger.logInput({ tool_name: input.tool_name });

    // Only process Task tool
    if (input.tool_name !== 'Task') {
      return {};
    }

    // Extract agent name from task result
    // Looking for pattern in result like "subagent_type": "ui-developer"
    const toolResponse = typeof input.tool_response === 'string' ? input.tool_response : JSON.stringify(input.tool_response);
    const agentMatch = toolResponse?.match(/"subagent_type":\s*"([^"]+)"/);
    if (!agentMatch) {
      return {};
    }

    const agentName = agentMatch[1];

    // Only trigger for ui-developer
    if (agentName !== 'ui-developer') {
      return {};
    }

    await logger.logOutput({ agent_detected: agentName });

    const message = `
🎨 UI Development Complete

The ui-developer agent has finished implementing UI changes.

📋 Recommended Next Steps:

1. **Start dev server** (if not running):
   bun run dev

2. **Invoke ui-reviewer agent** to visually inspect changes:
   "Review the UI changes at http://localhost:3000/[route]"

3. **Validate against**:
   - ui-developer agent principles (mobile-first, compound components, Server Components)
   - Skill documentation (ui-wireframing, ui-design, ui-interaction, ui-integration, ai-sdk-ui)
   - Wireframe files in src/views/*/WIREFRAME.md

4. **Check responsive behavior** at:
   - Mobile (375px)
   - Tablet (768px)
   - Desktop (1920px)

5. **Verify**:
   - Component composition follows compound components pattern
   - Proper use of 'use client' directive (pushed deep)
   - Zod validation on client and server
   - Accessibility (color contrast, semantic HTML)
`;

    return {
      systemMessage: message
    };
  } catch (error) {
    await logger.logError(error as Error);
    return {};
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
