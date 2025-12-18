/**
 * Package manager detection and command utilities
 *
 * @module lib/package-manager
 */

import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Detect which package manager is used in a project
 */
export function detectPackageManager(cwd: string): 'npm' | 'yarn' | 'pnpm' | 'bun' {
  if (existsSync(join(cwd, 'bun.lockb'))) return 'bun';
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/**
 * Get the command to run a package.json script
 */
export function getScriptCommand(cwd: string, script: string): string {
  const pm = detectPackageManager(cwd);
  return `${pm} run ${script}`;
}
