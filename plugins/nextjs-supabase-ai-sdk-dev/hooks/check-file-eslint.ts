/**
 * Real-time ESLint validation hook
 *
 * PostToolUse hook that runs ESLint immediately after Write/Edit operations,
 * providing instant feedback on code quality issues. Enables Claude to fix
 * linting errors in the same conversation turn.
 *
 * This hook detects the project's package manager and runs the appropriate
 * lint command (npm run lint, yarn lint, pnpm lint, or bun run lint).
 * Errors are provided as additional context, making Claude aware of issues
 * without blocking execution.
 *
 * @module lint-file
 */

import type { PostToolUseInput, PostToolUseHookOutput } from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { getScriptCommand } from '../shared/hooks/utils/package-manager.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * PostToolUse hook handler for linting
 *
 * Runs ESLint to check for code quality issues after file edits.
 * Only runs for Write and Edit tool operations.
 *
 * @param input - PostToolUse hook input from Claude Code
 * @returns Hook output with lint errors as additional context if found
 *
 * @example
 * This hook is automatically called by Claude Code after Write/Edit operations.
 * If lint errors are found, they're provided as additional context to Claude,
 * allowing it to fix them in the next response.
 */
async function handler(
  input: PostToolUseInput
): Promise<PostToolUseHookOutput> {
  // Only run for Write and Edit operations
  if (input.tool_name !== 'Write' && input.tool_name !== 'Edit') {
    return {};
  }

  const logger = createDebugLogger(input.cwd, 'lint-file', true);

  try {
    await logger.logInput({
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
    });

    // Run ESLint on the project using detected package manager
    const command = getScriptCommand(input.cwd, 'lint');
    await execAsync(command, {
      cwd: input.cwd,
      timeout: 30000, // 30 second timeout
    });

    // If lint completes successfully with no errors
    await logger.logOutput({ success: true, errors: [] });

    return {};
  } catch (error: unknown) {
    // Lint command exits with non-zero code when there are lint errors
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const output = err.stdout || err.stderr || '';

    if (output) {
      await logger.logOutput({
        success: false,
        lint_errors: output,
      });

      // Provide lint errors as additional context to Claude
      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `ESLint found errors:\n\n${output}\n\nPlease fix these linting issues.`,
        },
      };
    }

    // If execution failed for other reasons (timeout, eslint not found, etc.)
    await logger.logError(error as Error);

    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `Linting failed: ${err.message || 'Unknown error'}`,
      },
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
