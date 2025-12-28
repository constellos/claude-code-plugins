/**
 * Full project TypeScript validation hook
 *
 * SessionEnd hook that runs TypeScript compiler on the entire project before
 * allowing the session to end. This ensures type safety is maintained throughout
 * the codebase.
 *
 * Unlike typecheck-file which provides advisory feedback, this hook **blocks**
 * session end if type errors exist. This prevents type-unsafe code from being
 * committed, enforcing TypeScript's type guarantees.
 *
 * The hook runs `tsc --noEmit` with a 2-minute timeout, suitable for most
 * project sizes. Type errors are provided in the blocking error message.
 *
 * @module typecheck-all
 */

import type { StopInput, StopHookOutput } from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * SessionEnd hook handler for full project type checking
 *
 * Runs `tsc --noEmit` to check for TypeScript errors before ending the session.
 * Returns blocking error if type errors are found.
 *
 * @param input - SessionEnd hook input from Claude Code
 * @returns Hook output with type errors as blocking error if found
 */
async function handler(input: StopInput): Promise<StopHookOutput> {
  // Prevent infinite loops - if hook is already active, allow stop
  if (input.stop_hook_active) {
    return {};
  }

  const logger = createDebugLogger(input.cwd, 'typecheck-all', true);

  try {
    await logger.logInput({
      session_id: input.session_id,
    });

    // Run TypeScript type checking on the entire project
    await execAsync('npx tsc --noEmit', {
      cwd: input.cwd,
      timeout: 120000, // 2 minute timeout for full project type check
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

      // Return blocking error to AI - session cannot end with type errors
      return {
        decision: 'block',
        reason: `TypeScript type errors detected:\n\n${output}\n\nPlease fix these type errors before ending the session.`,
      };
    }

    // If execution failed for other reasons (timeout, tsc not found, etc.)
    await logger.logError(error as Error);

    return {
      decision: 'block',
      reason: `Type checking failed: ${err.message || 'Unknown error'}`,
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
