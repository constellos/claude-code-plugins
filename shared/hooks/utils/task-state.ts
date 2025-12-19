/**
 * Task state management for Claude Code hooks
 * Coordinates context between PreToolUse[Task] and PostToolUse[Task]/SubagentStop hooks
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import {
  parseTranscript,
  findPendingTaskCall,
  findTaskCallForAgent,
  getNewFiles,
  getDeletedFiles,
  getEditedFiles,
} from './transcripts.js';

// ============================================================================
// Constants
// ============================================================================

const LOGS_DIR = '.claude/logs';
const TASK_CALLS_FILE = 'task-calls.json';

// ============================================================================
// Types
// ============================================================================

export interface TaskCallContext {
  toolUseId: string;
  agentType: string;
  sessionId: string;
  timestamp: string;
  prompt: string;
}

interface TaskCallsMap {
  [toolUseId: string]: TaskCallContext;
}

export interface TaskEditsResult {
  sessionId: string;
  agentSessionId: string;
  parentSessionTranscript: string;
  agentSessionTranscript: string;
  subagentType: string;
  agentPrompt: string;
  agentFile?: string;
  agentPreloadedSkillsFiles: string[];
  agentNewFiles: string[];
  agentDeletedFiles: string[];
  agentEditedFiles: string[];
}

// ============================================================================
// Context Management
// ============================================================================

/**
 * Get the path to task-calls.json
 */
function getTasksFilePath(cwd: string, customPath?: string): string {
  return customPath || path.join(cwd, LOGS_DIR, TASK_CALLS_FILE);
}

/**
 * Save task call context at PreToolUse[Task] for later retrieval at PostToolUse/SubagentStop
 */
export async function saveTaskCallContext(
  input: {
    tool_use_id: string;
    agent_type: string;
    session_id: string;
    prompt: string;
    cwd: string;
  },
  outputPath?: string
): Promise<TaskCallContext> {
  const contextPath = getTasksFilePath(input.cwd, outputPath);
  const timestamp = new Date().toISOString();

  const context: TaskCallContext = {
    toolUseId: input.tool_use_id,
    agentType: input.agent_type,
    sessionId: input.session_id,
    timestamp,
    prompt: input.prompt,
  };

  // Load existing contexts
  let contexts: TaskCallsMap = {};
  try {
    const existing = await fs.readFile(contextPath, 'utf-8');
    contexts = JSON.parse(existing);
  } catch {
    // File doesn't exist yet
  }

  contexts[input.tool_use_id] = context;

  // Ensure directory exists
  await fs.mkdir(path.dirname(contextPath), { recursive: true });
  await fs.writeFile(contextPath, JSON.stringify(contexts, null, 2), 'utf-8');

  return context;
}

/**
 * Load saved task call context from PreToolUse[Task]
 */
export async function loadTaskCallContext(
  toolUseId: string,
  cwd: string,
  contextPath?: string
): Promise<TaskCallContext | undefined> {
  const filePath = getTasksFilePath(cwd, contextPath);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const contexts: TaskCallsMap = JSON.parse(content);
    return contexts[toolUseId];
  } catch {
    return undefined;
  }
}

/**
 * Remove task context after processing
 */
export async function removeTaskCallContext(
  toolUseId: string,
  cwd: string,
  contextPath?: string
): Promise<void> {
  const filePath = getTasksFilePath(cwd, contextPath);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const contexts: TaskCallsMap = JSON.parse(content);
    delete contexts[toolUseId];
    await fs.writeFile(filePath, JSON.stringify(contexts, null, 2), 'utf-8');
  } catch {
    // Nothing to remove
  }
}

// ============================================================================
// Task Edits Analysis
// ============================================================================

/**
 * Parse YAML frontmatter from an agent markdown file
 */
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
 * Analyze a task transcript to extract comprehensive edit information
 */
export async function getTaskEdits(
  agentTranscriptPath: string,
  options?: {
    contextPath?: string;
    subagentType?: string;
  }
): Promise<TaskEditsResult> {
  const filename = path.basename(agentTranscriptPath);
  if (!filename.startsWith('agent-')) {
    throw new Error(`Path must be an agent transcript (starting with agent-): ${filename}`);
  }

  // Parse agent transcript
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

  // Find parent session transcript
  const dir = path.dirname(agentTranscriptPath);
  const parentPath = path.join(dir, `${sessionId}.jsonl`);

  try {
    await fs.access(parentPath);
  } catch {
    throw new Error(`Parent session transcript not found: ${parentPath}`);
  }

  // Parse parent transcript and find matching Task call
  const parentTranscript = await parseTranscript(parentPath);
  const taskInfo = findTaskCallForAgent(parentTranscript, agentId, {
    subagentType: options?.subagentType,
    agentStartTimestamp,
  });

  // Try to load saved context using tool_use_id from task call
  let savedContext: TaskCallContext | undefined;
  if (cwd && taskInfo?.toolUseId) {
    savedContext = await loadTaskCallContext(taskInfo.toolUseId, cwd, options?.contextPath);
  }

  const subagentType = taskInfo?.subagentType || savedContext?.agentType || options?.subagentType || 'unknown';
  const agentPrompt = savedContext?.prompt || taskInfo?.prompt || '';
  const toolUseId = taskInfo?.toolUseId || savedContext?.toolUseId;

  // Find agent definition file
  let agentFile: string | undefined;
  if (cwd) {
    const agentFilePath = path.join(cwd, '.claude', 'agents', `${subagentType}.md`);
    try {
      await fs.access(agentFilePath);
      agentFile = agentFilePath;
    } catch {
      // Agent file doesn't exist
    }
  }

  // Parse agent frontmatter for skills
  let skills: string[] = [];
  if (agentFile) {
    const frontmatter = await parseAgentFrontmatter(agentFile);
    skills = frontmatter.skills || [];
  }

  const agentPreloadedSkillsFiles = cwd
    ? skills.map((s) => path.join(cwd, '.claude', 'skills', s, 'SKILL.md'))
    : [];

  // Get file operations
  const agentNewFiles = getNewFiles(agentTranscript);
  const agentDeletedFiles = getDeletedFiles(agentTranscript);
  const agentEditedFiles = getEditedFiles(agentTranscript);

  // Cleanup saved context
  if (cwd && toolUseId) {
    await removeTaskCallContext(toolUseId, cwd, options?.contextPath);
  }

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
