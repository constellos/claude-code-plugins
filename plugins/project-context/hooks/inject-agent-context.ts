/**
 * SubagentStart hook - SERP-style context injection for subagents
 *
 * This hook fires when a subagent (Task tool) starts and injects relevant
 * context based on the agent's prompt. It matches the prompt against the
 * metadata index to find relevant folders and files, then formats them
 * as SERP-style output.
 *
 * The hook retrieves the task prompt from .claude/logs/task-calls.json
 * (saved by the PreToolUse[Task] log-task-call.ts hook) since SubagentStartInput
 * only provides agent_id and agent_type, not the prompt.
 *
 * @module inject-agent-context
 */

import type { SubagentStartInput, SubagentStartHookOutput } from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// ============================================================================
// Types
// ============================================================================

/**
 * Structure of the metadata index file
 */
interface MetadataIndex {
  folders: FolderMetadata[];
  files: FileMetadata[];
}

interface FolderMetadata {
  path: string;
  tags: string[];
  description?: string;
}

interface FileMetadata {
  path: string;
  tags: string[];
  description?: string;
}

/**
 * Structure of task-calls.json entries
 */
interface TaskCallContext {
  toolUseId: string;
  agentType: string;
  sessionId: string;
  timestamp: string;
  prompt: string;
}

interface TaskCallsMap {
  [toolUseId: string]: TaskCallContext;
}

/**
 * Match result for context matching
 */
interface MatchResult {
  path: string;
  matchedTags: string[];
}

// ============================================================================
// Context Matching
// ============================================================================

/**
 * Extract keywords from a prompt for matching
 *
 * Tokenizes the prompt into lowercase words, filtering out common
 * stop words and short tokens.
 */
function extractKeywords(prompt: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this',
    'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'what', 'which', 'who', 'whom', 'where', 'when', 'why', 'how',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
    'than', 'too', 'very', 'just', 'about', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'any', 'file', 'files',
    'folder', 'folders', 'create', 'add', 'update', 'fix', 'make',
    'please', 'need', 'want', 'like', 'use', 'using'
  ]);

  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

/**
 * Match tags against keywords
 *
 * Returns the list of tags that match any of the keywords.
 * Uses substring matching for flexibility.
 */
function matchTags(tags: string[], keywords: string[]): string[] {
  const matched: string[] = [];

  for (const tag of tags) {
    const normalizedTag = tag.toLowerCase();
    for (const keyword of keywords) {
      if (normalizedTag.includes(keyword) || keyword.includes(normalizedTag)) {
        matched.push(tag);
        break;
      }
    }
  }

  return matched;
}

/**
 * Match folders and files against a prompt
 */
function matchContext(
  index: MetadataIndex,
  prompt: string
): { folders: MatchResult[]; files: MatchResult[] } {
  const keywords = extractKeywords(prompt);

  if (keywords.length === 0) {
    return { folders: [], files: [] };
  }

  const folders: MatchResult[] = [];
  const files: MatchResult[] = [];

  // Match folders
  for (const folder of index.folders) {
    const matchedTags = matchTags(folder.tags, keywords);
    if (matchedTags.length > 0) {
      folders.push({ path: folder.path, matchedTags });
    }
  }

  // Match files
  for (const file of index.files) {
    const matchedTags = matchTags(file.tags, keywords);
    if (matchedTags.length > 0) {
      files.push({ path: file.path, matchedTags });
    }
  }

  // Sort by number of matched tags (descending)
  folders.sort((a, b) => b.matchedTags.length - a.matchedTags.length);
  files.sort((a, b) => b.matchedTags.length - a.matchedTags.length);

  return { folders, files };
}

/**
 * Format matches as SERP-style output
 */
function formatSerpOutput(matches: { folders: MatchResult[]; files: MatchResult[] }): string {
  const lines: string[] = [];

  if (matches.folders.length > 0) {
    lines.push('Relevant Folders:');
    for (const folder of matches.folders) {
      const tagsStr = folder.matchedTags.map((t) => `"${t}"`).join(', ');
      lines.push(`  - ${folder.path} (matches: ${tagsStr})`);
    }
  }

  if (matches.files.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('Relevant Files:');
    for (const file of matches.files) {
      const tagsStr = file.matchedTags.map((t) => `"${t}"`).join(', ');
      lines.push(`  - ${file.path} (matches: ${tagsStr})`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Task Context Loading
// ============================================================================

/**
 * Load the most recent task call context from task-calls.json
 *
 * Since SubagentStart doesn't include the prompt, we need to look it up
 * from the task-calls.json file that was populated by log-task-call.ts
 */
async function loadMostRecentTaskPrompt(cwd: string): Promise<string | undefined> {
  const taskCallsPath = join(cwd, '.claude', 'logs', 'task-calls.json');

  if (!existsSync(taskCallsPath)) {
    return undefined;
  }

  try {
    const content = await readFile(taskCallsPath, 'utf-8');
    const contexts: TaskCallsMap = JSON.parse(content);

    // Get the most recent task call by timestamp
    let mostRecent: TaskCallContext | undefined;
    let mostRecentTime = 0;

    for (const context of Object.values(contexts)) {
      const time = new Date(context.timestamp).getTime();
      if (time > mostRecentTime) {
        mostRecentTime = time;
        mostRecent = context;
      }
    }

    return mostRecent?.prompt;
  } catch {
    return undefined;
  }
}

// ============================================================================
// Hook Handler
// ============================================================================

/**
 * SubagentStart hook that injects relevant context based on the agent's prompt
 *
 * This hook:
 * 1. Loads the metadata index from .claude/logs/metadata-index.json
 * 2. Retrieves the task prompt from task-calls.json
 * 3. Matches the prompt against folder/file tags
 * 4. Returns SERP-style formatted context via systemMessage
 *
 * @param input - SubagentStart hook input from Claude Code
 * @returns Hook output with matched context as systemMessage
 */
async function handler(input: SubagentStartInput): Promise<SubagentStartHookOutput> {
  const logger = createDebugLogger(input.cwd, 'inject-agent-context', true);

  try {
    await logger.logInput({
      agent_id: input.agent_id,
      agent_type: input.agent_type,
    });

    // Check if metadata index exists
    const indexPath = join(input.cwd, '.claude', 'logs', 'metadata-index.json');
    if (!existsSync(indexPath)) {
      await logger.logOutput({ success: false, reason: 'No metadata index found' });
      return {};
    }

    // Load metadata index
    let index: MetadataIndex;
    try {
      const content = await readFile(indexPath, 'utf-8');
      index = JSON.parse(content);
    } catch {
      await logger.logOutput({ success: false, reason: 'Failed to parse metadata index' });
      return {};
    }

    // Get task prompt from task-calls.json
    const prompt = await loadMostRecentTaskPrompt(input.cwd);
    if (!prompt) {
      await logger.logOutput({ success: false, reason: 'No task prompt found' });
      return {};
    }

    // Match context
    const matches = matchContext(index, prompt);

    if (matches.folders.length === 0 && matches.files.length === 0) {
      await logger.logOutput({
        success: true,
        matches: 0,
        prompt: prompt.slice(0, 100),
      });
      return {};
    }

    // Format as SERP-style output
    const contextOutput = formatSerpOutput(matches);

    await logger.logOutput({
      success: true,
      folders: matches.folders.length,
      files: matches.files.length,
      prompt: prompt.slice(0, 100),
    });

    return {
      systemMessage: contextOutput,
      hookSpecificOutput: {
        hookEventName: 'SubagentStart',
      },
    };
  } catch (error: unknown) {
    // Non-blocking on errors
    await logger.logError(error as Error);
    return {};
  }
}

// Export handler for testing
export { handler };

// Export utilities for testing
export { extractKeywords, matchTags, matchContext, formatSerpOutput, loadMostRecentTaskPrompt };
export type { MetadataIndex, FolderMetadata, FileMetadata, MatchResult, TaskCallContext, TaskCallsMap };

// Make this file self-executable with tsx
runHook(handler);
