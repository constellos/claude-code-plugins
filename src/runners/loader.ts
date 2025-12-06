/**
 * Hook loading utilities for Claude Code hook runners
 *
 * Provides functions for resolving hook paths and dynamically loading
 * hook functions from TypeScript/JavaScript files.
 *
 * Uses tsx for TypeScript support, allowing hooks to be written in
 * TypeScript without requiring shebangs or chmod permissions.
 */

import { resolve, isAbsolute } from 'path';
import { existsSync } from 'fs';
import { isMarkdownFormat, type MarkdownFormat } from '../format/index.js';

/**
 * Check if we're running under Bun
 * Bun natively supports TypeScript, so no loader is needed
 */
function isRunningUnderBun(): boolean {
  // Use globalThis to avoid TypeScript errors when Bun types aren't available
  return typeof (globalThis as Record<string, unknown>).Bun !== 'undefined';
}

/**
 * Check if we're already running under tsx
 * When tsx is active, we don't need to register it again
 */
function isRunningUnderTsx(): boolean {
  // Check multiple signals that tsx is the active loader
  return (
    process.execArgv.some(arg => arg.includes('tsx')) ||
    (process.argv[1] && process.argv[1].includes('tsx')) ||
    process.env.TSX === '1' ||
    // Check if tsx loader hooks are registered
    !!(globalThis as unknown as { __tsx_esm_loader?: boolean }).__tsx_esm_loader
  );
}

/**
 * Check if TypeScript loader is needed
 * Returns false if running under Bun or tsx
 */
function needsTsxLoader(): boolean {
  return !isRunningUnderBun() && !isRunningUnderTsx();
}

/**
 * Hook function type
 *
 * A hook function takes an input object and returns an output object.
 * Can be synchronous or asynchronous.
 */
export type HookFunction = (
  input: Record<string, unknown>
) => Record<string, unknown> | Promise<Record<string, unknown>>;

/**
 * Hook export type - either a function or a MarkdownFormat
 */
export type HookExport = HookFunction | MarkdownFormat;


/**
 * Resolve a hook path to an absolute path
 *
 * Handles both relative and absolute paths. Relative paths are resolved
 * from the provided working directory.
 *
 * @param hookPath - Hook path (relative or absolute)
 * @param cwd - Working directory for relative path resolution
 * @returns Absolute path to the hook file
 * @throws Error if the path is empty or file doesn't exist
 */
export function resolveHookPath(hookPath: string, cwd: string): string {
  if (!hookPath || hookPath.trim().length === 0) {
    throw new Error('Hook path cannot be empty');
  }

  const absolutePath = isAbsolute(hookPath) ? hookPath : resolve(cwd, hookPath);

  if (!absolutePath || absolutePath.trim().length === 0) {
    throw new Error(
      `Resolved path is empty. Original: "${hookPath}", CWD: "${cwd}"`
    );
  }

  if (!existsSync(absolutePath)) {
    throw new Error(`File does not exist: ${absolutePath}`);
  }

  return absolutePath;
}

/**
 * Load a hook from a file
 *
 * Dynamically imports the hook file and extracts the default export.
 * The default export can be either:
 * - A hook function (takes input, returns output)
 * - A MarkdownFormat object (for format validation hooks)
 *
 * @param hookPath - Absolute path to the hook file
 * @returns The hook function or MarkdownFormat
 * @throws Error if loading fails or default export is invalid
 *
 * @example
 * // Load a regular hook function
 * const hook = await loadHook('/path/to/my-hook.ts');
 * if (typeof hook === 'function') {
 *   const output = await hook(input);
 * }
 *
 * @example
 * // Load a format hook (MarkdownFormat)
 * const hook = await loadHook('/path/to/claude-md-format.ts');
 * if (isMarkdownFormat(hook)) {
 *   // Use format validation utilities
 * }
 */
export async function loadHook(hookPath: string): Promise<HookExport> {
  if (!hookPath || hookPath.trim().length === 0) {
    throw new Error('Hook path cannot be empty');
  }

  // Use pathToFileURL for proper ESM import
  const { pathToFileURL } = await import('url');
  const hookUrl = pathToFileURL(hookPath).href;

  // Only register tsx if we need it (not running under Bun or tsx)
  // Bun natively supports TypeScript, tsx handles its own registration
  let unregister: (() => void) | undefined;
  if (needsTsxLoader()) {
    // Dynamic import tsx only when needed (it's an optional dependency)
    // Use variable to prevent TypeScript from statically analyzing the import
    try {
      const tsxModule = 'tsx/esm/api';
      const tsx = await import(/* webpackIgnore: true */ tsxModule) as { register: () => () => void };
      unregister = tsx.register();
    } catch {
      // tsx not available - assume TypeScript is handled by the runtime
    }
  }

  try {
    // Add cache-busting query to force fresh import
    const importUrl = `${hookUrl}?t=${Date.now()}`;
    const imported = await import(importUrl);

    // Handle nested default export from tsx
    // tsx can wrap the module creating: { default: { default: actualExport } }
    let defaultExport = imported.default;
    if (defaultExport && typeof defaultExport === 'object' && 'default' in defaultExport) {
      defaultExport = defaultExport.default;
    }

    // Check if it's a function (regular hook)
    if (typeof defaultExport === 'function') {
      return defaultExport;
    }

    // Check if it's a MarkdownFormat (format hook)
    if (isMarkdownFormat(defaultExport)) {
      return defaultExport;
    }

    // Invalid export
    throw new Error(
      `Hook file must export a default function or MarkdownFormat object. ` +
        `Got: ${typeof defaultExport}`
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load hook from ${hookPath}: ${error.message}`);
    }
    throw error;
  } finally {
    if (unregister) {
      unregister();
    }
  }
}

