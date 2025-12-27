/**
 * Supabase CLI Setup Hook
 * SessionStart hook that installs Supabase CLI.
 * On remote: always installs if missing. On local: warns if missing or outdated.
 * @module setup-supabase
 */

import type { SessionStartInput, SessionStartHookOutput } from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { exec } from 'child_process';
import { promisify } from 'util';

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
 * Get Supabase CLI version
 */
async function getSupabaseVersion(): Promise<string | null> {
  const result = await execCommand('supabase --version');
  if (result.success) {
    const match = result.stdout.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  }
  return null;
}

/**
 * Get latest Supabase CLI version from npm
 */
async function getLatestSupabaseVersion(): Promise<string | null> {
  const result = await execCommand('npm view supabase version', { timeout: 15000 });
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
 * Install Supabase CLI via npm
 */
async function installSupabaseCLI(): Promise<ExecResult> {
  if (await isCommandAvailable('supabase')) {
    return { success: true, stdout: 'supabase already installed', stderr: '' };
  }

  const result = await execCommand('npm install -g supabase');
  if (!result.success) {
    return { success: false, stdout: '', stderr: `Failed to install supabase: ${result.stderr}` };
  }
  return { success: true, stdout: 'supabase installed successfully', stderr: '' };
}

/**
 * SessionStart hook handler
 * On remote: installs supabase if missing. On local: warns if missing or outdated.
 */
async function handler(input: SessionStartInput): Promise<SessionStartHookOutput> {
  const logger = createDebugLogger(input.cwd, 'setup-supabase', true);
  const isRemote = isRemoteEnvironment();
  const messages: string[] = [];

  try {
    await logger.logInput({
      source: input.source,
      session_id: input.session_id,
      is_remote: isRemote,
    });

    const supabaseAvailable = await isCommandAvailable('supabase');

    if (!supabaseAvailable) {
      if (isRemote) {
        messages.push('Installing Supabase CLI...');
        const installResult = await installSupabaseCLI();
        messages.push(installResult.success ? '✓ supabase installed' : `⚠️ ${installResult.stderr}`);
      } else {
        messages.push('⚠️ Supabase CLI not installed');
        messages.push('  Install: npm install -g supabase');
      }
    } else {
      const supabaseVersion = await getSupabaseVersion();
      messages.push(`✓ Supabase CLI v${supabaseVersion || 'unknown'}`);

      const latestVersion = await getLatestSupabaseVersion();
      if (supabaseVersion && latestVersion && isVersionOlder(supabaseVersion, latestVersion)) {
        messages.push(`⚠️ Update available: v${latestVersion} (current: v${supabaseVersion})`);
        if (!isRemote) {
          messages.push('  Run: npm install -g supabase');
        }
      }
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
        additionalContext: `Supabase CLI setup error: ${error}`,
      },
    };
  }
}

export { handler };
runHook(handler);
