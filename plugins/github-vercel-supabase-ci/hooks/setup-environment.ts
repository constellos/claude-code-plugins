/**
 * SessionStart Hook - Setup Development Environment
 *
 * This hook sets up the required development tools and services for the
 * GitHub/Vercel/Supabase CI workflow. It behaves differently based on whether
 * running in a remote or local environment.
 *
 * Remote (cloud) environment:
 * - Installs required CLI tools: gh, vercel, docker, supabase
 * - Starts Docker daemon if not running
 * - Starts Supabase local development if not running
 * - Installs project dependencies using detected package manager
 *
 * Local environment:
 * - Verifies required tools are installed and reports status
 * - Starts services if needed
 * - Installs dependencies if needed
 *
 * @module hooks/setup-environment
 */

import type { SessionStartInput, SessionStartHookOutput } from '../../../shared/types/types.js';
import { createDebugLogger } from '../../../shared/hooks/utils/debug.js';
import { runHook } from '../../../shared/hooks/utils/io.js';
import { detectPackageManager } from '../../../shared/hooks/utils/package-manager.js';
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
 * Execute a command and return structured result
 */
async function execCommand(
  command: string,
  options: { cwd?: string; timeout?: number; env?: Record<string, string> } = {}
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: options.cwd,
      timeout: options.timeout || 300000, // 5 minute default timeout
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
 * Install GitHub CLI (gh) on Ubuntu
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
 * Install Docker Engine on Ubuntu
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
 * Install Node.js CLI tools globally
 */
async function installNodeCLI(packageName: string): Promise<ExecResult> {
  // Check if already installed
  if (await isCommandAvailable(packageName)) {
    return { success: true, stdout: `${packageName} already installed`, stderr: '' };
  }

  const result = await execCommand(`npm install -g ${packageName}`);
  if (!result.success) {
    return { success: false, stdout: '', stderr: `Failed to install ${packageName}: ${result.stderr}` };
  }
  return { success: true, stdout: `${packageName} installed successfully`, stderr: '' };
}

/**
 * Install Supabase CLI on Ubuntu via APT repository
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
 * Start Docker daemon if not running
 */
async function startDocker(): Promise<ExecResult> {
  // Check if Docker is running
  const checkResult = await execCommand('docker ps');
  if (checkResult.success) {
    return { success: true, stdout: 'Docker already running', stderr: '' };
  }

  // Try to start Docker daemon
  // In containerized environments without systemd, we may need special handling
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
    stderr: 'Could not start Docker daemon. This may require manual setup in containerized environments.',
  };
}

/**
 * Check if Supabase is running locally
 */
async function isSupabaseRunning(): Promise<boolean> {
  const result = await execCommand('supabase status');
  return result.success && result.stdout.includes('Running');
}

/**
 * Start Supabase local development
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
 * Install project dependencies using detected package manager
 */
async function installDependencies(cwd: string): Promise<ExecResult> {
  // Check if package.json exists
  if (!existsSync(join(cwd, 'package.json'))) {
    return { success: true, stdout: 'No package.json found, skipping dependency installation', stderr: '' };
  }

  // Detect package manager
  const pm = detectPackageManager(cwd);

  // Check if dependencies are already installed
  if (existsSync(join(cwd, 'node_modules'))) {
    return { success: true, stdout: `Dependencies already installed (${pm})`, stderr: '' };
  }

  // Ensure the package manager itself is available
  if (!(await isCommandAvailable(pm))) {
    // Install the package manager if needed
    if (pm === 'pnpm') {
      await installNodeCLI('pnpm');
    } else if (pm === 'yarn') {
      await installNodeCLI('yarn');
    } else if (pm === 'bun') {
      const bunInstall = await execCommand('curl -fsSL https://bun.sh/install | bash');
      if (!bunInstall.success) {
        return { success: false, stdout: '', stderr: 'Failed to install bun' };
      }
    }
  }

  // Install dependencies
  const installCmd = pm === 'npm' ? 'npm install' : `${pm} install`;
  const result = await execCommand(installCmd, { cwd });

  if (!result.success) {
    return { success: false, stdout: '', stderr: `Failed to install dependencies: ${result.stderr}` };
  }

  return { success: true, stdout: `Dependencies installed successfully using ${pm}`, stderr: '' };
}

/**
 * Verify tool installation and report status
 */
async function verifyTools(): Promise<{
  gh: boolean;
  vercel: boolean;
  docker: boolean;
  supabase: boolean;
}> {
  return {
    gh: await isCommandAvailable('gh'),
    vercel: await isCommandAvailable('vercel'),
    docker: await isCommandAvailable('docker'),
    supabase: await isCommandAvailable('supabase'),
  };
}

/**
 * SessionStart hook handler
 *
 * Sets up the development environment based on whether running in remote or local context.
 *
 * @param input - SessionStart hook input from Claude Code
 * @returns Hook output with setup status as additional context
 */
async function handler(input: SessionStartInput): Promise<SessionStartHookOutput> {
  const logger = createDebugLogger(input.cwd, 'setup-environment', true);
  const isRemote = isRemoteEnvironment();
  const messages: string[] = [];

  try {
    await logger.logInput({
      source: input.source,
      session_id: input.session_id,
      is_remote: isRemote,
    });

    messages.push(`Environment: ${isRemote ? 'Remote (Cloud)' : 'Local'}`);

    if (isRemote) {
      // Remote environment: Install tools
      messages.push('\n🔧 Installing required tools...');

      // Install Vercel CLI (most reliable, npm-based)
      const vercelResult = await installNodeCLI('vercel');
      messages.push(`  • Vercel CLI: ${vercelResult.success ? '✓' : '⚠️'} ${vercelResult.stdout || vercelResult.stderr}`);

      // Install Supabase CLI (from binary release)
      const supabaseResult = await installSupabaseCLI();
      messages.push(`  • Supabase CLI: ${supabaseResult.success ? '✓' : '⚠️'} ${supabaseResult.stdout || supabaseResult.stderr}`);

      // Install GitHub CLI (may fail in restricted environments)
      const ghResult = await installGitHubCLI();
      messages.push(`  • GitHub CLI: ${ghResult.success ? '✓' : '⚠️'} ${ghResult.stdout || ghResult.stderr}`);
      if (!ghResult.success) {
        messages.push('    Note: GitHub CLI installation failed - this may be due to network restrictions');
      }

      // Install Docker (may fail in restricted/containerized environments)
      const dockerResult = await installDocker();
      messages.push(`  • Docker: ${dockerResult.success ? '✓' : '⚠️'} ${dockerResult.stdout || dockerResult.stderr}`);
      if (!dockerResult.success) {
        messages.push('    Note: Docker installation failed - this may not be supported in this environment');
      }
    } else {
      // Local environment: Verify tools
      messages.push('\n🔍 Verifying installed tools...');
      const tools = await verifyTools();

      messages.push(`  • GitHub CLI: ${tools.gh ? '✓ Installed' : '✗ Not found'}`);
      messages.push(`  • Vercel CLI: ${tools.vercel ? '✓ Installed' : '✗ Not found'}`);
      messages.push(`  • Docker: ${tools.docker ? '✓ Installed' : '✗ Not found'}`);
      messages.push(`  • Supabase CLI: ${tools.supabase ? '✓ Installed' : '✗ Not found'}`);

      const missingTools = Object.entries(tools)
        .filter(([_, installed]) => !installed)
        .map(([tool]) => tool);

      if (missingTools.length > 0) {
        messages.push(`\n⚠️  Missing tools: ${missingTools.join(', ')}`);
        messages.push('Please install them manually for full functionality.');
      }
    }

    // Start Docker (both environments)
    if (await isCommandAvailable('docker')) {
      messages.push('\n🐳 Starting Docker...');
      const dockerStart = await startDocker();
      messages.push(`  ${dockerStart.success ? '✓' : '✗'} ${dockerStart.stdout || dockerStart.stderr}`);
    }

    // Start Supabase (both environments)
    if (await isCommandAvailable('supabase')) {
      messages.push('\n🚀 Starting Supabase...');
      const supabaseStart = await startSupabase(input.cwd);
      messages.push(`  ${supabaseStart.success ? '✓' : '⚠️'} ${supabaseStart.stdout || supabaseStart.stderr}`);
    }

    // Install dependencies (both environments)
    messages.push('\n📦 Installing dependencies...');
    const depsResult = await installDependencies(input.cwd);
    messages.push(`  ${depsResult.success ? '✓' : '✗'} ${depsResult.stdout || depsResult.stderr}`);

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
        additionalContext: `Environment setup error: ${error}`,
      },
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
