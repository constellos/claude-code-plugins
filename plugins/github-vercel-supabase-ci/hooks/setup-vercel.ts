/**
 * Vercel Setup Hook
 * SessionStart hook that installs Vercel CLI and syncs environment variables.
 * Ensures Vercel commands are available and environment is configured for deployments.
 * @module setup-vercel
 */

import type { SessionStartInput, SessionStartHookOutput } from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

interface ExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

/**
 * Execute a shell command with error handling
 * Wraps child_process.exec with structured error handling and timeout support.
 * @param command - The shell command to execute
 * @param options - Execution options
 * @param options.cwd - Working directory for command execution
 * @param options.timeout - Maximum execution time in milliseconds
 * @param options.env - Environment variables to pass to the command
 * @returns Structured result with success flag and output streams
 * @example
 * ```typescript
 * const result = await execCommand('vercel --version', { cwd: '/project' });
 * if (result.success) {
 *   console.log('Vercel CLI version:', result.stdout);
 * }
 * ```
 */
async function execCommand(
  command: string,
  options: { cwd?: string; timeout?: number; env?: Record<string, string> } = {}
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: options.cwd,
      timeout: options.timeout || 300000,
      env: { ...process.env, ...options.env },
    });
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      success: false,
      stdout: err.stdout?.trim() || '',
      stderr: err.stderr?.trim() || err.message || '',
    };
  }
}

/**
 * Check if a command is available in PATH
 * Verifies command availability by checking which command output.
 * @param command - Command name to check
 * @returns True if command is available in PATH
 * @example
 * ```typescript
 * const hasVercel = await isCommandAvailable('vercel');
 * if (hasVercel) {
 *   console.log('Vercel CLI is installed');
 * }
 * ```
 */
async function isCommandAvailable(command: string): Promise<boolean> {
  const result = await execCommand(`which ${command}`);
  return result.success && result.stdout.length > 0;
}

/**
 * Detect if running in remote (cloud) environment
 * Checks CLAUDE_CODE_REMOTE environment variable to determine execution context.
 * @returns True if running in remote/cloud environment
 * @example
 * ```typescript
 * if (isRemoteEnvironment()) {
 *   console.log('Running in cloud environment');
 * }
 * ```
 */
function isRemoteEnvironment(): boolean {
  return process.env.CLAUDE_CODE_REMOTE === 'true';
}

/**
 * Install Vercel CLI globally via npm
 * Installs vercel npm package globally if not already installed.
 * @returns Execution result with installation status
 * @example
 * ```typescript
 * const result = await installVercelCLI();
 * if (result.success) {
 *   console.log('Vercel CLI installed successfully');
 * }
 * ```
 */
async function installVercelCLI(): Promise<ExecResult> {
  // Check if already installed
  if (await isCommandAvailable('vercel')) {
    return { success: true, stdout: 'vercel already installed', stderr: '' };
  }

  const result = await execCommand('npm install -g vercel');
  if (!result.success) {
    return { success: false, stdout: '', stderr: `Failed to install vercel: ${result.stderr}` };
  }
  return { success: true, stdout: 'vercel installed successfully', stderr: '' };
}

/**
 * Sync Vercel environment variables to .env.local
 * Pulls environment variables from Vercel project if .vercel directory exists.
 * @param cwd - Working directory containing .vercel configuration
 * @returns Execution result with sync status
 * @example
 * ```typescript
 * const result = await syncVercelEnv('/project');
 * if (result.success) {
 *   console.log('Environment variables synced');
 * }
 * ```
 */
async function syncVercelEnv(cwd: string): Promise<ExecResult> {
  // Check if .vercel directory exists
  const vercelDir = join(cwd, '.vercel');
  if (!existsSync(vercelDir)) {
    return {
      success: true,
      stdout: 'Vercel not configured, skipping env pull',
      stderr: '',
    };
  }

  // Pull environment variables
  const result = await execCommand('vercel env pull --yes', { cwd });
  if (!result.success) {
    return {
      success: false,
      stdout: '',
      stderr: `Failed to pull Vercel env: ${result.stderr}`,
    };
  }

  return {
    success: true,
    stdout: 'Vercel environment variables synced successfully',
    stderr: '',
  };
}

/**
 * SessionStart hook handler
 * Installs Vercel CLI and syncs environment variables from Vercel project.
 * @param input - SessionStart hook input from Claude Code
 * @returns Hook output with setup status as additional context
 * @example
 * ```typescript
 * // This hook is automatically called by Claude Code
 * // when a new session starts
 * ```
 */
async function handler(input: SessionStartInput): Promise<SessionStartHookOutput> {
  const logger = createDebugLogger(input.cwd, 'setup-vercel', true);
  const isRemote = isRemoteEnvironment();
  const messages: string[] = [];

  try {
    await logger.logInput({
      source: input.source,
      session_id: input.session_id,
      is_remote: isRemote,
    });

    // Check if vercel is installed
    const vercelAvailable = await isCommandAvailable('vercel');

    if (!vercelAvailable) {
      if (isRemote) {
        // Install in remote environment
        messages.push('🔧 Installing Vercel CLI...');
        const installResult = await installVercelCLI();
        messages.push(`  ${installResult.success ? '✓' : '⚠️'} ${installResult.stdout || installResult.stderr}`);
      } else {
        // Just report missing in local environment
        messages.push('⚠️  Vercel CLI not installed');
        messages.push('   Install with: npm install -g vercel');
      }
    } else {
      messages.push('✓ Vercel CLI installed');

      // Sync environment variables
      const syncResult = await syncVercelEnv(input.cwd);
      messages.push(`  ${syncResult.success ? '✓' : '⚠️'} ${syncResult.stdout || syncResult.stderr}`);
    }

    const finalMessage = messages.join('\n');

    await logger.logOutput({
      success: true,
      is_remote: isRemote,
      message: finalMessage,
    });

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: finalMessage,
      },
    };
  } catch (error) {
    await logger.logError(error as Error);

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `Vercel setup error: ${error}`,
      },
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
