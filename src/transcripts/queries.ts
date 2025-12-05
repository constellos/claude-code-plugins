/**
 * Query utilities for Claude Code transcripts
 *
 * Provides functions for extracting and filtering data from parsed transcripts.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import type {
  Transcript,
  Message,
  ToolUse,
  AgentCall,
  SkillLoad,
  AssistantMessage,
  UserMessage,
  AgentEditsResult,
} from '../schemas/index.js';
import { parseTranscript } from './parser.js';

// ============================================================================
// Tool Use Queries
// ============================================================================

/** Extract all tool uses from a transcript */
export function getToolUses(transcript: Transcript): ToolUse[] {
  const toolUses: ToolUse[] = [];

  for (const msg of transcript.messages) {
    if (msg.type !== 'assistant') continue;

    for (const content of msg.message.content) {
      if (content.type === 'tool_use') {
        toolUses.push({
          id: content.id,
          name: content.name,
          input: content.input,
          messageUuid: msg.uuid,
          timestamp: msg.timestamp,
          agentId: transcript.agentId,
        });
      }
    }
  }

  return toolUses;
}

/** Filter tool uses by tool name */
export function filterByToolName(transcript: Transcript, toolName: string): ToolUse[] {
  return getToolUses(transcript).filter((tu) => tu.name === toolName);
}

// ============================================================================
// Agent Call Queries
// ============================================================================

/** Extract all Task tool invocations (agent calls) from a transcript */
export function getAgentCalls(transcript: Transcript): AgentCall[] {
  const agentCalls: AgentCall[] = [];

  for (let i = 0; i < transcript.messages.length; i++) {
    const msg = transcript.messages[i];
    if (msg.type !== 'assistant') continue;

    for (const content of msg.message.content) {
      if (content.type === 'tool_use' && content.name === 'Task') {
        const input = content.input as {
          description?: string;
          prompt?: string;
          subagent_type?: string;
          model?: 'sonnet' | 'opus' | 'haiku';
        };

        // Find the result in subsequent user messages
        let agentId = '';
        let status: 'active' | 'completed' | 'failed' | 'cancelled' = 'active';
        let result: AgentCall['result'];

        for (let j = i + 1; j < transcript.messages.length; j++) {
          const resultMsg = transcript.messages[j];
          if (resultMsg.type !== 'user') continue;

          const resultContent = resultMsg.message.content;
          if (typeof resultContent === 'string') continue;

          for (const rc of resultContent) {
            if (rc.tool_use_id === content.id && resultMsg.toolUseResult) {
              const toolResult = resultMsg.toolUseResult as {
                agentId?: string;
                status?: 'completed' | 'failed' | 'cancelled';
                prompt?: string;
                content?: Array<{ type: 'text'; text: string }>;
                result?: string;
                totalDurationMs?: number;
                totalTokens?: number;
                totalToolUseCount?: number;
                usage?: { input_tokens: number; output_tokens: number };
                totalCostUsd?: number;
              };
              agentId = toolResult.agentId || '';
              status = toolResult.status || 'completed';
              if (toolResult.status) {
                result = {
                  status: toolResult.status,
                  prompt: toolResult.prompt || input.prompt || '',
                  agentId: toolResult.agentId || '',
                  content: toolResult.content || [],
                  result: toolResult.result,
                  totalDurationMs: toolResult.totalDurationMs || 0,
                  totalTokens: toolResult.totalTokens || 0,
                  totalToolUseCount: toolResult.totalToolUseCount || 0,
                  usage: toolResult.usage || { input_tokens: 0, output_tokens: 0 },
                  totalCostUsd: toolResult.totalCostUsd,
                };
              }
              break;
            }
          }
          if (agentId) break;
        }

        agentCalls.push({
          toolUseId: content.id,
          agentId,
          subagentType: input.subagent_type || 'default',
          description: input.description || '',
          prompt: input.prompt || '',
          model: input.model,
          timestamp: msg.timestamp,
          status,
          result,
        });
      }
    }
  }

  return agentCalls;
}

// ============================================================================
// Skill Load Queries
// ============================================================================

/** Extract all Skill tool invocations from a transcript */
export function getSkillLoads(transcript: Transcript): SkillLoad[] {
  const skillLoads: SkillLoad[] = [];

  for (const msg of transcript.messages) {
    if (msg.type !== 'assistant') continue;

    for (const content of msg.message.content) {
      if (content.type === 'tool_use' && content.name === 'Skill') {
        const input = content.input as { skill?: string };
        skillLoads.push({
          toolUseId: content.id,
          skillName: input.skill || '',
          timestamp: msg.timestamp,
          agentId: transcript.agentId,
        });
      }
    }
  }

  return skillLoads;
}

// ============================================================================
// Message Type Queries
// ============================================================================

/** Get messages filtered by type with proper typing */
export function getMessagesByType<T extends Message['type']>(
  transcript: Transcript,
  type: T
): Extract<Message, { type: T }>[] {
  return transcript.messages.filter((msg): msg is Extract<Message, { type: T }> => msg.type === type);
}

/** Get all assistant messages */
export function getAssistantMessages(transcript: Transcript): AssistantMessage[] {
  return getMessagesByType(transcript, 'assistant');
}

/** Get all user messages */
export function getUserMessages(transcript: Transcript): UserMessage[] {
  return getMessagesByType(transcript, 'user');
}

// ============================================================================
// File Edit Queries
// ============================================================================

/** Extract unique file paths edited by Write/Edit tools in a transcript */
export function getEditedFiles(transcript: Transcript): string[] {
  const files = new Set<string>();

  for (const msg of transcript.messages) {
    if (msg.type !== 'assistant') continue;

    for (const content of msg.message.content) {
      if (content.type === 'tool_use' && (content.name === 'Write' || content.name === 'Edit')) {
        const input = content.input as { file_path?: string };
        if (input.file_path) {
          files.add(input.file_path);
        }
      }
    }
  }

  return Array.from(files);
}

/**
 * Extract unique file paths created by Write tool (new files only).
 *
 * A file is considered "new" if it's the first Write to that path in the transcript.
 * Edit calls don't count - a file can be edited without being new.
 */
export function getNewFiles(transcript: Transcript): string[] {
  const newFiles: string[] = [];
  const seenPaths = new Set<string>();

  for (const msg of transcript.messages) {
    if (msg.type !== 'assistant') continue;

    for (const content of msg.message.content) {
      if (content.type === 'tool_use' && content.name === 'Write') {
        const input = content.input as { file_path?: string };
        if (input.file_path && !seenPaths.has(input.file_path)) {
          newFiles.push(input.file_path);
          seenPaths.add(input.file_path);
        }
      }
    }
  }

  return newFiles;
}

/**
 * Extract unique file paths deleted via Bash rm commands.
 *
 * Looks for Bash tool_use calls with rm commands and extracts the file paths.
 * Handles patterns like: rm file, rm -f file, rm -rf dir, rm -r dir
 */
export function getDeletedFiles(transcript: Transcript): string[] {
  const deletedFiles = new Set<string>();

  // Pattern to match rm commands with various flags
  // Captures: rm [-flags] <path(s)>
  const rmPattern = /^\s*rm\s+(?:-[rfiv]+\s+)*(.+)$/;

  for (const msg of transcript.messages) {
    if (msg.type !== 'assistant') continue;

    for (const content of msg.message.content) {
      if (content.type === 'tool_use' && content.name === 'Bash') {
        const input = content.input as { command?: string };
        if (!input.command) continue;

        // Handle commands that might be chained with && or ;
        const commands = input.command.split(/\s*(?:&&|;)\s*/);

        for (const cmd of commands) {
          const match = cmd.match(rmPattern);
          if (match) {
            // Split the paths (handles multiple files in one rm command)
            const pathsStr = match[1].trim();
            // Simple split on whitespace, but respect quoted paths
            const paths = pathsStr.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];

            for (const p of paths) {
              // Remove quotes if present
              const cleanPath = p.replace(/^["']|["']$/g, '');
              // Skip flags that might have been captured
              if (!cleanPath.startsWith('-')) {
                deletedFiles.add(cleanPath);
              }
            }
          }
        }
      }
    }
  }

  return Array.from(deletedFiles);
}

// ============================================================================
// Agent Start Context (for SubagentStart/SubagentStop coordination)
// ============================================================================

const DEFAULT_CONTEXT_PATH = '.claude/state/active-subagents.json';

/** Context saved at SubagentStart for use at SubagentStop */
export interface AgentStartContext {
  agentId: string;
  agentType: string;
  sessionId: string;
  timestamp: string;
  prompt: string;
  toolUseId: string;
}

/** Map of agentId -> AgentStartContext */
interface ActiveSubagentsMap {
  [agentId: string]: AgentStartContext;
}

/**
 * Save agent context at SubagentStart time for later retrieval at SubagentStop.
 *
 * This function should be called from a SubagentStart hook. It:
 * 1. Parses the parent transcript to find the most recent Task tool_use matching agent_type
 * 2. Extracts the prompt and toolUseId from that Task call
 * 3. Saves the context to active-subagents.json keyed by agentId
 *
 * @param input - SubagentStart hook input fields
 * @param outputPath - Path to save context (defaults to .claude/state/active-subagents.json)
 * @returns The saved context object
 */
export async function saveAgentStartContext(
  input: {
    agent_id: string;
    agent_type: string;
    session_id: string;
    cwd: string;
    transcript_path: string;
  },
  outputPath?: string
): Promise<AgentStartContext> {
  const contextPath = outputPath || path.join(input.cwd, DEFAULT_CONTEXT_PATH);
  const timestamp = new Date().toISOString();

  // Parse parent transcript to find the Task call
  const parentTranscript = await parseTranscript(input.transcript_path);
  const taskInfo = findPendingTaskCall(parentTranscript, input.agent_type);

  const context: AgentStartContext = {
    agentId: input.agent_id,
    agentType: input.agent_type,
    sessionId: input.session_id,
    timestamp,
    prompt: taskInfo?.prompt || '',
    toolUseId: taskInfo?.toolUseId || '',
  };

  // Load existing contexts
  let contexts: ActiveSubagentsMap = {};
  try {
    const existing = await fs.readFile(contextPath, 'utf-8');
    contexts = JSON.parse(existing);
  } catch {
    // File doesn't exist yet, start fresh
  }

  // Add new context
  contexts[input.agent_id] = context;

  // Ensure directory exists
  await fs.mkdir(path.dirname(contextPath), { recursive: true });

  // Save
  await fs.writeFile(contextPath, JSON.stringify(contexts, null, 2), 'utf-8');

  return context;
}

/**
 * Load saved agent context from SubagentStart.
 *
 * @param agentId - The agent ID to look up
 * @param cwd - Current working directory (project root)
 * @param contextPath - Optional path to the context file (defaults to .claude/state/active-subagents.json)
 * @returns The saved context or undefined if not found
 */
export async function loadAgentStartContext(
  agentId: string,
  cwd: string,
  contextPath?: string
): Promise<AgentStartContext | undefined> {
  const filePath = contextPath || path.join(cwd, DEFAULT_CONTEXT_PATH);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const contexts: ActiveSubagentsMap = JSON.parse(content);
    return contexts[agentId];
  } catch {
    return undefined;
  }
}

/**
 * Remove agent context after SubagentStop processing.
 *
 * @param agentId - The agent ID to remove
 * @param cwd - Current working directory (project root)
 * @param contextPath - Optional path to the context file (defaults to .claude/state/active-subagents.json)
 */
export async function removeAgentStartContext(
  agentId: string,
  cwd: string,
  contextPath?: string
): Promise<void> {
  const filePath = contextPath || path.join(cwd, DEFAULT_CONTEXT_PATH);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const contexts: ActiveSubagentsMap = JSON.parse(content);
    delete contexts[agentId];
    await fs.writeFile(filePath, JSON.stringify(contexts, null, 2), 'utf-8');
  } catch {
    // File doesn't exist or other error, nothing to remove
  }
}

/**
 * Find a pending Task tool_use call (one without a result yet) matching the given agent type.
 *
 * This is used at SubagentStart time to find the Task call that spawned the agent.
 * At this point, the tool_result hasn't been written yet, so we match by:
 * 1. Looking for Task tool_use with matching subagent_type
 * 2. Finding the most recent one without a corresponding tool_result
 */
function findPendingTaskCall(
  transcript: Transcript,
  agentType: string
): { subagentType: string; prompt: string; toolUseId: string; timestamp: string } | undefined {
  // Collect all Task tool_use calls
  const taskCalls: Array<{
    toolUseId: string;
    subagentType: string;
    prompt: string;
    timestamp: string;
  }> = [];

  for (const msg of transcript.messages) {
    if (msg.type !== 'assistant') continue;

    for (const content of msg.message.content) {
      if (content.type === 'tool_use' && content.name === 'Task') {
        const input = content.input as {
          subagent_type?: string;
          prompt?: string;
        };
        taskCalls.push({
          toolUseId: content.id,
          subagentType: input.subagent_type || 'unknown',
          prompt: input.prompt || '',
          timestamp: msg.timestamp,
        });
      }
    }
  }

  // Collect tool_use_ids that have results
  const completedToolUseIds = new Set<string>();
  for (const msg of transcript.messages) {
    if (msg.type !== 'user') continue;
    const content = msg.message.content;
    if (typeof content === 'string') continue;
    for (const rc of content) {
      if ('tool_use_id' in rc && rc.tool_use_id) {
        completedToolUseIds.add(rc.tool_use_id);
      }
    }
  }

  // Find pending Task calls matching agent type (most recent first)
  const pendingTasks = taskCalls
    .filter((t) => !completedToolUseIds.has(t.toolUseId))
    .filter((t) => t.subagentType === agentType)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return pendingTasks[0];
}

// ============================================================================
// Agent Edits Analysis
// ============================================================================

/**
 * Find the Task tool_use call for an agent using multiple matching strategies.
 *
 * Matching priority:
 * 1. Exact match via saved context (toolUseId from SubagentStart)
 * 2. Exact match via tool_result.agentId (for historical transcripts)
 * 3. Fuzzy match by subagentType and timestamp (within 10s window)
 *
 * @param transcript - The parent transcript to search
 * @param targetAgentId - The agent ID to find
 * @param options - Additional hints for matching
 */
export function findTaskCallForAgent(
  transcript: Transcript,
  targetAgentId: string,
  options?: {
    /** Known subagent type (from SubagentStart/Stop input) */
    subagentType?: string;
    /** Known toolUseId (from saved context) */
    toolUseId?: string;
    /** Agent's first message timestamp for fuzzy matching */
    agentStartTimestamp?: string;
    /** Max time delta in ms for fuzzy matching (default: 10000) */
    maxTimeDeltaMs?: number;
  }
): { subagentType: string; prompt: string; toolUseId: string } | undefined {
  const maxDelta = options?.maxTimeDeltaMs ?? 10000;

  // Collect all Task tool_use calls
  const taskCalls = new Map<
    string,
    { subagentType: string; prompt: string; toolUseId: string; timestamp: string }
  >();

  for (const msg of transcript.messages) {
    if (msg.type !== 'assistant') continue;

    for (const content of msg.message.content) {
      if (content.type === 'tool_use' && content.name === 'Task') {
        const input = content.input as {
          subagent_type?: string;
          prompt?: string;
        };
        taskCalls.set(content.id, {
          toolUseId: content.id,
          subagentType: input.subagent_type || 'unknown',
          prompt: input.prompt || '',
          timestamp: msg.timestamp,
        });
      }
    }
  }

  // Strategy 1: Direct lookup by toolUseId (from saved context)
  if (options?.toolUseId) {
    const direct = taskCalls.get(options.toolUseId);
    if (direct) {
      return { subagentType: direct.subagentType, prompt: direct.prompt, toolUseId: direct.toolUseId };
    }
  }

  // Strategy 2: Match via tool_result.agentId (works for historical/completed transcripts)
  for (const msg of transcript.messages) {
    if (msg.type !== 'user') continue;

    const toolResult = msg.toolUseResult as { agentId?: string } | undefined;
    if (toolResult?.agentId === targetAgentId) {
      const content = msg.message.content;
      if (typeof content === 'string') continue;

      for (const rc of content) {
        if ('tool_use_id' in rc && rc.tool_use_id) {
          const taskInfo = taskCalls.get(rc.tool_use_id);
          if (taskInfo) {
            return { subagentType: taskInfo.subagentType, prompt: taskInfo.prompt, toolUseId: taskInfo.toolUseId };
          }
        }
      }
    }
  }

  // Strategy 3: Fuzzy match by subagentType and timestamp
  if (options?.subagentType && options?.agentStartTimestamp) {
    const agentStartTime = new Date(options.agentStartTimestamp).getTime();

    // Find Task calls with matching subagentType that are within time window
    const candidates = Array.from(taskCalls.values())
      .filter((t) => t.subagentType === options.subagentType)
      .filter((t) => {
        const taskTime = new Date(t.timestamp).getTime();
        // Task must come before agent start, within maxDelta
        return taskTime <= agentStartTime && agentStartTime - taskTime <= maxDelta;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (candidates[0]) {
      return {
        subagentType: candidates[0].subagentType,
        prompt: candidates[0].prompt,
        toolUseId: candidates[0].toolUseId,
      };
    }
  }

  return undefined;
}

/** Parse YAML frontmatter from a markdown file */
async function parseAgentFrontmatter(
  filePath: string
): Promise<{ name?: string; skills?: string[] }> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const { data } = matter(content);
    return data as { name?: string; skills?: string[] };
  } catch {
    return {};
  }
}

/**
 * Analyze an agent transcript to extract comprehensive edit information.
 *
 * Given a subagent transcript path (starting with "agent-"), this function:
 * 1. Finds the parent session transcript
 * 2. Extracts the subagent_type and prompt from the Task call (using saved context or fuzzy matching)
 * 3. Locates the agent definition file in .claude/agents/
 * 4. Parses the agent's YAML frontmatter for preloaded skills
 * 5. Collects all unique files edited by Write/Edit tools
 * 6. Cleans up the saved context (removes entry from active-subagents.json)
 *
 * @param agentTranscriptPath - Path to an agent transcript file (must start with "agent-")
 * @param options - Optional configuration
 * @returns AgentEditsResult with session info, agent metadata, and edited files
 * @throws Error if path is not an agent transcript or parent session not found
 *
 * @example
 * ```typescript
 * const result = await getAgentEdits('/path/to/.claude/projects/-home-user-myproject/agent-03ce8cb2.jsonl');
 * console.log(result.subagentType); // 'ui'
 * console.log(result.agentEditedFiles); // ['/path/to/file1.tsx', '/path/to/file2.ts']
 * ```
 */
export async function getAgentEdits(
  agentTranscriptPath: string,
  options?: {
    /** Path to active-subagents.json context file */
    contextPath?: string;
    /** Known subagent type (from SubagentStop input) for fuzzy matching */
    subagentType?: string;
  }
): Promise<AgentEditsResult> {
  // 1. Validate path starts with 'agent-'
  const filename = path.basename(agentTranscriptPath);
  if (!filename.startsWith('agent-')) {
    throw new Error(`Path must be an agent transcript (starting with agent-): ${filename}`);
  }

  // 2. Parse agent transcript to get sessionId and cwd
  const agentTranscript = await parseTranscript(agentTranscriptPath);
  const firstMsg = agentTranscript.messages[0];
  if (!firstMsg) {
    throw new Error(`Agent transcript is empty: ${agentTranscriptPath}`);
  }

  const sessionId = firstMsg.sessionId;
  const cwd = firstMsg.cwd;
  const agentId = agentTranscript.agentId;
  const agentStartTimestamp = firstMsg.timestamp;

  if (!agentId) {
    throw new Error(`Could not determine agentId from transcript: ${agentTranscriptPath}`);
  }

  // 3. Find parent session transcript in same directory
  const dir = path.dirname(agentTranscriptPath);
  const parentPath = path.join(dir, `${sessionId}.jsonl`);

  // Verify parent exists
  try {
    await fs.access(parentPath);
  } catch {
    throw new Error(`Parent session transcript not found: ${parentPath}`);
  }

  // 4. Try to load saved context from SubagentStart
  let savedContext: AgentStartContext | undefined;
  if (cwd) {
    savedContext = await loadAgentStartContext(agentId, cwd, options?.contextPath);
  }

  // 5. Parse parent transcript and find matching Task call
  const parentTranscript = await parseTranscript(parentPath);

  // Use findTaskCallForAgent with all available hints
  const taskInfo = findTaskCallForAgent(parentTranscript, agentId, {
    toolUseId: savedContext?.toolUseId,
    subagentType: savedContext?.agentType || options?.subagentType,
    agentStartTimestamp,
  });

  const subagentType = taskInfo?.subagentType || savedContext?.agentType || options?.subagentType || 'unknown';
  const agentPrompt = taskInfo?.prompt || savedContext?.prompt || '';

  // 6. Find agent definition file
  let agentFile: string | undefined;
  if (cwd) {
    const agentFilePath = path.join(cwd, '.claude', 'agents', `${subagentType}.md`);
    try {
      await fs.access(agentFilePath);
      agentFile = agentFilePath;
    } catch {
      // Agent file doesn't exist, that's okay (could be a system agent)
    }
  }

  // 7. Parse agent frontmatter for skills
  let skills: string[] = [];
  if (agentFile) {
    const frontmatter = await parseAgentFrontmatter(agentFile);
    skills = frontmatter.skills || [];
  }

  // 8. Convert skill names to SKILL.md paths
  const agentPreloadedSkillsFiles = cwd
    ? skills.map((s) => path.join(cwd, '.claude', 'skills', s, 'SKILL.md'))
    : [];

  // 9. Get file operations from agent transcript
  const agentNewFiles = getNewFiles(agentTranscript);
  const agentDeletedFiles = getDeletedFiles(agentTranscript);
  const agentEditedFiles = getEditedFiles(agentTranscript);

  // 10. Cleanup: Remove saved context now that we've processed it
  if (cwd) {
    await removeAgentStartContext(agentId, cwd, options?.contextPath);
  }

  // 11. Return result
  return {
    sessionId,
    agentSessionId: agentId,
    parentSessionTranscript: parentPath,
    agentSessionTranscript: agentTranscriptPath,
    subagentType,
    agentPrompt,
    agentFile,
    agentPreloadedSkillsFiles,
    agentNewFiles,
    agentDeletedFiles,
    agentEditedFiles,
  };
}
