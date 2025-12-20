/**
 * Context discovery hook for CLAUDE.md documentation
 *
 * PostToolUse hook that automatically discovers and links related CLAUDE.md
 * documentation files after Read operations. This helps Claude understand the
 * project structure and access relevant context without explicit prompting.
 *
 * When a file is read, this hook searches for CLAUDE.md files in:
 * 1. Project root directory
 * 2. Parent directories (walking up from the read file)
 * 3. Immediate child directories (one level deep)
 *
 * Found documentation files are provided as clickable file:// links in the
 * additional context section, making it easy to explore related documentation.
 *
 * @module add-folder-context
 */

import type { PostToolUseInput, PostToolUseHookOutput } from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { readdir, access } from 'fs/promises';
import { join, dirname } from 'path';

/**
 * Check if a file exists at the given path
 *
 * Uses fs.access to test file existence without throwing errors.
 * This is more efficient than try-catching readFile for existence checks.
 *
 * @param path - The file path to check
 * @returns True if the file exists and is accessible, false otherwise
 *
 * @example
 * ```typescript
 * const exists = await fileExists('/path/to/CLAUDE.md');
 * if (exists) {
 *   console.log('File found!');
 * }
 * ```
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * PostToolUse hook that discovers and links related CLAUDE.md documentation
 *
 * Intercepts Read tool completions to automatically discover related documentation
 * files in the project structure. The hook searches three locations and provides
 * found files as clickable links in the additional context.
 *
 * Search strategy:
 * 1. Project root - always check for /CLAUDE.md
 * 2. Parent directories - walk up from the read file to project root
 * 3. Child directories - scan one level deep in the file's directory
 *
 * The hook is non-blocking and fails silently - errors in discovery do not
 * prevent the Read operation from completing.
 *
 * @param input - PostToolUse hook input from Claude Code
 * @returns Hook output with discovered CLAUDE.md files as additional context
 *
 * @example
 * ```typescript
 * // When reading: /project/src/api/routes.ts
 * const result = await handler({
 *   tool_name: 'Read',
 *   tool_use_id: 'toolu_123',
 *   tool_input: { file_path: '/project/src/api/routes.ts' },
 *   cwd: '/project',
 *   // ... other fields
 * });
 *
 * // If the following files exist:
 * // - /project/CLAUDE.md (root)
 * // - /project/src/CLAUDE.md (parent)
 * // - /project/src/api/CLAUDE.md (parent)
 * // - /project/src/api/handlers/CLAUDE.md (child)
 *
 * // Returns:
 * // {
 * //   hookSpecificOutput: {
 * //     hookEventName: 'PostToolUse',
 * //     additionalContext: `Related context:
 * // [/project/CLAUDE.md](file:///project/CLAUDE.md)
 * // [/project/src/CLAUDE.md](file:///project/src/CLAUDE.md)
 * // [/project/src/api/CLAUDE.md](file:///project/src/api/CLAUDE.md)
 * // [/project/src/api/handlers/CLAUDE.md](file:///project/src/api/handlers/CLAUDE.md)`
 * //   }
 * // }
 *
 * // This additional context appears in Claude's response as clickable links
 * ```
 */
async function handler(
  input: PostToolUseInput
): Promise<PostToolUseHookOutput> {
  // Only run for Read operations
  if (input.tool_name !== 'Read') {
    return {};
  }

  const logger = createDebugLogger(input.cwd, 'add-folder-context', true);

  try {
    await logger.logInput({
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
    });

    // Extract file path from tool input
    const toolInput = input.tool_input as { file_path?: string };
    const filePath = toolInput?.file_path;

    if (!filePath) {
      await logger.logOutput({ success: false, reason: 'No file_path in tool input' });
      return {};
    }

    const claudeMdFiles: string[] = [];

    // 1. Check for CLAUDE.md at project root
    const rootClaudeMd = join(input.cwd, 'CLAUDE.md');
    if (await fileExists(rootClaudeMd)) {
      claudeMdFiles.push(rootClaudeMd);
    }

    // 2. Walk up the directory tree to find parent CLAUDE.md files
    let currentDir = dirname(filePath);
    while (currentDir.startsWith(input.cwd) && currentDir !== input.cwd) {
      const claudeMdPath = join(currentDir, 'CLAUDE.md');
      if (await fileExists(claudeMdPath)) {
        claudeMdFiles.push(claudeMdPath);
      }
      currentDir = dirname(currentDir);
    }

    // 3. Scan immediate child directories for CLAUDE.md files
    const fileDir = dirname(filePath);
    try {
      const entries = await readdir(fileDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const childClaudeMd = join(fileDir, entry.name, 'CLAUDE.md');
          if (await fileExists(childClaudeMd)) {
            claudeMdFiles.push(childClaudeMd);
          }
        }
      }
    } catch (error) {
      // Directory may not be readable, skip silently
      await logger.logError(error as Error);
    }

    // Remove duplicates and sort
    const uniqueFiles = [...new Set(claudeMdFiles)].sort();

    if (uniqueFiles.length === 0) {
      await logger.logOutput({ success: true, found: 0 });
      return {};
    }

    // Format as markdown links
    const links = uniqueFiles.map(path => `[${path}](file://${path})`).join('\n');
    const contextMessage = `Related context:\n${links}`;

    await logger.logOutput({
      success: true,
      found: uniqueFiles.length,
      files: uniqueFiles,
    });

    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: contextMessage,
      },
    };
  } catch (error: unknown) {
    // Non-blocking on errors
    await logger.logError(error as Error);
    return {};
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
