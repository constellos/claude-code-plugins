/**
 * PostToolUse Hook - Run Rule Checks
 *
 * This hook fires after Write/Edit operations to run custom checks defined
 * in rule frontmatter. Rules can specify executable commands in the `checks:`
 * array that validate the modified files.
 *
 * @module hooks/run-rule-checks
 */

import type { PostToolUseInput, PostToolUseHookOutput } from '../types/types.js';
import { createDebugLogger } from './utils/debug.js';
import { runHook } from './utils/io.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';

const execAsync = promisify(exec);

interface RuleFrontmatter {
  checks?: string[];
  [key: string]: unknown;
}

interface RuleFile {
  path: string;
  pattern: string;
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

        // Use filename without .md as the pattern (can be enhanced later)
        const pattern = entry.name.replace(/\.md$/, '');

        ruleFiles.push({
          path: rulePath,
          pattern,
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
 * Simple glob-style pattern matching
 * Supports * as wildcard for any characters
 */
function matchesPattern(filePath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath) || filePath.includes(pattern);
}

/**
 * Find rules that match the given file path
 */
function findMatchingRules(filePath: string, rules: RuleFile[]): RuleFile[] {
  return rules.filter(rule => matchesPattern(filePath, rule.pattern));
}

/**
 * PostToolUse hook handler for running rule checks
 *
 * Finds rules that match the edited file, extracts checks from frontmatter,
 * and executes each check command. Returns blocking decision on failure.
 *
 * @param input - PostToolUse hook input from Claude Code
 * @returns Hook output with check failures as blocking decision if found
 */
async function handler(
  input: PostToolUseInput
): Promise<PostToolUseHookOutput> {
  // Only run for Write and Edit operations
  if (input.tool_name !== 'Write' && input.tool_name !== 'Edit') {
    return {};
  }

  const logger = createDebugLogger(input.cwd, 'run-rule-checks', true);

  try {
    await logger.logInput({
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
    });

    // Get the file path from tool input
    const toolInput = input.tool_input as { file_path?: string };
    const filePath = toolInput.file_path;

    if (!filePath) {
      return {};
    }

    // Find all rule files
    const ruleFiles = await findRuleFiles(input.cwd);
    if (ruleFiles.length === 0) {
      await logger.logOutput({ success: true, message: 'No rule files found' });
      return {};
    }

    // Find matching rules for this file
    const matchingRules = findMatchingRules(filePath, ruleFiles);
    if (matchingRules.length === 0) {
      await logger.logOutput({ success: true, message: 'No matching rules' });
      return {};
    }

    // Collect all checks from matching rules
    const checks: string[] = [];
    for (const rule of matchingRules) {
      if (rule.frontmatter.checks && Array.isArray(rule.frontmatter.checks)) {
        checks.push(...rule.frontmatter.checks);
      }
    }

    if (checks.length === 0) {
      await logger.logOutput({ success: true, message: 'No checks defined' });
      return {};
    }

    // Run each check
    const failures: string[] = [];

    for (const check of checks) {
      try {
        await logger.logOutput({ running_check: check });

        const result = await execAsync(check, {
          cwd: input.cwd,
          timeout: 60000, // 60 second timeout
        });

        await logger.logOutput({
          check,
          success: true,
          stdout: result.stdout,
          stderr: result.stderr,
        });
      } catch (error: unknown) {
        const err = error as { stdout?: string; stderr?: string; message?: string };
        const output = err.stdout || err.stderr || err.message || 'Unknown error';

        failures.push(`Check "${check}" failed:\n${output}`);

        await logger.logOutput({
          check,
          success: false,
          error: output,
        });
      }
    }

    // If any checks failed, return blocking decision
    if (failures.length > 0) {
      const failureMessage = failures.join('\n\n');

      return {
        decision: 'block',
        reason: 'Rule checks failed',
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `Rule checks failed for ${filePath}:\n\n${failureMessage}\n\nPlease fix these issues.`,
        },
      };
    }

    await logger.logOutput({ success: true, checks_passed: checks.length });
    return {};

  } catch (error: unknown) {
    await logger.logError(error as Error);

    return {
      systemMessage: `Rule checks hook failed: ${(error as Error).message || 'Unknown error'}`,
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
