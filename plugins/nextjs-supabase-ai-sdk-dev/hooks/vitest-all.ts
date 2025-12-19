/**
 * SessionStop Hook - Vitest full test suite runner
 *
 * This hook fires at session end to run the entire test suite with Vitest,
 * providing comprehensive feedback about test failures.
 * Returns an error if tests fail, blocking session end.
 *
 * @module hooks/vitest-all
 */

import type { SessionStopInput, SessionStopHookOutput } from '../../../shared/types/types.js';
import { createDebugLogger } from '../../../shared/hooks/utils/debug.js';
import { runHook } from '../../../shared/hooks/utils/io.js';
import { getScriptCommand } from '../../../shared/hooks/utils/package-manager.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * SessionStop hook handler for running full test suite
 *
 * Runs Vitest on all tests to check for test failures before ending the session.
 * Returns blocking error if test failures are found.
 *
 * @param input - SessionStop hook input from Claude Code
 * @returns Hook output with test failures as blocking error if found
 */
async function handler(input: SessionStopInput): Promise<SessionStopHookOutput> {
  const logger = createDebugLogger(input.cwd, 'vitest-all', true);

  try {
    await logger.logInput({
      session_id: input.session_id,
    });

    // Run Vitest on all tests using detected package manager
    const command = getScriptCommand(input.cwd, 'test');
    const { stdout } = await execAsync(command, {
      cwd: input.cwd,
      timeout: 300000, // 5 minute timeout for full test suite
    });

    // If tests complete successfully with no failures
    await logger.logOutput({ success: true, test_results: stdout });

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStop',
        additionalContext: '✓ All tests passed - no test failures found',
      },
    };
  } catch (error: unknown) {
    // Vitest exits with non-zero code when there are test failures
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const output = err.stdout || err.stderr || '';

    if (output) {
      await logger.logOutput({
        success: false,
        test_failures: output,
      });

      // Return blocking error - session cannot end with test failures
      return {
        systemMessage: `🚨 Test failures detected:\n\n${output}\n\nPlease fix these test failures before ending the session.`,
      };
    }

    // If execution failed for other reasons (timeout, vitest not found, etc.)
    await logger.logError(error as Error);

    return {
      systemMessage: `Test execution failed: ${err.message || 'Unknown error'}`,
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
