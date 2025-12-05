/**
 * Transcript and session Zod schemas for Claude Code
 *
 * These schemas define the structure of JSONL transcript files and parsed sessions.
 */

import { z } from 'zod';
import {
  MessageSchema,
  UserMessageSchema,
  AssistantMessageSchema,
  SystemMessageSchema,
  TaskResultMetaSchema,
  TaskModelSchema,
} from './messages.js';

// ============================================================================
// Non-Message Line Types
// ============================================================================

/** Summary line (session title marker) */
export const SummaryLineSchema = z.object({
  type: z.literal('summary'),
  summary: z.string(),
  leafUuid: z.string().optional(),
});

export type SummaryLine = z.infer<typeof SummaryLineSchema>;

/** File history snapshot */
export const FileHistorySnapshotSchema = z.object({
  type: z.literal('file-history-snapshot'),
  messageId: z.string(),
  snapshot: z.record(z.unknown()),
  isSnapshotUpdate: z.boolean().optional(),
});

export type FileHistorySnapshot = z.infer<typeof FileHistorySnapshotSchema>;

// ============================================================================
// Transcript Line Union
// ============================================================================

/** All possible JSONL line types */
export const TranscriptLineSchema = z.discriminatedUnion('type', [
  UserMessageSchema,
  AssistantMessageSchema,
  SystemMessageSchema,
  SummaryLineSchema,
  FileHistorySnapshotSchema,
]);

export type TranscriptLine = z.infer<typeof TranscriptLineSchema>;

// ============================================================================
// Parsed Transcript & Session
// ============================================================================

/** Parsed transcript structure */
export const TranscriptSchema = z.object({
  sourcePath: z.string(),
  sessionId: z.string(),
  subagentType: z.string().optional(),
  agentId: z.string().optional(),
  isSidechain: z.boolean(),
  messages: z.array(MessageSchema),
});

export type Transcript = z.infer<typeof TranscriptSchema>;

/** Parsed session with main + subagent transcripts */
export const SessionSchema = z.object({
  sessionId: z.string(),
  slug: z.string().optional(),
  mainTranscript: TranscriptSchema,
  subagentTranscripts: z.array(TranscriptSchema),
});

export type Session = z.infer<typeof SessionSchema>;

// ============================================================================
// Query Result Schemas
// ============================================================================

/** Extracted tool use */
export const ToolUseSchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown()),
  messageUuid: z.string(),
  timestamp: z.string(),
  agentId: z.string().optional(),
});

export type ToolUse = z.infer<typeof ToolUseSchema>;

/** Agent call status */
export const AgentCallStatusSchema = z.enum(['active', 'completed', 'failed', 'cancelled']);

export type AgentCallStatus = z.infer<typeof AgentCallStatusSchema>;

/** Agent call (Task tool invocation) */
export const AgentCallSchema = z.object({
  toolUseId: z.string(),
  agentId: z.string(),
  subagentType: z.string(),
  description: z.string(),
  prompt: z.string(),
  model: TaskModelSchema.optional(),
  timestamp: z.string(),
  status: AgentCallStatusSchema,
  result: TaskResultMetaSchema.optional(),
});

export type AgentCall = z.infer<typeof AgentCallSchema>;

/** Skill load (Skill tool invocation) */
export const SkillLoadSchema = z.object({
  toolUseId: z.string(),
  skillName: z.string(),
  timestamp: z.string(),
  agentId: z.string().optional(),
});

export type SkillLoad = z.infer<typeof SkillLoadSchema>;

/** Result from getAgentEdits - analysis of an agent transcript */
export const AgentEditsResultSchema = z.object({
  // Session identifiers
  sessionId: z.string(),
  agentSessionId: z.string(),

  // File paths
  parentSessionTranscript: z.string(),
  agentSessionTranscript: z.string(),

  // Agent info from Task call
  subagentType: z.string(),
  agentPrompt: z.string(),

  // Agent definition file (path to .claude/agents/[type].md)
  agentFile: z.string().optional(),

  // Skills from agent YAML frontmatter (full SKILL.md paths)
  agentPreloadedSkillsFiles: z.array(z.string()),

  // Files created by Write tool (new files only, first Write to a path)
  agentNewFiles: z.array(z.string()),

  // Files deleted via Bash rm commands
  agentDeletedFiles: z.array(z.string()),

  // All files modified by Write/Edit tools (includes new files)
  agentEditedFiles: z.array(z.string()),
});

export type AgentEditsResult = z.infer<typeof AgentEditsResultSchema>;
