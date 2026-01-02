/**
 * Shared CI status utilities for GitHub CI integration
 *
 * Provides common functions for checking CI status, waiting for checks,
 * extracting preview URLs, and formatting results. Used by:
 * - commit-task-await-ci-status.ts (SubagentStop)
 * - await-pr-status.ts (PostToolUse[Bash])
 * - commit-session-await-ci-status.ts (Stop)
 *
 * @module ci-status
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** Maximum output characters for CI status (prevents context bloat) */
const MAX_OUTPUT_CHARS = 500;

/** Default CI check timeout in milliseconds (10 minutes) */
const DEFAULT_TIMEOUT_MS = 600000;

/**
 * Result from a CI check operation
 */
export interface CICheckResult {
  /** Whether all CI checks passed */
  success: boolean;
  /** Combined output from CI checks */
  output: string;
  /** Error message if operation failed */
  error?: string;
}

/**
 * CI run details from GitHub
 */
export interface CIRunDetails {
  /** CI workflow URL */
  url?: string;
  /** CI status (queued, in_progress, completed) */
  status?: string;
  /** CI conclusion (success, failure, cancelled) */
  conclusion?: string;
  /** Workflow name */
  name?: string;
}

/**
 * Individual check status
 */
export interface CheckStatus {
  /** Check name */
  name: string;
  /** Check status emoji */
  emoji: string;
  /** Check status (success, failure, pending) */
  status: string;
  /** Details URL */
  url?: string;
}

/**
 * PR existence check result
 */
export interface PRCheckResult {
  /** Whether PR exists */
  exists: boolean;
  /** PR number if exists */
  prNumber?: number;
  /** PR URL if exists */
  prUrl?: string;
  /** Error message if check failed */
  error?: string;
}

/**
 * Preview URLs extracted from PR
 */
export interface PreviewUrls {
  /** Web app preview URL */
  webUrl?: string;
  /** Marketing app preview URL */
  marketingUrl?: string;
  /** All preview URLs found */
  allUrls: string[];
}

/**
 * Execute a shell command with timeout
 *
 * @param command - Command to execute
 * @param cwd - Working directory
 * @param timeout - Timeout in milliseconds (default: 30s)
 * @returns Command result with success flag and output
 *
 * @example
 * ```typescript
 * const result = await execCommand('gh pr list', '/path/to/repo');
 * if (result.success) {
 *   console.log(result.stdout);
 * }
 * ```
 */
export async function execCommand(
  command: string,
  cwd: string,
  timeout = 30000
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd, timeout });
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      success: false,
      stdout: err.stdout?.trim() || '',
      stderr: err.stderr?.trim() || err.message || '',
    };
  }
}

/**
 * Check if a PR exists for the given branch
 *
 * @param branch - Branch name to check
 * @param cwd - Working directory
 * @returns PR check result with number and URL if exists
 *
 * @example
 * ```typescript
 * const prCheck = await checkPRExists('feature-branch', '/path/to/repo');
 * if (prCheck.exists) {
 *   console.log(`PR #${prCheck.prNumber}: ${prCheck.prUrl}`);
 * }
 * ```
 */
export async function checkPRExists(
  branch: string,
  cwd: string
): Promise<PRCheckResult> {
  // Check if gh CLI is available
  const ghCheck = await execCommand('gh --version', cwd);
  if (!ghCheck.success) {
    return { exists: false, error: 'GitHub CLI not installed' };
  }

  // Check if gh is authenticated
  const authCheck = await execCommand('gh auth status', cwd);
  if (!authCheck.success) {
    return { exists: false, error: 'GitHub CLI not authenticated' };
  }

  // List PRs for current branch
  const prListResult = await execCommand(
    `gh pr list --head ${branch} --json number,url --limit 1`,
    cwd
  );

  if (!prListResult.success) {
    return { exists: false, error: `gh pr list failed: ${prListResult.stderr}` };
  }

  try {
    const prs = JSON.parse(prListResult.stdout);
    if (Array.isArray(prs) && prs.length > 0) {
      return {
        exists: true,
        prNumber: prs[0].number,
        prUrl: prs[0].url,
      };
    }
    return { exists: false };
  } catch {
    return { exists: false, error: 'Failed to parse gh output' };
  }
}

/**
 * Get PR number for the current branch
 *
 * @param cwd - Working directory
 * @returns PR number or null if no PR exists
 *
 * @example
 * ```typescript
 * const prNumber = await getPRForCurrentBranch('/path/to/repo');
 * if (prNumber) {
 *   const ciResult = await waitForCIChecks({ prNumber, cwd });
 * }
 * ```
 */
export async function getPRForCurrentBranch(cwd: string): Promise<number | null> {
  const branchResult = await execCommand('git rev-parse --abbrev-ref HEAD', cwd);
  if (!branchResult.success) {
    return null;
  }

  const prCheck = await checkPRExists(branchResult.stdout, cwd);
  return prCheck.exists ? (prCheck.prNumber ?? null) : null;
}

/**
 * Wait for CI checks to complete on a PR
 *
 * Uses `gh pr checks --watch` to wait for all CI checks to finish.
 * Blocks until all checks complete or timeout is reached.
 *
 * @param options - Wait options
 * @param options.prNumber - PR number to check (required if no commitSha)
 * @param options.commitSha - Commit SHA to check (alternative to prNumber)
 * @param options.timeout - Timeout in milliseconds (default: 10 minutes)
 * @param cwd - Working directory
 * @returns CI check result with success status and output
 *
 * @example
 * ```typescript
 * const result = await waitForCIChecks({ prNumber: 123 }, '/path/to/repo');
 * if (result.success) {
 *   console.log('All CI checks passed!');
 * } else {
 *   console.log('CI failed:', result.output);
 * }
 * ```
 */
export async function waitForCIChecks(
  options: {
    prNumber?: number;
    commitSha?: string;
    timeout?: number;
  },
  cwd: string
): Promise<CICheckResult> {
  const { prNumber, commitSha, timeout = DEFAULT_TIMEOUT_MS } = options;

  if (!prNumber && !commitSha) {
    return { success: false, output: '', error: 'Either prNumber or commitSha required' };
  }

  try {
    // Build command based on what we have
    const target = prNumber ? prNumber.toString() : commitSha!;
    const command = `gh pr checks ${target} --watch`;

    const { stdout, stderr } = await execAsync(command, { cwd, timeout });
    const combinedOutput = `${stdout}\n${stderr}`.trim();

    // Check if all checks passed
    const hasFailures =
      combinedOutput.includes('fail') ||
      combinedOutput.includes('X ') ||
      combinedOutput.includes('cancelled');

    return {
      success: !hasFailures,
      output: combinedOutput,
    };
  } catch (error: unknown) {
    const err = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
      killed?: boolean;
    };
    const errorOutput = err.stdout || err.stderr || err.message || 'Unknown error';

    if (err.killed) {
      return {
        success: false,
        output: errorOutput,
        error: `CI check timeout (${Math.round(timeout / 60000)} minutes)`,
      };
    }

    return {
      success: false,
      output: errorOutput,
      error: 'Failed to watch CI checks',
    };
  }
}

/**
 * Get latest CI workflow run details
 *
 * @param prNumber - PR number
 * @param cwd - Working directory
 * @returns CI run details or null if not found
 *
 * @example
 * ```typescript
 * const ciRun = await getLatestCIRun(123, '/path/to/repo');
 * if (ciRun?.conclusion === 'success') {
 *   console.log('CI passed:', ciRun.url);
 * }
 * ```
 */
export async function getLatestCIRun(
  prNumber: number,
  cwd: string
): Promise<CIRunDetails | null> {
  const result = await execCommand(
    `gh run list --limit 1 --json databaseId,displayTitle,status,conclusion,url`,
    cwd
  );

  if (!result.success) {
    return null;
  }

  try {
    const runs = JSON.parse(result.stdout);
    if (Array.isArray(runs) && runs.length > 0) {
      const run = runs[0];
      return {
        url: run.url,
        status: run.status,
        conclusion: run.conclusion,
        name: run.displayTitle,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract Vercel preview URLs from PR comments
 *
 * Searches PR comments for Vercel bot URLs and categorizes them
 * by app type (web, marketing, etc).
 *
 * @param prNumber - PR number
 * @param cwd - Working directory
 * @returns Preview URLs object with categorized URLs
 *
 * @example
 * ```typescript
 * const urls = await extractPreviewUrls(123, '/path/to/repo');
 * if (urls.webUrl) {
 *   console.log('Web preview:', urls.webUrl);
 * }
 * ```
 */
export async function extractPreviewUrls(
  prNumber: number,
  cwd: string
): Promise<PreviewUrls> {
  const result = await execCommand(`gh pr view ${prNumber} --json comments`, cwd);

  if (!result.success) {
    return { allUrls: [] };
  }

  try {
    const data = JSON.parse(result.stdout);
    const comments = data.comments || [];

    const vercelUrlPattern = /https:\/\/[a-z0-9-]+\.vercel\.app/g;
    const allUrls: string[] = [];

    for (const comment of comments) {
      const matches = comment.body?.match(vercelUrlPattern) || [];
      allUrls.push(...matches);
    }

    // Deduplicate URLs
    const uniqueUrls = [...new Set(allUrls)];

    // Identify web and marketing apps by URL pattern
    const webUrl = uniqueUrls.find(
      (url) =>
        url.includes('-web-') || url.includes('web-') || url.match(/web\.vercel\.app/)
    );
    const marketingUrl = uniqueUrls.find(
      (url) =>
        url.includes('-marketing-') ||
        url.includes('marketing-') ||
        url.match(/marketing\.vercel\.app/)
    );

    return {
      webUrl,
      marketingUrl,
      allUrls: uniqueUrls,
    };
  } catch {
    return { allUrls: [] };
  }
}

/**
 * Parse CI checks output into structured format
 *
 * @param output - Raw output from `gh pr checks`
 * @returns Array of parsed check statuses
 *
 * @example
 * ```typescript
 * const checks = parseCIChecks(ciOutput);
 * for (const check of checks) {
 *   console.log(`${check.emoji} ${check.name}: ${check.status}`);
 * }
 * ```
 */
export function parseCIChecks(output: string): CheckStatus[] {
  const checks: CheckStatus[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Parse line format: "✓ check-name" or "X check-name" or "* check-name"
    let emoji = '⏳';
    let status = 'pending';

    if (trimmed.startsWith('✓') || trimmed.includes('pass')) {
      emoji = '✅';
      status = 'success';
    } else if (trimmed.startsWith('X') || trimmed.includes('fail')) {
      emoji = '❌';
      status = 'failure';
    } else if (trimmed.includes('cancel')) {
      emoji = '⚪';
      status = 'cancelled';
    }

    // Extract check name (remove status indicator)
    const name = trimmed.replace(/^[✓X*\s]+/, '').split('\t')[0].trim();

    if (name) {
      checks.push({ name, emoji, status });
    }
  }

  return checks;
}

/**
 * Format CI status result as concise string
 *
 * Truncates output to MAX_OUTPUT_CHARS to prevent context bloat.
 *
 * @param result - CI check result
 * @param maxChars - Maximum output characters (default: 500)
 * @returns Formatted status string
 *
 * @example
 * ```typescript
 * const ciResult = await waitForCIChecks({ prNumber: 123 }, cwd);
 * const formatted = formatCIStatus(ciResult);
 * console.log(formatted);
 * ```
 */
export function formatCIStatus(
  result: CICheckResult,
  maxChars: number = MAX_OUTPUT_CHARS
): string {
  let output = '';

  if (result.success) {
    output = '✅ All CI checks passed';
  } else if (result.error) {
    output = `⚠️ ${result.error}`;
  } else {
    output = '❌ CI checks failed';
  }

  // Add check details if available
  if (result.output) {
    const checks = parseCIChecks(result.output);
    if (checks.length > 0) {
      const checkLines = checks.map((c) => `${c.emoji} ${c.name}`).join('\n');
      output += `\n\n${checkLines}`;
    }
  }

  // Truncate if too long
  if (output.length > maxChars) {
    output = output.slice(0, maxChars - 20) + '\n... (truncated)';
  }

  return output;
}

/**
 * Format full CI status with PR info and preview URLs
 *
 * @param prNumber - PR number
 * @param prUrl - PR URL
 * @param ciResult - CI check result
 * @param ciRun - CI run details
 * @param previewUrls - Preview URLs
 * @param maxChars - Maximum output characters (default: 500)
 * @returns Formatted status string
 *
 * @example
 * ```typescript
 * const status = formatFullCIStatus(
 *   123, 'https://github.com/...', ciResult, ciRun, previewUrls
 * );
 * ```
 */
export function formatFullCIStatus(
  prNumber: number,
  prUrl: string,
  ciResult: CICheckResult,
  ciRun: CIRunDetails | null,
  previewUrls: PreviewUrls,
  maxChars: number = MAX_OUTPUT_CHARS
): string {
  let output = `**PR #${prNumber}**\n`;

  // CI status
  if (ciResult.success) {
    output += '✅ All CI checks passed\n';
  } else if (ciResult.error) {
    output += `⏱️ ${ciResult.error}\n`;
  } else {
    output += '❌ CI checks failed\n';
  }

  // CI run link
  if (ciRun?.url) {
    output += `🔗 [CI](${ciRun.url})\n`;
  }

  // Preview URLs
  if (previewUrls.allUrls.length > 0) {
    output += `🌐 ${previewUrls.allUrls[0]}`;
    if (previewUrls.allUrls.length > 1) {
      output += ` (+${previewUrls.allUrls.length - 1})`;
    }
    output += '\n';
  }

  // Truncate if too long
  if (output.length > maxChars) {
    output = output.slice(0, maxChars - 20) + '\n... (truncated)';
  }

  return output;
}
