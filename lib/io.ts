/**
 * I/O utilities for Claude Code hook runners
 * Provides stdin/stdout JSON handling
 */

/**
 * Read and parse JSON from stdin
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
 */
export function writeStdoutJson(output: unknown): void {
  process.stdout.write(JSON.stringify(output) + '\n');
}
