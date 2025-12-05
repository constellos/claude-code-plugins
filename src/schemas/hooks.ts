/**
 * Hook event Zod schemas for Claude Code
 *
 * These schemas define the input/output structure for all hook events.
 */

import { z } from 'zod';

// ============================================================================
// Permission Mode
// ============================================================================

/** Permission mode for the current session */
export const PermissionModeSchema = z.enum([
  'default',
  'plan',
  'acceptEdits',
  'bypassPermissions',
]);

export type PermissionMode = z.infer<typeof PermissionModeSchema>;

// ============================================================================
// Hook Event Names
// ============================================================================

/** All available hook event names in Claude Code */
export const HookEventNameSchema = z.enum([
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'UserPromptSubmit',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'SessionStart',
  'SessionEnd',
  'PermissionRequest',
]);

export type HookEventName = z.infer<typeof HookEventNameSchema>;

// ============================================================================
// Base Hook Input/Output
// ============================================================================

/** Base input fields present in all hook events */
export const BaseHookInputSchema = z.object({
  /** Unique identifier for the current session */
  session_id: z.string(),
  /** Absolute path to the session transcript file */
  transcript_path: z.string(),
  /** Current working directory (project root) */
  cwd: z.string(),
  /** Permission mode for the current session */
  permission_mode: PermissionModeSchema,
});

export type BaseHookInput = z.infer<typeof BaseHookInputSchema>;

/** Base output fields available for all hook events */
export const BaseHookOutputSchema = z.object({
  /** Whether Claude should continue after hook execution */
  continue: z.boolean().optional(),
  /** Message shown to user when continue is false */
  stopReason: z.string().optional(),
  /** Hide stdout from transcript mode */
  suppressOutput: z.boolean().optional(),
  /** Optional warning message shown to the user */
  systemMessage: z.string().optional(),
});

export type BaseHookOutput = z.infer<typeof BaseHookOutputSchema>;

/** Decision type for permission-based hooks */
export const DecisionTypeSchema = z.enum(['allow', 'deny', 'ask']);

export type DecisionType = z.infer<typeof DecisionTypeSchema>;

// ============================================================================
// PreToolUse Hook
// ============================================================================

/** PreToolUse hook input */
export const PreToolUseInputSchema = BaseHookInputSchema.extend({
  hook_event_name: z.literal('PreToolUse'),
  tool_name: z.string(),
  tool_input: z.record(z.unknown()),
  /** Tool use identifier (starts with "toolu_") */
  tool_use_id: z.string(),
});

export type PreToolUseInput = z.infer<typeof PreToolUseInputSchema>;

/** PreToolUse hook output - allow variant */
export const PreToolUseAllowOutputSchema = z.object({
  hookEventName: z.literal('PreToolUse'),
  permissionDecision: z.literal('allow'),
  /** When permissionDecision is "allow", shows to user only */
  permissionDecisionReason: z.string().optional(),
  /** Modify tool input parameters before execution */
  updatedInput: z.record(z.unknown()).optional(),
});

/** PreToolUse hook output - deny/ask variant */
export const PreToolUseDenyAskOutputSchema = z.object({
  hookEventName: z.literal('PreToolUse'),
  /** "ask" will request user approval */
  permissionDecision: z.enum(['deny', 'ask']),
  /** Required for "deny" or "ask". For "ask" shows to user; for "deny" shows to Claude only */
  permissionDecisionReason: z.string(),
});

/** PreToolUse hook-specific output */
export const PreToolUseHookSpecificOutputSchema = z.discriminatedUnion('permissionDecision', [
  PreToolUseAllowOutputSchema.extend({ permissionDecision: z.literal('allow') }),
  PreToolUseDenyAskOutputSchema.omit({ permissionDecision: true }).extend({
    permissionDecision: z.literal('deny'),
  }),
  PreToolUseDenyAskOutputSchema.omit({ permissionDecision: true }).extend({
    permissionDecision: z.literal('ask'),
  }),
]);

/** PreToolUse hook output */
export const PreToolUseOutputSchema = BaseHookOutputSchema.extend({
  hookSpecificOutput: z.union([
    PreToolUseAllowOutputSchema,
    PreToolUseDenyAskOutputSchema,
  ]),
});

export type PreToolUseOutput = z.infer<typeof PreToolUseOutputSchema>;

// ============================================================================
// PostToolUse Hook
// ============================================================================

/** PostToolUse hook input */
export const PostToolUseInputSchema = BaseHookInputSchema.extend({
  hook_event_name: z.literal('PostToolUse'),
  tool_name: z.string(),
  tool_input: z.record(z.unknown()),
  tool_response: z.unknown(),
  /** Tool use identifier (starts with "toolu_") */
  tool_use_id: z.string(),
});

export type PostToolUseInput = z.infer<typeof PostToolUseInputSchema>;

/** PostToolUse hook-specific output */
export const PostToolUseHookSpecificOutputSchema = z.object({
  hookEventName: z.literal('PostToolUse'),
  additionalContext: z.string().optional(),
});

/** PostToolUse hook output */
export const PostToolUseOutputSchema = BaseHookOutputSchema.extend({
  decision: z.literal('block').optional(),
  reason: z.string().optional(),
  hookSpecificOutput: PostToolUseHookSpecificOutputSchema.optional(),
});

export type PostToolUseOutput = z.infer<typeof PostToolUseOutputSchema>;

// ============================================================================
// SessionStart Hook
// ============================================================================

/** SessionStart source */
export const SessionStartSourceSchema = z.enum(['startup', 'resume', 'clear', 'compact']);

export type SessionStartSource = z.infer<typeof SessionStartSourceSchema>;

/** SessionStart hook input */
export const SessionStartInputSchema = BaseHookInputSchema.extend({
  hook_event_name: z.literal('SessionStart'),
  source: SessionStartSourceSchema,
});

export type SessionStartInput = z.infer<typeof SessionStartInputSchema>;

/** SessionStart hook-specific output */
export const SessionStartHookSpecificOutputSchema = z.object({
  hookEventName: z.literal('SessionStart'),
  additionalContext: z.string(),
});

/** SessionStart hook output */
export const SessionStartOutputSchema = BaseHookOutputSchema.extend({
  hookSpecificOutput: SessionStartHookSpecificOutputSchema,
});

export type SessionStartOutput = z.infer<typeof SessionStartOutputSchema>;

// ============================================================================
// SessionEnd Hook
// ============================================================================

/** SessionEnd reason */
export const SessionEndReasonSchema = z.enum(['clear', 'logout', 'prompt_input_exit', 'other']);

export type SessionEndReason = z.infer<typeof SessionEndReasonSchema>;

/** SessionEnd hook input */
export const SessionEndInputSchema = BaseHookInputSchema.extend({
  hook_event_name: z.literal('SessionEnd'),
  reason: SessionEndReasonSchema,
});

export type SessionEndInput = z.infer<typeof SessionEndInputSchema>;

/** SessionEnd hook output */
export const SessionEndOutputSchema = BaseHookOutputSchema;

export type SessionEndOutput = z.infer<typeof SessionEndOutputSchema>;

// ============================================================================
// SubagentStart Hook
// ============================================================================

/** SubagentStart hook input */
export const SubagentStartInputSchema = BaseHookInputSchema.extend({
  hook_event_name: z.literal('SubagentStart'),
  /** Agent identifier (lowercase letters and numbers) */
  agent_id: z.string(),
  /** Type of agent being started */
  agent_type: z.string(),
});

export type SubagentStartInput = z.infer<typeof SubagentStartInputSchema>;

/** SubagentStart hook-specific output */
export const SubagentStartHookSpecificOutputSchema = z.object({
  hookEventName: z.literal('SubagentStart'),
}).optional();

/** SubagentStart hook output */
export const SubagentStartOutputSchema = BaseHookOutputSchema.extend({
  hookSpecificOutput: z
    .object({
      hookEventName: z.literal('SubagentStart'),
    })
    .optional(),
});

export type SubagentStartOutput = z.infer<typeof SubagentStartOutputSchema>;

// ============================================================================
// SubagentStop Hook
// ============================================================================

/** SubagentStop hook input */
export const SubagentStopInputSchema = BaseHookInputSchema.extend({
  hook_event_name: z.literal('SubagentStop'),
  stop_hook_active: z.boolean(),
  /** Agent identifier (lowercase letters and numbers) */
  agent_id: z.string(),
  /** Path to the agent's transcript file */
  agent_transcript_path: z.string(),
});

export type SubagentStopInput = z.infer<typeof SubagentStopInputSchema>;

/** SubagentStop hook output */
export const SubagentStopOutputSchema = BaseHookOutputSchema.extend({
  decision: z.literal('block').optional(),
  reason: z.string().optional(),
});

export type SubagentStopOutput = z.infer<typeof SubagentStopOutputSchema>;

// ============================================================================
// Notification Hook
// ============================================================================

/** Notification hook input */
export const NotificationInputSchema = BaseHookInputSchema.extend({
  hook_event_name: z.literal('Notification'),
  message: z.string(),
});

export type NotificationInput = z.infer<typeof NotificationInputSchema>;

/** Notification hook output */
export const NotificationOutputSchema = BaseHookOutputSchema;

export type NotificationOutput = z.infer<typeof NotificationOutputSchema>;

// ============================================================================
// UserPromptSubmit Hook
// ============================================================================

/** UserPromptSubmit hook input */
export const UserPromptSubmitInputSchema = BaseHookInputSchema.extend({
  hook_event_name: z.literal('UserPromptSubmit'),
  prompt: z.string(),
});

export type UserPromptSubmitInput = z.infer<typeof UserPromptSubmitInputSchema>;

/** UserPromptSubmit hook-specific output */
export const UserPromptSubmitHookSpecificOutputSchema = z.object({
  hookEventName: z.literal('UserPromptSubmit'),
  additionalContext: z.string().optional(),
});

/** UserPromptSubmit hook output */
export const UserPromptSubmitOutputSchema = BaseHookOutputSchema.extend({
  decision: z.literal('block').optional(),
  reason: z.string().optional(),
  hookSpecificOutput: UserPromptSubmitHookSpecificOutputSchema.optional(),
});

export type UserPromptSubmitOutput = z.infer<typeof UserPromptSubmitOutputSchema>;

// ============================================================================
// Stop Hook
// ============================================================================

/** Stop hook input */
export const StopInputSchema = BaseHookInputSchema.extend({
  hook_event_name: z.literal('Stop'),
  stop_hook_active: z.boolean(),
});

export type StopInput = z.infer<typeof StopInputSchema>;

/** Stop hook output */
export const StopOutputSchema = BaseHookOutputSchema.extend({
  decision: z.literal('block').optional(),
  reason: z.string().optional(),
});

export type StopOutput = z.infer<typeof StopOutputSchema>;

// ============================================================================
// PreCompact Hook
// ============================================================================

/** PreCompact trigger */
export const PreCompactTriggerSchema = z.enum(['manual', 'auto']);

export type PreCompactTrigger = z.infer<typeof PreCompactTriggerSchema>;

/** PreCompact hook input */
export const PreCompactInputSchema = BaseHookInputSchema.extend({
  hook_event_name: z.literal('PreCompact'),
  trigger: PreCompactTriggerSchema,
  custom_instructions: z.string(),
});

export type PreCompactInput = z.infer<typeof PreCompactInputSchema>;

/** PreCompact hook output */
export const PreCompactOutputSchema = BaseHookOutputSchema;

export type PreCompactOutput = z.infer<typeof PreCompactOutputSchema>;

// ============================================================================
// PermissionRequest Hook
// ============================================================================

/** PermissionRequest decision - allow variant */
export const PermissionRequestAllowDecisionSchema = z.object({
  behavior: z.literal('allow'),
  /** Optional message explaining the decision */
  message: z.string().optional(),
  /** Modify tool input parameters before execution */
  updatedInput: z.record(z.unknown()).optional(),
});

/** PermissionRequest decision - deny variant */
export const PermissionRequestDenyDecisionSchema = z.object({
  behavior: z.literal('deny'),
  /** Required message explaining why permission was denied (shown to Claude) */
  message: z.string(),
  /** Stop Claude execution when denying */
  interrupt: z.boolean().optional(),
});

/** PermissionRequest hook-specific output */
export const PermissionRequestHookSpecificOutputSchema = z.object({
  hookEventName: z.literal('PermissionRequest'),
  decision: z.discriminatedUnion('behavior', [
    PermissionRequestAllowDecisionSchema,
    PermissionRequestDenyDecisionSchema,
  ]),
});

/** PermissionRequest hook output */
export const PermissionRequestOutputSchema = BaseHookOutputSchema.extend({
  hookSpecificOutput: PermissionRequestHookSpecificOutputSchema,
});

export type PermissionRequestOutput = z.infer<typeof PermissionRequestOutputSchema>;

// ============================================================================
// Hook Input Union
// ============================================================================

/** All hook inputs (discriminated by hook_event_name) */
export const HookInputSchema = z.discriminatedUnion('hook_event_name', [
  PreToolUseInputSchema,
  PostToolUseInputSchema,
  SessionStartInputSchema,
  SessionEndInputSchema,
  SubagentStartInputSchema,
  SubagentStopInputSchema,
  NotificationInputSchema,
  UserPromptSubmitInputSchema,
  StopInputSchema,
  PreCompactInputSchema,
]);

export type HookInput = z.infer<typeof HookInputSchema>;
