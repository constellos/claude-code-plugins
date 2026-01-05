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
import { existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync, statSync } from 'fs';
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
 * Read project_id from supabase/config.toml
 * Uses regex for lightweight parsing (avoids importing TOML parser)
 */
function getSupabaseProjectId(cwd: string): string | null {
  const configPath = join(cwd, 'supabase', 'config.toml');
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const match = content.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
    return match?.[1] || null;
  } catch {
    return null;
  }
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
 * Export Supabase env vars to .env.local and dev.vars
 * Only saves 3 critical variables with correct prefixes
 * Maps deprecated variable names to modern ones
 *
 * @param supabaseRoot - Directory containing supabase/config.toml (where to run supabase CLI)
 * @param targetDir - Directory where to write .env.local and dev.vars
 */
async function exportSupabaseEnvVars(
  supabaseRoot: string,
  targetDir: string
): Promise<{ nextjs: boolean; cloudflare: boolean }> {
  // Get raw env output from supabase root
  const result = await execCommand('supabase status -o env', { cwd: supabaseRoot, timeout: 10000 });
  if (!result.success) {
    return { nextjs: false, cloudflare: false };
  }

  // Parse only the 3 variables we need from supabase status output
  // Supabase CLI outputs: API_URL, ANON_KEY, PUBLISHABLE_KEY, SERVICE_ROLE_KEY, SECRET_KEY
  const envVars: Record<string, string> = {};
  for (const line of result.stdout.split('\n')) {
    // API_URL -> SUPABASE_URL
    const urlMatch = line.match(/^API_URL="?([^"]+)"?$/);
    // PUBLISHABLE_KEY (new) or ANON_KEY (legacy) -> SUPABASE_PUBLISHABLE_KEY
    const publishableMatch = line.match(/^PUBLISHABLE_KEY="?([^"]+)"?$/);
    const anonMatch = line.match(/^ANON_KEY="?([^"]+)"?$/);
    // SECRET_KEY (new) or SERVICE_ROLE_KEY (legacy) -> SUPABASE_SECRET_KEY
    const secretMatch = line.match(/^SECRET_KEY="?([^"]+)"?$/);
    const serviceMatch = line.match(/^SERVICE_ROLE_KEY="?([^"]+)"?$/);

    if (urlMatch) {
      envVars.SUPABASE_URL = urlMatch[1];
    } else if (publishableMatch) {
      envVars.SUPABASE_PUBLISHABLE_KEY = publishableMatch[1];
    } else if (anonMatch && !envVars.SUPABASE_PUBLISHABLE_KEY) {
      // Only use ANON_KEY if PUBLISHABLE_KEY not found
      envVars.SUPABASE_PUBLISHABLE_KEY = anonMatch[1];
    } else if (secretMatch) {
      envVars.SUPABASE_SECRET_KEY = secretMatch[1];
    } else if (serviceMatch && !envVars.SUPABASE_SECRET_KEY) {
      // Only use SERVICE_ROLE_KEY if SECRET_KEY not found
      envVars.SUPABASE_SECRET_KEY = serviceMatch[1];
    }
  }

  let nextjsWritten = false;
  let cloudflareWritten = false;

  // Write to .env.local (for Next.js projects)
  const envLocalPath = join(targetDir, '.env.local');
  if (envVars.SUPABASE_URL && envVars.SUPABASE_PUBLISHABLE_KEY) {
    const nextjsEnv = [
      '',
      '# Supabase Local Development (auto-generated)',
      `NEXT_PUBLIC_SUPABASE_URL=${envVars.SUPABASE_URL}`,
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${envVars.SUPABASE_PUBLISHABLE_KEY}`,
      envVars.SUPABASE_SECRET_KEY ? `SUPABASE_SECRET_KEY=${envVars.SUPABASE_SECRET_KEY}` : '',
      '',
    ].filter(Boolean);

    // Update or append to .env.local
    if (existsSync(envLocalPath)) {
      const existing = readFileSync(envLocalPath, 'utf-8');
      if (existing.includes('# Supabase Local Development')) {
        const updated = existing.replace(
          /\n# Supabase Local Development \(auto-generated\)[\s\S]*?(?=\n[^#\n]|\n\n[^#]|$)/,
          nextjsEnv.join('\n')
        );
        writeFileSync(envLocalPath, updated);
      } else {
        appendFileSync(envLocalPath, nextjsEnv.join('\n'));
      }
    } else {
      writeFileSync(envLocalPath, nextjsEnv.join('\n'));
    }
    nextjsWritten = true;
  }

  // Write to dev.vars (for Cloudflare Workers)
  const devVarsPath = join(targetDir, 'dev.vars');
  const hasWrangler = existsSync(join(targetDir, 'wrangler.toml')) || existsSync(join(targetDir, 'wrangler.jsonc'));

  if (
    (existsSync(devVarsPath) || hasWrangler) &&
    envVars.SUPABASE_URL &&
    envVars.SUPABASE_PUBLISHABLE_KEY
  ) {
    const cloudflareEnv = [
      '',
      '# Supabase Local Development (auto-generated)',
      `SUPABASE_URL=${envVars.SUPABASE_URL}`, // No NEXT_PUBLIC_ prefix!
      `SUPABASE_PUBLISHABLE_KEY=${envVars.SUPABASE_PUBLISHABLE_KEY}`, // No prefix!
      envVars.SUPABASE_SECRET_KEY ? `SUPABASE_SECRET_KEY=${envVars.SUPABASE_SECRET_KEY}` : '',
      '',
    ].filter(Boolean);

    if (existsSync(devVarsPath)) {
      const existing = readFileSync(devVarsPath, 'utf-8');
      if (existing.includes('# Supabase Local Development')) {
        const updated = existing.replace(
          /\n# Supabase Local Development \(auto-generated\)[\s\S]*?(?=\n[^#\n]|\n\n[^#]|$)/,
          cloudflareEnv.join('\n')
        );
        writeFileSync(devVarsPath, updated);
      } else {
        appendFileSync(devVarsPath, cloudflareEnv.join('\n'));
      }
    } else {
      writeFileSync(devVarsPath, cloudflareEnv.join('\n'));
    }
    cloudflareWritten = true;
  }

  return { nextjs: nextjsWritten, cloudflare: cloudflareWritten };
}

// ==================== Project Type Detection ====================

/**
 * Detect Turborepo workspace directories
 * Reads package.json workspaces field to find app directories
 */
function detectTurborepoWorkspaces(cwd: string): string[] | null {
  const turboJsonPath = join(cwd, 'turbo.json');
  if (!existsSync(turboJsonPath)) {
    return null;
  }

  const rootPackageJson = join(cwd, 'package.json');
  if (!existsSync(rootPackageJson)) {
    return null;
  }

  try {
    const packageData = JSON.parse(readFileSync(rootPackageJson, 'utf-8'));

    // Get workspace patterns (supports npm/yarn/pnpm formats)
    let workspacePatterns: string[] = [];
    if (Array.isArray(packageData.workspaces)) {
      workspacePatterns = packageData.workspaces;
    } else if (packageData.workspaces?.packages) {
      workspacePatterns = packageData.workspaces.packages;
    }

    // Resolve workspace directories
    const workspaceDirs: string[] = [];

    for (const pattern of workspacePatterns) {
      if (pattern.includes('*')) {
        // Handle globs like "apps/*" or "packages/*"
        const baseDir = pattern.replace('/*', '');
        const basePath = join(cwd, baseDir);

        if (existsSync(basePath)) {
          const entries = readdirSync(basePath);
          for (const entry of entries) {
            const entryPath = join(basePath, entry);
            if (statSync(entryPath).isDirectory() && existsSync(join(entryPath, 'package.json'))) {
              workspaceDirs.push(join(baseDir, entry));
            }
          }
        }
      } else {
        // Direct path like "apps/web"
        if (existsSync(join(cwd, pattern, 'package.json'))) {
          workspaceDirs.push(pattern);
        }
      }
    }

    return workspaceDirs.length > 0 ? workspaceDirs : null;
  } catch {
    return null;
  }
}

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
  switch (projectType) {
    case 'turborepo':
      // Use npx to run turbo since it may be a local dependency
      // turbo dev starts ALL workspace dev tasks in parallel
      return 'npx turbo dev';

    case 'nextjs': {
      const pm = detectPackageManager(cwd);
      const runCmd = pm === 'npm' ? 'npm run' : pm;
      return `${runCmd} dev`;
    }

    case 'cloudflare':
      // Use npx to run wrangler since it may be a local dependency
      return 'npx wrangler dev';

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

    // Read project_id from config.toml
    const projectId = getSupabaseProjectId(input.cwd);
    if (projectId) {
      messages.push(`✓ Supabase project: ${projectId}`);
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
    const projectType = detectProjectType(input.cwd);

    if (supabaseRunning) {
      if (projectType === 'turborepo') {
        // For Turborepo: export env vars to each workspace
        const workspaces = detectTurborepoWorkspaces(input.cwd);
        if (workspaces && workspaces.length > 0) {
          for (const workspace of workspaces) {
            const workspacePath = join(input.cwd, workspace);
            const result = await exportSupabaseEnvVars(input.cwd, workspacePath);

            if (result.nextjs) {
              messages.push(`✓ Environment variables written to ${workspace}/.env.local`);
            }
            if (result.cloudflare) {
              messages.push(`✓ Environment variables written to ${workspace}/dev.vars`);
            }
          }
        }
      } else {
        // For single projects: export to root
        const result = await exportSupabaseEnvVars(input.cwd, input.cwd);

        if (result.nextjs) {
          messages.push('✓ Environment variables written to .env.local');
        }
        if (result.cloudflare) {
          messages.push('✓ Environment variables written to dev.vars');
        }
      }
    }

    // ========== Step 6: Detect Project Type and Start Dev Server ==========
    const devCommand = getDevCommand(input.cwd, projectType);

    if (devCommand) {
      messages.push('');
      messages.push(`Detected project type: ${projectType}`);

      // Show workspace info for Turborepo
      if (projectType === 'turborepo') {
        const workspaces = detectTurborepoWorkspaces(input.cwd);
        if (workspaces && workspaces.length > 0) {
          messages.push(`  Workspaces: ${workspaces.join(', ')}`);

          // Check for MCP worker and start it separately
          const mcpWorkspace = workspaces.find((w) => w.includes('mcp'));
          if (mcpWorkspace) {
            const mcpPath = join(input.cwd, mcpWorkspace);
            if (existsSync(join(mcpPath, 'wrangler.toml'))) {
              messages.push('');
              messages.push('Starting MCP Cloudflare Worker...');
              const mcpResult = startDevServerBackground(mcpPath, 'npx wrangler dev');
              if (mcpResult) {
                messages.push(`✓ MCP worker started (PID: ${mcpResult.pid})`);
                messages.push('  URL: http://localhost:8787');
              }
            }
          }
        }
      }

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
