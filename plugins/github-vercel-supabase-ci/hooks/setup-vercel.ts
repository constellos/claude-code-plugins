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
 * Get Vercel CLI version
 * @returns Version string or null if not available
 */
async function getVercelVersion(): Promise<string | null> {
  const result = await execCommand('vercel --version');
  if (result.success) {
    // Parse version from "Vercel CLI x.x.x"
    const match = result.stdout.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  }
  return null;
}

/**
 * Get latest Vercel CLI version from npm
 * @returns Latest version string or null if unavailable
 */
async function getLatestVercelVersion(): Promise<string | null> {
  const result = await execCommand('npm view vercel version', { timeout: 15000 });
  if (result.success) {
    return result.stdout.trim();
  }
  return null;
}

/**
 * Compare semver versions
 * @returns true if v1 < v2
 */
function isVersionOlder(v1: string, v2: string): boolean {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 < p2) return true;
    if (p1 > p2) return false;
  }
  return false;
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
      const vercelVersion = await getVercelVersion();
      messages.push(`✓ Vercel CLI v${vercelVersion || 'unknown'}`);

      // Check for updates
      const latestVersion = await getLatestVercelVersion();
      if (vercelVersion && latestVersion && isVersionOlder(vercelVersion, latestVersion)) {
        if (isRemote) {
          messages.push(`⚠️  UPDATE AVAILABLE: vercel v${latestVersion} (current: v${vercelVersion})`);
          messages.push('   Consider updating for latest features and fixes');
        } else {
          messages.push(`⚠️  Update available: v${latestVersion}`);
          messages.push('   Run: npm install -g vercel');
        }
      }

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
