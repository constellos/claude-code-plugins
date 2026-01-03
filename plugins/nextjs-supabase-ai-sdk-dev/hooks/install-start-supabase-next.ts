/**
 * Supabase + Next.js Development Environment Setup Hook
 * SessionStart hook that:
 * 1. Checks/installs Supabase CLI
 * 2. Starts Docker if needed
 * 3. Starts Supabase local server
 * 4. Exports env vars to the correct env file
 * 5. Starts Next.js dev server (or Turborepo apps)
 * @module install-start-supabase-next
 */

import type { SessionStartInput, SessionStartHookOutput } from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { detectPackageManager } from '../shared/hooks/utils/package-manager.js';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { platform } from 'os';

const execAsync = promisify(exec);

interface ExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

type ProjectType = 'turborepo' | 'nextjs' | 'cloudflare' | 'unknown';

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
  return process.env.CLAUDE_CODE_ENTRYPOINT === 'remote';
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
 * Install Supabase CLI via official binary installer
 */
async function installSupabaseCLI(): Promise<ExecResult> {
  if (await isCommandAvailable('supabase')) {
    return { success: true, stdout: 'supabase already installed', stderr: '' };
  }

  const result = await execCommand(
    'curl -fsSL https://raw.githubusercontent.com/supabase/cli/main/install.sh | sh',
    { timeout: 120000 }
  );
  if (!result.success) {
    return { success: false, stdout: '', stderr: `Failed to install supabase: ${result.stderr}` };
  }
  return { success: true, stdout: 'supabase installed successfully', stderr: '' };
}

// ==================== Docker Management ====================

/**
 * Check if Docker daemon is running
 */
async function isDockerRunning(): Promise<boolean> {
  const result = await execCommand('docker info', { timeout: 10000 });
  return result.success;
}

/**
 * Attempt to start Docker daemon
 */
async function startDocker(): Promise<boolean> {
  const os = platform();

  if (os === 'darwin') {
    // macOS: Try Docker Desktop, then Rancher Desktop, then OrbStack
    const apps = ['Docker', 'Rancher Desktop', 'OrbStack'];
    for (const app of apps) {
      const result = await execCommand(`open -a "${app}"`, { timeout: 5000 });
      if (result.success) {
        return true;
      }
    }
  } else if (os === 'linux') {
    // Linux: Try systemctl
    const result = await execCommand('sudo systemctl start docker', { timeout: 30000 });
    return result.success;
  }

  return false;
}

/**
 * Wait for Docker to be ready
 */
async function waitForDocker(timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 2000;

  while (Date.now() - startTime < timeoutMs) {
    if (await isDockerRunning()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return false;
}

// ==================== Supabase Management ====================

/**
 * Check if Supabase project is initialized
 */
function isSupabaseInitialized(cwd: string): boolean {
  return existsSync(join(cwd, 'supabase', 'config.toml'));
}

/**
 * Check if Supabase is already running
 */
async function isSupabaseRunning(cwd: string): Promise<boolean> {
  const result = await execCommand('supabase status', { cwd, timeout: 10000 });
  // If status returns successfully and contains service info, it's running
  return result.success && result.stdout.includes('API URL');
}

/**
 * Start Supabase local server
 */
async function startSupabase(cwd: string): Promise<ExecResult> {
  // 5 minute timeout for first run (downloads containers)
  return await execCommand('supabase start', { cwd, timeout: 300000 });
}

/**
 * Get Supabase environment variables
 */
async function getSupabaseEnvVars(cwd: string): Promise<Record<string, string>> {
  const result = await execCommand('supabase status -o env', { cwd, timeout: 10000 });
  if (!result.success) {
    return {};
  }

  const vars: Record<string, string> = {};
  const lines = result.stdout.split('\n');
  for (const line of lines) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match) {
      vars[match[1]] = match[2];
    }
  }

  return vars;
}

// ==================== Environment File Management ====================

/**
 * Detect the correct env file to use
 */
function detectEnvFile(cwd: string): string {
  // Priority order based on project type
  if (existsSync(join(cwd, 'wrangler.toml')) || existsSync(join(cwd, 'wrangler.jsonc'))) {
    return 'dev.vars';
  }
  if (existsSync(join(cwd, '.env.local'))) {
    return '.env.local';
  }
  if (existsSync(join(cwd, '.env.development.local'))) {
    return '.env.development.local';
  }
  // Default for Next.js projects
  return '.env.local';
}

/**
 * Write environment variables to file
 */
function writeEnvVars(cwd: string, envFile: string, vars: Record<string, string>): void {
  const envPath = join(cwd, envFile);
  const isCloudflare = envFile === 'dev.vars';

  // Build new env content
  const lines: string[] = [];
  lines.push('');
  lines.push('# Supabase Local Development (auto-generated)');

  for (const [key, value] of Object.entries(vars)) {
    if (key === 'SUPABASE_URL') {
      if (isCloudflare) {
        lines.push(`SUPABASE_URL=${value}`);
      } else {
        lines.push(`NEXT_PUBLIC_SUPABASE_URL=${value}`);
      }
    } else if (key === 'SUPABASE_ANON_KEY') {
      if (isCloudflare) {
        lines.push(`SUPABASE_ANON_KEY=${value}`);
      } else {
        lines.push(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${value}`);
      }
    } else if (key === 'SUPABASE_SERVICE_ROLE_KEY') {
      lines.push(`SUPABASE_SERVICE_ROLE_KEY=${value}`);
    } else if (key === 'SUPABASE_DB_URL') {
      lines.push(`SUPABASE_DB_URL=${value}`);
    }
  }

  const newContent = lines.join('\n') + '\n';

  // Read existing content and check if already has Supabase vars
  if (existsSync(envPath)) {
    const existing = readFileSync(envPath, 'utf-8');
    if (existing.includes('# Supabase Local Development')) {
      // Replace existing Supabase section
      const updatedContent = existing.replace(
        /\n# Supabase Local Development \(auto-generated\)[\s\S]*?(?=\n[^#\n]|\n\n[^#]|$)/,
        newContent
      );
      writeFileSync(envPath, updatedContent);
    } else {
      // Append to file
      appendFileSync(envPath, newContent);
    }
  } else {
    // Create new file
    writeFileSync(envPath, newContent.trim() + '\n');
  }
}

// ==================== Project Type Detection ====================

/**
 * Detect project type
 */
function detectProjectType(cwd: string): ProjectType {
  if (existsSync(join(cwd, 'turbo.json'))) {
    return 'turborepo';
  }
  if (
    existsSync(join(cwd, 'next.config.js')) ||
    existsSync(join(cwd, 'next.config.mjs')) ||
    existsSync(join(cwd, 'next.config.ts'))
  ) {
    return 'nextjs';
  }
  if (existsSync(join(cwd, 'wrangler.toml')) || existsSync(join(cwd, 'wrangler.jsonc'))) {
    return 'cloudflare';
  }
  return 'unknown';
}

/**
 * Get the dev command for the project type
 */
function getDevCommand(cwd: string, projectType: ProjectType): string | null {
  const pm = detectPackageManager(cwd);
  const runCmd = pm === 'npm' ? 'npm run' : pm;

  switch (projectType) {
    case 'turborepo':
      return `${runCmd} dev`;
    case 'nextjs':
      return `${runCmd} dev`;
    case 'cloudflare':
      return 'wrangler dev';
    default:
      return null;
  }
}

/**
 * Start dev server in background
 */
function startDevServerBackground(cwd: string, command: string): { pid: number } | null {
  try {
    const [cmd, ...args] = command.split(' ');
    const child = spawn(cmd, args, {
      cwd,
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });

    child.unref();
    return { pid: child.pid || 0 };
  } catch {
    return null;
  }
}

// ==================== Main Handler ====================

/**
 * SessionStart hook handler
 */
async function handler(input: SessionStartInput): Promise<SessionStartHookOutput> {
  const logger = createDebugLogger(input.cwd, 'install-start-supabase-next', true);
  const isRemote = isRemoteEnvironment();
  const messages: string[] = [];

  try {
    await logger.logInput({
      source: input.source,
      session_id: input.session_id,
      is_remote: isRemote,
    });

    // ========== Step 1: Check/Install Supabase CLI ==========
    const supabaseAvailable = await isCommandAvailable('supabase');

    if (!supabaseAvailable) {
      if (isRemote) {
        messages.push('Installing Supabase CLI...');
        const installResult = await installSupabaseCLI();
        messages.push(installResult.success ? '✓ Supabase CLI installed' : `⚠️ ${installResult.stderr}`);
      } else {
        messages.push('⚠️ Supabase CLI not installed');
        messages.push('  Install: npm install -g supabase');
        // Return early - can't proceed without CLI
        return {
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: messages.join('\n'),
          },
        };
      }
    } else {
      const version = await getSupabaseVersion();
      messages.push(`✓ Supabase CLI v${version || 'unknown'}`);
    }

    // ========== Step 2: Check if Supabase is initialized ==========
    if (!isSupabaseInitialized(input.cwd)) {
      messages.push('');
      messages.push('ℹ️ Supabase not initialized in this project');
      messages.push('  Run: supabase init');
      // Return early - can't proceed without initialization
      return {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: messages.join('\n'),
        },
      };
    }

    // ========== Step 3: Check/Start Docker ==========
    let dockerRunning = await isDockerRunning();

    if (!dockerRunning) {
      messages.push('');
      messages.push('Docker not running, attempting to start...');
      const started = await startDocker();

      if (started) {
        messages.push('Waiting for Docker to be ready...');
        dockerRunning = await waitForDocker(30000);
      }

      if (!dockerRunning) {
        messages.push('⚠️ Could not start Docker');
        messages.push('  Please start Docker Desktop manually');
        // Continue but note that Supabase won't start
      } else {
        messages.push('✓ Docker started');
      }
    } else {
      messages.push('✓ Docker running');
    }

    // ========== Step 4: Check/Start Supabase ==========
    let supabaseRunning = await isSupabaseRunning(input.cwd);

    if (!supabaseRunning && dockerRunning) {
      messages.push('');
      messages.push('Starting Supabase local server...');
      const startResult = await startSupabase(input.cwd);

      if (startResult.success) {
        messages.push('✓ Supabase started');
        messages.push('  Studio: http://localhost:54323');
        supabaseRunning = true;
      } else {
        messages.push(`⚠️ Failed to start Supabase: ${startResult.stderr}`);
      }
    } else if (supabaseRunning) {
      messages.push('✓ Supabase already running');
    }

    // ========== Step 5: Export Environment Variables ==========
    if (supabaseRunning) {
      const envVars = await getSupabaseEnvVars(input.cwd);
      if (Object.keys(envVars).length > 0) {
        const envFile = detectEnvFile(input.cwd);
        writeEnvVars(input.cwd, envFile, envVars);
        messages.push(`✓ Environment variables written to ${envFile}`);
      }
    }

    // ========== Step 6: Detect Project Type and Start Dev Server ==========
    const projectType = detectProjectType(input.cwd);
    const devCommand = getDevCommand(input.cwd, projectType);

    if (devCommand) {
      messages.push('');
      messages.push(`Detected project type: ${projectType}`);
      messages.push(`Starting dev server: ${devCommand}`);

      const result = startDevServerBackground(input.cwd, devCommand);
      if (result) {
        messages.push(`✓ Dev server started (PID: ${result.pid})`);

        // Default ports by project type
        const port = projectType === 'cloudflare' ? 8787 : 3000;
        messages.push(`  URL: http://localhost:${port}`);
      } else {
        messages.push('⚠️ Could not start dev server');
        messages.push(`  Run manually: ${devCommand}`);
      }
    }

    // ========== Final Status ==========
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
        additionalContext: `Supabase setup error: ${error}`,
      },
    };
  }
}

export { handler };
runHook(handler);
