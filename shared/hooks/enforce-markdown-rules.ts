/**
 * PreToolUse Hook - Enforce Markdown Rules
 *
 * This hook fires before Write and Edit operations on .md files referenced in .claude/rules
 * to validate markdown structure against frontmatter specifications.
 *
 * Validates against markdown.headings and markdown.metadata specifications:
 * - allowed: Patterns that items must match (gitignore-style with *, ?)
 * - required: Patterns that must have at least one match
 * - forbidden: Patterns that must not have any matches
 *
 * @module hooks/enforce-markdown-rules
 */

import type { PreToolUseInput, PreToolUseHookOutput } from '../types/types.js';
import { createDebugLogger } from './utils/debug.js';
import { runHook } from './utils/io.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';

interface ValidationSpec {
  allowed?: string[];
  required?: string[];
  forbidden?: string[];
}

interface MarkdownValidation {
  headings?: ValidationSpec;
  metadata?: ValidationSpec;
}

interface RuleFrontmatter {
  markdown?: MarkdownValidation;
  [key: string]: unknown;
}

interface RuleFile {
  path: string;
  filename: string;
  frontmatter: RuleFrontmatter;
}

/**
 * Find all rule files in .claude/rules directory
 */
async function findRuleFiles(cwd: string): Promise<RuleFile[]> {
  const rulesDir = path.join(cwd, '.claude', 'rules');

  try {
    const entries = await fs.readdir(rulesDir, { withFileTypes: true });
    const ruleFiles: RuleFile[] = [];

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const rulePath = path.join(rulesDir, entry.name);
        const content = await fs.readFile(rulePath, 'utf-8');
        const { data } = matter(content);

        ruleFiles.push({
          path: rulePath,
          filename: entry.name,
          frontmatter: data as RuleFrontmatter,
        });
      }
    }

    return ruleFiles;
  } catch {
    // .claude/rules directory doesn't exist or can't be read
    return [];
  }
}

/**
 * Extract markdown headings from content
 * Returns array of heading strings (e.g., ["# Title", "## Section"])
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
 * Check if a string matches a gitignore-style pattern
 * Supports:
 * - Exact match: "## Overview"
 * - Wildcard: "*" matches anything, "##*" matches "## Foo", "### Bar"
 * - Question mark: "?" matches single character
 */
function matchesGitignorePattern(value: string, pattern: string): boolean {
  // Exact match
  if (value === pattern) {
    return true;
  }

  // Convert gitignore pattern to regex
  // Escape regex special chars except * and ?
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(value);
}

/**
 * Validate items against specification with allowed/required/forbidden patterns
 */
function validateAgainstSpec(
  items: string[],
  spec: ValidationSpec,
  itemType: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required items
  if (spec.required) {
    for (const requiredPattern of spec.required) {
      const found = items.some(item => matchesGitignorePattern(item, requiredPattern));
      if (!found) {
        errors.push(`Required ${itemType} missing: "${requiredPattern}"`);
      }
    }
  }

  // Check forbidden items
  if (spec.forbidden) {
    for (const forbiddenPattern of spec.forbidden) {
      const found = items.filter(item => matchesGitignorePattern(item, forbiddenPattern));
      if (found.length > 0) {
        errors.push(`Forbidden ${itemType} found: ${found.map(f => `"${f}"`).join(', ')} (matches pattern "${forbiddenPattern}")`);
      }
    }
  }

  // Check allowed items (if specified, items must match at least one allowed pattern)
  if (spec.allowed && spec.allowed.length > 0) {
    for (const item of items) {
      const isAllowed = spec.allowed.some(pattern => matchesGitignorePattern(item, pattern));
      if (!isAllowed) {
        errors.push(`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} "${item}" is not in the allowed list`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * PreToolUse hook handler for enforcing markdown heading structure
 *
 * Validates markdown headings in .md files referenced in .claude/rules
 * against frontmatter heading specifications.
 *
 * @param input - PreToolUse hook input from Claude Code
 * @returns Hook output with permission decision (deny if validation fails)
 */
async function handler(
  input: PreToolUseInput
): Promise<PreToolUseHookOutput> {
  // Only run for Write and Edit operations
  if (input.tool_name !== 'Write' && input.tool_name !== 'Edit') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  const logger = createDebugLogger(input.cwd, 'enforce-markdown-rules', true);

  try {
    await logger.logInput({
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
    });

    // Get the file path and content from tool input
    const toolInput = input.tool_input as {
      file_path?: string;
      content?: string;
      old_string?: string;
      new_string?: string;
    };
    const filePath = toolInput.file_path;

    // For Write operations, use content directly
    // For Edit operations, read current file and apply the edit
    let content: string | undefined;

    if (input.tool_name === 'Write') {
      content = toolInput.content;
    } else if (input.tool_name === 'Edit') {
      // For Edit, read the current file and apply the replacement
      if (!filePath || !toolInput.old_string || !toolInput.new_string) {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
          },
        };
      }

      try {
        const currentContent = await fs.readFile(path.resolve(input.cwd, filePath), 'utf-8');
        // Apply the edit by replacing old_string with new_string
        content = currentContent.replace(toolInput.old_string, toolInput.new_string);
      } catch {
        // If file doesn't exist or can't be read, allow the operation
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
          },
        };
      }
    }

    if (!filePath || !content) {
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

    // Check if this is a file in .claude/rules
    const normalizedPath = path.normalize(filePath);
    const isRuleFile = normalizedPath.includes(path.join('.claude', 'rules'));

    if (!isRuleFile) {
      await logger.logOutput({ message: 'Not a rule file, skipping' });
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };
    }

    // Find the corresponding rule file
    const ruleFiles = await findRuleFiles(input.cwd);
    const filename = path.basename(filePath);
    const matchingRule = ruleFiles.find(r => r.filename === filename);

    if (!matchingRule || !matchingRule.frontmatter.markdown) {
      await logger.logOutput({ message: 'No markdown validation spec found for this rule' });
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };
    }

    const markdownSpec = matchingRule.frontmatter.markdown;
    const allErrors: string[] = [];

    // Validate headings if specified
    if (markdownSpec.headings) {
      const headings = extractHeadings(content);
      await logger.logOutput({ headings });

      const headingValidation = validateAgainstSpec(headings, markdownSpec.headings, 'heading');
      if (!headingValidation.valid) {
        allErrors.push(...headingValidation.errors);
      }
    }

    // Validate metadata if specified
    if (markdownSpec.metadata) {
      const { data: metadata } = matter(content);
      const metadataKeys = Object.keys(metadata);
      await logger.logOutput({ metadataKeys });

      const metadataValidation = validateAgainstSpec(metadataKeys, markdownSpec.metadata, 'metadata field');
      if (!metadataValidation.valid) {
        allErrors.push(...metadataValidation.errors);
      }
    }

    if (allErrors.length > 0) {
      const errorMessage = allErrors.join('\n');

      await logger.logOutput({
        valid: false,
        errors: allErrors,
      });

      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Markdown validation failed for ${filename}:\n\n${errorMessage}\n\nPlease ensure all required items are present, no forbidden items exist, and all items match allowed patterns.`,
        },
      };
    }

    await logger.logOutput({ valid: true });

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
      systemMessage: `Heading validation hook failed: ${(error as Error).message || 'Unknown error'}`,
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
