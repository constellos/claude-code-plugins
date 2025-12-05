/**
 * I/O utilities for Claude Code hook runners
 *
 * Provides functions for reading JSON from stdin, writing JSON to stdout,
 * and exiting with errors. These are the core I/O primitives used by the
 * hook runner.
 */

/**
 * Read and parse JSON from stdin
 *
 * @returns Promise resolving to parsed JSON data
 * @throws Error if stdin cannot be read or JSON parsing fails
 *
 * @example
 * const input = await readStdinJson<PreToolUseInput>();
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
 * Outputs compact JSON on a single line followed by newline.
 * Claude Code expects clean JSON output without extra formatting.
 *
 * @param output - Data to serialize and write
 *
 * @example
 * writeStdoutJson({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } });
 */
export function writeStdoutJson(output: unknown): void {
  process.stdout.write(JSON.stringify(output) + '\n');
}

/**
 * Exit the process with an error message
 *
 * Writes error to stderr and exits with the specified code.
 *
 * @param message - Error message to display
 * @param code - Exit code (default: 1)
 *
 * @example
 * exitWithError('Hook file not found');
 */
export function exitWithError(message: string, code: number = 1): never {
  console.error(`Error: ${message}`);
  process.exit(code);
}
