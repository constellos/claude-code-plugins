/**
 * Logging utilities for Claude Code hook runners
 *
 * Provides structured logging to markdown files for debugging hooks.
 * Logs are written to a configurable path with timestamps and formatted
 * JSON content.
 */

import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

/**
 * Get current timestamp in ISO format
 *
 * @returns ISO 8601 timestamp string
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Format a log entry with header and JSON content
 *
 * Creates a markdown-formatted entry with timestamp and JSON code block.
 *
 * @param type - Entry type ('INPUT' or 'OUTPUT')
 * @param data - Data to log (will be JSON stringified)
 * @returns Formatted markdown string
 */
export function formatLogEntry(type: 'INPUT' | 'OUTPUT', data: unknown): string {
  const timestamp = getTimestamp();
  const header = `## ${type} - ${timestamp}\n\n`;
  const content = '```json\n' + JSON.stringify(data, null, 2) + '\n```\n\n';
  return header + content;
}

/**
 * Ensure the directory for a log file exists
 *
 * Creates the directory recursively if it doesn't exist.
 *
 * @param logPath - Full path to the log file
 */
export function ensureLogDirectory(logPath: string): void {
  const dir = dirname(logPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Append an entry to the log file
 *
 * Creates the file with a header if it doesn't exist.
 * Silently fails if writing fails (logging should not break hooks).
 *
 * @param logPath - Full path to the log file
 * @param entry - Formatted log entry to append
 */
export function appendToLog(logPath: string, entry: string): void {
  try {
    ensureLogDirectory(logPath);

    if (!existsSync(logPath)) {
      const header = '# Claude Code Hook Event Log\n\n';
      writeFileSync(logPath, header + entry, 'utf8');
    } else {
      appendFileSync(logPath, entry, 'utf8');
    }
  } catch {
    // Don't throw - logging should not break the hook
  }
}

/**
 * Logger interface for hook runners
 */
export interface Logger {
  /**
   * Log input or output data
   * @param type - 'INPUT' or 'OUTPUT'
   * @param data - Data to log
   */
  log(type: 'INPUT' | 'OUTPUT', data: unknown): void;

  /**
   * Log a debug message
   * @param message - Debug message
   */
  debug(message: string): void;
}

/**
 * Create a logger instance for the specified log path
 *
 * @param logPath - Full path to the log file
 * @returns Logger instance
 *
 * @example
 * const logger = createLogger('/path/to/.claude/hooks/utils/log.md');
 * logger.log('INPUT', inputData);
 * logger.debug('Processing hook...');
 * logger.log('OUTPUT', outputData);
 */
export function createLogger(logPath: string): Logger {
  return {
    log(type: 'INPUT' | 'OUTPUT', data: unknown): void {
      const entry = formatLogEntry(type, data);
      appendToLog(logPath, entry);
    },

    debug(message: string): void {
      const timestamp = getTimestamp();
      const entry = `## DEBUG - ${timestamp}\n\n${message}\n\n`;
      appendToLog(logPath, entry);
    },
  };
}
