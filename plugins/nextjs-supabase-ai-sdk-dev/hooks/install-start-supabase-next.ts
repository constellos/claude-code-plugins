/**
 * Supabase + Next.js Development Environment Setup Hook
 * SessionStart hook that:
 * 1. Checks/installs Supabase CLI
 * 2. Starts Docker if needed
 * 3. Starts Supabase local server
 * 4. Exports env vars to the correct env file
 * 5. Installs dependencies (skips if node_modules is fresh)
 * 6. Starts Next.js dev server (or Turborepo apps)
 * @module install-start-supabase-next
 */

import type { SessionStartInput, SessionStartHookOutput } from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { detectPackageManager } from '../shared/hooks/utils/package-manager.js';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync, statSync, mkdirSync, openSync } from 'fs';
import { join } from 'path';
import { platform } from 'os';

const execAsync = promisify(exec);

interface ExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

type ProjectType = 'turborepo' | 'nextjs' | 'cloudflare' | 'elysia' | 'unknown';

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

  // Check for Elysia (Bun framework)
  if (existsSync(join(cwd, 'bun.toml'))) {
    return 'elysia';
  }

  // Or check package.json for elysia dependency
  const packageJsonPath = join(cwd, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      if (pkg.dependencies?.elysia || pkg.devDependencies?.elysia) {
        return 'elysia';
      }
    } catch {
      // Ignore parse errors
    }
  }

  return 'unknown';
}

/**
 * Get the dev command for the project type
 */
function getDevCommand(cwd: string, projectType: ProjectType): string | null {
  switch (projectType) {
    case 'turborepo': {
      // Check if turbo.json has a dev task defined
      const turboJsonPath = join(cwd, 'turbo.json');
      if (existsSync(turboJsonPath)) {
        try {
          const turboConfig = JSON.parse(readFileSync(turboJsonPath, 'utf-8'));

          // Check both old (pipeline) and new (tasks) format
          const hasDev = turboConfig.pipeline?.dev || turboConfig.tasks?.dev;

          if (hasDev) {
            return 'npx turbo dev';
          }
        } catch {
          // If parsing fails, fall through to default
        }
      }

      // Fallback: try `npx turbo run dev` (works if workspaces define dev script)
      return 'npx turbo run dev';
    }

    case 'nextjs': {
      const pm = detectPackageManager(cwd);
      const runCmd = pm === 'npm' ? 'npm run' : pm;
      return `${runCmd} dev`;
    }

    case 'cloudflare':
      // Use npx to run wrangler since it may be a local dependency
      return 'npx wrangler dev';

    case 'elysia':
      // Elysia uses Bun
      return 'bun run dev';

    default:
      return null;
  }
}

/**
 * Start dev server in background with comprehensive logging
 */
function startDevServerBackground(
  cwd: string,
  command: string,
  logger: ReturnType<typeof createDebugLogger>
): { pid: number; logs: { stdout: string; stderr: string } } | null {
  try {
    const [cmd, ...args] = command.split(' ');

    // Ensure .claude/logs directory exists
    const logDir = join(cwd, '.claude', 'logs');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    // Create log files for stdout/stderr
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const stdoutPath = join(logDir, `dev-server-stdout-${timestamp}.log`);
    const stderrPath = join(logDir, `dev-server-stderr-${timestamp}.log`);

    const stdoutFd = openSync(stdoutPath, 'a');
    const stderrFd = openSync(stderrPath, 'a');

    const child = spawn(cmd, args, {
      cwd,
      detached: true,
      stdio: ['ignore', stdoutFd, stderrFd],
      env: process.env,
    });

    // Log spawn errors
    child.on('error', (err) => {
      logger.logError(new Error(`Dev server spawn failed: ${err.message}`));
    });

    // Log early exits (within 5 seconds = crash)
    const spawnTime = Date.now();
    child.on('exit', (code, signal) => {
      const runtime = Date.now() - spawnTime;
      if (runtime < 5000 && code !== 0) {
        logger.logError(
          new Error(`Dev server exited early (${runtime}ms) with code ${code}, signal ${signal}`)
        );
      }
    });

    child.unref();

    return {
      pid: child.pid || 0,
      logs: {
        stdout: stdoutPath,
        stderr: stderrPath,
      },
    };
  } catch (error) {
    logger.logError(error as Error);
    return null;
  }
}

/**
 * Check if dev server is responding to HTTP requests
 */
async function checkServerHealth(port: number, timeoutMs: number = 10000): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 1000;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await execCommand(
        `curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}`,
        { timeout: 2000 }
      );

      // Accept 2xx, 3xx, 404, or 405 (Next.js returns 404 on root before app is ready)
      if (result.success) {
        const statusCode = parseInt(result.stdout);
        if (statusCode >= 200 && statusCode < 600) {
          return true;
        }
      }
    } catch {
      // Ignore errors, server might not be ready yet
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return false;
}

// ==================== Dependency Installation ====================

type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn';

/**
 * Get install command for package manager
 */
function getInstallCommand(pm: PackageManager): string {
  const commands: Record<PackageManager, string> = {
    bun: 'bun install',
    npm: 'npm install',
    pnpm: 'pnpm install',
    yarn: 'yarn install',
  };
  return commands[pm];
}

/**
 * Check if we should skip install (node_modules exists and is recent)
 */
function shouldSkipInstall(cwd: string): boolean {
  // Skip if SKIP_INSTALL env var is set
  if (process.env.SKIP_INSTALL === '1') {
    return true;
  }

  // Check if package.json exists (if not, not a Node.js project)
  const packageJsonPath = join(cwd, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return true;
  }

  // Check if node_modules exists
  const nodeModulesPath = join(cwd, 'node_modules');
  if (!existsSync(nodeModulesPath)) {
    return false;
  }

  // Check if node_modules is recent (within 1 hour)
  try {
    const stats = statSync(nodeModulesPath);
    const ageMs = Date.now() - stats.mtimeMs;
    const oneHourMs = 60 * 60 * 1000;
    return ageMs < oneHourMs;
  } catch {
    return false;
  }
}

/**
 * Install dependencies with package manager
 * @returns Success status and install time in seconds (or null if skipped)
 */
async function installDependencies(
  cwd: string,
  _logger: ReturnType<typeof createDebugLogger>
): Promise<{ success: boolean; skipped: boolean; timeSeconds?: number; error?: string }> {
  // Skip if conditions met
  if (shouldSkipInstall(cwd)) {
    return { success: true, skipped: true };
  }

  const packageManager = detectPackageManager(cwd) as PackageManager;
  const installCmd = getInstallCommand(packageManager);

  const startTime = Date.now();
  try {
    await execAsync(installCmd, {
      cwd,
      timeout: 120000, // 2 minutes
    });
    const timeSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
    return { success: true, skipped: false, timeSeconds: parseFloat(timeSeconds) };
  } catch (error: unknown) {
    const err = error as { message?: string };
    const errorMsg = err.message || 'Unknown error';
    return { success: false, skipped: false, error: errorMsg };
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

    // Show multi-instance warning if Supabase is running
    if (projectId && await isSupabaseRunning(input.cwd)) {
      messages.push(`ℹ️  Using Supabase instance: ${projectId}`);
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

    // ========== Step 5.5: Install Dependencies ==========
    messages.push('');
    const installResult = await installDependencies(input.cwd, logger);

    if (installResult.skipped) {
      messages.push('✓ Dependencies already installed (skipped)');
    } else if (installResult.success && installResult.timeSeconds !== undefined) {
      const packageManager = detectPackageManager(input.cwd);
      messages.push(`✓ Dependencies installed (${packageManager} install - ${installResult.timeSeconds}s)`);
    } else if (!installResult.success) {
      messages.push(`⚠️ Dependency installation failed: ${installResult.error}`);
      messages.push('  Continuing anyway - you may need to run install manually');
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
              const mcpResult = startDevServerBackground(mcpPath, 'npx wrangler dev', logger);
              if (mcpResult) {
                messages.push(`✓ MCP worker started (PID: ${mcpResult.pid})`);
                messages.push(`  Logs: ${mcpResult.logs.stdout}`);
                messages.push('  URL: http://localhost:8787');
              } else {
                messages.push('⚠️ Could not start MCP worker');
              }
            }
          }
        }
      }

      messages.push(`Starting dev server: ${devCommand}`);

      const result = startDevServerBackground(input.cwd, devCommand, logger);
      if (result) {
        messages.push(`✓ Dev server started (PID: ${result.pid})`);
        messages.push(`  Logs: ${result.logs.stdout}`);

        // Default ports by project type
        const port = projectType === 'cloudflare' ? 8787 : projectType === 'elysia' ? 3000 : 3000;

        // Check server health
        messages.push('  Waiting for server to be ready...');
        const isHealthy = await checkServerHealth(port);

        if (isHealthy) {
          messages.push(`✓ Server is responding at http://localhost:${port}`);
        } else {
          messages.push(`⚠️ Server did not respond within 10 seconds`);
          messages.push(`  Check logs: ${result.logs.stderr}`);
          messages.push(`  Try manually: ${devCommand}`);
        }
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
