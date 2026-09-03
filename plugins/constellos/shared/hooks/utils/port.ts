/**
 * Port availability utilities for checking and finding available TCP ports
 *
 * Provides functions to check if a port is available and find the next available
 * port in a range. Useful for avoiding port conflicts when starting development servers.
 *
 * @module port
 */

import { createServer } from 'net';

/**
 * Check if a TCP port is available
 *
 * Attempts to bind a server to the given port. If successful, the port is available.
 * If binding fails with EADDRINUSE, the port is already in use.
 *
 * @param port - Port number to check
 * @returns Promise that resolves to true if port is available, false if in use
 *
 * @example
 * ```typescript
 * import { isPortAvailable } from './port.js';
 *
 * const available = await isPortAvailable(8787);
 * if (!available) {
 *   console.log('Port 8787 is already in use');
 * }
 * ```
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        // Other errors (EACCES, etc.) also mean port is not available
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port);
  });
}

/**
 * Find the next available port starting from a given port
 *
 * Sequentially checks ports starting from `startPort` until an available port
 * is found or `maxAttempts` is reached.
 *
 * @param startPort - Port number to start checking from
 * @param maxAttempts - Maximum number of ports to check (default: 10)
 * @returns Promise that resolves to an available port number, or null if none found
 *
 * @example
 * ```typescript
 * import { findAvailablePort } from './port.js';
 *
 * // Try to find an available port starting from 8787
 * const port = await findAvailablePort(8787, 10);
 * if (port) {
 *   console.log(`Found available port: ${port}`);
 * } else {
 *   console.log('No available ports found in range 8787-8796');
 * }
 * ```
 */
export async function findAvailablePort(
  startPort: number,
  maxAttempts: number = 10
): Promise<number | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
  }
  return null;
}
