/**
 * Message Zod schemas for Claude Code transcripts
 *
 * These schemas define the structure of messages in JSONL transcript files.
 */

import { z } from 'zod';
import { UsageSchema, TodoItemSchema, ThinkingMetadataSchema } from './base.js';
import {
  TextContentSchema,
  UserContentSchema,
  AssistantContentSchema,
} from './content.js';

// ============================================================================
// Base Message
// ============================================================================

/** Base fields present on all messages */
export const BaseMessageSchema = z.object({
  uuid: z.string(),
  parentUuid: z.string().nullable(),
  timestamp: z.string(),
  sessionId: z.string(),
  isSidechain: z.boolean(),
  cwd: z.string(),
  version: z.string(),
  gitBranch: z.string().optional(),
  slug: z.string().optional(),
  agentId: z.string().optional(),
});

export type BaseMessage = z.infer<typeof BaseMessageSchema>;

// ============================================================================
// User Message
// ============================================================================

/** User message - text input or tool results */
export const UserMessageSchema = BaseMessageSchema.extend({
  type: z.literal('user'),
  userType: z.literal('external'),
  message: z.object({
    role: z.literal('user'),
    content: UserContentSchema,
  }),
  toolUseResult: z.record(z.unknown()).optional(),
  todos: z.array(TodoItemSchema).optional(),
  thinkingMetadata: ThinkingMetadataSchema.optional(),
  isCompactSummary: z.boolean().optional(),
  isVisibleInTranscriptOnly: z.boolean().optional(),
});

export type UserMessage = z.infer<typeof UserMessageSchema>;

// ============================================================================
// Assistant Message
// ============================================================================

/** Assistant message - text, tool calls, or thinking */
export const AssistantMessageSchema = BaseMessageSchema.extend({
  type: z.literal('assistant'),
  requestId: z.string(),
  message: z.object({
    id: z.string(),
    type: z.literal('message'),
    role: z.literal('assistant'),
    model: z.string(),
    content: z.array(AssistantContentSchema),
    stop_reason: z.string().nullable(),
    stop_sequence: z.string().nullable(),
    usage: UsageSchema,
  }),
});

export type AssistantMessage = z.infer<typeof AssistantMessageSchema>;

// ============================================================================
// System Message
// ============================================================================

/** System message level */
export const SystemMessageLevelSchema = z.enum(['info', 'warning', 'error']);

export type SystemMessageLevel = z.infer<typeof SystemMessageLevelSchema>;

/** System message - internal notifications */
export const SystemMessageSchema = BaseMessageSchema.extend({
  type: z.literal('system'),
  subtype: z.string(),
  content: z.string(),
  isMeta: z.boolean(),
  level: SystemMessageLevelSchema,
  compactMetadata: z.record(z.unknown()).optional(),
});

export type SystemMessage = z.infer<typeof SystemMessageSchema>;

// ============================================================================
// Message Union
// ============================================================================

/** Message types only (excludes summary, file-history-snapshot) */
export const MessageSchema = z.discriminatedUnion('type', [
  UserMessageSchema,
  AssistantMessageSchema,
  SystemMessageSchema,
]);

export type Message = z.infer<typeof MessageSchema>;

// ============================================================================
// Tool-Specific Input Schemas
// ============================================================================

/** Model options for Task tool */
export const TaskModelSchema = z.enum(['sonnet', 'opus', 'haiku']);

export type TaskModel = z.infer<typeof TaskModelSchema>;

/** Task tool input (spawns subagent) */
export const TaskToolInputSchema = z.object({
  description: z.string(),
  prompt: z.string(),
  subagent_type: z.string(),
  model: TaskModelSchema.optional(),
  resume: z.string().optional(),
});

export type TaskToolInput = z.infer<typeof TaskToolInputSchema>;

/** Skill tool input */
export const SkillToolInputSchema = z.object({
  skill: z.string(),
});

export type SkillToolInput = z.infer<typeof SkillToolInputSchema>;

/** Task result status */
export const TaskResultStatusSchema = z.enum(['completed', 'failed', 'cancelled']);

export type TaskResultStatus = z.infer<typeof TaskResultStatusSchema>;

/** Task result metadata (attached to user messages after Task tool execution) */
export const TaskResultMetaSchema = z.object({
  status: TaskResultStatusSchema,
  prompt: z.string(),
  agentId: z.string(),
  content: z.array(TextContentSchema),
  result: z.string().optional(),
  totalDurationMs: z.number(),
  totalTokens: z.number(),
  totalToolUseCount: z.number(),
  usage: UsageSchema,
  totalCostUsd: z.number().optional(),
});

export type TaskResultMeta = z.infer<typeof TaskResultMetaSchema>;
