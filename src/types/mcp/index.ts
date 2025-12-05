/**
 * MCP Tool Types Module
 *
 * This file contains auto-generated discriminated union types for MCP server tools.
 * Run `cck-sync-mcp` to regenerate these types from your configured MCP servers.
 *
 * The types here extend the PreToolUseInput and PostToolUseInput discriminated unions
 * to provide type-safe access to MCP tool inputs and outputs.
 *
 * DO NOT manually edit the generated sections below.
 */

import type { BaseHookInput } from '../hooks/base.js';

// ============================================================================
// MCP Tool Type Placeholders
// ============================================================================

/**
 * Fallback MCP tool input for unknown/untyped MCP tools.
 * Used when an MCP server's tools haven't been synced.
 */
export type UnknownMcpToolInput = BaseHookInput & {
  hook_event_name: "PreToolUse";
  tool_name: `mcp__${string}__${string}`;
  tool_input: unknown;
  tool_use_id: string;
};

/**
 * Fallback MCP tool with response for unknown/untyped MCP tools.
 * Used when an MCP server's tools haven't been synced.
 */
export type UnknownMcpToolWithResponse = BaseHookInput & {
  hook_event_name: "PostToolUse";
  tool_name: `mcp__${string}__${string}`;
  tool_input: unknown;
  tool_response: unknown;
  tool_use_id: string;
};

// ============================================================================
// AUTO-GENERATED MCP TOOL TYPES - DO NOT EDIT BELOW THIS LINE
// ============================================================================
// To regenerate, run: cck-sync-mcp
// ============================================================================

// [MCP_TOOL_INPUTS_START]
// No MCP server tools have been synced yet.
// Run `cck-sync-mcp <server-name>` to generate types for your MCP servers.
// [MCP_TOOL_INPUTS_END]

// [MCP_TOOL_WITH_RESPONSES_START]
// No MCP server tools have been synced yet.
// [MCP_TOOL_WITH_RESPONSES_END]

// ============================================================================
// Combined MCP Tool Types
// ============================================================================

/**
 * Union of all typed MCP tool inputs.
 * Falls back to UnknownMcpToolInput when no servers are synced.
 *
 * After syncing MCP servers, this will be a discriminated union like:
 * ```typescript
 * type McpToolInputUnion =
 *   | { tool_name: "mcp__server__tool1"; tool_input: Tool1Input; ... }
 *   | { tool_name: "mcp__server__tool2"; tool_input: Tool2Input; ... }
 *   | UnknownMcpToolInput;
 * ```
 */
// [MCP_TOOL_INPUT_UNION_START]
export type McpToolInputUnion = UnknownMcpToolInput;
// [MCP_TOOL_INPUT_UNION_END]

/**
 * Union of all typed MCP tools with responses.
 * Falls back to UnknownMcpToolWithResponse when no servers are synced.
 */
// [MCP_TOOL_WITH_RESPONSE_UNION_START]
export type McpToolWithResponseUnion = UnknownMcpToolWithResponse;
// [MCP_TOOL_WITH_RESPONSE_UNION_END]
