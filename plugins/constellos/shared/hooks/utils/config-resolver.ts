/**
 * Configuration File Resolver
 * Utilities for finding configuration files by traversing parent directories
 * @module config-resolver
 */

import { access } from 'fs/promises';
import * as path from 'path';

/**
 * Find git repository root directory
 *
 * @param startDir - Directory to start searching from
 * @returns Absolute path to git root, or null if not in a git repository
 */
async function findGitRoot(startDir: string): Promise<string | null> {
  let currentDir = startDir;

  while (true) {
    try {
      await access(path.join(currentDir, '.git'));
      return currentDir;
    } catch {
      const parent = path.dirname(currentDir);
      if (parent === currentDir) return null; // Filesystem root
      currentDir = parent;
    }
  }
}

/**
 * Find a configuration file by traversing parent directories
 *
 * @param startDir - Directory to start searching from (typically input.cwd)
 * @param configFileName - Name of config file to find (e.g., 'tsconfig.json')
 * @param stopAtGitRoot - Whether to stop at git repository root (default: true)
 * @returns Absolute path to config file directory, or null if not found
 *
 * @example
 * const configDir = await findConfigFile(input.cwd, 'eslint.config.mjs');
 * if (configDir) {
 *   await execAsync('npx eslint file.ts', { cwd: configDir });
 * }
 */
export async function findConfigFile(
  startDir: string,
  configFileName: string,
  stopAtGitRoot: boolean = true
): Promise<string | null> {
  let currentDir = path.resolve(startDir);
  const gitRoot = stopAtGitRoot ? await findGitRoot(currentDir) : null;

  while (true) {
    try {
      // Check if config file exists in current directory
      await access(path.join(currentDir, configFileName));
      return currentDir;
    } catch {
      // Config not found in this directory
    }

    // Check if we should stop at git root
    if (stopAtGitRoot && gitRoot && currentDir === gitRoot) {
      return null;
    }

    // Move to parent directory
    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      // Reached filesystem root
      return null;
    }

    currentDir = parent;
  }
}
