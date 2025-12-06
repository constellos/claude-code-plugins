/**
 * Claude Code Hook Runner
 *
 * Main entry point for executing hook functions. Reads input from stdin,
 * executes the hook (or passes through in logging-only mode), and writes
 * output to stdout.
 *
 * Supported Hook Events:
 * - PreToolUse: Called before any tool is executed
 * - PostToolUse: Called after any tool is executed
 * - SessionStart: Called when a Claude Code session starts
 * - SessionEnd: Called when a session ends
 * - SubagentStart: Called when a subagent is created
 * - SubagentStop: Called when a subagent stops
 * - Notification: Called for notification events
 * - UserPromptSubmit: Called when user submits a prompt
 * - Stop: Called for stop events
 * - PreCompact: Called before context compaction
 *
 * @example
 * // Run a specific hook
 * await runHook({ hookPath: './my-hook.ts' });
 *
 * // Pass-through mode with logging
 * await runHook({ enableLogging: true, logPath: './log.md' });
 *
 * // Run hook with logging
 * await runHook({ hookPath: './my-hook.ts', enableLogging: true });
 */

import { join } from 'path';
import { readStdinJson, writeStdoutJson, exitWithError } from './io.js';
import { createLogger, type Logger } from './logging.js';
import { resolveHookPath, loadHook } from './loader.js';
import {
  isMarkdownFormat,
  createFormatHookFunction,
  runFormatHook,
} from '../format/index.js';

/**
 * Hook input payload structure
 *
 * Uses index signature to allow passing to HookFunction which expects
 * Record<string, unknown>
 */
interface HookPayload {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  cwd?: string;
  [key: string]: unknown;
}

/**
 * Hook output structure
 */
type HookOutput = Record<string, unknown>;

/**
 * Options for running a hook
 */
export interface RunHookOptions {
  /**
   * Path to the hook file (relative or absolute)
   * If not provided, runs in pass-through mode
   */
  hookPath?: string;

  /**
   * Enable logging to file
   * @default false
   */
  enableLogging?: boolean;

  /**
   * Path to the log file
   * @default '{hookPath}.log.md' (sibling of hook file)
   */
  logPath?: string;
}

/**
 * Get default non-blocking output for a hook event
 *
 * Returns the appropriate default output based on the event type.
 * PreToolUse returns an 'allow' decision; other events return minimal output.
 *
 * @param hookEventName - Name of the hook event
 * @returns Default output for pass-through mode
 */
function getDefaultOutput(hookEventName: string | undefined): HookOutput {
  switch (hookEventName) {
    case 'PreToolUse':
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };

    case 'PostToolUse':
      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
        },
      };

    case 'SessionStart':
      return {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
        },
      };

    case 'SessionEnd':
      return {
        hookSpecificOutput: {
          hookEventName: 'SessionEnd',
        },
      };

    case 'SubagentStart':
      return {
        hookSpecificOutput: {
          hookEventName: 'SubagentStart',
        },
      };

    case 'SubagentStop':
      return {
        hookSpecificOutput: {
          hookEventName: 'SubagentStop',
        },
      };

    case 'Notification':
      return {
        hookSpecificOutput: {
          hookEventName: 'Notification',
        },
      };

    case 'UserPromptSubmit':
      return {
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
        },
      };

    case 'Stop':
      return {
        hookSpecificOutput: {
          hookEventName: 'Stop',
        },
      };

    case 'PreCompact':
      return {
        hookSpecificOutput: {
          hookEventName: 'PreCompact',
        },
      };

    default:
      // Unknown hook event, return minimal output
      return {
        hookSpecificOutput: {
          hookEventName: hookEventName || 'Unknown',
        },
      };
  }
}

/**
 * Run a Claude Code hook
 *
 * Reads JSON input from stdin, executes the hook function (if provided),
 * and writes JSON output to stdout. Supports logging for debugging.
 *
 * In pass-through mode (no hookPath), returns non-blocking default output
 * based on the event type. This is useful for logging-only hooks.
 *
 * @param options - Runner options
 */
export async function runHook(options: RunHookOptions = {}): Promise<void> {
  const { hookPath, enableLogging = false, logPath: customLogPath } = options;

  // Resolve hook path early so we can use it for logging
  const resolvedHookPath = hookPath ? resolveHookPath(hookPath, process.cwd()) : undefined;

  // Determine log path - use sibling file of hook if available
  const logPath = customLogPath || (resolvedHookPath ? `${resolvedHookPath}.log.md` : undefined);

  // Create logger if logging is enabled and we have a log path
  let logger: Logger | undefined;
  if (enableLogging && logPath) {
    logger = createLogger(logPath);
  }

  try {
    // Read input from stdin
    const input = await readStdinJson<HookPayload>();

    // Change to the correct working directory from input
    if (input.cwd && typeof input.cwd === 'string') {
      process.chdir(input.cwd);
    }

    // Log enabled but no log path (no hook file provided) - create fallback logger
    if (enableLogging && !logger) {
      const fallbackLogPath = join(process.cwd(), '.claude', 'hooks', 'utils', 'log.md');
      logger = createLogger(fallbackLogPath);
    }

    // Log debug info and input if logging is enabled
    if (logger) {
      logger.debug(
        '```json\n' +
          JSON.stringify(
            {
              hookPath,
              resolvedHookPath,
              enableLogging,
              cwd: process.cwd(),
              inputCwd: input.cwd,
            },
            null,
            2
          ) +
          '\n```'
      );
      logger.log('INPUT', input);
    }

    let output: HookOutput;

    if (hookPath && hookPath.trim().length > 0 && resolvedHookPath) {
      // Log that we're loading the hook
      if (logger) {
        logger.debug(`Loading hook: \`${hookPath}\` -> \`${resolvedHookPath}\``);
      }

      // Load the hook (already resolved earlier)
      const hook = await loadHook(resolvedHookPath);

      // Handle based on export type
      if (isMarkdownFormat(hook)) {
        // Format hook - create handler and run format validation
        if (logger) {
          logger.debug(`Detected MarkdownFormat hook, running format validation`);
        }

        const handler = createFormatHookFunction(hook);
        const result = await runFormatHook(
          handler,
          input.tool_name || '',
          input.tool_input || {},
          process.cwd()
        );

        output = {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: result.continue ? 'allow' : 'deny',
          },
          ...(result.stopReason && { stopReason: result.stopReason }),
        };
      } else {
        // Regular hook function
        output = await hook(input);

        // Validate output is an object
        if (typeof output !== 'object' || output === null) {
          throw new Error(`Hook must return an object. Got: ${typeof output}`);
        }
      }
    } else {
      // Pass-through mode - return default non-blocking output
      if (logger) {
        logger.debug(`No hook path provided, using pass-through mode`);
      }

      output = getDefaultOutput(input.hook_event_name);
    }

    // Log output
    if (logger) {
      logger.log('OUTPUT', output);
    }

    // Write output to stdout
    writeStdoutJson(output);
  } catch (error) {
    // Log error if logger is available
    if (logger) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.debug(
        `## ERROR\n\n\`\`\`\n${errorMessage}${errorStack ? `\n\nStack:\n${errorStack}` : ''}\n\`\`\``
      );
    }
    exitWithError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Parse command line arguments for the hook runner
 *
 * @param args - Command line arguments (process.argv.slice(2))
 * @returns Parsed options
 */
export function parseArgs(args: string[]): RunHookOptions {
  const enableLogging = args.includes('--log');
  const hookPath = args.find((arg) => !arg.startsWith('--'));

  return {
    hookPath,
    enableLogging,
  };
}

/**
 * Main entry point for CLI usage
 *
 * Parses command line arguments and runs the hook.
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  await runHook(options);
}
