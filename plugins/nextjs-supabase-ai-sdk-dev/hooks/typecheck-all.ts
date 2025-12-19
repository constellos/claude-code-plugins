/**
 * SessionStop Hook - TypeScript full project type checking
 *
 * This hook fires at session end to run TypeScript type checking on the entire project,
 * providing comprehensive feedback about type errors.
 * Returns an error if type checking fails, blocking session end.
 *
 * @module hooks/typecheck-all
 */

import type { SessionStopInput, SessionStopHookOutput } from '../../../shared/types/types.js';
import { createDebugLogger } from '../../../shared/hooks/utils/debug.js';
import { runHook } from '../../../shared/hooks/utils/io.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * SessionStop hook handler for full project type checking
 *
 * Runs `tsc --noEmit` to check for TypeScript errors before ending the session.
 * Returns blocking error if type errors are found.
 *
 * @param input - SessionStop hook input from Claude Code
 * @returns Hook output with type errors as blocking error if found
 */
async function handler(input: SessionStopInput): Promise<SessionStopHookOutput> {
  const logger = createDebugLogger(input.cwd, 'typecheck-all', true);

  try {
    await logger.logInput({
      session_id: input.session_id,
    });

    // Run TypeScript type checking on the entire project
    await execAsync('tsc --noEmit', {
      cwd: input.cwd,
      timeout: 120000, // 2 minute timeout for full project type check
    });

    // If tsc completes successfully with no errors
    await logger.logOutput({ success: true, errors: [] });

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStop',
        additionalContext: '✓ TypeScript type checking passed - no type errors found',
      },
    };
  } catch (error: unknown) {
    // tsc exits with non-zero code when there are type errors
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const output = err.stdout || err.stderr || '';

    if (output) {
      await logger.logOutput({
        success: false,
        type_errors: output,
      });

      // Return blocking error - session cannot end with type errors
      return {
        systemMessage: `🚨 TypeScript type errors detected:\n\n${output}\n\nPlease fix these type errors before ending the session.`,
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
