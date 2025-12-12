/**
 * I/O utilities for Claude Code hook runners
 *
 * Provides stdin/stdout JSON handling for hook communication.
 * Claude Code passes hook input via stdin as JSON and expects
 * hook output as JSON on stdout.
 *
 * @module io
 */

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
 * import { readStdinJson } from 'claude-code-kit-ts';
 * import type { SubagentStopInput } from 'claude-code-kit-ts';
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
 * import { writeStdoutJson } from 'claude-code-kit-ts';
 * import type { SubagentStopHookOutput } from 'claude-code-kit-ts';
 *
 * const output: SubagentStopHookOutput = { continue: true };
 * writeStdoutJson(output);
 * ```
 */
export function writeStdoutJson(output: unknown): void {
  process.stdout.write(JSON.stringify(output) + '\n');
}
