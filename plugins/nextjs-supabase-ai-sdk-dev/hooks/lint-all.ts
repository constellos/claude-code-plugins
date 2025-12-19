/**
 * SessionStop Hook - ESLint full project linting
 *
 * This hook fires at session end to run ESLint on the entire project,
 * providing comprehensive feedback about code quality issues.
 * Returns an error if linting fails, blocking session end.
 *
 * @module hooks/lint-all
 */

import type { SessionStopInput, SessionStopHookOutput } from '../../../shared/types/types.js';
import { createDebugLogger } from '../../../shared/hooks/utils/debug.js';
import { runHook } from '../../../shared/hooks/utils/io.js';
import { getScriptCommand } from '../../../shared/hooks/utils/package-manager.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * SessionStop hook handler for full project linting
 *
 * Runs ESLint to check for code quality issues before ending the session.
 * Returns blocking error if lint errors are found.
 *
 * @param input - SessionStop hook input from Claude Code
 * @returns Hook output with lint errors as blocking error if found
 */
async function handler(input: SessionStopInput): Promise<SessionStopHookOutput> {
  const logger = createDebugLogger(input.cwd, 'lint-all', true);

  try {
    await logger.logInput({
      session_id: input.session_id,
    });

    // Run ESLint on the entire project using detected package manager
    const command = getScriptCommand(input.cwd, 'lint');
    await execAsync(command, {
      cwd: input.cwd,
      timeout: 120000, // 2 minute timeout for full project lint
    });

    // If lint completes successfully with no errors
    await logger.logOutput({ success: true, errors: [] });

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStop',
        additionalContext: '✓ ESLint passed - no linting errors found',
      },
    };
  } catch (error: unknown) {
    // Lint command exits with non-zero code when there are lint errors
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const output = err.stdout || err.stderr || '';

    if (output) {
      await logger.logOutput({
        success: false,
        lint_errors: output,
      });

      // Return blocking error - session cannot end with lint errors
      return {
        systemMessage: `🚨 ESLint errors detected:\n\n${output}\n\nPlease fix these linting issues before ending the session.`,
      };
    }

    // If execution failed for other reasons (timeout, eslint not found, etc.)
    await logger.logError(error as Error);

    return {
      systemMessage: `Linting failed: ${err.message || 'Unknown error'}`,
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
