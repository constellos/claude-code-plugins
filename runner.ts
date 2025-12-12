#!/usr/bin/env node
/**
 * Claude Code Kit Hook Runner
 *
 * Simplified hook runner for Claude Code plugins.
 * Usage: node runner.ts <hook-file.ts>
 *
 * Reads JSON from stdin, executes the hook, writes JSON to stdout.
 *
 * Debug mode:
 * - When the hook input contains `debug: true`, logs all calls and errors
 * - On error with debug: returns blocking error response
 * - On error without debug: returns pass-through response (fails silently)
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
 * Dynamically load a hook file
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
 * Extract the default export from a module
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
    await logger.log('Hook input received', input);

    // Load and execute hook
    const hook = await loadHook(hookPath);
    const output = await hook(input);

    // Log output if debug enabled
    await logger.log('Hook output', output);

    // Write output to stdout
    writeStdoutJson(output);

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    // Log error
    await logger.error('Hook execution failed', err);

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
