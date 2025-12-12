/**
 * Debug utilities for Claude Code hooks
 * Provides logging and error handling with debug mode support
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface DebugConfig {
  debug?: boolean;
}

export interface DebugLogger {
  log: (message: string, data?: unknown) => Promise<void>;
  error: (message: string, error?: Error) => Promise<void>;
}

// ============================================================================
// Debug Logging
// ============================================================================

/**
 * Create a debug logger for a hook execution
 */
export function createDebugLogger(
  cwd: string,
  hookEventName: string,
  debug: boolean
): DebugLogger {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logDir = path.join(cwd, '.claude', 'logs', 'hooks');
  const logFile = path.join(logDir, `${timestamp}-${hookEventName}.json`);

  const entries: Array<{ time: string; type: string; message: string; data?: unknown }> = [];

  const writeLog = async () => {
    if (!debug || entries.length === 0) return;
    try {
      await fs.mkdir(logDir, { recursive: true });
      await fs.writeFile(logFile, JSON.stringify(entries, null, 2), 'utf-8');
    } catch {
      // Silently fail - don't break hook execution for logging
    }
  };

  return {
    log: async (message: string, data?: unknown) => {
      if (!debug) return;
      entries.push({
        time: new Date().toISOString(),
        type: 'log',
        message,
        data,
      });
      await writeLog();
    },

    error: async (message: string, error?: Error) => {
      if (!debug) return;
      entries.push({
        time: new Date().toISOString(),
        type: 'error',
        message,
        data: error ? { name: error.name, message: error.message, stack: error.stack } : undefined,
      });
      await writeLog();
    },
  };
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Create a blocking error response for hooks
 * Used when debug mode is enabled and an error occurs
 */
export function createBlockingErrorResponse(
  hookEventName: string,
  error: Error
): Record<string, unknown> {
  const baseResponse = {
    continue: false,
    stopReason: `Hook error: ${error.message}`,
    systemMessage: `Hook ${hookEventName} failed: ${error.message}`,
  };

  // Add hook-specific output based on event type
  switch (hookEventName) {
    case 'PreToolUse':
      return {
        ...baseResponse,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Hook error: ${error.message}`,
        },
      };

    case 'PostToolUse':
      return {
        ...baseResponse,
        decision: 'block',
        reason: `Hook error: ${error.message}`,
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `Hook error: ${error.message}\n${error.stack || ''}`,
        },
      };

    case 'SubagentStop':
      return {
        ...baseResponse,
        decision: 'block',
        reason: `Hook error: ${error.message}`,
      };

    case 'UserPromptSubmit':
      return {
        ...baseResponse,
        decision: 'block',
        reason: `Hook error: ${error.message}`,
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: `Hook error: ${error.message}`,
        },
      };

    case 'Stop':
      return {
        ...baseResponse,
        decision: 'block',
        reason: `Hook error: ${error.message}`,
      };

    default:
      return baseResponse;
  }
}

/**
 * Create a pass-through response for hooks (used when debug is off and error occurs)
 */
export function createPassthroughResponse(hookEventName: string): Record<string, unknown> {
  switch (hookEventName) {
    case 'PreToolUse':
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };

    case 'PostToolUse':
      return {};

    case 'SessionStart':
      return {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: '',
        },
      };

    case 'SubagentStart':
      return {};

    case 'SubagentStop':
      return {};

    default:
      return {};
  }
}
