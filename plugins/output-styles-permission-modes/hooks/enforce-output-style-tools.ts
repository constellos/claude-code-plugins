#!/usr/bin/env npx tsx

import type { PreToolUseInput, PreToolUseHookOutput } from '../../../shared/types/types.js';
import { runHook, wasToolEventMainAgent } from '../../../shared/hooks/utils/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';

const DEBUG = process.env.DEBUG === '*' || process.env.DEBUG?.includes('output-styles-permission-modes');

interface OutputStyleFrontmatter {
  name?: string;
  description?: string;
  tools?: string[];
}

/**
 * Read settings.json to get the current output style name
 */
async function getCurrentOutputStyle(cwd: string): Promise<string | undefined> {
  const settingsPaths = [
    path.join(cwd, '.claude', 'settings.local.json'),
    path.join(cwd, '.claude', 'settings.json'),
  ];

  for (const settingsPath of settingsPaths) {
    try {
      const content = await fs.readFile(settingsPath, 'utf-8');
      const settings = JSON.parse(content);
      if (settings.outputStyle) {
        return settings.outputStyle;
      }
    } catch {
      // File doesn't exist or is invalid JSON, try next path
      continue;
    }
  }

  return undefined;
}

/**
 * Load and parse output style file to get frontmatter
 */
async function loadOutputStyleFrontmatter(
  cwd: string,
  styleName: string
): Promise<OutputStyleFrontmatter | undefined> {
  const stylePaths = [
    path.join(cwd, '.claude', 'output-styles', `${styleName}.md`),
    // Note: User-level styles would be in ~/.claude/output-styles/
    // but we can't easily access user home in hooks without assumptions
  ];

  for (const stylePath of stylePaths) {
    try {
      const content = await fs.readFile(stylePath, 'utf-8');
      const { data } = matter(content);
      return data as OutputStyleFrontmatter;
    } catch {
      // File doesn't exist, try next path
      continue;
    }
  }

  return undefined;
}

/**
 * PreToolUse hook that enforces tool restrictions from output style frontmatter
 *
 * Only applies to the main agent - subagents can use any tools they need.
 */
async function handler(input: PreToolUseInput): Promise<PreToolUseHookOutput> {
  if (DEBUG) {
    console.log('[enforce-output-style-tools] Hook triggered');
    console.log('[enforce-output-style-tools] Tool:', input.tool_name);
  }

  // Only enforce for main agent, not subagents
  const isMainAgent = await wasToolEventMainAgent(input.transcript_path, input.tool_use_id);
  if (!isMainAgent) {
    if (DEBUG) {
      console.log('[enforce-output-style-tools] Subagent detected, skipping enforcement');
    }
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  // Get current output style
  const styleName = await getCurrentOutputStyle(input.cwd);
  if (!styleName) {
    if (DEBUG) {
      console.log('[enforce-output-style-tools] No output style configured, allowing all tools');
    }
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  if (DEBUG) {
    console.log('[enforce-output-style-tools] Current output style:', styleName);
  }

  // Load output style frontmatter
  const frontmatter = await loadOutputStyleFrontmatter(input.cwd, styleName);
  if (!frontmatter || !frontmatter.tools || frontmatter.tools.length === 0) {
    if (DEBUG) {
      console.log('[enforce-output-style-tools] No tool restrictions defined, allowing all tools');
    }
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  const allowedTools = frontmatter.tools;
  if (DEBUG) {
    console.log('[enforce-output-style-tools] Allowed tools:', allowedTools);
  }

  // Check if current tool is allowed
  const isAllowed = allowedTools.includes(input.tool_name);

  if (!isAllowed) {
    if (DEBUG) {
      console.log('[enforce-output-style-tools] Tool not allowed, blocking');
    }

    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `The "${input.tool_name}" tool is not allowed by the current output style "${styleName}". Allowed tools: ${allowedTools.join(', ')}`,
      },
    };
  }

  if (DEBUG) {
    console.log('[enforce-output-style-tools] Tool allowed');
  }

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  };
}

// Export for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
