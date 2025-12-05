/**
 * Content block Zod schemas for Claude Code messages
 *
 * These schemas define the structure of content blocks within messages.
 */

import { z } from 'zod';

// ============================================================================
// Text Content
// ============================================================================

/** Text content block */
export const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

export type TextContent = z.infer<typeof TextContentSchema>;

// ============================================================================
// Tool Use Content
// ============================================================================

/** Tool use content block (assistant -> tool call) */
export const ToolUseContentSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown()),
});

export type ToolUseContent = z.infer<typeof ToolUseContentSchema>;

// ============================================================================
// Tool Result Content
// ============================================================================

/** Tool result item (user -> tool result) - uses tool_use_id (snake_case) */
export const ToolResultItemSchema = z.object({
  tool_use_id: z.string(),
  type: z.literal('tool_result'),
  content: z.array(TextContentSchema).or(z.string()),
});

export type ToolResultItem = z.infer<typeof ToolResultItemSchema>;

// ============================================================================
// Thinking Content
// ============================================================================

/** Thinking content block */
export const ThinkingContentSchema = z.object({
  type: z.literal('thinking'),
  thinking: z.string(),
});

export type ThinkingContent = z.infer<typeof ThinkingContentSchema>;

// ============================================================================
// Union Schemas
// ============================================================================

/** User message content - plain string OR array of tool results */
export const UserContentSchema = z.union([
  z.string(),
  z.array(ToolResultItemSchema),
]);

export type UserContent = z.infer<typeof UserContentSchema>;

/** Assistant message content - text, tool_use, or thinking */
export const AssistantContentSchema = z.discriminatedUnion('type', [
  TextContentSchema,
  ToolUseContentSchema,
  ThinkingContentSchema,
]);

export type AssistantContent = z.infer<typeof AssistantContentSchema>;
