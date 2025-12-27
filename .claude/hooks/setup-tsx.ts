/**
 * tsx and Claude CLI Setup Hook
 * SessionStart hook that ensures tsx is available via npx and
 * verifies/installs Claude CLI in remote environments.
 * @module setup-tsx
 */

import type { SessionStartInput, SessionStartHookOutput } from '../../shared/types/types.js';
import { runHook } from '../../shared/hooks/utils/io.js';
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
      timeout: options.timeout || 60000,
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
 * Checks CLAUDE_CODE_REMOTE environment variable.
 * @returns True if running in remote/cloud environment
 */
function isRemoteEnvironment(): boolean {
  return process.env.CLAUDE_CODE_REMOTE === 'true';
}

/**
 * Get tsx version via npx
 * @returns Version string or null if not available
 */
async function getTsxVersion(): Promise<string | null> {
  const result = await execCommand('npx tsx --version');
  if (result.success) {
    // Parse version from output like "tsx v4.21.0"
    const match = result.stdout.match(/tsx v?([\d.]+)/);
    return match ? match[1] : result.stdout;
  }
  return null;
}

/**
 * Get Claude CLI version
 * @returns Version string or null if not available
 */
async function getClaudeVersion(): Promise<string | null> {
  const result = await execCommand('claude --version');
  if (result.success) {
    // Parse version from output like "2.0.59 (Claude Code)"
    const match = result.stdout.match(/([\d.]+)/);
    return match ? match[1] : result.stdout;
  }
  return null;
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
  const result = await execCommand('npm install -g @anthropic-ai/claude-code', { timeout: 120000 });
  if (result.success) {
    const version = await getClaudeVersion();
    return { success: true, stdout: `Claude CLI installed successfully (v${version})`, stderr: '' };
  }

  return { success: false, stdout: '', stderr: `Failed to install Claude CLI: ${result.stderr}` };
}

/**
 * SessionStart hook handler
 * Ensures tsx is available via npx and verifies/installs Claude CLI.
 * @param input - SessionStart hook input from Claude Code
 * @returns Hook output with setup status
 */
async function handler(input: SessionStartInput): Promise<SessionStartHookOutput> {
  const isRemote = isRemoteEnvironment();
  const messages: string[] = [];

  try {
    // Check tsx availability via npx
    const tsxVersion = await getTsxVersion();
    if (tsxVersion) {
      messages.push(`tsx v${tsxVersion} available via npx`);
    } else {
      messages.push('tsx not available via npx - hooks may fail');
    }

    // Check Claude CLI
    const claudeVersion = await getClaudeVersion();
    if (claudeVersion) {
      messages.push(`Claude CLI v${claudeVersion} installed`);
    } else if (isRemote) {
      // Install in remote environment
      messages.push('Installing Claude CLI...');
      const installResult = await installClaudeCLI();
      if (installResult.success) {
        messages.push(`  ${installResult.stdout}`);
      } else {
        messages.push(`  Failed: ${installResult.stderr}`);
      }
    } else {
      // Just report missing in local environment
      messages.push('Claude CLI not installed');
      messages.push('  Install with: npm install -g @anthropic-ai/claude-code');
    }

    const finalMessage = messages.join('\n');

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: finalMessage,
      },
    };
  } catch (error) {
    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `Setup error: ${error}`,
      },
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
