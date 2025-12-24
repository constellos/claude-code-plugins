/**
 * Supabase Local Docker Setup Hook
 * SessionStart hook that installs Docker, Supabase CLI, and starts local Supabase stack.
 * Ensures local development environment is ready for database operations.
 * @module setup-supabase-local-docker
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
 * const result = await execCommand('docker ps', { cwd: '/project' });
 * if (result.success) {
 *   console.log('Docker is running');
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
 * const hasDocker = await isCommandAvailable('docker');
 * if (hasDocker) {
 *   console.log('Docker is installed');
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
 * Install Docker Engine on Ubuntu
 * Installs Docker from official repository if not already installed.
 * @returns Execution result with installation status
 * @example
 * ```typescript
 * const result = await installDocker();
 * if (result.success) {
 *   console.log('Docker installed successfully');
 * }
 * ```
 */
async function installDocker(): Promise<ExecResult> {
  // Check if already installed
  if (await isCommandAvailable('docker')) {
    return { success: true, stdout: 'docker already installed', stderr: '' };
  }

  // Install Docker from official repository
  const commands = [
    'sudo apt-get update',
    'sudo apt-get install -y ca-certificates curl gnupg',
    'sudo install -m 0755 -d /etc/apt/keyrings',
    'curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg',
    'sudo chmod a+r /etc/apt/keyrings/docker.gpg',
    'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null',
    'sudo apt-get update',
    'sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin',
  ];

  for (const cmd of commands) {
    const result = await execCommand(cmd);
    if (!result.success) {
      return { success: false, stdout: '', stderr: `Failed to install docker: ${result.stderr}` };
    }
  }

  return { success: true, stdout: 'docker installed successfully', stderr: '' };
}

/**
 * Start Docker daemon if not running
 * Attempts to start Docker using service commands and waits for readiness.
 * @returns Execution result with startup status
 * @example
 * ```typescript
 * const result = await startDocker();
 * if (result.success) {
 *   console.log('Docker is running');
 * }
 * ```
 */
async function startDocker(): Promise<ExecResult> {
  // Check if Docker is running
  const checkResult = await execCommand('docker ps');
  if (checkResult.success) {
    return { success: true, stdout: 'Docker already running', stderr: '' };
  }

  // Try to start Docker daemon
  const startCommands = [
    'sudo service docker start',
    'sudo dockerd > /dev/null 2>&1 &',
  ];

  for (const cmd of startCommands) {
    const result = await execCommand(cmd);
    if (result.success) {
      // Wait for Docker to be ready
      for (let i = 0; i < 30; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const testResult = await execCommand('docker ps');
        if (testResult.success) {
          return { success: true, stdout: 'Docker started successfully', stderr: '' };
        }
      }
    }
  }

  return {
    success: false,
    stdout: '',
    stderr: 'Could not start Docker daemon',
  };
}

/**
 * Install Supabase CLI on Ubuntu via APT repository
 * Installs Supabase CLI from official repository if not already installed.
 * @returns Execution result with installation status
 * @example
 * ```typescript
 * const result = await installSupabaseCLI();
 * if (result.success) {
 *   console.log('Supabase CLI installed successfully');
 * }
 * ```
 */
async function installSupabaseCLI(): Promise<ExecResult> {
  // Check if already installed
  if (await isCommandAvailable('supabase')) {
    return { success: true, stdout: 'supabase already installed', stderr: '' };
  }

  // Install from Supabase APT repository
  const commands = [
    'curl -fsSL https://download.supabase.com/linux/apt/GPG-KEY-supabase | sudo gpg --dearmor -o /usr/share/keyrings/supabase-archive-keyring.gpg',
    'echo "deb [signed-by=/usr/share/keyrings/supabase-archive-keyring.gpg] https://download.supabase.com/linux/apt stable main" | sudo tee /etc/apt/sources.list.d/supabase.list',
    'sudo apt-get update',
    'sudo apt-get install -y supabase',
  ];

  for (const cmd of commands) {
    const result = await execCommand(cmd);
    if (!result.success) {
      return { success: false, stdout: '', stderr: `Failed to install Supabase CLI: ${result.stderr}` };
    }
  }

  return { success: true, stdout: 'supabase installed successfully', stderr: '' };
}

/**
 * Check if Supabase is running locally
 * Verifies Supabase local stack is running by checking supabase status.
 * @returns True if Supabase is running
 * @example
 * ```typescript
 * const running = await isSupabaseRunning();
 * if (!running) {
 *   console.log('Supabase needs to be started');
 * }
 * ```
 */
async function isSupabaseRunning(): Promise<boolean> {
  const result = await execCommand('supabase status');
  return result.success && result.stdout.includes('Running');
}

/**
 * Start Supabase local development
 * Starts Supabase local stack if config exists and not already running.
 * @param cwd - Working directory containing supabase/config.toml
 * @returns Execution result with startup status
 * @example
 * ```typescript
 * const result = await startSupabase('/project');
 * if (result.success) {
 *   console.log('Supabase stack started');
 * }
 * ```
 */
async function startSupabase(cwd: string): Promise<ExecResult> {
  // Check if already running
  if (await isSupabaseRunning()) {
    return { success: true, stdout: 'Supabase already running', stderr: '' };
  }

  // Check if supabase config exists
  if (!existsSync(join(cwd, 'supabase', 'config.toml'))) {
    return {
      success: false,
      stdout: '',
      stderr: 'Supabase not initialized in this project (no supabase/config.toml found)',
    };
  }

  // Start Supabase
  const result = await execCommand('supabase start', { cwd });
  if (!result.success) {
    return { success: false, stdout: '', stderr: `Failed to start Supabase: ${result.stderr}` };
  }

  // Wait for Supabase to be ready
  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (await isSupabaseRunning()) {
      return { success: true, stdout: 'Supabase started successfully', stderr: '' };
    }
  }

  return { success: false, stdout: '', stderr: 'Supabase did not start within timeout period' };
}

/**
 * SessionStart hook handler
 * Installs Docker, Supabase CLI, and starts local Supabase stack if configured.
 * @param input - SessionStart hook input from Claude Code
 * @returns Hook output with setup status as additional context
 * @example
 * ```typescript
 * // This hook is automatically called by Claude Code
 * // when a new session starts
 * ```
 */
async function handler(input: SessionStartInput): Promise<SessionStartHookOutput> {
  const logger = createDebugLogger(input.cwd, 'setup-supabase-local-docker', true);
  const isRemote = isRemoteEnvironment();
  const messages: string[] = [];

  try {
    await logger.logInput({
      source: input.source,
      session_id: input.session_id,
      is_remote: isRemote,
    });

    // Check if docker is installed
    const dockerAvailable = await isCommandAvailable('docker');

    if (!dockerAvailable) {
      if (isRemote) {
        // Install in remote environment
        messages.push('🔧 Installing Docker...');
        const installResult = await installDocker();
        messages.push(`  ${installResult.success ? '✓' : '⚠️'} ${installResult.stdout || installResult.stderr}`);
      } else {
        // Just report missing in local environment
        messages.push('⚠️  Docker not installed');
        messages.push('   Install from: https://docs.docker.com/engine/install/');
      }
    } else {
      messages.push('✓ Docker installed');

      // Start Docker if not running
      const dockerStart = await startDocker();
      messages.push(`  ${dockerStart.success ? '✓' : '⚠️'} ${dockerStart.stdout || dockerStart.stderr}`);
    }

    // Check if supabase is installed
    const supabaseAvailable = await isCommandAvailable('supabase');

    if (!supabaseAvailable) {
      if (isRemote) {
        // Install in remote environment
        messages.push('🔧 Installing Supabase CLI...');
        const installResult = await installSupabaseCLI();
        messages.push(`  ${installResult.success ? '✓' : '⚠️'} ${installResult.stdout || installResult.stderr}`);
      } else {
        // Just report missing in local environment
        messages.push('⚠️  Supabase CLI not installed');
        messages.push('   Install from: https://supabase.com/docs/guides/cli');
      }
    } else {
      messages.push('✓ Supabase CLI installed');

      // Start Supabase if Docker is running
      if (dockerAvailable) {
        const supabaseStart = await startSupabase(input.cwd);
        messages.push(`  ${supabaseStart.success ? '✓' : '⚠️'} ${supabaseStart.stdout || supabaseStart.stderr}`);
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
        additionalContext: `Supabase/Docker setup error: ${error}`,
      },
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
