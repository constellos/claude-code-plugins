/**
 * PostToolUse Hook - Vitest test runner
 *
 * This hook fires after Write/Edit operations on test files to run Vitest,
 * providing immediate feedback about test failures.
 *
 * @module hooks/vitest-file
 */

import type { PostToolUseInput, PostToolUseHookOutput } from '../../../shared/types/types.js';
import { createDebugLogger } from '../../../shared/hooks/utils/debug.js';
import { getScriptCommand } from '../../../shared/hooks/utils/package-manager.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * PostToolUse hook handler for running Vitest
 *
 * Runs Vitest on the project to check for test failures after test file edits.
 * Only runs for Write and Edit operations on **.test.ts or **.test.tsx files.
 *
 * @param input - PostToolUse hook input from Claude Code
 * @returns Hook output with test errors as additional context if found
 *
 * @example
 * This hook is automatically called by Claude Code after Write/Edit operations on test files.
 * If test failures are found, they're provided as additional context to Claude,
 * allowing it to fix them in the next response.
 */
export default async function (
  input: PostToolUseInput
): Promise<PostToolUseHookOutput> {
  // Only run for Write and Edit operations on test files
  if (input.tool_name !== 'Write' && input.tool_name !== 'Edit') {
    return {};
  }

  const logger = createDebugLogger(input.cwd, 'vitest-file', true);

  try {
    await logger.logInput({
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
    });

    // Run Vitest on the project using detected package manager
    const command = getScriptCommand(input.cwd, 'test');
    const { stdout } = await execAsync(command, {
      cwd: input.cwd,
      timeout: 60000, // 60 second timeout for tests
    });

    // If tests complete successfully with no errors
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

      // Provide test failures as additional context to Claude
      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `Vitest found test failures:\n\n${output}\n\nPlease fix these test failures.`,
        },
      };
    }

    // If execution failed for other reasons (timeout, vitest not found, etc.)
    await logger.logError(error as Error);

    return {
      systemMessage: `Test execution failed: ${err.message || 'Unknown error'}`,
    };
  }
}
