/**
 * Base Zod schemas for Claude Code
 *
 * These schemas are the source of truth - types are inferred via z.infer<>
 */

import { z } from 'zod';

// ============================================================================
// Token Usage
// ============================================================================

/** Token usage statistics - uses snake_case in actual data */
export const UsageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_creation_input_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
  cache_creation: z
    .object({
      ephemeral_5m_input_tokens: z.number(),
      ephemeral_1h_input_tokens: z.number(),
    })
    .optional(),
  service_tier: z.string().optional(),
});

export type Usage = z.infer<typeof UsageSchema>;

// ============================================================================
// Todo Items
// ============================================================================

/** Todo item status */
export const TodoStatusSchema = z.enum(['pending', 'in_progress', 'completed']);

export type TodoStatus = z.infer<typeof TodoStatusSchema>;

/** Todo list item */
export const TodoItemSchema = z.object({
  content: z.string(),
  status: TodoStatusSchema,
  activeForm: z.string(),
});

export type TodoItem = z.infer<typeof TodoItemSchema>;

// ============================================================================
// Thinking Metadata
// ============================================================================

/** Thinking mode metadata */
export const ThinkingMetadataSchema = z.object({
  level: z.string(),
  disabled: z.boolean(),
  triggers: z.array(z.unknown()),
});

export type ThinkingMetadata = z.infer<typeof ThinkingMetadataSchema>;
