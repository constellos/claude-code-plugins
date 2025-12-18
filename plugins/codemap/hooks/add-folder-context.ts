/**
 * PostToolUse Hook - Add folder context via CLAUDE.md links
 *
 * This hook fires after Read operations to provide context about related
 * documentation files in the project structure.
 *
 * @module hooks/add-folder-context
 */

import type { PostToolUseInput, PostToolUseHookOutput } from '../../../shared/lib/types.js';
import { createDebugLogger } from '../../../shared/lib/debug.js';
import { readdir, access } from 'fs/promises';
import { join, dirname } from 'path';

/**
 * Check if a file exists
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
 * PostToolUse hook handler for adding folder context
 *
 * Discovers CLAUDE.md files related to the file being read and provides
 * them as clickable links in the additional context.
 *
 * Searches for CLAUDE.md files in:
 * 1. Project root
 * 2. Parent folders of the file being read
 * 3. Immediate child folders of the directory containing the file
 *
 * @param input - PostToolUse hook input from Claude Code
 * @returns Hook output with CLAUDE.md links as additional context
 *
 * @example
 * This hook is automatically called by Claude Code after Read operations.
 * If related CLAUDE.md files are found, they're provided as markdown links
 * in the additional context.
 */
export default async function (
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
