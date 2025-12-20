/**
 * I/O utilities for Claude Code hooks
 *
 * Provides stdin/stdout JSON handling and the runHook wrapper for
 * creating self-executable hooks. Claude Code passes hook input via
 * stdin as JSON and expects hook output as JSON on stdout.
 *
 * @module io
 */

import type { HookInput, HookOutput } from '../../types/types.js';
import {
  createDebugLogger,
  createBlockingErrorResponse,
  createPassthroughResponse,
  type DebugConfig,
} from './debug.js';

/**
 * Read and parse JSON from stdin
 *
 * Reads all data from stdin, concatenates chunks, and parses as JSON.
 * Used by hook runners to receive hook input from Claude Code.
 *
 * @template T - Expected type of the parsed JSON (defaults to unknown)
 * @returns Promise that resolves to the parsed JSON data
 * @throws Error if stdin cannot be read or JSON parsing fails
 *
 * @example
 * ```typescript
 * import { readStdinJson } from './utils/io.js';
 * import type { SubagentStopInput } from '../../types/types.js';
 *
 * const input = await readStdinJson<SubagentStopInput>();
 * console.log(input.agent_id);
 * ```
 */
export async function readStdinJson<T = unknown>(): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      try {
        const data = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(data) as T);
      } catch (error) {
        reject(new Error(`Failed to parse JSON input: ${error}`));
      }
    });
    process.stdin.on('error', (error) => {
      reject(new Error(`Failed to read stdin: ${error}`));
    });
  });
}

/**
 * Write JSON output to stdout
 *
 * Serializes the output object to JSON and writes it to stdout with a trailing newline.
 * Used by hook runners to return hook output to Claude Code.
 *
 * @param output - The output object to serialize and write
 *
 * @example
 * ```typescript
 * import { writeStdoutJson } from './utils/io.js';
 * import type { SubagentStopHookOutput } from '../../types/types.js';
 *
 * const output: SubagentStopHookOutput = { continue: true };
 * writeStdoutJson(output);
 * ```
 */
export function writeStdoutJson(output: unknown): void {
  process.stdout.write(JSON.stringify(output) + '\n');
}

/**
 * Hook handler function type
 */
export type HookHandler<I extends HookInput = HookInput, O extends HookOutput = HookOutput> = (
  input: I
) => O | Promise<O>;

/**
 * Run a hook as a self-executable script
 *
 * This function wraps a hook handler to make it self-executable when called
 * with `npx tsx`. It reads input from stdin, executes the hook, and writes
 * the output to stdout.
 *
 * @template I - Hook input type
 * @template O - Hook output type
 * @param handler - The hook handler function to execute
 *
 * @example
 * ```typescript
 * // my-hook.ts
 * import { runHook } from '../shared/hooks/utils/io.js';
 * import type { SessionStartInput, SessionStartHookOutput } from '../shared/types/types.js';
 *
 * async function handler(input: SessionStartInput): Promise<SessionStartHookOutput> {
 *   return {
 *     hookSpecificOutput: {
 *       hookEventName: 'SessionStart',
 *       additionalContext: 'Hook executed successfully',
 *     },
 *   };
 * }
 *
 * // Make this file self-executable
 * runHook(handler);
 * ```
 */
export function runHook<I extends HookInput = HookInput, O extends HookOutput = HookOutput>(
  handler: HookHandler<I, O>
): void {
  main(handler).catch((error) => {
    console.error('Hook fatal error:', error);
    process.exit(1);
  });
}

/**
 * Main hook execution function
 */
async function main<I extends HookInput, O extends HookOutput>(
  handler: HookHandler<I, O>
): Promise<void> {
  let input: I & DebugConfig;
  let hookEventName = 'unknown';
  let cwd = process.cwd();
  let debug = false;

  try {
    // Read input from stdin
    input = await readStdinJson<I & DebugConfig>();
    hookEventName = (input as { hook_event_name?: string }).hook_event_name || 'unknown';
    cwd = (input as { cwd?: string }).cwd || process.cwd();
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

    // Execute hook handler
    const output = await handler(input);

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
