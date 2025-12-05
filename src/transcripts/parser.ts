/**
 * Parsing functions for Claude Code transcript files (.jsonl)
 *
 * Provides utilities for reading and parsing transcript files into typed structures.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  TranscriptLineSchema,
  type TranscriptLine,
  type Message,
  type Transcript,
  type Session,
} from '../schemas/index.js';

// ============================================================================
// Types
// ============================================================================

/** Options for parsing transcript files */
export interface ParseOptions {
  /** Filter to specific message types */
  messageTypes?: Array<'user' | 'assistant' | 'system'>;
  /** Continue on parse errors (default: true) */
  lenient?: boolean;
}

/** Metadata extracted from transcript file path */
export interface TranscriptInfo {
  sourcePath: string;
  sessionId: string;
  agentId?: string;
  isSidechain: boolean;
  subagentType?: string;
}

// ============================================================================
// Low-Level Parsing
// ============================================================================

/** Parse a single JSONL line (lenient - returns null on error) */
export function parseTranscriptLine(line: string): TranscriptLine | null {
  try {
    const json = JSON.parse(line);
    const result = TranscriptLineSchema.safeParse(json);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Check if a transcript line is a message (not summary/file-history-snapshot) */
export function isMessageLine(line: TranscriptLine): line is Message {
  return line.type === 'user' || line.type === 'assistant' || line.type === 'system';
}

// ============================================================================
// Transcript Info
// ============================================================================

/** Extract metadata from transcript file path (without reading file) */
export function getTranscriptInfo(filePath: string): TranscriptInfo {
  const filename = path.basename(filePath);
  const isSubagent = filename.startsWith('agent-');
  const agentId = isSubagent ? filename.replace('agent-', '').replace('.jsonl', '') : undefined;

  return {
    sourcePath: filePath,
    sessionId: '', // Populated when file is read
    agentId,
    isSidechain: isSubagent,
  };
}

// ============================================================================
// Transcript Parsing
// ============================================================================

/** Parse a full .jsonl transcript file */
export async function parseTranscript(
  filePath: string,
  options: ParseOptions = {}
): Promise<Transcript> {
  const { messageTypes, lenient = true } = options;
  const info = getTranscriptInfo(filePath);

  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  const messages: Message[] = [];
  let sessionId = '';

  for (const line of lines) {
    const parsed = parseTranscriptLine(line);
    if (!parsed) {
      if (!lenient) throw new Error(`Failed to parse line: ${line.slice(0, 100)}`);
      continue;
    }

    if (!isMessageLine(parsed)) continue;

    // Capture sessionId from first message
    if (!sessionId) sessionId = parsed.sessionId;

    // Filter by message type
    if (messageTypes && !messageTypes.includes(parsed.type)) continue;

    messages.push(parsed);
  }

  return {
    ...info,
    sessionId,
    messages,
  };
}

/** Parse session with all linked subagent transcripts */
export async function parseSession(
  filePath: string,
  options: ParseOptions = {}
): Promise<Session> {
  const mainTranscript = await parseTranscript(filePath, options);
  const dir = path.dirname(filePath);

  // Find agent transcripts in same directory
  const files = await fs.readdir(dir);
  const agentFiles = files.filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl'));

  // Parse and filter to this session, resolve subagentType
  const subagentTranscripts: Transcript[] = [];
  const agentTypeMap = buildAgentTypeMap(mainTranscript);

  for (const agentFile of agentFiles) {
    const agentPath = path.join(dir, agentFile);
    const transcript = await parseTranscript(agentPath, options);

    if (transcript.sessionId === mainTranscript.sessionId) {
      // Resolve subagentType from main transcript's Task calls
      transcript.subagentType = agentTypeMap.get(transcript.agentId!);
      subagentTranscripts.push(transcript);
    }
  }

  return {
    sessionId: mainTranscript.sessionId,
    slug: mainTranscript.messages[0]?.slug,
    mainTranscript,
    subagentTranscripts,
  };
}

// ============================================================================
// Subagent Type Resolution
// ============================================================================

/** Build map of agentId -> subagentType from Task calls in transcript */
export function buildAgentTypeMap(transcript: Transcript): Map<string, string> {
  const map = new Map<string, string>();

  for (let i = 0; i < transcript.messages.length; i++) {
    const msg = transcript.messages[i];
    if (msg.type !== 'assistant') continue;

    for (const content of msg.message.content) {
      if (content.type === 'tool_use' && content.name === 'Task') {
        const input = content.input as { subagent_type?: string };
        const toolUseId = content.id;

        // Find result in subsequent user message
        for (let j = i + 1; j < transcript.messages.length; j++) {
          const resultMsg = transcript.messages[j];
          if (resultMsg.type !== 'user') continue;

          const resultContent = resultMsg.message.content;
          if (typeof resultContent === 'string') continue;

          for (const rc of resultContent) {
            if (rc.tool_use_id === toolUseId && resultMsg.toolUseResult) {
              const agentId = (resultMsg.toolUseResult as { agentId?: string }).agentId;
              if (agentId && input.subagent_type) {
                map.set(agentId, input.subagent_type);
              }
            }
          }
        }
      }
    }
  }

  return map;
}

/** Resolve subagentType for an agent transcript by finding its Task call in main session */
export async function resolveSubagentType(
  agentTranscriptPath: string
): Promise<string | undefined> {
  const info = getTranscriptInfo(agentTranscriptPath);
  if (!info.agentId) return undefined;

  // Read first line to get sessionId
  const content = await fs.readFile(agentTranscriptPath, 'utf-8');
  const firstLine = content.split('\n')[0];
  const parsed = parseTranscriptLine(firstLine);
  if (!parsed || !isMessageLine(parsed)) return undefined;

  const sessionId = parsed.sessionId;
  const dir = path.dirname(agentTranscriptPath);
  const mainPath = path.join(dir, `${sessionId}.jsonl`);

  // Check if main transcript exists
  try {
    await fs.access(mainPath);
  } catch {
    return undefined;
  }

  // Parse main transcript and find matching Task call
  const mainTranscript = await parseTranscript(mainPath);
  const agentTypeMap = buildAgentTypeMap(mainTranscript);

  return agentTypeMap.get(info.agentId);
}
