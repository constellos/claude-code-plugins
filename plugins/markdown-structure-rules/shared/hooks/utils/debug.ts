/**
 * Debug utilities for Claude Code hooks
 * Provides logging and error handling with debug mode support
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Constants
// ============================================================================

const LOGS_DIR = '.claude/logs';
const HOOK_EVENTS_FILE = 'hook-events.json';

// ============================================================================
// Types
// ============================================================================

export interface DebugConfig {
  debug?: boolean;
}

export interface HookEventEntry {
  timestamp: string;
  event: string;
  type: 'input' | 'output' | 'error';
  data: unknown;
}

export interface DebugLogger {
  logInput: (input: unknown) => Promise<void>;
  logOutput: (output: unknown) => Promise<void>;
  logError: (error: Error) => Promise<void>;
}

// ============================================================================
// Debug Logging (JSONL append to hook-events.json)
// ============================================================================

/**
 * Append a hook event entry to hook-events.json (JSONL format)
 */
async function appendHookEvent(cwd: string, entry: HookEventEntry): Promise<void> {
  const logDir = path.join(cwd, LOGS_DIR);
  const logFile = path.join(logDir, HOOK_EVENTS_FILE);

  try {
    await fs.mkdir(logDir, { recursive: true });
    await fs.appendFile(logFile, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // Silently fail - don't break hook execution for logging
  }
}

/**
 * Create a debug logger for a hook execution
 */
export function createDebugLogger(
  cwd: string,
  hookEventName: string,
  debug: boolean
): DebugLogger {
  return {
    logInput: async (input: unknown) => {
      if (!debug) return;
      await appendHookEvent(cwd, {
        timestamp: new Date().toISOString(),
        event: hookEventName,
        type: 'input',
        data: input,
      });
    },

    logOutput: async (output: unknown) => {
      if (!debug) return;
      await appendHookEvent(cwd, {
        timestamp: new Date().toISOString(),
        event: hookEventName,
        type: 'output',
        data: output,
      });
    },

    logError: async (error: Error) => {
      if (!debug) return;
      await appendHookEvent(cwd, {
        timestamp: new Date().toISOString(),
        event: hookEventName,
        type: 'error',
        data: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      });
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
