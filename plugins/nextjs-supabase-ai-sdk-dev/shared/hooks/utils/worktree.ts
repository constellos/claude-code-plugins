/**
 * Git Worktree Detection Utility
 * Detects if the current directory is a git worktree and provides worktree information
 * for consistent port allocation across concurrent sessions.
 * @module worktree
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { createHash } from 'crypto';

/**
 * Information about a git worktree
 */
export interface WorktreeInfo {
  /** Whether the current directory is a git worktree (not main repo) */
  isWorktree: boolean;
  /** Full path to the worktree root directory */
  worktreePath: string;
  /** Path to the main repository (same as worktreePath if not a worktree) */
  parentRepoPath: string;
  /** Short hash (8 chars) for unique identification, used for port slot allocation */
  worktreeId: string;
  /** Worktree name extracted from path (e.g., "claude-brave-zebra-k8fifpgr") */
  worktreeName: string;
}

/**
 * Generate a stable worktree ID from a path
 * Uses SHA256 hash truncated to 8 characters for uniqueness while being short
 *
 * @param path - The path to hash
 * @returns 8-character hex string
 */
export function getWorktreeId(path: string): string {
  const hash = createHash('sha256').update(path).digest('hex');
  return hash.substring(0, 8);
}

/**
 * Calculate a numeric slot from worktree ID for port allocation
 * Converts the hex worktree ID to a slot number (1-99)
 *
 * @param worktreeId - 8-character hex worktree ID
 * @returns Slot number (1-99), or 0 for main repo
 */
export function getWorktreeSlot(worktreeId: string): number {
  // Convert first 4 hex chars to number, mod 99, + 1 to get 1-99 range
  const num = parseInt(worktreeId.substring(0, 4), 16);
  return (num % 99) + 1;
}

/**
 * Find the git root directory from a given path
 * Walks up the directory tree looking for .git
 *
 * @param startPath - Starting directory
 * @returns Path to git root, or null if not in a git repo
 */
function findGitRoot(startPath: string): string | null {
  let current = resolve(startPath);
  const root = '/';

  while (current !== root) {
    const gitPath = join(current, '.git');
    if (existsSync(gitPath)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

/**
 * Parse the .git file in a worktree to extract the gitdir path
 * Worktrees have a .git FILE (not directory) containing: gitdir: /path/to/main/.git/worktrees/name
 *
 * @param gitFilePath - Path to the .git file
 * @returns The gitdir path, or null if invalid
 */
function parseGitFile(gitFilePath: string): string | null {
  try {
    const content = readFileSync(gitFilePath, 'utf-8').trim();
    const match = content.match(/^gitdir:\s*(.+)$/);
    if (match) {
      return match[1].trim();
    }
  } catch {
    // File doesn't exist or can't be read
  }
  return null;
}

/**
 * Extract the main repository path from a worktree gitdir path
 * gitdir format: /path/to/main-repo/.git/worktrees/worktree-name
 *
 * @param gitdir - The gitdir path from .git file
 * @returns Path to the main repository
 */
function extractParentRepoPath(gitdir: string): string {
  // gitdir looks like: /path/to/repo/.git/worktrees/worktree-name
  // We need to get: /path/to/repo
  const worktreesIndex = gitdir.indexOf('/.git/worktrees/');
  if (worktreesIndex !== -1) {
    return gitdir.substring(0, worktreesIndex);
  }
  // Fallback: strip last two components (.git/worktrees/name -> repo path)
  return dirname(dirname(dirname(gitdir)));
}

/**
 * Extract worktree name from the gitdir path
 *
 * @param gitdir - The gitdir path from .git file
 * @returns Worktree name (last component of path)
 */
function extractWorktreeName(gitdir: string): string {
  // gitdir looks like: /path/to/repo/.git/worktrees/worktree-name
  const parts = gitdir.split('/');
  return parts[parts.length - 1] || 'unknown';
}

/**
 * Detect if the current directory is a git worktree
 * Returns comprehensive information about the worktree for port allocation
 *
 * @param cwd - Current working directory to check
 * @returns WorktreeInfo object with detection results
 *
 * @example
 * ```typescript
 * const info = detectWorktree('/home/user/project-worktree');
 * if (info.isWorktree) {
 *   console.log(`Worktree: ${info.worktreeName}`);
 *   console.log(`Slot: ${getWorktreeSlot(info.worktreeId)}`);
 * }
 * ```
 */
export function detectWorktree(cwd: string): WorktreeInfo {
  const gitRoot = findGitRoot(cwd);

  if (!gitRoot) {
    // Not in a git repo at all
    return {
      isWorktree: false,
      worktreePath: cwd,
      parentRepoPath: cwd,
      worktreeId: getWorktreeId(cwd),
      worktreeName: 'main',
    };
  }

  const gitPath = join(gitRoot, '.git');

  // Check if .git is a file (worktree) or directory (main repo)
  try {
    const stats = statSync(gitPath);

    if (stats.isFile()) {
      // This is a worktree - .git is a file pointing to the main repo
      const gitdir = parseGitFile(gitPath);

      if (gitdir && gitdir.includes('/.git/worktrees/')) {
        const parentRepoPath = extractParentRepoPath(gitdir);
        const worktreeName = extractWorktreeName(gitdir);

        return {
          isWorktree: true,
          worktreePath: gitRoot,
          parentRepoPath,
          worktreeId: getWorktreeId(gitRoot),
          worktreeName,
        };
      }
    }

    // .git is a directory - this is the main repo
    return {
      isWorktree: false,
      worktreePath: gitRoot,
      parentRepoPath: gitRoot,
      worktreeId: getWorktreeId(gitRoot),
      worktreeName: 'main',
    };
  } catch {
    // Can't stat .git - return default
    return {
      isWorktree: false,
      worktreePath: cwd,
      parentRepoPath: cwd,
      worktreeId: getWorktreeId(cwd),
      worktreeName: 'main',
    };
  }
}

/**
 * Check if a path looks like a worktree path
 * Quick heuristic check without full detection
 *
 * @param path - Path to check
 * @returns true if path appears to be a worktree
 */
export function looksLikeWorktree(path: string): boolean {
  // Common worktree path patterns
  return (
    path.includes('-worktrees/') ||
    path.includes('/worktrees/') ||
    /claude-[a-z]+-[a-z]+-[a-z0-9]+$/.test(path)
  );
}
