/**
 * Requirements analysis and planning guidance hook
 *
 * UserPromptSubmit hook that adds systematic requirement analysis instructions
 * to every user prompt. Ensures Claude follows a consistent process for
 * understanding requests and maintaining plans.
 *
 * This hook also matches user prompt words against CLAUDE.md file tags,
 * displaying relevant context files based on the user's message.
 *
 * This hook instructs Claude to:
 * 1. **List requirements** - Document all explicit and implicit requirements
 * 2. **Plan consideration** - Evaluate if current plan needs revision
 * 3. **Proceed systematically** - Implement only after documenting understanding
 *
 * The guidance is added as additional context to the user's prompt, making it
 * part of Claude's instruction set for that turn. This creates a consistent
 * workflow across all user interactions.
 *
 * @module guide-requirements-check
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type {
  UserPromptSubmitInput,
  UserPromptSubmitHookOutput,
} from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { parseFrontmatter } from '../shared/hooks/utils/frontmatter.js';

/**
 * Session state for tracking guidance injection
 */
interface GuidanceState {
  [sessionId: string]: {
    injectedAt: string;
  };
}

/**
 * Check if guidance has already been injected for this session
 *
 * @param sessionId - Current session ID
 * @param cwd - Working directory
 * @returns True if guidance already injected
 */
async function hasGuidanceBeenInjected(sessionId: string, cwd: string): Promise<boolean> {
  const stateFile = join(cwd, '.claude', 'logs', 'guidance-state.json');

  try {
    if (!existsSync(stateFile)) {
      return false;
    }
    const content = await readFile(stateFile, 'utf-8');
    const state: GuidanceState = JSON.parse(content);
    return !!state[sessionId];
  } catch {
    return false;
  }
}

/**
 * Mark guidance as injected for this session
 *
 * @param sessionId - Current session ID
 * @param cwd - Working directory
 */
async function markGuidanceInjected(sessionId: string, cwd: string): Promise<void> {
  const logsDir = join(cwd, '.claude', 'logs');
  const stateFile = join(logsDir, 'guidance-state.json');

  try {
    await mkdir(logsDir, { recursive: true });

    let state: GuidanceState = {};
    if (existsSync(stateFile)) {
      const content = await readFile(stateFile, 'utf-8');
      state = JSON.parse(content);
    }

    state[sessionId] = { injectedAt: new Date().toISOString() };
    await writeFile(stateFile, JSON.stringify(state, null, 2));
  } catch {
    // Ignore errors - non-critical
  }
}

/**
 * Context match result from tag matching
 */
interface ContextMatch {
  title: string;
  path: string;
  matchedTags: string[];
}

/**
 * Recursively find all CLAUDE.md files in a directory
 *
 * @param dir - Directory to search
 * @param maxDepth - Maximum recursion depth (default 5)
 * @returns Array of file paths
 */
async function findClaudeMdFiles(dir: string, maxDepth = 5): Promise<string[]> {
  if (maxDepth <= 0) return [];

  const files: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      // Skip node_modules, .git, and hidden directories (except .claude)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        if (entry.name.startsWith('.') && entry.name !== '.claude') continue;

        const subFiles = await findClaudeMdFiles(fullPath, maxDepth - 1);
        files.push(...subFiles);
      } else if (entry.name === 'CLAUDE.md') {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore permission errors or missing directories
  }

  return files;
}

/**
 * Parse CLAUDE.md file and extract title and tags
 *
 * @param filePath - Path to CLAUDE.md file
 * @returns Object with title and tags, or null if not found
 */
async function parseClaudeMd(filePath: string): Promise<{ title: string; tags: string[] } | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const { data } = parseFrontmatter(content);

    const title = data.title as string | undefined;
    const tags = data.tags as string[] | undefined;

    if (!title || !tags || !Array.isArray(tags)) {
      return null;
    }

    return { title, tags };
  } catch {
    return null;
  }
}

/**
 * Tokenize user prompt into lowercase words
 *
 * @param prompt - User prompt string
 * @returns Array of lowercase words
 */
function tokenizePrompt(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

/**
 * Find CLAUDE.md files with tags matching user prompt words
 *
 * @param cwd - Current working directory
 * @param prompt - User prompt string
 * @returns Array of context matches with title and matched tags
 */
async function findMatchingContexts(cwd: string, prompt: string): Promise<ContextMatch[]> {
  const promptWords = new Set(tokenizePrompt(prompt));
  const claudeMdFiles = await findClaudeMdFiles(cwd);
  const matches: ContextMatch[] = [];

  for (const filePath of claudeMdFiles) {
    const parsed = await parseClaudeMd(filePath);
    if (!parsed) continue;

    const matchedTags = parsed.tags.filter((tag) =>
      promptWords.has(tag.toLowerCase())
    );

    if (matchedTags.length > 0) {
      matches.push({
        title: parsed.title,
        path: filePath,
        matchedTags,
      });
    }
  }

  // Sort by number of matched tags (descending)
  matches.sort((a, b) => b.matchedTags.length - a.matchedTags.length);

  return matches;
}

/**
 * UserPromptSubmit hook handler
 *
 * Adds guidance to Claude for thorough requirement analysis and plan updates.
 * Also matches user prompt words against CLAUDE.md tags to show relevant context.
 *
 * @param input - UserPromptSubmit hook input from Claude Code
 * @returns Hook output with additional context guidance
 */
async function handler(input: UserPromptSubmitInput): Promise<UserPromptSubmitHookOutput> {
  const logger = createDebugLogger(input.cwd, 'guide-requirements-check', true);

  try {
    await logger.logInput({
      session_id: input.session_id,
      permission_mode: input.permission_mode,
      prompt_length: input.prompt.length,
    });

    // Check if guidance has already been injected this session
    if (await hasGuidanceBeenInjected(input.session_id, input.cwd)) {
      await logger.logOutput({ skipped: true, reason: 'already_injected' });
      return {};
    }

    // Find matching context files based on user prompt
    const matchedContexts = await findMatchingContexts(input.cwd, input.prompt);

    // Build context list if there are matches
    let contextSection = '';
    if (matchedContexts.length > 0) {
      const contextList = matchedContexts
        .map((c) => `- **${c.title}**: ${c.matchedTags.join(', ')}`)
        .join('\n');
      contextSection = `\n\n**Relevant Context Files:**\n${contextList}`;
    }

    // Add guidance for Claude to check requirements and plan
    const guidance = `IMPORTANT: Before proceeding with this request:

1. **List Requirements**: Start your response by noting a precise list of ALL requirements from the user's message:
   - Explicit requirements (directly stated)
   - Implicit requirements (implied by context)
   - Constraints or limitations mentioned
   - Success criteria or acceptance conditions

2. **Plan Consideration**: Consider whether this request should update the current plan:
   - If in plan mode (permission_mode: ${input.permission_mode}), update the plan accordingly
   - If a plan exists for this session, evaluate if it needs revision based on new requirements
   - If no plan exists but this is a complex multi-step task, consider creating one
   - Ensure the plan includes Intent, Plan steps, and Success Criteria sections

3. **Proceed**: After documenting requirements and plan considerations, proceed with the implementation.${contextSection}`;

    // Mark guidance as injected for this session
    await markGuidanceInjected(input.session_id, input.cwd);

    await logger.logOutput({
      added_guidance: true,
      guidance_length: guidance.length,
      matched_contexts: matchedContexts.length,
    });

    return {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: guidance,
      },
    };
  } catch (error) {
    await logger.logError(error as Error);

    // Non-blocking - just skip guidance on error
    return {};
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
