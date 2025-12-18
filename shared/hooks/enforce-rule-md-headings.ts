/**
 * PreToolUse Hook - Enforce Rule Markdown Headings
 *
 * This hook fires before Write operations on .md files referenced in .claude/rules
 * to validate markdown heading structure against frontmatter specifications.
 *
 * Supports:
 * - Required headings (must be present)
 * - Optional headings (may be present)
 * - Repeating headings with min/max counts
 * - Wildcard patterns (prefix: "### Step *", suffix: "## * Notes")
 *
 * @module hooks/enforce-rule-md-headings
 */

import type { PreToolUseInput, PreToolUseHookOutput } from '../types/types.js';
import { createDebugLogger } from './utils/debug.js';
import { runHook } from './utils/io.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';

interface HeadingSpec {
  required?: string[];
  optional?: string[];
  repeating?: Array<{
    pattern: string;
    min?: number;
    max?: number;
  }>;
}

interface RuleFrontmatter {
  headings?: HeadingSpec;
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
 * Check if a heading matches a pattern with wildcard support
 * Supports:
 * - Exact match: "## Overview"
 * - Prefix wildcard: "### Step *" matches "### Step 1", "### Step Two"
 * - Suffix wildcard: "## * Notes" matches "## Important Notes", "## Notes"
 */
function matchesHeadingPattern(heading: string, pattern: string): boolean {
  // Exact match
  if (heading === pattern) {
    return true;
  }

  // Wildcard matching
  if (pattern.includes('*')) {
    // Convert pattern to regex
    // Escape regex special chars except *
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(heading);
  }

  return false;
}

/**
 * Validate heading structure against specification
 */
function validateHeadings(
  headings: string[],
  spec: HeadingSpec
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required headings
  if (spec.required) {
    for (const requiredPattern of spec.required) {
      const found = headings.some(h => matchesHeadingPattern(h, requiredPattern));
      if (!found) {
        errors.push(`Required heading missing: "${requiredPattern}"`);
      }
    }
  }

  // Optional headings don't need validation - they're optional
  // If present, they'll be counted in the headings array, but we don't enforce them

  // Check repeating headings
  if (spec.repeating) {
    for (const repeatSpec of spec.repeating) {
      const matchingHeadings = headings.filter(h =>
        matchesHeadingPattern(h, repeatSpec.pattern)
      );

      const count = matchingHeadings.length;
      const min = repeatSpec.min ?? 1;
      const max = repeatSpec.max ?? Infinity;

      if (count < min) {
        errors.push(
          `Repeating heading "${repeatSpec.pattern}" appears ${count} time(s), but requires at least ${min}`
        );
      }

      if (count > max) {
        errors.push(
          `Repeating heading "${repeatSpec.pattern}" appears ${count} time(s), but allows at most ${max}`
        );
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
  // Only run for Write operations
  if (input.tool_name !== 'Write') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  const logger = createDebugLogger(input.cwd, 'enforce-rule-md-headings', true);

  try {
    await logger.logInput({
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
    });

    // Get the file path and content from tool input
    const toolInput = input.tool_input as { file_path?: string; content?: string };
    const filePath = toolInput.file_path;
    const content = toolInput.content;

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

    if (!matchingRule || !matchingRule.frontmatter.headings) {
      await logger.logOutput({ message: 'No heading spec found for this rule' });
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };
    }

    // Extract headings from the content
    const headings = extractHeadings(content);
    await logger.logOutput({ headings });

    // Validate headings against spec
    const validation = validateHeadings(headings, matchingRule.frontmatter.headings);

    if (!validation.valid) {
      const errorMessage = validation.errors.join('\n');

      await logger.logOutput({
        valid: false,
        errors: validation.errors,
      });

      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Markdown heading validation failed for ${filename}:\n\n${errorMessage}\n\nPlease ensure all required headings are present and repeating headings meet min/max constraints.`,
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
