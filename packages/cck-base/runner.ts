#!/usr/bin/env node
/**
 * Claude Code Kit Hook Runner
 *
 * Universal hook runner for executing Claude Code hook scripts. Handles TypeScript
 * and JavaScript hook files, providing stdin/stdout JSON communication and debug logging.
 *
 * @module runner
 *
 * @usage
 * ```bash
 * node runner.ts <hook-file.ts>
 * echo '{"hook_event_name":"SubagentStop",...}' | node runner.ts ./hooks/my-hook.ts
 * ```
 *
 * @description
 * The runner:
 * 1. Reads JSON hook input from stdin
 * 2. Dynamically loads the specified hook file (supports .ts, .tsx, .js via tsx)
 * 3. Executes the hook's default export function with the input
 * 4. Writes the hook's JSON output to stdout
 * 5. Logs all activity to .claude/logs/hook-events.json when debug mode is enabled
 *
 * @debug
 * Debug mode is activated when hook input contains `debug: true`:
 * - All inputs, outputs, and errors are logged to .claude/logs/hook-events.json
 * - On error: returns blocking error response (stops execution)
 * - On success: normal output
 *
 * Normal mode (debug: false or undefined):
 * - No logging occurs
 * - On error: returns pass-through response (execution continues silently)
 * - On success: normal output
 */

import { pathToFileURL } from 'url';
import * as path from 'path';
import { readStdinJson, writeStdoutJson } from './lib/io.js';
import {
  createDebugLogger,
  createBlockingErrorResponse,
  createPassthroughResponse,
  type DebugConfig,
} from './lib/debug.js';
import type { HookInput, HookOutput } from './lib/types.js';

// ============================================================================
// Hook Loading
// ============================================================================

type HookModule = {
  default: (input: HookInput) => HookOutput | Promise<HookOutput>;
};

/**
 * Dynamically load a hook file with TypeScript support
 *
 * Loads hook files (.ts, .tsx, .js) using dynamic import with tsx for TypeScript compilation.
 * Includes cache-busting to ensure hooks are reloaded on every execution.
 *
 * @param hookPath - Absolute or relative path to the hook file
 * @returns Promise resolving to the hook's default export function
 * @throws Error if hook file cannot be loaded or doesn't export a default function
 *
 * @example
 * ```typescript
 * const hook = await loadHook('./hooks/my-hook.ts');
 * const output = await hook(input);
 * ```
 */
async function loadHook(hookPath: string): Promise<HookModule['default']> {
  const absolutePath = path.isAbsolute(hookPath) ? hookPath : path.resolve(process.cwd(), hookPath);
  const hookUrl = pathToFileURL(absolutePath).href;

  // Add cache-busting query parameter
  const importUrl = `${hookUrl}?t=${Date.now()}`;

  // Check if we need tsx for TypeScript
  if (absolutePath.endsWith('.ts') || absolutePath.endsWith('.tsx')) {
    // Try to use tsx for TypeScript support
    try {
      const tsx = await import('tsx/esm/api');
      const unregister = tsx.register();
      try {
        const module = await import(importUrl);
        return extractDefaultExport(module);
      } finally {
        unregister();
      }
    } catch {
      // If tsx is not available, try direct import (might work in Bun)
      const module = await import(importUrl);
      return extractDefaultExport(module);
    }
  }

  const module = await import(importUrl);
  return extractDefaultExport(module);
}

/**
 * Extract the default export from a dynamically imported module
 *
 * Handles various module formats including nested defaults from tsx loader.
 * Ensures the extracted export is a function suitable for use as a hook handler.
 *
 * @param module - The dynamically imported module object
 * @returns The default export function
 * @throws Error if no default function export is found
 *
 * @internal
 */
function extractDefaultExport(module: unknown): HookModule['default'] {
  if (typeof module === 'object' && module !== null) {
    const mod = module as Record<string, unknown>;
    // Handle nested default from tsx
    if ('default' in mod) {
      const defaultExport = mod.default;
      if (typeof defaultExport === 'function') {
        return defaultExport as HookModule['default'];
      }
      // Handle double-wrapped default
      if (typeof defaultExport === 'object' && defaultExport !== null && 'default' in defaultExport) {
        const nestedDefault = (defaultExport as Record<string, unknown>).default;
        if (typeof nestedDefault === 'function') {
          return nestedDefault as HookModule['default'];
        }
      }
    }
  }
  throw new Error('Hook file must export a default function');
}

// ============================================================================
// Main Runner
// ============================================================================

/**
 * Main runner entrypoint
 *
 * Orchestrates the complete hook execution lifecycle:
 * 1. Reads hook input from stdin
 * 2. Loads the specified hook file
 * 3. Executes the hook with the input
 * 4. Writes the output to stdout
 * 5. Handles errors based on debug mode
 *
 * @throws Exits process with code 1 if hook path is missing or input cannot be read
 */
async function main(): Promise<void> {
  const hookPath = process.argv[2];

  if (!hookPath) {
    console.error('Usage: runner.ts <hook-file.ts>');
    process.exit(1);
  }

  let input: HookInput & DebugConfig;
  let hookEventName = 'unknown';
  let cwd = process.cwd();
  let debug = false;

  try {
    // Read input from stdin
    input = await readStdinJson<HookInput & DebugConfig>();
    hookEventName = (input as { hook_event_name?: string }).hook_event_name || 'unknown';
    cwd = input.cwd || process.cwd();
    debug = input.debug === true;
  } catch (error) {
    // Can't even read input - exit with error
    console.error('Failed to read hook input:', error);
    process.exit(1);
  }

  const logger = createDebugLogger(cwd, hookEventName, debug);

  try {
    // Log input if debug enabled
    await logger.logInput(input);

    // Load and execute hook
    const hook = await loadHook(hookPath);
    const output = await hook(input);

    // Log output if debug enabled
    await logger.logOutput(output);

    // Write output to stdout
    writeStdoutJson(output);

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    // Log error
    await logger.logError(err);

    if (debug) {
      // Debug mode: return blocking error
      const errorResponse = createBlockingErrorResponse(hookEventName, err);
      writeStdoutJson(errorResponse);
    } else {
      // Normal mode: return pass-through response (fail silently)
      const passthroughResponse = createPassthroughResponse(hookEventName);
      writeStdoutJson(passthroughResponse);
    }
  }
}

main().catch((error) => {
  console.error('Runner fatal error:', error);
  process.exit(1);
});
