/**
 * Base types for Claude Code hooks
 *
 * These types are shared across all hook events and provide the foundation
 * for hook input/output contracts.
 */

// ============================================================================
// Permission Mode
// ============================================================================

/**
 * Permission mode for the current session
 */
export type PermissionMode = "default" | "plan" | "acceptEdits" | "bypassPermissions";

// ============================================================================
// Hook Event Names
// ============================================================================

/**
 * All available hook event names in Claude Code
 */
export type HookEventName =
  | "PreToolUse"
  | "PostToolUse"
  | "Notification"
  | "UserPromptSubmit"
  | "Stop"
  | "SubagentStart"
  | "SubagentStop"
  | "PreCompact"
  | "SessionStart"
  | "SessionEnd";

// ============================================================================
// Base Hook Input/Output
// ============================================================================

/**
 * Base input fields present in all hook events
 */
export interface BaseHookInput {
  /** Unique identifier for the current session */
  session_id: string;
  /** Absolute path to the session transcript file */
  transcript_path: string;
  /** Current working directory (project root) */
  cwd: string;
  /** Permission mode for the current session */
  permission_mode: PermissionMode;
}

/**
 * Base output fields available for all hook events
 */
export interface BaseHookOutput {
  /**
   * Whether Claude should continue after hook execution.
   * Setting to false will terminate execution and require user input.
   * @default true
   */
  continue?: boolean;
  /** Message shown to user when continue is false */
  stopReason?: string;
  /**
   * Hide stdout from transcript mode.
   * Useful for suppressing verbose output.
   * @default false
   */
  suppressOutput?: boolean;
  /**
   * Optional warning message shown to the user.
   * Useful when "continue" is true but a message to the user is still needed.
   */
  systemMessage?: string;
}

/**
 * Decision type for permission-based hooks
 */
export type DecisionType = "allow" | "deny" | "ask";
