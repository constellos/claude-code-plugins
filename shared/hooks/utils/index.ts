/**
 * Claude Code Kit Hooks Utilities
 *
 * Re-exports all utilities for easy importing.
 * Use specific imports for smaller bundles:
 *   import { readStdinJson } from './io.ts';
 */

// I/O utilities and hook runner
export { readStdinJson, writeStdoutJson, runHook, type HookHandler } from './io.js';

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

// Task state management
export {
  saveTaskCallContext,
  loadTaskCallContext,
  removeTaskCallContext,
  getTaskEdits,
  type TaskCallContext,
  type TaskEditsResult,
} from './task-state.js';

// TOML parsing
export { parseToml, readTomlFile, type TomlValue } from './toml.js';

// Agent type detection
export {
  wasToolEventMainAgent,
  isMainAgentTranscript,
  isSubagentType,
  getTranscriptAgentId,
} from './was-tool-event-main-agent.js';
