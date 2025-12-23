/**
 * Full test suite validation hook
 *
 * SessionEnd hook that runs the entire Vitest test suite before allowing the
 * session to end. This ensures all tests pass and no regressions were introduced
 * during the session.
 *
 * Unlike vitest-file which provides advisory feedback on individual test files,
 * this hook **blocks** session end if any tests fail. This enforces test quality
 * and prevents broken code from being committed.
 *
 * The hook uses the project's package manager to run the test script with a
 * 5-minute timeout, suitable for most test suites.
 *
 * @module vitest-all
 */

import type { SessionEndInput, SessionEndHookOutput } from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { getScriptCommand } from '../shared/hooks/utils/package-manager.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * SessionEnd hook handler for running full test suite
 *
 * Runs Vitest on all tests to check for test failures before ending the session.
 * Returns blocking error if test failures are found.
 *
 * @param input - SessionEnd hook input from Claude Code
 * @returns Hook output with test failures as blocking error if found
 */
async function handler(input: SessionEndInput): Promise<SessionEndHookOutput> {
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

    return {};
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
