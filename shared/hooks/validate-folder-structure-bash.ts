/**
 * PreToolUse Hook - Validate Folder Structure (Bash)
 *
 * This hook fires before Bash commands to validate folder creation against
 * CLAUDE.md folder specifications. Validates mkdir commands to ensure new
 * subdirectories are allowed by parent folder configuration.
 *
 * Checks parent CLAUDE.md for folder.subfolders specifications:
 * - allowed: Patterns that subfolder names must match
 * - required: (not checked during creation)
 * - forbidden: Patterns that must not match
 *
 * @module hooks/validate-folder-structure-bash
 */

import type { PreToolUseInput, PreToolUseHookOutput } from '../types/types.js';
import { createDebugLogger } from './utils/debug.js';
import { runHook } from './utils/io.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';

interface ValidationSpec {
  allowed?: string[];
  required?: string[];
  forbidden?: string[];
}

interface FolderSpec {
  subfolders?: ValidationSpec;
  files?: ValidationSpec;
}

interface ClaudeMdFrontmatter {
  title?: string;
  description?: string;
  folder?: FolderSpec;
  [key: string]: unknown;
}

/**
 * Check if a string matches a gitignore-style pattern
 */
function matchesGitignorePattern(value: string, pattern: string): boolean {
  if (value === pattern) {
    return true;
  }

  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(value);
}

/**
 * Extract directory paths from mkdir command
 * Handles: mkdir foo, mkdir -p foo/bar, mkdir foo bar baz
 */
function extractMkdirPaths(command: string): string[] {
  const paths: string[] = [];

  // Remove 'mkdir' and common flags
  const cleaned = command
    .replace(/^mkdir\s+/, '')
    .replace(/-[a-z]+\s+/g, ''); // Remove flags like -p, -v

  // Split by spaces (simple approach - doesn't handle quoted paths with spaces)
  const parts = cleaned.split(/\s+/).filter(p => p.length > 0);

  for (const part of parts) {
    // Skip if it looks like a flag
    if (part.startsWith('-')) {
      continue;
    }
    paths.push(part);
  }

  return paths;
}

/**
 * Find parent CLAUDE.md file
 */
async function findParentClaudeMd(dirPath: string, cwd: string): Promise<string | null> {
  let currentDir = dirPath;

  // Walk up directory tree
  while (currentDir.startsWith(cwd)) {
    const claudeMdPath = path.join(currentDir, 'CLAUDE.md');

    try {
      await fs.access(claudeMdPath);
      return claudeMdPath;
    } catch {
      // File doesn't exist, continue up
    }

    // Move to parent directory
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached root
      break;
    }
    currentDir = parentDir;
  }

  return null;
}

/**
 * Validate folder name against subfolder spec
 */
function validateFolderName(
  folderName: string,
  spec: ValidationSpec
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check forbidden patterns
  if (spec.forbidden) {
    for (const forbiddenPattern of spec.forbidden) {
      if (matchesGitignorePattern(folderName, forbiddenPattern)) {
        errors.push(`Folder "${folderName}" matches forbidden pattern "${forbiddenPattern}"`);
      }
    }
  }

  // Check allowed patterns (if specified, folder must match at least one)
  if (spec.allowed && spec.allowed.length > 0) {
    const isAllowed = spec.allowed.some(pattern =>
      matchesGitignorePattern(folderName, pattern)
    );

    if (!isAllowed) {
      errors.push(
        `Folder "${folderName}" is not allowed. Allowed patterns: ${spec.allowed.join(', ')}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * PreToolUse hook handler for validating folder structure in Bash commands
 */
async function handler(input: PreToolUseInput): Promise<PreToolUseHookOutput> {
  // Only run for Bash tool
  if (input.tool_name !== 'Bash') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  const logger = createDebugLogger(input.cwd, 'validate-folder-structure-bash', true);

  try {
    await logger.logInput({
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
    });

    const toolInput = input.tool_input as { command?: string };
    const command = toolInput.command;

    if (!command) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };
    }

    // Only check mkdir commands
    if (!command.trim().startsWith('mkdir')) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };
    }

    // Extract paths from mkdir command
    const mkdirPaths = extractMkdirPaths(command);
    await logger.logOutput({ mkdirPaths });

    if (mkdirPaths.length === 0) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };
    }

    // Validate each path
    const allErrors: string[] = [];

    for (const mkdirPath of mkdirPaths) {
      // Resolve to absolute path
      const absolutePath = path.isAbsolute(mkdirPath)
        ? mkdirPath
        : path.resolve(input.cwd, mkdirPath);

      // Get parent directory
      const parentDir = path.dirname(absolutePath);
      const folderName = path.basename(absolutePath);

      await logger.logOutput({
        mkdirPath,
        absolutePath,
        parentDir,
        folderName,
      });

      // Find parent CLAUDE.md
      const claudeMdPath = await findParentClaudeMd(parentDir, input.cwd);

      if (!claudeMdPath) {
        await logger.logOutput({
          message: `No CLAUDE.md found for ${mkdirPath}, allowing`,
        });
        continue;
      }

      // Read and parse CLAUDE.md
      const claudeMdContent = await fs.readFile(claudeMdPath, 'utf-8');
      const { data } = matter(claudeMdContent);
      const frontmatter = data as ClaudeMdFrontmatter;

      await logger.logOutput({
        claudeMdPath,
        frontmatter,
      });

      // Check if there's a subfolder spec
      if (!frontmatter.folder?.subfolders) {
        await logger.logOutput({
          message: `No subfolder spec in ${claudeMdPath}, allowing`,
        });
        continue;
      }

      // Validate the folder name
      const validation = validateFolderName(
        folderName,
        frontmatter.folder.subfolders
      );

      if (!validation.valid) {
        allErrors.push(
          `Cannot create folder in ${path.dirname(claudeMdPath)}:\n` +
            validation.errors.map(e => `  - ${e}`).join('\n')
        );
      }
    }

    // If any validations failed, deny the operation
    if (allErrors.length > 0) {
      const errorMessage = allErrors.join('\n\n');

      await logger.logOutput({
        valid: false,
        errors: allErrors,
      });

      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            `Folder structure validation failed:\n\n${errorMessage}\n\n` +
            `Check the CLAUDE.md file in the parent directory for allowed subfolder patterns.`,
        },
      };
    }

    await logger.logOutput({ valid: true });

    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  } catch (error: unknown) {
    await logger.logError(error as Error);

    // On error, allow the operation but log a system message
    return {
      systemMessage: `Folder validation hook failed: ${(error as Error).message || 'Unknown error'}`,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
