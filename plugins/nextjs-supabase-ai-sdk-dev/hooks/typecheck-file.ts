/**
 * PostToolUse Hook - TypeScript type checking
 *
 * This hook fires after Write/Edit operations to run TypeScript type checking
 * on the project, providing immediate feedback about type errors.
 *
 * @module hooks/typecheck-file
 */

import type { PostToolUseInput, PostToolUseHookOutput } from '../../../shared/types/types.js';
import { createDebugLogger } from '../../../shared/hooks/utils/debug.js';
import { runHook } from '../../../shared/hooks/utils/io.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * PostToolUse hook handler for type checking
 *
 * Runs `tsc --noEmit` to check for TypeScript errors after file edits.
 * Only runs for Write and Edit tool operations.
 *
 * @param input - PostToolUse hook input from Claude Code
 * @returns Hook output with type errors as additional context if found
 *
 * @example
 * This hook is automatically called by Claude Code after Write/Edit operations.
 * If type errors are found, they're provided as additional context to Claude,
 * allowing it to fix them in the next response.
 */
async function handler(
  input: PostToolUseInput
): Promise<PostToolUseHookOutput> {
  // Only run for Write and Edit operations
  if (input.tool_name !== 'Write' && input.tool_name !== 'Edit') {
    return {};
  }

  const logger = createDebugLogger(input.cwd, 'typecheck-file', true);

  try {
    await logger.logInput({
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
    });

    // Run TypeScript type checking
    await execAsync('tsc --noEmit', {
      cwd: input.cwd,
      timeout: 30000, // 30 second timeout
    });

    // If tsc completes successfully with no errors
    await logger.logOutput({ success: true, errors: [] });

    return {};
  } catch (error: unknown) {
    // tsc exits with non-zero code when there are type errors
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const output = err.stdout || err.stderr || '';

    if (output) {
      await logger.logOutput({
        success: false,
        type_errors: output,
      });

      // Provide type errors as additional context to Claude
      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `TypeScript type checking found errors:\n\n${output}\n\nPlease fix these type errors.`,
        },
      };
    }

    // If execution failed for other reasons (timeout, tsc not found, etc.)
    await logger.logError(error as Error);

    return {
      systemMessage: `Type checking failed: ${err.message || 'Unknown error'}`,
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
