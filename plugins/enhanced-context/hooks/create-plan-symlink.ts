/**
 * PostToolUse Hook - Create PLAN.md Symlink
 *
 * This hook fires after Write or Edit operations to create a PLAN.md symlink
 * in the project root pointing to the active plan file.
 *
 * When a plan file is written to `.claude/plans/*.md`, this hook:
 * 1. Detects the write operation
 * 2. Removes any existing PLAN.md symlink
 * 3. Creates a new symlink from `${cwd}/PLAN.md` to the plan file
 *
 * This allows other hooks to easily read the active plan without maintaining
 * external state files.
 *
 * @module hooks/create-plan-symlink
 */

import type { PostToolUseInput, PostToolUseHookOutput } from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * PostToolUse hook handler for creating PLAN.md symlink
 *
 * Executes after Write or Edit operations to maintain a symlink to the
 * active plan file. Only one plan can be active per project.
 *
 * @param input - PostToolUse hook input from Claude Code
 * @returns Hook output (non-blocking)
 *
 * @example
 * ```typescript
 * // This hook is automatically called by Claude Code
 * // after any Write or Edit operation
 * ```
 */
async function handler(input: PostToolUseInput): Promise<PostToolUseHookOutput> {
  const logger = createDebugLogger(input.cwd, 'create-plan-symlink', false);

  try {
    await logger.logInput({
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
    });

    // Only run for Write or Edit tools
    if (input.tool_name !== 'Write' && input.tool_name !== 'Edit') {
      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
        },
      };
    }

    const toolInput = input.tool_input as { file_path?: string };
    const filePath = toolInput.file_path;

    if (!filePath) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
        },
      };
    }

    // Resolve to absolute path
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(input.cwd, filePath);

    await logger.logOutput({
      filePath,
      absolutePath,
    });

    // Check if this is a plan file write
    const isInPlansDir = absolutePath.includes(path.join('.claude', 'plans'));
    const isPlanFile = path.extname(absolutePath) === '.md';

    if (!isInPlansDir || !isPlanFile) {
      await logger.logOutput({
        action: 'skip',
        reason: 'Not a plan file',
      });

      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
        },
      };
    }

    // Create PLAN.md symlink
    const symlinkPath = path.join(input.cwd, 'PLAN.md');

    await logger.logOutput({
      action: 'create-symlink',
      target: absolutePath,
      symlink: symlinkPath,
    });

    // Remove old symlink if it exists
    try {
      const stats = await fs.lstat(symlinkPath);
      if (stats.isSymbolicLink()) {
        await fs.unlink(symlinkPath);
        await logger.logOutput({
          action: 'removed-old-symlink',
          path: symlinkPath,
        });
      }
    } catch (error: unknown) {
      // Symlink doesn't exist, which is fine
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        await logger.logOutput({
          action: 'error-removing-symlink',
          error: (error as Error).message,
        });
      }
    }

    // Create new symlink
    await fs.symlink(absolutePath, symlinkPath);

    await logger.logOutput({
      action: 'symlink-created',
      target: absolutePath,
      symlink: symlinkPath,
    });

    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
      },
    };
  } catch (error: unknown) {
    await logger.logError(error as Error);

    // Non-blocking: allow operation even if symlink creation fails
    return {
      systemMessage: `PLAN.md symlink creation failed: ${(error as Error).message || 'Unknown error'}`,
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
      },
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
