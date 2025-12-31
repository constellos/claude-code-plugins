/**
 * Full project ESLint validation hook
 *
 * SessionEnd hook that runs ESLint on the entire project before allowing the
 * session to end. This ensures no code quality regressions are introduced
 * during the session.
 *
 * Unlike lint-file which provides advisory feedback, this hook **blocks** session
 * end if linting fails. This forces resolution of all code quality issues before
 * the session completes, preventing broken code from being committed.
 *
 * The hook uses the project's package manager to run the lint script, ensuring
 * compatibility with project-specific ESLint configurations.
 *
 * @module lint-all
 */

import type { StopInput, StopHookOutput } from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { getScriptCommand } from '../shared/hooks/utils/package-manager.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * SessionEnd hook handler for full project linting
 *
 * Runs ESLint to check for code quality issues before ending the session.
 * Returns blocking error if lint errors are found.
 *
 * @param input - SessionEnd hook input from Claude Code
 * @returns Hook output with lint errors as blocking error if found
 */
async function handler(input: StopInput): Promise<StopHookOutput> {
  // Prevent infinite loops - if hook is already active, allow stop
  if (input.stop_hook_active) {
    return { decision: 'approve' };
  }

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

    return { decision: 'approve' };
  } catch (error: unknown) {
    // Lint command exits with non-zero code when there are lint errors
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const output = err.stdout || err.stderr || '';

    if (output) {
      await logger.logOutput({
        success: false,
        lint_errors: output,
      });

      // Return blocking error to AI - session cannot end with lint errors
      return {
        decision: 'block',
        reason: `ESLint errors detected. You MUST fix these before stopping:\n\n${output}\n\nFix each error listed above, then run the linter again to verify all issues are resolved.`,
      };
    }

    // If execution failed for other reasons (timeout, eslint not found, etc.)
    await logger.logError(error as Error);

    return {
      decision: 'block',
      reason: `Linting command failed: ${err.message || 'Unknown error'}. Check if ESLint is installed and the lint script exists in package.json.`,
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
