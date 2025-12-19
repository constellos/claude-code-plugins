#!/usr/bin/env npx tsx
/**
 * PostToolUse Hook - Run Rule Checks
 *
 * This hook fires after Write and Edit operations to execute custom checks
 * defined in rule file frontmatter. If a file matches a rule pattern and that
 * rule defines checks, those checks are executed.
 *
 * @module hooks/run-rule-checks
 */

import type { PostToolUseInput, PostToolUseHookOutput } from '../types/types.js';
import { createDebugLogger } from './utils/debug.js';
import { runHook } from './utils/io.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import matter from 'gray-matter';

const DEBUG = process.env.DEBUG === '*' || process.env.DEBUG?.includes('run-rule-checks');

interface RuleFrontmatter {
  checks?: string[];
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
        try {
          const content = await fs.readFile(rulePath, 'utf-8');
          const { data } = matter(content);

          ruleFiles.push({
            path: rulePath,
            filename: entry.name,
            frontmatter: data as RuleFrontmatter,
          });
        } catch {
          // Skip files that can't be read or parsed
          continue;
        }
      }
    }

    return ruleFiles;
  } catch {
    // .claude/rules directory doesn't exist or can't be read
    return [];
  }
}

/**
 * Check if a file path matches a rule pattern
 * Currently uses simple substring matching of the rule name (without .md)
 */
function fileMatchesRule(filePath: string, ruleFilename: string): boolean {
  const rulePattern = ruleFilename.replace(/\.md$/, '');
  return filePath.includes(rulePattern);
}

/**
 * Execute a check command
 */
function executeCheck(command: string, cwd: string, timeout: number = 60000): {
  success: boolean;
  output: string;
} {
  try {
    const output = execSync(command, {
      cwd,
      encoding: 'utf-8',
      timeout,
      stdio: 'pipe',
    });
    return { success: true, output };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      success: false,
      output: err.stdout || err.stderr || err.message || 'Unknown error',
    };
  }
}

/**
 * PostToolUse hook handler for running rule checks
 */
async function handler(input: PostToolUseInput): Promise<PostToolUseHookOutput> {
  // Only run for Write and Edit operations
  if (input.tool_name !== 'Write' && input.tool_name !== 'Edit') {
    return {};
  }

  const logger = createDebugLogger(input.cwd, 'run-rule-checks', DEBUG || false);

  try {
    await logger.logInput({
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
    });

    const toolInput = input.tool_input as {
      file_path?: string;
    };

    const filePath = toolInput.file_path;
    if (!filePath) {
      return {};
    }

    // Find all rules
    const ruleFiles = await findRuleFiles(input.cwd);
    if (ruleFiles.length === 0) {
      await logger.logOutput({ message: 'No rule files found' });
      return {};
    }

    // Find matching rules that have checks
    const matchingRules = ruleFiles.filter(
      rule => rule.frontmatter.checks &&
              rule.frontmatter.checks.length > 0 &&
              fileMatchesRule(filePath, rule.filename)
    );

    if (matchingRules.length === 0) {
      await logger.logOutput({ message: 'No matching rules with checks found' });
      return {};
    }

    await logger.logOutput({
      matchingRules: matchingRules.map(r => r.filename),
    });

    // Execute checks from all matching rules
    const allCheckResults: Array<{
      rule: string;
      check: string;
      success: boolean;
      output: string;
    }> = [];

    for (const rule of matchingRules) {
      if (!rule.frontmatter.checks) continue;

      for (const check of rule.frontmatter.checks) {
        const result = executeCheck(check, input.cwd);
        allCheckResults.push({
          rule: rule.filename,
          check,
          success: result.success,
          output: result.output,
        });
      }
    }

    // Check if any checks failed
    const failedChecks = allCheckResults.filter(r => !r.success);

    if (failedChecks.length > 0) {
      const errorMessages = failedChecks.map(
        r => `Check "${r.check}" (from ${r.rule}) failed:\n${r.output}`
      );

      await logger.logOutput({
        allChecks: allCheckResults.length,
        failedChecks: failedChecks.length,
        errors: errorMessages,
      });

      return {
        decision: 'block',
        reason: `Rule checks failed for ${path.basename(filePath)}:\n\n${errorMessages.join('\n\n')}\n\nPlease fix these issues.`,
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `Rule checks failed for ${path.basename(filePath)}`,
        },
      };
    }

    await logger.logOutput({
      allChecks: allCheckResults.length,
      allPassed: true,
    });

    return {};

  } catch (error: unknown) {
    await logger.logError(error as Error);

    // On error, don't block but log a system message
    return {
      systemMessage: `Rule checks hook failed: ${(error as Error).message || 'Unknown error'}`,
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
