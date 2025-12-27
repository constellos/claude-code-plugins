/**
 * Claude CLI Setup Hook
 * SessionStart hook that verifies and installs Claude CLI in remote environments.
 * @module setup-claude
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
 * @param command - The shell command to execute
 * @param options - Execution options
 * @returns Structured result with success flag and output streams
 */
async function execCommand(
  command: string,
  options: { cwd?: string; timeout?: number; env?: Record<string, string> } = {}
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: options.cwd,
      timeout: options.timeout || 120000,
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
 * @param command - Command name to check
 * @returns True if command is available in PATH
 */
async function isCommandAvailable(command: string): Promise<boolean> {
  const result = await execCommand(`which ${command}`);
  return result.success && result.stdout.length > 0;
}

/**
 * Detect if running in remote (cloud) environment
 * @returns True if running in remote/cloud environment
 */
function isRemoteEnvironment(): boolean {
  return process.env.CLAUDE_CODE_REMOTE === 'true';
}

/**
 * Get Claude CLI version
 * @returns Version string or null if not available
 */
async function getClaudeVersion(): Promise<string | null> {
  const result = await execCommand('claude --version');
  if (result.success) {
    const match = result.stdout.match(/([\d.]+)/);
    return match ? match[1] : result.stdout;
  }
  return null;
}

/**
 * Get latest Claude CLI version from npm
 * @returns Latest version string or null if unavailable
 */
async function getLatestClaudeVersion(): Promise<string | null> {
  const result = await execCommand('npm view @anthropic-ai/claude-code version', { timeout: 30000 });
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
 * Install Claude CLI via npm
 * @returns Execution result with installation status
 */
async function installClaudeCLI(): Promise<ExecResult> {
  // Check if already installed
  if (await isCommandAvailable('claude')) {
    const version = await getClaudeVersion();
    return { success: true, stdout: `Claude CLI already installed (v${version})`, stderr: '' };
  }

  // Install globally via npm
  const result = await execCommand('npm install -g @anthropic-ai/claude-code', { timeout: 180000 });
  if (result.success) {
    const version = await getClaudeVersion();
    return { success: true, stdout: `Claude CLI installed (v${version})`, stderr: '' };
  }

  return { success: false, stdout: '', stderr: `Failed to install Claude CLI: ${result.stderr}` };
}

/**
 * SessionStart hook handler
 * Verifies Claude CLI is installed, installs if missing in remote environments.
 * Checks for updates and warns appropriately based on environment.
 * @param input - SessionStart hook input from Claude Code
 * @returns Hook output with setup status
 */
async function handler(input: SessionStartInput): Promise<SessionStartHookOutput> {
  const logger = createDebugLogger(input.cwd, 'setup-claude', true);
  const isRemote = isRemoteEnvironment();
  const messages: string[] = [];

  try {
    await logger.logInput({
      source: input.source,
      session_id: input.session_id,
      is_remote: isRemote,
    });

    // Check Claude CLI
    const claudeVersion = await getClaudeVersion();

    if (claudeVersion) {
      messages.push(`✓ Claude CLI v${claudeVersion}`);

      // Check for updates
      const latestVersion = await getLatestClaudeVersion();
      if (latestVersion && isVersionOlder(claudeVersion, latestVersion)) {
        if (isRemote) {
          messages.push(`⚠️  UPDATE AVAILABLE: Claude CLI v${latestVersion} (current: v${claudeVersion})`);
          messages.push('   Consider updating for latest features and fixes');
        } else {
          messages.push(`⚠️  Update available: v${latestVersion}`);
          messages.push('   Run: npm install -g @anthropic-ai/claude-code');
        }
      }
    } else if (isRemote) {
      // Install in remote environment
      messages.push('🔧 Installing Claude CLI...');
      const installResult = await installClaudeCLI();
      messages.push(`  ${installResult.success ? '✓' : '⚠️'} ${installResult.stdout || installResult.stderr}`);
    } else {
      // Report missing in local environment
      messages.push('⚠️  Claude CLI not installed');
      messages.push('   Install with: npm install -g @anthropic-ai/claude-code');
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
        additionalContext: `Claude CLI setup error: ${error}`,
      },
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
