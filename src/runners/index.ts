/**
 * Hook Runners Module
 *
 * Provides utilities for executing Claude Code hooks:
 * - I/O utilities for stdin/stdout JSON communication
 * - Logging utilities for debugging hooks
 * - Hook loading and path resolution
 * - Main hook runner with pass-through support
 *
 * @example
 * // Use the hook runner programmatically
 * import { runHook } from '@constellos/claude-code-kit/runners';
 *
 * await runHook({
 *   hookPath: './my-hook.ts',
 *   enableLogging: true,
 * });
 *
 * @example
 * // Use individual utilities
 * import {
 *   readStdinJson,
 *   writeStdoutJson,
 *   createLogger,
 *   loadHookFunction,
 * } from '@constellos/claude-code-kit/runners';
 */

// I/O utilities
export { readStdinJson, writeStdoutJson, exitWithError } from './io.js';

// Logging utilities
export {
  getTimestamp,
  formatLogEntry,
  ensureLogDirectory,
  appendToLog,
  createLogger,
  type Logger,
} from './logging.js';

// Hook loading
export {
  resolveHookPath,
  loadHook,
  type HookFunction,
  type HookExport,
} from './loader.js';

// Main hook runner
export {
  runHook,
  parseArgs,
  main,
  type RunHookOptions,
} from './hook-runner.js';
