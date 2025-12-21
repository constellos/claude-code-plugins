/**
 * Real-time TSDoc validation hook
 *
 * PostToolUse hook that validates TSDoc documentation immediately after Write/Edit
 * operations on TypeScript files. Ensures all exported members have comprehensive
 * documentation following TSDoc 2025 best practices defined in CLAUDE.md.
 *
 * This hook uses ESLint with eslint-plugin-jsdoc to check for:
 * - Missing JSDoc comments on exported functions/classes
 * - Missing @param tags with descriptions
 * - Missing @returns tags with descriptions
 * - Missing @example blocks
 * - Proper multiline formatting
 *
 * The hook is non-blocking and provides guidance via additionalContext,
 * allowing Claude to fix documentation issues in subsequent responses.
 *
 * @module tsdoc-validate
 */

import type {
  PostToolUseInput,
  PostToolUseHookOutput,
} from '../../../shared/types/types.js';
import { createDebugLogger } from '../../../shared/hooks/utils/debug.js';
import { runHook } from '../../../shared/hooks/utils/io.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

/**
 * PostToolUse hook handler for TSDoc validation
 *
 * Runs ESLint with TSDoc validation rules to check for missing or incomplete
 * documentation on exported TypeScript members. Only runs for Write and Edit
 * operations on .ts files (excluding test files and type definitions).
 *
 * @param input - PostToolUse hook input from Claude Code
 * @returns Hook output with TSDoc violations as additional context if found
 *
 * @example
 * This hook is automatically called by Claude Code after Write/Edit operations.
 * If documentation issues are found, they're provided as additional context to Claude,
 * allowing it to add or improve documentation in the next response.
 */
async function handler(
  input: PostToolUseInput
): Promise<PostToolUseHookOutput> {
  // Only run for Write and Edit operations
  if (input.tool_name !== 'Write' && input.tool_name !== 'Edit') {
    return {};
  }

  // Extract file path from tool input
  const toolInput = input.tool_input as { file_path?: string };
  const filePath = toolInput.file_path;

  if (!filePath) {
    return {};
  }

  // Only process TypeScript files
  if (!filePath.endsWith('.ts')) {
    return {};
  }

  // Skip test files and type definition files
  if (filePath.endsWith('.test.ts') || filePath.endsWith('.d.ts')) {
    return {};
  }

  const logger = createDebugLogger(input.cwd, 'tsdoc-validate', true);

  try {
    await logger.logInput({
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
      file_path: filePath,
    });

    // Path to ESLint TSDoc config (in project root)
    const configPath = path.join(input.cwd, 'eslint.tsdoc.config.mjs');

    // Run ESLint with TSDoc config on the specific file
    const command = `npx eslint --config "${configPath}" "${filePath}"`;
    await execAsync(command, {
      cwd: input.cwd,
      timeout: 30000, // 30 second timeout
    });

    // If ESLint completes successfully with no errors
    await logger.logOutput({ success: true, violations: [] });

    return {};
  } catch (error: unknown) {
    // ESLint exits with non-zero code when there are violations
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const output = err.stdout || err.stderr || '';

    if (output) {
      await logger.logOutput({
        success: false,
        violations: output,
      });

      // Parse output to categorize violations
      const hasMissingJsDoc = output.includes('jsdoc/require-jsdoc');
      const hasMissingParam = output.includes('jsdoc/require-param');
      const hasMissingReturns = output.includes('jsdoc/require-returns');
      const hasMissingExample = output.includes('jsdoc/require-example');
      const hasMissingDescription = output.includes(
        'jsdoc/require-description'
      );
      const hasFormatting =
        output.includes('jsdoc/multiline-blocks') ||
        output.includes('jsdoc/check-alignment') ||
        output.includes('jsdoc/check-indentation');

      // Build friendly categorization
      let categories = '';
      if (hasMissingJsDoc) {
        categories += '📝 Missing JSDoc on exported functions/classes\n';
      }
      if (hasMissingDescription) {
        categories += '📄 Missing description text in JSDoc\n';
      }
      if (hasMissingParam) {
        categories += '📋 Missing @param tags or descriptions\n';
      }
      if (hasMissingReturns) {
        categories += '↩️  Missing @returns tags or descriptions\n';
      }
      if (hasMissingExample) {
        categories += '💡 Missing @example blocks (recommended)\n';
      }
      if (hasFormatting) {
        categories += '📐 Formatting issues (multiline format required)\n';
      }

      // Provide TSDoc violations as additional context to Claude
      const guidance = `TSDoc documentation issues found in ${filePath}:

${categories}
ESLint Output:
${output}

TSDoc 2025 Requirements (from CLAUDE.md):
- @module tag at top of file
- Multi-line format for all public exports (no single-line /** */ blocks)
- @param tags for all parameters with descriptions
- @returns tags describing return values
- @example blocks showing realistic usage
- Clear description text explaining what the function does

Please add comprehensive TSDoc documentation to address these issues.`;

      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: guidance,
        },
      };
    }

    // If execution failed for other reasons (config not found, timeout, etc.)
    // Silently skip if config doesn't exist (graceful degradation)
    if (
      err.message?.includes('ENOENT') ||
      err.message?.includes('eslint.tsdoc.config.mjs')
    ) {
      await logger.logOutput({
        success: true,
        skipped: true,
        reason: 'ESLint TSDoc config not found',
      });
      return {};
    }

    await logger.logError(error as Error);

    return {
      systemMessage: `TSDoc validation failed: ${err.message || 'Unknown error'}`,
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
