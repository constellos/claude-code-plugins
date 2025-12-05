/**
 * MCP-specific hook types for Claude Code
 *
 * These types provide type-safe hook functions for MCP tools.
 * Use with generated types from `cck-sync-mcp` for full type safety.
 *
 * @example
 * ```typescript
 * import type { PreToolUseMcpHook, PostToolUseMcpHook } from '@constellos/claude-code-kit/types/hooks';
 * import type { FilesystemToolRequest, FilesystemToolResult } from './.claude/hooks/utils/mcp-tools/filesystem.types';
 *
 * const preHook: PreToolUseMcpHook<FilesystemToolRequest> = (input) => {
 *   if (input.tool_name === 'mcp__filesystem__write') {
 *     // input.tool_input is typed based on FilesystemWriteRequest['arguments']
 *   }
 *   return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
 * };
 * ```
 */

import type { BaseHookInput, BaseHookOutput } from './base.js';

// ============================================================================
// MCP Hook Input Types
// ============================================================================

/**
 * Base type for MCP tool request (matches CallToolRequestParams shape)
 */
export interface McpToolRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

/**
 * PreToolUse input for MCP tools
 *
 * @typeParam TRequest - The MCP tool request type (e.g., FilesystemToolRequest)
 */
export type PreToolUseMcpInput<TRequest extends McpToolRequest = McpToolRequest> =
  BaseHookInput & {
    hook_event_name: 'PreToolUse';
    tool_name: TRequest['name'];
    tool_input: TRequest['arguments'];
    tool_use_id: string;
  };

/**
 * PostToolUse input for MCP tools
 *
 * @typeParam TRequest - The MCP tool request type
 * @typeParam TResult - The MCP tool result type (defaults to unknown)
 */
export type PostToolUseMcpInput<
  TRequest extends McpToolRequest = McpToolRequest,
  TResult = unknown
> = BaseHookInput & {
  hook_event_name: 'PostToolUse';
  tool_name: TRequest['name'];
  tool_input: TRequest['arguments'];
  tool_response: TResult;
  tool_use_id: string;
};

// ============================================================================
// MCP Hook Output Types
// ============================================================================

/**
 * PreToolUse hook output for MCP tools
 */
export type PreToolUseMcpHookOutput = BaseHookOutput & {
  hookSpecificOutput:
    | {
        hookEventName: 'PreToolUse';
        permissionDecision: 'allow';
        /** Shows to user only when allowing */
        permissionDecisionReason?: string;
        /** Modify tool input parameters before execution */
        updatedInput?: Record<string, unknown>;
      }
    | {
        hookEventName: 'PreToolUse';
        /** "ask" will request user approval */
        permissionDecision: 'deny' | 'ask';
        /** Required - for "ask" shows to user; for "deny" shows to Claude only */
        permissionDecisionReason: string;
      };
};

/**
 * PostToolUse hook output for MCP tools
 */
export type PostToolUseMcpHookOutput = BaseHookOutput &
  (
    | {
        decision?: undefined;
        reason?: string;
        hookSpecificOutput?: {
          hookEventName: 'PostToolUse';
          additionalContext?: string;
        };
      }
    | {
        decision: 'block';
        reason?: string;
        /** Required when decision is "block" */
        hookSpecificOutput: {
          hookEventName: 'PostToolUse';
          /** Required when decision is "block" */
          additionalContext: string;
        };
      }
  );

// ============================================================================
// MCP Hook Function Types
// ============================================================================

/**
 * PreToolUse hook function type for MCP tools
 *
 * Use this when creating hooks that handle MCP tool calls before execution.
 * The generic type allows you to use generated request types from cck-sync-mcp.
 *
 * @typeParam TRequest - Union of MCP tool request types (e.g., FilesystemToolRequest)
 *
 * @example
 * ```typescript
 * import type { PreToolUseMcpHook } from '@constellos/claude-code-kit/types/hooks';
 * import type { FilesystemToolRequest } from './.claude/hooks/utils/mcp-tools/filesystem.types';
 *
 * const hook: PreToolUseMcpHook<FilesystemToolRequest> = (input) => {
 *   // Type-safe access to tool_name and tool_input
 *   if (input.tool_name === 'mcp__filesystem__write') {
 *     const args = input.tool_input; // typed as FilesystemWriteRequest['arguments']
 *     if (args?.path?.includes('secrets')) {
 *       return {
 *         hookSpecificOutput: {
 *           hookEventName: 'PreToolUse',
 *           permissionDecision: 'deny',
 *           permissionDecisionReason: 'Cannot write to secrets directory',
 *         },
 *       };
 *     }
 *   }
 *   return {
 *     hookSpecificOutput: {
 *       hookEventName: 'PreToolUse',
 *       permissionDecision: 'allow',
 *     },
 *   };
 * };
 *
 * export default hook;
 * ```
 */
export type PreToolUseMcpHook<TRequest extends McpToolRequest = McpToolRequest> = (
  input: PreToolUseMcpInput<TRequest>
) => PreToolUseMcpHookOutput | Promise<PreToolUseMcpHookOutput>;

/**
 * PostToolUse hook function type for MCP tools
 *
 * Use this when creating hooks that process MCP tool results after execution.
 * The generic types allow you to use generated request and result types.
 *
 * @typeParam TRequest - Union of MCP tool request types
 * @typeParam TResult - Union of MCP tool result types
 *
 * @example
 * ```typescript
 * import type { PostToolUseMcpHook } from '@constellos/claude-code-kit/types/hooks';
 * import type { FilesystemToolRequest, FilesystemToolResult } from './.claude/hooks/utils/mcp-tools/filesystem.types';
 *
 * const hook: PostToolUseMcpHook<FilesystemToolRequest, FilesystemToolResult> = (input) => {
 *   // Log all MCP tool responses
 *   console.error(`[MCP] ${input.tool_name} completed`);
 *
 *   return {
 *     hookSpecificOutput: {
 *       hookEventName: 'PostToolUse',
 *       additionalContext: 'MCP tool execution logged',
 *     },
 *   };
 * };
 *
 * export default hook;
 * ```
 */
export type PostToolUseMcpHook<
  TRequest extends McpToolRequest = McpToolRequest,
  TResult = unknown
> = (
  input: PostToolUseMcpInput<TRequest, TResult>
) => PostToolUseMcpHookOutput | Promise<PostToolUseMcpHookOutput>;

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract the arguments type from an MCP tool request
 *
 * @example
 * ```typescript
 * type WriteArgs = McpToolArgs<FilesystemWriteRequest>;
 * // => { path: string; content: string; } | undefined
 * ```
 */
export type McpToolArgs<TRequest extends McpToolRequest> = TRequest['arguments'];

/**
 * Extract tool names from a request union type
 *
 * @example
 * ```typescript
 * type Names = McpToolNames<FilesystemToolRequest>;
 * // => 'mcp__filesystem__read' | 'mcp__filesystem__write' | ...
 * ```
 */
export type McpToolNames<TRequest extends McpToolRequest> = TRequest['name'];
