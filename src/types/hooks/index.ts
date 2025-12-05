/**
 * Claude Code hook types
 * Re-exports all hook-related types
 */

// Base types
export type {
  PermissionMode,
  HookEventName,
  BaseHookInput,
  BaseHookOutput,
  DecisionType
} from './base.js';

// Hook function types (primary exports)
export type {
  PreToolUseHook,
  PostToolUseHook,
  SessionStartHook,
  SessionEndHook,
  SubagentStartHook,
  SubagentStopHook,
  NotificationHook,
  UserPromptSubmitHook,
  StopHook,
  PreCompactHook
} from './events.js';

// Hook input types
export type {
  PreToolUseInput,
  PostToolUseInput,
  SessionStartInput,
  SessionEndInput,
  SubagentStartInput,
  SubagentStopInput,
  NotificationInput,
  UserPromptSubmitInput,
  StopInput,
  PreCompactInput
} from './events.js';

// Hook output types
export type {
  PreToolUseHookOutput,
  PostToolUseHookOutput,
  SessionStartHookOutput,
  SessionEndHookOutput,
  SubagentStartHookOutput,
  SubagentStopHookOutput,
  NotificationHookOutput,
  UserPromptSubmitHookOutput,
  StopHookOutput,
  PreCompactHookOutput,
  PermissionRequestHookOutput
} from './events.js';

// MCP-specific hook types
export type {
  McpToolRequest,
  PreToolUseMcpInput,
  PostToolUseMcpInput,
  PreToolUseMcpHookOutput,
  PostToolUseMcpHookOutput,
  PreToolUseMcpHook,
  PostToolUseMcpHook,
  McpToolArgs,
  McpToolNames
} from './mcp.js';
