#!/usr/bin/env npx tsx
/**
 * PreToolUse Hook - Enforce Structured Markdown Configuration
 *
 * This hook fires before Write and Edit operations on markdown files to validate
 * structure and metadata for different file types:
 *
 * 1. Agent files (in .claude/agents/)
 *    - Headings: Objective, Principles, Agent-scoped project context
 *    - Title can be wildcard but should use agent name
 *
 * 2. Skill files (in .claude/skills/, excluding SKILL.md and SKILL.template.md)
 *    - Headings: Purpose, Skill-scoped context
 *    - Metadata: name, description required
 *
 * 3. Rules files (in .claude/rules/)
 *    - Metadata: Required Skills
 *    - Headings: Rules
 *
 * 4. CLAUDE.md files (any directory)
 *    - Metadata: name, description required
 *    - Metadata: folders, files optional
 *
 * @module hooks/enforce-structured-markdown
 */

import type { PreToolUseInput, PreToolUseHookOutput } from '../types/types.js';
import { createDebugLogger } from './utils/debug.js';
import { runHook } from './utils/io.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';

const DEBUG = process.env.DEBUG === '*' || process.env.DEBUG?.includes('enforce-structured-markdown');

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Extract markdown headings from content
 */
function extractHeadings(content: string): string[] {
  const lines = content.split('\n');
  const headings: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.match(/^#{1,6}\s+/)) {
      headings.push(trimmed);
    }
  }

  return headings;
}

/**
 * Check if a heading matches a pattern (supports wildcards)
 */
function matchesHeadingPattern(heading: string, pattern: string): boolean {
  // Normalize whitespace
  const normalizedHeading = heading.replace(/\s+/g, ' ').trim();
  const normalizedPattern = pattern.replace(/\s+/g, ' ').trim();

  // Exact match
  if (normalizedHeading === normalizedPattern) {
    return true;
  }

  // Wildcard pattern
  const regexPattern = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(normalizedHeading);
}

/**
 * Validate required headings are present
 */
function validateRequiredHeadings(headings: string[], required: string[]): ValidationResult {
  const errors: string[] = [];

  for (const requiredPattern of required) {
    const found = headings.some(h => matchesHeadingPattern(h, requiredPattern));
    if (!found) {
      errors.push(`Required heading missing: "${requiredPattern}"`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate required metadata fields are present
 */
function validateRequiredMetadata(metadata: Record<string, unknown>, required: string[]): ValidationResult {
  const errors: string[] = [];

  for (const field of required) {
    if (!metadata[field]) {
      errors.push(`Required metadata field missing: "${field}"`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Determine file type and return validation rules
 */
function getFileValidationRules(filePath: string, cwd: string): {
  type: string;
  requiredHeadings?: string[];
  requiredMetadata?: string[];
  shouldValidate: boolean;
} | null {
  const normalizedPath = path.normalize(filePath);
  const relativePath = path.isAbsolute(filePath)
    ? path.relative(cwd, filePath)
    : filePath;

  if (DEBUG) {
    console.log('[enforce-structured-markdown] Checking file type:', relativePath);
  }

  // Agent files: .claude/agents/*.md
  if (relativePath.includes(path.join('.claude', 'agents')) && relativePath.endsWith('.md')) {
    return {
      type: 'agent',
      requiredHeadings: ['## Objective', '## Principles', '## Agent-scoped project context'],
      shouldValidate: true,
    };
  }

  // Skill files: .claude/skills/*/*.md (excluding SKILL.md and SKILL.template.md)
  if (relativePath.includes(path.join('.claude', 'skills')) && relativePath.endsWith('.md')) {
    const basename = path.basename(relativePath);
    if (basename === 'SKILL.md' || basename === 'SKILL.template.md') {
      if (DEBUG) {
        console.log('[enforce-structured-markdown] Skipping SKILL.md or SKILL.template.md');
      }
      return { type: 'skill-template', shouldValidate: false };
    }
    return {
      type: 'skill',
      requiredHeadings: ['## Purpose', '## Skill-scoped context'],
      requiredMetadata: ['name', 'description'],
      shouldValidate: true,
    };
  }

  // Rules files: .claude/rules/*.md
  if (relativePath.includes(path.join('.claude', 'rules')) && relativePath.endsWith('.md')) {
    return {
      type: 'rule',
      requiredHeadings: ['## Rules'],
      requiredMetadata: ['Required Skills'],
      shouldValidate: true,
    };
  }

  // CLAUDE.md files (any directory)
  if (path.basename(relativePath) === 'CLAUDE.md') {
    return {
      type: 'claude-md',
      requiredMetadata: ['name', 'description'],
      shouldValidate: true,
    };
  }

  return null;
}

/**
 * Get content from tool input (handles both Write and Edit)
 */
async function getContentFromToolInput(
  toolName: string,
  toolInput: {
    file_path?: string;
    content?: string;
    old_string?: string;
    new_string?: string;
  },
  cwd: string
): Promise<string | null> {
  if (toolName === 'Write') {
    return toolInput.content || null;
  } else if (toolName === 'Edit') {
    const filePath = toolInput.file_path;
    if (!filePath || !toolInput.old_string || !toolInput.new_string) {
      return null;
    }

    try {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
      const currentContent = await fs.readFile(fullPath, 'utf-8');
      // Apply the edit
      return currentContent.replace(toolInput.old_string, toolInput.new_string);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * PreToolUse hook handler for enforcing structured markdown
 */
async function handler(input: PreToolUseInput): Promise<PreToolUseHookOutput> {
  // Only run for Write and Edit operations
  if (input.tool_name !== 'Write' && input.tool_name !== 'Edit') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  const logger = createDebugLogger(input.cwd, 'enforce-structured-markdown', DEBUG);

  try {
    await logger.logInput({
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
    });

    const toolInput = input.tool_input as {
      file_path?: string;
      content?: string;
      old_string?: string;
      new_string?: string;
    };

    const filePath = toolInput.file_path;
    if (!filePath) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };
    }

    // Only process .md files
    if (!filePath.endsWith('.md')) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };
    }

    // Get validation rules for this file type
    const validationRules = getFileValidationRules(filePath, input.cwd);
    if (!validationRules || !validationRules.shouldValidate) {
      await logger.logOutput({ message: 'No validation rules for this file type or validation skipped' });
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };
    }

    // Get the content (handles both Write and Edit)
    const content = await getContentFromToolInput(input.tool_name, toolInput, input.cwd);
    if (!content) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };
    }

    // Parse frontmatter and content
    const { data: metadata } = matter(content);
    const headings = extractHeadings(content);

    const allErrors: string[] = [];

    // Validate required metadata
    if (validationRules.requiredMetadata && validationRules.requiredMetadata.length > 0) {
      const metadataValidation = validateRequiredMetadata(
        metadata as Record<string, unknown>,
        validationRules.requiredMetadata
      );
      if (!metadataValidation.valid) {
        allErrors.push(...metadataValidation.errors);
      }
    }

    // Validate required headings
    if (validationRules.requiredHeadings && validationRules.requiredHeadings.length > 0) {
      const headingValidation = validateRequiredHeadings(headings, validationRules.requiredHeadings);
      if (!headingValidation.valid) {
        allErrors.push(...headingValidation.errors);
      }
    }

    await logger.logOutput({
      fileType: validationRules.type,
      headings,
      metadata: Object.keys(metadata),
      valid: allErrors.length === 0,
      errors: allErrors,
    });

    if (allErrors.length > 0) {
      const errorMessage = allErrors.join('\n');
      const fileTypeDisplay = validationRules.type.replace('-', ' ');

      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `${fileTypeDisplay.charAt(0).toUpperCase() + fileTypeDisplay.slice(1)} validation failed for ${path.basename(filePath)}:\n\n${errorMessage}\n\nPlease ensure all required headings and metadata fields are present.`,
        },
      };
    }

    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };

  } catch (error: unknown) {
    await logger.logError(error as Error);

    // On error, allow the operation but log a system message
    return {
      systemMessage: `Structured markdown validation hook failed: ${(error as Error).message || 'Unknown error'}`,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
