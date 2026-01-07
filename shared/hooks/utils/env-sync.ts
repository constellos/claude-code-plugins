/**
 * Environment variable synchronization utilities for turborepo workspaces
 *
 * Provides functions to collect, merge, validate, and distribute environment variables
 * across multiple workspaces in a turborepo project. Ensures consistent environment
 * configuration across all apps.
 *
 * @module env-sync
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Environment variable sets organized by source
 */
export interface EnvVarSet {
  /** Environment variables from Supabase CLI (SUPABASE_URL, etc.) */
  supabaseVars: Record<string, string>;
  /** Environment variables from Vercel CLI */
  vercelVars: Record<string, string>;
  /** Next.js prefixed variables (NEXT_PUBLIC_*) */
  nextjsVars: Record<string, string>;
  /** Cloudflare variables (unprefixed for dev.vars) */
  cloudflareVars: Record<string, string>;
}

/**
 * Options for distributing environment variables
 */
export interface DistributeOptions {
  /** Create .env.local and dev.vars files if they don't exist */
  createIfMissing: boolean;
  /** Preserve existing environment variables (don't overwrite) */
  preserveExisting: boolean;
}

/**
 * Validation result for environment variables
 */
export interface ValidationResult {
  /** Whether all required variables are present */
  valid: boolean;
  /** List of missing required variables */
  missing: string[];
}

/**
 * Read and parse a .env.local file
 *
 * Parses a .env.local file into a key-value object. Handles:
 * - Comments starting with #
 * - Empty lines
 * - KEY=value format
 * - Quoted values
 *
 * @param path - Path to the directory containing .env.local
 * @returns Object with parsed environment variables
 *
 * @example
 * ```typescript
 * import { readEnvLocalFile } from './env-sync.js';
 *
 * const vars = await readEnvLocalFile('/path/to/app');
 * console.log(vars.NEXT_PUBLIC_SUPABASE_URL);
 * ```
 */
export async function readEnvLocalFile(path: string): Promise<Record<string, string>> {
  const envPath = join(path, '.env.local');
  if (!existsSync(envPath)) {
    return {};
  }

  const content = readFileSync(envPath, 'utf-8');
  const vars: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse KEY=value
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    vars[key] = value;
  }

  return vars;
}

/**
 * Merge environment variables from multiple workspace .env.local files
 *
 * Reads .env.local files from all workspaces and merges them into a single
 * object. Later workspaces override earlier ones if there are conflicts.
 *
 * @param workspaces - Array of workspace paths relative to cwd
 * @param cwd - Root directory of the project
 * @returns Merged environment variables
 *
 * @example
 * ```typescript
 * import { mergeWorkspaceEnvVars } from './env-sync.js';
 *
 * const vars = await mergeWorkspaceEnvVars(
 *   ['apps/web', 'apps/api', 'apps/mcp'],
 *   '/path/to/project'
 * );
 * ```
 */
export async function mergeWorkspaceEnvVars(
  workspaces: string[],
  cwd: string
): Promise<Record<string, string>> {
  const merged: Record<string, string> = {};

  for (const workspace of workspaces) {
    const workspacePath = join(cwd, workspace);
    const vars = await readEnvLocalFile(workspacePath);
    Object.assign(merged, vars);
  }

  return merged;
}

/**
 * Validate that required environment variables are present
 *
 * Checks that all required variables exist in at least one of the variable sets.
 *
 * @param vars - Environment variable sets to validate
 * @param required - List of required variable names
 * @returns Validation result with missing variables
 *
 * @example
 * ```typescript
 * import { validateEnvVars } from './env-sync.js';
 *
 * const result = validateEnvVars(
 *   { supabaseVars, vercelVars },
 *   ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY']
 * );
 *
 * if (!result.valid) {
 *   console.warn('Missing vars:', result.missing);
 * }
 * ```
 */
export function validateEnvVars(
  vars: Partial<EnvVarSet>,
  required: string[]
): ValidationResult {
  const allVars = {
    ...vars.supabaseVars,
    ...vars.vercelVars,
    ...vars.nextjsVars,
    ...vars.cloudflareVars,
  };

  const missing: string[] = [];
  for (const key of required) {
    if (!(key in allVars)) {
      missing.push(key);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Distribute environment variables to a workspace
 *
 * Writes environment variables to .env.local (for Next.js) and dev.vars
 * (for Cloudflare Workers) in the specified workspace directory.
 *
 * @param workspacePath - Path to the workspace directory
 * @param vars - Environment variable sets to distribute
 * @param options - Distribution options
 * @returns Object indicating which files were written
 *
 * @example
 * ```typescript
 * import { distributeEnvVars } from './env-sync.js';
 *
 * const result = await distributeEnvVars(
 *   '/path/to/apps/web',
 *   { supabaseVars, vercelVars },
 *   { createIfMissing: true, preserveExisting: true }
 * );
 *
 * if (result.nextjs) console.log('.env.local updated');
 * if (result.cloudflare) console.log('dev.vars updated');
 * ```
 */
export async function distributeEnvVars(
  workspacePath: string,
  vars: Partial<EnvVarSet>,
  options: DistributeOptions
): Promise<{ nextjs: boolean; cloudflare: boolean }> {
  let nextjsWritten = false;
  let cloudflareWritten = false;

  // Prepare combined vars for Next.js (with NEXT_PUBLIC_ prefix where needed)
  const nextjsVars: Record<string, string> = {};

  // Add Supabase vars with NEXT_PUBLIC_ prefix
  if (vars.supabaseVars) {
    for (const [key, value] of Object.entries(vars.supabaseVars)) {
      if (key === 'SUPABASE_URL') {
        nextjsVars['NEXT_PUBLIC_SUPABASE_URL'] = value;
      } else if (key === 'SUPABASE_PUBLISHABLE_KEY') {
        nextjsVars['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] = value;
      } else if (key === 'SUPABASE_SECRET_KEY') {
        nextjsVars['SUPABASE_SECRET_KEY'] = value; // No prefix for secret
      }
    }
  }

  // Add Vercel vars (keep as-is, they're already properly prefixed)
  if (vars.vercelVars) {
    Object.assign(nextjsVars, vars.vercelVars);
  }

  // Add explicit Next.js vars
  if (vars.nextjsVars) {
    Object.assign(nextjsVars, vars.nextjsVars);
  }

  // Write to .env.local
  const envLocalPath = join(workspacePath, '.env.local');
  if (Object.keys(nextjsVars).length > 0) {
    if (existsSync(envLocalPath)) {
      // Merge with existing
      const existing = await readEnvLocalFile(workspacePath);
      const merged = options.preserveExisting
        ? { ...nextjsVars, ...existing } // Existing takes precedence
        : { ...existing, ...nextjsVars }; // New takes precedence

      const lines = Object.entries(merged).map(([key, value]) => `${key}=${value}`);
      writeFileSync(envLocalPath, lines.join('\n') + '\n');
      nextjsWritten = true;
    } else if (options.createIfMissing) {
      const lines = Object.entries(nextjsVars).map(([key, value]) => `${key}=${value}`);
      writeFileSync(envLocalPath, lines.join('\n') + '\n');
      nextjsWritten = true;
    }
  }

  // Prepare vars for Cloudflare (unprefixed)
  const cloudflareVars: Record<string, string> = {};

  // Add Supabase vars without NEXT_PUBLIC_ prefix
  if (vars.supabaseVars) {
    Object.assign(cloudflareVars, vars.supabaseVars);
  }

  // Add Cloudflare-specific vars
  if (vars.cloudflareVars) {
    Object.assign(cloudflareVars, vars.cloudflareVars);
  }

  // Add Vercel vars (strip NEXT_PUBLIC_ prefix for Cloudflare)
  if (vars.vercelVars) {
    for (const [key, value] of Object.entries(vars.vercelVars)) {
      if (key.startsWith('NEXT_PUBLIC_')) {
        const unprefixed = key.replace('NEXT_PUBLIC_', '');
        cloudflareVars[unprefixed] = value;
      } else {
        cloudflareVars[key] = value;
      }
    }
  }

  // Write to dev.vars (only if wrangler.toml/wrangler.jsonc exists)
  const devVarsPath = join(workspacePath, 'dev.vars');
  const hasWrangler = existsSync(join(workspacePath, 'wrangler.toml')) ||
                      existsSync(join(workspacePath, 'wrangler.jsonc'));

  if (hasWrangler && Object.keys(cloudflareVars).length > 0) {
    if (existsSync(devVarsPath)) {
      // Merge with existing
      const existing = readFileSync(devVarsPath, 'utf-8');
      const existingVars: Record<string, string> = {};

      for (const line of existing.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;

        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        existingVars[key] = value;
      }

      const merged = options.preserveExisting
        ? { ...cloudflareVars, ...existingVars }
        : { ...existingVars, ...cloudflareVars };

      const lines = Object.entries(merged).map(([key, value]) => `${key}=${value}`);
      writeFileSync(devVarsPath, lines.join('\n') + '\n');
      cloudflareWritten = true;
    } else if (options.createIfMissing) {
      const lines = Object.entries(cloudflareVars).map(([key, value]) => `${key}=${value}`);
      writeFileSync(devVarsPath, lines.join('\n') + '\n');
      cloudflareWritten = true;
    }
  }

  return { nextjs: nextjsWritten, cloudflare: cloudflareWritten };
}

/**
 * Collect environment variables from all sources
 *
 * Gathers environment variables from Supabase CLI (if running) and
 * from all workspace .env.local files (from Vercel pulls).
 *
 * @param cwd - Root directory of the project
 * @param workspaces - Array of workspace paths relative to cwd
 * @param supabaseVars - Optional Supabase variables (from Supabase CLI)
 * @returns Complete environment variable sets
 *
 * @example
 * ```typescript
 * import { collectEnvVars } from './env-sync.js';
 *
 * const vars = await collectEnvVars(
 *   '/path/to/project',
 *   ['apps/web', 'apps/api'],
 *   { SUPABASE_URL: 'http://localhost:54321', ... }
 * );
 * ```
 */
export async function collectEnvVars(
  cwd: string,
  workspaces: string[],
  supabaseVars?: Record<string, string>
): Promise<EnvVarSet> {
  // Collect Supabase vars
  const supabase = supabaseVars || {};

  // Collect and merge Vercel vars from all workspaces
  const vercel = await mergeWorkspaceEnvVars(workspaces, cwd);

  // Separate Next.js prefixed vars
  const nextjs: Record<string, string> = {};
  const cloudflare: Record<string, string> = {};

  for (const [key, value] of Object.entries(vercel)) {
    if (key.startsWith('NEXT_PUBLIC_')) {
      nextjs[key] = value;
      // Also add unprefixed version for Cloudflare
      cloudflare[key.replace('NEXT_PUBLIC_', '')] = value;
    } else {
      cloudflare[key] = value;
    }
  }

  return {
    supabaseVars: supabase,
    vercelVars: vercel,
    nextjsVars: nextjs,
    cloudflareVars: cloudflare,
  };
}
