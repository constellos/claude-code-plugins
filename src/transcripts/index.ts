/**
 * Transcript parsing and query utilities for Claude Code
 *
 * Provides functions for reading, parsing, and querying JSONL transcript files.
 *
 * @example
 * ```typescript
 * import {
 *   parseTranscript,
 *   parseSession,
 *   getToolUses,
 *   filterByToolName,
 * } from '@constellos/claude-code-kit/transcripts';
 *
 * // Parse a single transcript
 * const transcript = await parseTranscript('/path/to/session.jsonl');
 *
 * // Parse session with all subagents
 * const session = await parseSession('/path/to/session.jsonl');
 *
 * // Query tool uses
 * const allToolUses = getToolUses(transcript);
 * const bashCalls = filterByToolName(transcript, 'Bash');
 * ```
 */

// Parser functions
export {
  parseTranscriptLine,
  isMessageLine,
  getTranscriptInfo,
  parseTranscript,
  parseSession,
  resolveSubagentType,
  buildAgentTypeMap,
} from './parser.js';

// Query functions
export {
  getToolUses,
  filterByToolName,
  getAgentCalls,
  getSkillLoads,
  getMessagesByType,
  getAssistantMessages,
  getUserMessages,
  // File operation queries
  getEditedFiles,
  getNewFiles,
  getDeletedFiles,
  // Agent edits analysis
  getAgentEdits,
  // Agent start context functions (for SubagentStart/SubagentStop coordination)
  saveAgentStartContext,
  loadAgentStartContext,
  removeAgentStartContext,
  findTaskCallForAgent,
} from './queries.js';

// Agent start context type
export type { AgentStartContext } from './queries.js';

// Types
export type * from './types.js';
