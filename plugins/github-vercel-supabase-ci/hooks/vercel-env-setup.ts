/**
 * Vercel Environment Setup Hook
 *
 * SessionStart hook that syncs Vercel environment variables from the project
 * to the local .env.local file. This ensures that worktrees have the same
 * environment configuration as the main repository.
 *
 * @module vercel-env-setup
 */

import type {
  SessionStartInput,
  SessionStartHookOutput,
} from '../../../shared/types/types.js';
import { runHook } from '../../../shared/hooks/utils/io.js';
import { createDebugLogger } from '../../../shared/hooks/utils/debug.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

/**
 * SessionStart hook handler for Vercel environment setup
 *
 * Executes at session start to sync environment variables from Vercel project.
 * Checks if .vercel directory exists, and if so, runs `vercel env pull --yes`
 * to download environment variables to .env.local.
 *
 * @param input - SessionStart hook input from Claude Code
 * @returns Hook output with additional context about env sync status
 *
 * @example
 * ```typescript
 * // This hook is automatically called by Claude Code
 * // when a new session starts
 * ```
 */
async function handler(
  input: SessionStartInput
): Promise<SessionStartHookOutput> {
  const logger = createDebugLogger(
    input.cwd,
    'vercel-env-setup',
    true
  );

  try {
    await logger.logInput({
      source: input.source,
      session_id: input.session_id,
      cwd: input.cwd,
    });

    // Check if .vercel directory exists
    const vercelDir = join(input.cwd, '.vercel');
    if (!existsSync(vercelDir)) {
      const skipMessage = 'Vercel not configured, skipping env pull';

      await logger.logOutput({
        success: true,
        skipped: true,
        message: skipMessage,
      });

      return {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: skipMessage,
        },
      };
    }

    // Pull environment variables from Vercel
    await logger.logOutput({
      message: 'Pulling Vercel environment variables...',
    });

    const { stdout, stderr } = await execAsync('vercel env pull --yes', {
      cwd: input.cwd,
    });

    const successMessage = 'Vercel environment variables synced successfully';

    await logger.logOutput({
      success: true,
      message: successMessage,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    });

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: successMessage,
      },
    };
  } catch (error) {
    const errorMessage = `Vercel env pull failed: ${
      error instanceof Error ? error.message : String(error)
    }`;

    await logger.logError(error as Error);

    // Non-blocking: return success even on error
    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: errorMessage,
      },
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
