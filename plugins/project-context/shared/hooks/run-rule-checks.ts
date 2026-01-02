/**
 * Rule-based check runner for PostToolUse[Write|Edit] hooks
 *
 * Runs checks defined in `.claude/rules/*.md` file frontmatter.
 * Checks are blocking - if any check fails, the edit is blocked.
 *
 * Frontmatter format:
 * ```yaml
 * ---
 * globs: ["**\/*.ts", "**\/*.tsx", "!**\/*.test.ts"]
 * checks:
 *   - lint
 *   - typecheck
 *   - vitest
 * ---
 * ```
 *
 * @module run-rule-checks
 */

import type { PostToolUseInput, PostToolUseHookOutput } from '../types/types.js';
import { runHook } from './utils/io.js';
import { parseFrontmatter } from './utils/frontmatter.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';

const execAsync = promisify(exec);

/** Maximum characters for check output to prevent context bloat */
const MAX_OUTPUT_CHARS = 500;

/** Timeout for each check in milliseconds (30 seconds) */
const CHECK_TIMEOUT_MS = 30000;

/** Supported check types and their commands */
const CHECK_COMMANDS: Record<string, (filePath: string) => string> = {
  lint: (filePath) => `npx eslint "${filePath}"`,
  typecheck: (filePath) => `npx tsc --noEmit "${filePath}"`,
  vitest: (filePath) => `npx vitest run "${filePath}" --reporter=verbose`,
};

/**
 * Check result from running a single check
 */
interface CheckResult {
  check: string;
  passed: boolean;
  output: string;
}

/**
 * Rule definition parsed from frontmatter
 */
interface RuleDefinition {
  filePath: string;
  globs: string[];
  checks: string[];
}

/**
 * Simple glob pattern matcher
 *
 * Supports:
 * - `*` matches any characters except /
 * - `**` matches any characters including /
 * - `!` prefix for negation patterns
 *
 * @param pattern - Glob pattern to match
 * @param filePath - File path to test
 * @returns True if pattern matches (or doesn't match for negation)
 */
function matchGlob(pattern: string, filePath: string): boolean {
  // Handle negation patterns
  if (pattern.startsWith('!')) {
    return !matchGlob(pattern.slice(1), filePath);
  }

  // Convert glob to regex
  const regexPattern = pattern
    // Escape special regex characters except * and ?
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // Convert ** to match anything including /
    .replace(/\*\*/g, '.*')
    // Convert * to match anything except /
    .replace(/\*/g, '[^/]*')
    // Convert ? to match single character
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

/**
 * Check if a file path matches any of the glob patterns
 *
 * Processes patterns in order - positive patterns include, negative exclude.
 *
 * @param filePath - File path to check
 * @param patterns - Array of glob patterns
 * @returns True if file matches the patterns
 */
function matchesPatterns(filePath: string, patterns: string[]): boolean {
  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, '/');

  let matched = false;

  for (const pattern of patterns) {
    if (pattern.startsWith('!')) {
      // Negation pattern - if it matches, exclude
      if (matchGlob(pattern.slice(1), normalizedPath)) {
        matched = false;
      }
    } else {
      // Positive pattern - if it matches, include
      if (matchGlob(pattern, normalizedPath)) {
        matched = true;
      }
    }
  }

  return matched;
}

/**
 * Load all rule files from .claude/rules/ directory
 *
 * @param cwd - Current working directory
 * @returns Array of parsed rule definitions
 */
async function loadRules(cwd: string): Promise<RuleDefinition[]> {
  const rulesDir = join(cwd, '.claude', 'rules');
  const rules: RuleDefinition[] = [];

  try {
    const files = await readdir(rulesDir);

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const filePath = join(rulesDir, file);
      const content = await readFile(filePath, 'utf-8');
      const { data } = parseFrontmatter(content);

      // Extract globs and checks from frontmatter
      const globs = Array.isArray(data.globs) ? (data.globs as string[]) : [];
      const checks = Array.isArray(data.checks) ? (data.checks as string[]) : [];

      // Only include rules that have both globs and checks
      if (globs.length > 0 && checks.length > 0) {
        rules.push({ filePath, globs, checks });
      }
    }
  } catch {
    // No rules directory or can't read it - that's fine
  }

  return rules;
}

/**
 * Run a single check on a file
 *
 * @param check - Check type to run (lint, typecheck, vitest)
 * @param filePath - Absolute path to file to check
 * @param cwd - Current working directory
 * @returns Check result with pass/fail and output
 */
async function runCheck(check: string, filePath: string, cwd: string): Promise<CheckResult> {
  const commandFn = CHECK_COMMANDS[check];

  if (!commandFn) {
    return {
      check,
      passed: true,
      output: `Unknown check type: ${check}`,
    };
  }

  const command = commandFn(filePath);

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: CHECK_TIMEOUT_MS,
    });

    // Check passed
    return {
      check,
      passed: true,
      output: truncateOutput(stdout || stderr || 'Check passed'),
    };
  } catch (error) {
    // Check failed
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const output = err.stdout || err.stderr || err.message || 'Check failed';

    return {
      check,
      passed: false,
      output: truncateOutput(output),
    };
  }
}

/**
 * Truncate output to MAX_OUTPUT_CHARS
 *
 * @param output - Output string to truncate
 * @returns Truncated string with indicator if truncated
 */
function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) {
    return output;
  }

  const truncated = output.slice(0, MAX_OUTPUT_CHARS);
  const remaining = output.length - MAX_OUTPUT_CHARS;
  return `${truncated}\n... (${remaining} more chars truncated)`;
}

/**
 * PostToolUse[Write|Edit] hook handler
 *
 * Runs checks defined in matching rule files for the edited file.
 * Blocks if any check fails.
 *
 * @param input - PostToolUse hook input
 * @returns Hook output with blocking decision if checks fail
 */
async function handler(input: PostToolUseInput): Promise<PostToolUseHookOutput> {
  // Only process Write and Edit tools
  if (input.tool_name !== 'Write' && input.tool_name !== 'Edit') {
    return {};
  }

  // Get file path from tool input
  const toolInput = input.tool_input as { file_path?: string };
  const filePath = toolInput?.file_path;

  if (!filePath) {
    return {};
  }

  // Get relative path for glob matching
  const relativePath = relative(input.cwd, filePath).replace(/\\/g, '/');

  // Load all rules
  const rules = await loadRules(input.cwd);

  // Find all checks that apply to this file
  const checksToRun = new Set<string>();

  for (const rule of rules) {
    if (matchesPatterns(relativePath, rule.globs)) {
      for (const check of rule.checks) {
        checksToRun.add(check);
      }
    }
  }

  // If no checks apply, allow the edit
  if (checksToRun.size === 0) {
    return {};
  }

  // Run all applicable checks
  const results: CheckResult[] = [];

  for (const check of checksToRun) {
    const result = await runCheck(check, filePath, input.cwd);
    results.push(result);
  }

  // Check if any failed
  const failedResults = results.filter((r) => !r.passed);

  if (failedResults.length === 0) {
    // All checks passed
    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `✓ Checks passed: ${[...checksToRun].join(', ')}`,
      },
    };
  }

  // Format failure message
  const failureMessages = failedResults
    .map((r) => `**${r.check}**:\n${r.output}`)
    .join('\n\n');

  // Block the edit with actionable feedback
  return {
    decision: 'block',
    reason: `Fix these errors before continuing:\n\n${failureMessages}`,
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `❌ Checks failed: ${failedResults.map((r) => r.check).join(', ')}\n\n${failureMessages}`,
    },
  };
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
