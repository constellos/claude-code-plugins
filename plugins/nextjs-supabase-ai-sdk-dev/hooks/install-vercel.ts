/**
 * Vercel CLI Setup Hook
 * SessionStart hook that installs Vercel CLI and syncs environment variables.
 * On remote: always installs if missing. On local: warns if missing or outdated.
 * @module install-vercel
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
 */
async function isCommandAvailable(command: string): Promise<boolean> {
  const result = await execCommand(`which ${command}`);
  return result.success && result.stdout.length > 0;
}

/**
 * Detect if running in remote (cloud) environment
 */
function isRemoteEnvironment(): boolean {
  return process.env.CLAUDE_CODE_REMOTE === 'true';
}

/**
 * Get Vercel CLI version
 */
async function getVercelVersion(): Promise<string | null> {
  const result = await execCommand('vercel --version');
  if (result.success) {
    const match = result.stdout.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  }
  return null;
}

/**
 * Get latest Vercel CLI version from npm
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
 */
async function installVercelCLI(): Promise<ExecResult> {
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
 */
async function syncVercelEnv(cwd: string): Promise<ExecResult> {
  const vercelDir = join(cwd, '.vercel');
  if (!existsSync(vercelDir)) {
    return {
      success: true,
      stdout: 'Vercel not configured, skipping env pull',
      stderr: '',
    };
  }

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
    stdout: 'Vercel environment variables synced',
    stderr: '',
  };
}

/**
 * SessionStart hook handler
 * On remote: installs vercel if missing. On local: warns if missing or outdated.
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

    const vercelAvailable = await isCommandAvailable('vercel');

    if (!vercelAvailable) {
      if (isRemote) {
        messages.push('Installing Vercel CLI...');
        const installResult = await installVercelCLI();
        messages.push(installResult.success ? '✓ vercel installed' : `⚠️ ${installResult.stderr}`);
      } else {
        messages.push('⚠️ Vercel CLI not installed');
        messages.push('  Install: npm install -g vercel');
      }
    } else {
      const vercelVersion = await getVercelVersion();
      messages.push(`✓ Vercel CLI v${vercelVersion || 'unknown'}`);

      const latestVersion = await getLatestVercelVersion();
      if (vercelVersion && latestVersion && isVersionOlder(vercelVersion, latestVersion)) {
        messages.push(`⚠️ Update available: v${latestVersion} (current: v${vercelVersion})`);
        if (!isRemote) {
          messages.push('  Run: npm install -g vercel');
        }
      }

      const syncResult = await syncVercelEnv(input.cwd);
      messages.push(syncResult.success ? `✓ ${syncResult.stdout}` : `⚠️ ${syncResult.stderr}`);
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

export { handler };
runHook(handler);
