/**
 * Process Information Utility
 * Identifies processes using specific ports for debugging and diagnostics.
 * Provides graceful fallbacks when system tools are unavailable.
 * @module process-info
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Information about a process using a port
 */
export interface ProcessInfo {
  /** Process ID (null if cannot be determined) */
  pid: number | null;
  /** Process name (null if cannot be determined) */
  name: string | null;
  /** Full command line (null if cannot be determined) */
  command: string | null;
}

/**
 * Extended process info with port context
 */
export interface PortProcessInfo extends ProcessInfo {
  /** Port number being used */
  port: number;
  /** Whether a process was found on the port */
  found: boolean;
}

/**
 * Get information about the process using a specific port
 * Uses lsof and ps commands (best effort, graceful fallback)
 *
 * @param port - Port number to check
 * @returns Process information (fields may be null if unavailable)
 *
 * @example
 * ```typescript
 * const info = await getProcessOnPort(3000);
 * if (info.pid) {
 *   console.log(`Port 3000 used by ${info.name} (PID: ${info.pid})`);
 * }
 * ```
 */
export async function getProcessOnPort(port: number): Promise<ProcessInfo> {
  const result: ProcessInfo = {
    pid: null,
    name: null,
    command: null,
  };

  try {
    // Try lsof first (works on macOS and Linux)
    const lsofResult = await execAsync(`lsof -ti tcp:${port}`, { timeout: 5000 });
    const pids = lsofResult.stdout.trim().split('\n').filter(Boolean);

    if (pids.length === 0) {
      return result;
    }

    // Take the first PID found
    const pid = parseInt(pids[0], 10);
    if (isNaN(pid)) {
      return result;
    }

    result.pid = pid;

    // Try to get process name and command
    try {
      const psResult = await execAsync(`ps -p ${pid} -o comm=,args=`, { timeout: 5000 });
      const psOutput = psResult.stdout.trim();

      if (psOutput) {
        // ps output format: "comm args" - comm is first word, rest is args
        const parts = psOutput.split(/\s+/);
        result.name = parts[0] || null;
        result.command = psOutput;
      }
    } catch {
      // ps failed, try alternative approach
      try {
        // Try just getting the command name
        const commResult = await execAsync(`ps -p ${pid} -o comm=`, { timeout: 5000 });
        result.name = commResult.stdout.trim() || null;
      } catch {
        // Ignore - we at least have the PID
      }
    }
  } catch {
    // lsof failed - port might not be in use or lsof not available
  }

  return result;
}

/**
 * Get process information for multiple ports
 * Runs checks in parallel for efficiency
 *
 * @param ports - Array of port numbers to check
 * @returns Array of port process info objects
 *
 * @example
 * ```typescript
 * const infos = await getProcessesOnPorts([3000, 54321, 54323]);
 * for (const info of infos) {
 *   if (info.found) {
 *     console.log(`Port ${info.port}: ${info.name} (PID: ${info.pid})`);
 *   }
 * }
 * ```
 */
export async function getProcessesOnPorts(ports: number[]): Promise<PortProcessInfo[]> {
  const results = await Promise.all(
    ports.map(async (port): Promise<PortProcessInfo> => {
      const info = await getProcessOnPort(port);
      return {
        ...info,
        port,
        found: info.pid !== null,
      };
    })
  );
  return results;
}

/**
 * Check if lsof command is available on the system
 * Useful for deciding whether to attempt process identification
 *
 * @returns true if lsof is available
 */
export async function isLsofAvailable(): Promise<boolean> {
  try {
    await execAsync('which lsof', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Format process info for display
 * Creates a human-readable string describing the process
 *
 * @param info - Process information object
 * @returns Formatted string (e.g., "node (PID: 12345)")
 */
export function formatProcessInfo(info: ProcessInfo): string {
  if (info.pid === null) {
    return 'unknown process';
  }

  if (info.name) {
    return `${info.name} (PID: ${info.pid})`;
  }

  return `PID: ${info.pid}`;
}

/**
 * Check if a process appears to be a Supabase-related process
 * Based on common Supabase container/process names
 *
 * @param info - Process information to check
 * @returns true if process appears Supabase-related
 */
export function isSupabaseProcess(info: ProcessInfo): boolean {
  if (!info.name && !info.command) {
    return false;
  }

  const searchText = `${info.name || ''} ${info.command || ''}`.toLowerCase();

  const supabaseIndicators = [
    'supabase',
    'postgres',
    'postgrest',
    'gotrue',
    'realtime',
    'storage',
    'kong',
    'inbucket',
    'studio',
    'pg_',
    'docker',
    'containerd',
  ];

  return supabaseIndicators.some((indicator) => searchText.includes(indicator));
}

/**
 * Get a summary of processes using Supabase ports
 * Useful for diagnostics and debugging
 *
 * @param ports - Port set to check (as array or individual ports)
 * @returns Summary object with counts and details
 */
export async function getSupabaseProcessSummary(ports: number[]): Promise<{
  totalPorts: number;
  portsInUse: number;
  supabaseProcesses: number;
  otherProcesses: number;
  details: PortProcessInfo[];
}> {
  const details = await getProcessesOnPorts(ports);

  const portsInUse = details.filter((d) => d.found).length;
  const supabaseProcesses = details.filter((d) => d.found && isSupabaseProcess(d)).length;
  const otherProcesses = portsInUse - supabaseProcesses;

  return {
    totalPorts: ports.length,
    portsInUse,
    supabaseProcesses,
    otherProcesses,
    details,
  };
}
