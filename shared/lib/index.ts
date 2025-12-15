/**
 * Claude Code Kit Library
 *
 * Re-exports all utilities for easy importing.
 * Use specific imports for smaller bundles:
 *   import type { PreToolUseHook } from './types.ts';
 *   import { readStdinJson } from './io.ts';
 */

// Types
export type * from './types.js';

// I/O utilities
export { readStdinJson, writeStdoutJson } from './io.js';

// Debug utilities
export {
  createDebugLogger,
  createBlockingErrorResponse,
  createPassthroughResponse,
  type DebugConfig,
  type DebugLogger,
  type HookEventEntry,
} from './debug.js';

// Transcript parsing
export {
  parseTranscript,
  parseTranscriptLine,
  getTranscriptInfo,
  getToolUses,
  getEditedFiles,
  getNewFiles,
  getDeletedFiles,
  findPendingTaskCall,
  findTaskCallForAgent,
  type Transcript,
  type Message,
  type UserMessage,
  type AssistantMessage,
  type SystemMessage,
} from './transcripts.js';

// Subagent state management
export {
  saveAgentStartContext,
  loadAgentStartContext,
  removeAgentStartContext,
  getAgentEdits,
  type AgentStartContext,
  type AgentEditsResult,
} from './subagent-state.js';

// TOML parsing
export { parseToml, readTomlFile, type TomlValue } from './toml.js';
