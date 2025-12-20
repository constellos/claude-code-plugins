/**
 * GitHub Actions workflow installation hook
 *
 * SessionStart hook that copies bundled workflow files from the plugin directory
 * to the project's .github/workflows/ directory. Preserves existing workflows by
 * only copying files that don't already exist.
 *
 * This enables projects to automatically receive CI/CD workflow templates for:
 * - Type checking and linting
 * - Test execution
 * - Vercel deployments
 * - Supabase migrations
 *
 * @module install-workflows
 */

import type { SessionStartInput, SessionStartHookOutput } from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

/**
 * Copy a file only if destination doesn't exist
 *
 * Safe copy operation that preserves existing files. Creates parent directories
 * as needed before copying.
 *
 * @param src - Source file path
 * @param dest - Destination file path
 * @returns Result object with copy status and existence flags
 *
 * @example
 * ```typescript
 * const result = await copyFileIfNotExists(
 *   '/plugin/.github-workflows/ci.yml',
 *   '/project/.github/workflows/ci.yml'
 * );
 * if (result.copied) {
 *   console.log('Workflow installed');
 * } else if (result.existed) {
 *   console.log('Workflow already exists');
 * }
 * ```
 */
async function copyFileIfNotExists(
  src: string,
  dest: string
): Promise<{ copied: boolean; existed: boolean; error?: string }> {
  try {
    // Check if destination exists
    try {
      await fs.access(dest);
      return { copied: false, existed: true };
    } catch {
      // Destination doesn't exist, proceed with copy
    }

    // Ensure destination directory exists
    await fs.mkdir(path.dirname(dest), { recursive: true });

    // Copy file
    await fs.copyFile(src, dest);

    return { copied: true, existed: false };
  } catch (error) {
    return {
      copied: false,
      existed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * SessionStart hook handler for installing GitHub Actions workflows
 *
 * Copies workflow files from the plugin's .github-workflows/ directory
 * to the project's .github/workflows/ directory.
 *
 * @param input - SessionStart hook input from Claude Code
 * @returns Hook output with installation status
 */
async function handler(input: SessionStartInput): Promise<SessionStartHookOutput> {
  const logger = createDebugLogger(input.cwd, 'install-workflows', true);
  const DEBUG = process.env.DEBUG === '*' || process.env.DEBUG?.includes('workflows');

  try {
    await logger.logInput({
      source: input.source,
      session_id: input.session_id,
    });

    // Get plugin root from environment
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
    if (!pluginRoot) {
      await logger.logOutput({
        skipped: true,
        reason: 'CLAUDE_PLUGIN_ROOT not set',
      });
      return {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: '',
        },
      };
    }

    // Check if we're in a git repository
    try {
      await execAsync('git rev-parse --is-inside-work-tree', { cwd: input.cwd });
    } catch {
      await logger.logOutput({
        skipped: true,
        reason: 'Not a git repository',
      });
      return {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: '',
        },
      };
    }

    const workflowsSourceDir = path.join(pluginRoot, '.github-workflows');
    const workflowsDestDir = path.join(input.cwd, '.github', 'workflows');

    // Check if source directory exists
    try {
      await fs.access(workflowsSourceDir);
    } catch {
      await logger.logOutput({
        skipped: true,
        reason: 'No workflow templates found in plugin',
      });
      return {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: '',
        },
      };
    }

    // Get list of workflow files
    const workflowFiles = await fs.readdir(workflowsSourceDir);
    const ymlFiles = workflowFiles.filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

    if (ymlFiles.length === 0) {
      await logger.logOutput({
        skipped: true,
        reason: 'No .yml workflow files found',
      });
      return {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: '',
        },
      };
    }

    const results: Array<{
      file: string;
      copied: boolean;
      existed: boolean;
      error?: string;
    }> = [];

    // Copy each workflow file
    for (const file of ymlFiles) {
      const src = path.join(workflowsSourceDir, file);
      const dest = path.join(workflowsDestDir, file);

      const result = await copyFileIfNotExists(src, dest);
      results.push({ file, ...result });

      if (DEBUG) {
        if (result.copied) {
          console.log(`[install-workflows] ✓ Installed: ${file}`);
        } else if (result.existed) {
          console.log(`[install-workflows] - Already exists: ${file}`);
        } else if (result.error) {
          console.log(`[install-workflows] ✗ Error with ${file}: ${result.error}`);
        }
      }
    }

    const copiedCount = results.filter(r => r.copied).length;
    const existedCount = results.filter(r => r.existed).length;
    const errorCount = results.filter(r => r.error).length;

    await logger.logOutput({
      success: true,
      workflows_copied: copiedCount,
      workflows_existed: existedCount,
      workflows_errors: errorCount,
      results,
    });

    // Build message for Claude
    const messages: string[] = [];

    if (copiedCount > 0) {
      messages.push(`✓ Installed ${copiedCount} GitHub Actions workflow(s):`);
      results
        .filter(r => r.copied)
        .forEach(r => messages.push(`  - ${r.file}`));
    }

    if (existedCount > 0) {
      messages.push(`- ${existedCount} workflow(s) already exist (not overwritten)`);
    }

    if (errorCount > 0) {
      messages.push(`⚠ ${errorCount} workflow(s) had errors`);
      results
        .filter(r => r.error)
        .forEach(r => messages.push(`  - ${r.file}: ${r.error}`));
    }

    const additionalContext = messages.length > 0
      ? messages.join('\n')
      : '';

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext,
      },
    };
  } catch (error) {
    await logger.logError(error as Error);

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `Workflow installation error: ${error}`,
      },
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
