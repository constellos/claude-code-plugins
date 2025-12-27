/**
 * Requirements analysis and planning guidance hook
 *
 * UserPromptSubmit hook that adds systematic requirement analysis instructions
 * to every user prompt. Ensures Claude follows a consistent process for
 * understanding requests and maintaining plans.
 *
 * This hook instructs Claude to:
 * 1. **List requirements** - Document all explicit and implicit requirements
 * 2. **Plan consideration** - Evaluate if current plan needs revision
 * 3. **Proceed systematically** - Implement only after documenting understanding
 *
 * The guidance is added as additional context to the user's prompt, making it
 * part of Claude's instruction set for that turn. This creates a consistent
 * workflow across all user interactions.
 *
 * @module guide-requirements-check
 */

import type {
  UserPromptSubmitInput,
  UserPromptSubmitHookOutput,
} from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';

/**
 * UserPromptSubmit hook handler
 *
 * Adds guidance to Claude for thorough requirement analysis and plan updates.
 *
 * @param input - UserPromptSubmit hook input from Claude Code
 * @returns Hook output with additional context guidance
 */
async function handler(input: UserPromptSubmitInput): Promise<UserPromptSubmitHookOutput> {
  const logger = createDebugLogger(input.cwd, 'guide-requirements-check', true);

  try {
    await logger.logInput({
      session_id: input.session_id,
      permission_mode: input.permission_mode,
      prompt_length: input.prompt.length,
    });

    // Add guidance for Claude to check requirements and plan
    const guidance = `IMPORTANT: Before proceeding with this request:

1. **List Requirements**: Start your response by noting a precise list of ALL requirements from the user's message:
   - Explicit requirements (directly stated)
   - Implicit requirements (implied by context)
   - Constraints or limitations mentioned
   - Success criteria or acceptance conditions

2. **Plan Consideration**: Consider whether this request should update the current plan:
   - If in plan mode (permission_mode: ${input.permission_mode}), update the plan accordingly
   - If a plan exists for this session, evaluate if it needs revision based on new requirements
   - If no plan exists but this is a complex multi-step task, consider creating one
   - Ensure the plan includes Intent, Plan steps, and Success Criteria sections

3. **Proceed**: After documenting requirements and plan considerations, proceed with the implementation.`;

    await logger.logOutput({
      added_guidance: true,
      guidance_length: guidance.length,
    });

    return {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: guidance,
      },
    };
  } catch (error) {
    await logger.logError(error as Error);

    // Non-blocking - just skip guidance on error
    return {};
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
