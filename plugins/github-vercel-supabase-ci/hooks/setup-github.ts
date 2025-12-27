/**
 * GitHub CLI Setup Hook
 * SessionStart hook that installs and configures GitHub CLI for the project.
 * Ensures gh commands can be used throughout the session.
 * @module setup-github
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
 * Wraps child_process.exec with structured error handling and timeout support.
 * @param command - The shell command to execute
 * @param options - Execution options
 * @param options.cwd - Working directory for command execution
 * @param options.timeout - Maximum execution time in milliseconds
 * @param options.env - Environment variables to pass to the command
 * @returns Structured result with success flag and output streams
 * @example
 * ```typescript
 * const result = await execCommand('gh --version', { cwd: '/project' });
 * if (result.success) {
 *   console.log('GitHub CLI version:', result.stdout);
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
 * const hasGh = await isCommandAvailable('gh');
 * if (hasGh) {
 *   console.log('GitHub CLI is installed');
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
 * Get GitHub CLI version
 * @returns Version string or null if not available
 */
async function getGhVersion(): Promise<string | null> {
  const result = await execCommand('gh --version');
  if (result.success) {
    // Parse version from "gh version 2.x.x (yyyy-mm-dd)"
    const match = result.stdout.match(/gh version ([\d.]+)/);
    return match ? match[1] : null;
  }
  return null;
}

/**
 * Get latest GitHub CLI version from GitHub releases
 * @returns Latest version string or null if unavailable
 */
async function getLatestGhVersion(): Promise<string | null> {
  const result = await execCommand('curl -s https://api.github.com/repos/cli/cli/releases/latest | grep tag_name', { timeout: 15000 });
  if (result.success) {
    // Parse from "tag_name": "v2.x.x"
    const match = result.stdout.match(/"v?([\d.]+)"/);
    return match ? match[1] : null;
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
 * Install GitHub CLI (gh) on Ubuntu
 * Installs gh from GitHub's official APT repository if not already installed.
 * @returns Execution result with installation status
 * @example
 * ```typescript
 * const result = await installGitHubCLI();
 * if (result.success) {
 *   console.log('GitHub CLI installed successfully');
 * }
 * ```
 */
async function installGitHubCLI(): Promise<ExecResult> {
  // Check if already installed
  if (await isCommandAvailable('gh')) {
    return { success: true, stdout: 'gh already installed', stderr: '' };
  }

  // Install from GitHub's official repository
  const commands = [
    'curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg',
    'sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg',
    'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null',
    'sudo apt-get update',
    'sudo apt-get install -y gh',
  ];

  for (const cmd of commands) {
    const result = await execCommand(cmd);
    if (!result.success) {
      return { success: false, stdout: '', stderr: `Failed to install gh: ${result.stderr}` };
    }
  }

  return { success: true, stdout: 'gh installed successfully', stderr: '' };
}

/**
 * Check if GitHub CLI is authenticated
 * Verifies GitHub authentication by running gh auth status command.
 * @returns True if GitHub CLI is authenticated
 * @example
 * ```typescript
 * const authed = await isAuthenticated();
 * if (!authed) {
 *   console.log('Please run: gh auth login');
 * }
 * ```
 */
async function isAuthenticated(): Promise<boolean> {
  const result = await execCommand('gh auth status');
  return result.success;
}

/**
 * SessionStart hook handler
 * Installs GitHub CLI and ensures repository is linked for gh commands.
 * @param input - SessionStart hook input from Claude Code
 * @returns Hook output with setup status as additional context
 * @example
 * ```typescript
 * // This hook is automatically called by Claude Code
 * // when a new session starts
 * ```
 */
async function handler(input: SessionStartInput): Promise<SessionStartHookOutput> {
  const logger = createDebugLogger(input.cwd, 'setup-github', true);
  const isRemote = isRemoteEnvironment();
  const messages: string[] = [];

  try {
    await logger.logInput({
      source: input.source,
      session_id: input.session_id,
      is_remote: isRemote,
    });

    // Check if gh is installed
    const ghAvailable = await isCommandAvailable('gh');

    if (!ghAvailable) {
      if (isRemote) {
        // Install in remote environment
        messages.push('🔧 Installing GitHub CLI...');
        const installResult = await installGitHubCLI();
        messages.push(`  ${installResult.success ? '✓' : '⚠️'} ${installResult.stdout || installResult.stderr}`);
      } else {
        // Just report missing in local environment
        messages.push('⚠️  GitHub CLI not installed');
        messages.push('   Install with: curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && sudo apt install gh');
      }
    } else {
      const ghVersion = await getGhVersion();
      messages.push(`✓ GitHub CLI v${ghVersion || 'unknown'}`);

      // Check for updates
      const latestVersion = await getLatestGhVersion();
      if (ghVersion && latestVersion && isVersionOlder(ghVersion, latestVersion)) {
        if (isRemote) {
          messages.push(`⚠️  UPDATE AVAILABLE: gh v${latestVersion} (current: v${ghVersion})`);
          messages.push('   Consider updating for latest features and fixes');
        } else {
          messages.push(`⚠️  Update available: v${latestVersion}`);
          messages.push('   Run: gh upgrade');
        }
      }

      // Check authentication status
      const authed = await isAuthenticated();
      if (authed) {
        messages.push('✓ GitHub CLI authenticated');
      } else {
        messages.push('⚠️  GitHub CLI not authenticated');
        messages.push('   Run: gh auth login');
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
        additionalContext: `GitHub CLI setup error: ${error}`,
      },
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
