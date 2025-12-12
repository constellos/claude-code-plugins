/**
 * Pure TypeScript types for Claude Code hooks
 * No Zod dependencies - these are type-only definitions
 */

// ============================================================================
// Permission Mode
// ============================================================================

export type PermissionMode = "default" | "plan" | "acceptEdits" | "bypassPermissions";

// ============================================================================
// Hook Event Names
// ============================================================================

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

export interface BaseHookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: PermissionMode;
}

export interface BaseHookOutput {
  continue?: boolean;
  stopReason?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
}

// ============================================================================
// PreToolUse Hook
// ============================================================================

export interface PreToolUseInput extends BaseHookInput {
  hook_event_name: "PreToolUse";
  tool_use_id: string;
  tool_name: string;
  tool_input: unknown;
}

export type PreToolUseHookOutput = BaseHookOutput & {
  hookSpecificOutput:
    | {
        hookEventName: "PreToolUse";
        permissionDecision: "allow";
        permissionDecisionReason?: string;
        updatedInput?: Record<string, unknown>;
      }
    | {
        hookEventName: "PreToolUse";
        permissionDecision: "deny" | "ask";
        permissionDecisionReason: string;
      };
};

export type PreToolUseHook = (
  input: PreToolUseInput
) => PreToolUseHookOutput | Promise<PreToolUseHookOutput>;

// ============================================================================
// PostToolUse Hook
// ============================================================================

export interface PostToolUseInput extends BaseHookInput {
  hook_event_name: "PostToolUse";
  tool_use_id: string;
  tool_name: string;
  tool_input: unknown;
  tool_response: unknown;
}

export type PostToolUseHookOutput = BaseHookOutput &
  (
    | {
        decision?: undefined;
        reason?: string;
        hookSpecificOutput?: {
          hookEventName: "PostToolUse";
          additionalContext?: string;
        };
      }
    | {
        decision: "block";
        reason?: string;
        hookSpecificOutput: {
          hookEventName: "PostToolUse";
          additionalContext: string;
        };
      }
  );

export type PostToolUseHook = (
  input: PostToolUseInput
) => PostToolUseHookOutput | Promise<PostToolUseHookOutput>;

// ============================================================================
// SessionStart Hook
// ============================================================================

export type SessionStartSource = "startup" | "resume" | "clear" | "compact";

export interface SessionStartInput extends BaseHookInput {
  hook_event_name: "SessionStart";
  source: SessionStartSource;
}

export interface SessionStartHookOutput extends BaseHookOutput {
  hookSpecificOutput: {
    hookEventName: "SessionStart";
    additionalContext: string;
  };
}

export type SessionStartHook = (
  input: SessionStartInput
) => SessionStartHookOutput | Promise<SessionStartHookOutput>;

// ============================================================================
// SessionEnd Hook
// ============================================================================

export type SessionEndReason = "clear" | "logout" | "prompt_input_exit" | "other";

export interface SessionEndInput extends BaseHookInput {
  hook_event_name: "SessionEnd";
  reason: SessionEndReason;
}

export type SessionEndHookOutput = BaseHookOutput;

export type SessionEndHook = (
  input: SessionEndInput
) => SessionEndHookOutput | Promise<SessionEndHookOutput>;

// ============================================================================
// SubagentStart Hook
// ============================================================================

export interface SubagentStartInput extends BaseHookInput {
  hook_event_name: "SubagentStart";
  agent_id: string;
  agent_type: string;
}

export interface SubagentStartHookOutput extends BaseHookOutput {
  hookSpecificOutput?: {
    hookEventName: "SubagentStart";
  };
}

export type SubagentStartHook = (
  input: SubagentStartInput
) => SubagentStartHookOutput | Promise<SubagentStartHookOutput>;

// ============================================================================
// SubagentStop Hook
// ============================================================================

export interface SubagentStopInput extends BaseHookInput {
  hook_event_name: "SubagentStop";
  stop_hook_active: boolean;
  agent_id: string;
  agent_transcript_path: string;
}

export interface SubagentStopHookOutput extends BaseHookOutput {
  decision?: "block";
  reason?: string;
}

export type SubagentStopHook = (
  input: SubagentStopInput
) => SubagentStopHookOutput | Promise<SubagentStopHookOutput>;

// ============================================================================
// Notification Hook
// ============================================================================

export interface NotificationInput extends BaseHookInput {
  hook_event_name: "Notification";
  message: string;
}

export type NotificationHookOutput = BaseHookOutput;

export type NotificationHook = (
  input: NotificationInput
) => NotificationHookOutput | Promise<NotificationHookOutput>;

// ============================================================================
// UserPromptSubmit Hook
// ============================================================================

export interface UserPromptSubmitInput extends BaseHookInput {
  hook_event_name: "UserPromptSubmit";
  prompt: string;
}

export type UserPromptSubmitHookOutput = BaseHookOutput &
  (
    | {
        decision?: undefined;
        reason?: string;
        hookSpecificOutput?: {
          hookEventName: "UserPromptSubmit";
          additionalContext?: string;
        };
      }
    | {
        decision: "block";
        reason?: string;
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit";
          additionalContext: string;
        };
      }
  );

export type UserPromptSubmitHook = (
  input: UserPromptSubmitInput
) => UserPromptSubmitHookOutput | Promise<UserPromptSubmitHookOutput>;

// ============================================================================
// Stop Hook
// ============================================================================

export interface StopInput extends BaseHookInput {
  hook_event_name: "Stop";
  stop_hook_active: boolean;
}

export interface StopHookOutput extends BaseHookOutput {
  decision?: "block";
  reason?: string;
}

export type StopHook = (
  input: StopInput
) => StopHookOutput | Promise<StopHookOutput>;

// ============================================================================
// PreCompact Hook
// ============================================================================

export type PreCompactTrigger = "manual" | "auto";

export interface PreCompactInput extends BaseHookInput {
  hook_event_name: "PreCompact";
  trigger: PreCompactTrigger;
  custom_instructions: string;
}

export type PreCompactHookOutput = BaseHookOutput;

export type PreCompactHook = (
  input: PreCompactInput
) => PreCompactHookOutput | Promise<PreCompactHookOutput>;

// ============================================================================
// Hook Input/Output Union Types
// ============================================================================

export type HookInput =
  | PreToolUseInput
  | PostToolUseInput
  | SessionStartInput
  | SessionEndInput
  | SubagentStartInput
  | SubagentStopInput
  | NotificationInput
  | UserPromptSubmitInput
  | StopInput
  | PreCompactInput;

export type HookOutput =
  | PreToolUseHookOutput
  | PostToolUseHookOutput
  | SessionStartHookOutput
  | SessionEndHookOutput
  | SubagentStartHookOutput
  | SubagentStopHookOutput
  | NotificationHookOutput
  | UserPromptSubmitHookOutput
  | StopHookOutput
  | PreCompactHookOutput;

// ============================================================================
// Hook Function Type
// ============================================================================

export type HookFunction<I extends HookInput = HookInput, O extends HookOutput = HookOutput> = (
  input: I
) => O | Promise<O>;
