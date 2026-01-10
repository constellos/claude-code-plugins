/**
 * Native GitHub Sub-Issues API utility
 *
 * Provides functions for working with GitHub's native sub-issues feature (GA 2025).
 * This creates proper parent-child relationships in GitHub's UI and Projects.
 *
 * API Endpoints:
 * - POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues - Add sub-issue
 * - GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues - List sub-issues
 * - DELETE /repos/{owner}/{repo}/issues/{issue_number}/sub_issues/{sub_issue_id} - Remove
 *
 * Requirements:
 * - GitHub sub-issues feature must be enabled for the repository
 * - Requires at least triage permissions
 * - gh CLI must be authenticated
 *
 * @module native-subissues
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Sub-issue information from GitHub API
 */
export interface NativeSubissueInfo {
  /** Issue ID (internal GitHub ID) */
  id: number;
  /** Issue number (display number) */
  number: number;
  /** Issue title */
  title: string;
  /** Issue state */
  state: 'open' | 'closed';
  /** Issue URL */
  url: string;
}

/**
 * Result of a native sub-issues API call
 */
export interface NativeSubissueResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Execute a shell command
 */
async function execCommand(
  command: string,
  cwd: string
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd, timeout: 30000 });
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
 * Check if native sub-issues API is available for the current repository
 *
 * Tests by making a GET request to the sub-issues endpoint.
 * Returns true if the API responds (even with empty list), false on error.
 *
 * @param cwd - Current working directory (git repo)
 * @returns Whether native sub-issues are available
 */
export async function isNativeSubissuesAvailable(cwd: string): Promise<boolean> {
  // Get a recent issue number to test with
  const listResult = await execCommand('gh issue list --limit 1 --json number -q ".[0].number"', cwd);

  if (!listResult.success || !listResult.stdout) {
    // No issues in repo, try creating a test call anyway
    // Use issue 1 as a test - if API is available it will return empty or error gracefully
    const testResult = await execCommand('gh api repos/{owner}/{repo}/issues/1/sub_issues 2>&1', cwd);
    // If we get a 404 for the issue, the API is available but issue doesn't exist
    // If we get a different error about sub-issues not being enabled, it's not available
    return !testResult.stderr.includes('sub_issues') || testResult.success;
  }

  const issueNumber = listResult.stdout;
  const result = await execCommand(`gh api repos/{owner}/{repo}/issues/${issueNumber}/sub_issues`, cwd);

  // API is available if the call succeeds (even with empty array)
  return result.success;
}

/**
 * Add an issue as a sub-issue of a parent issue using GitHub's native API
 *
 * This creates a proper parent-child relationship that appears in GitHub's UI.
 *
 * @param cwd - Current working directory (git repo)
 * @param parentIssue - Parent issue number
 * @param subissueNumber - Issue number to add as sub-issue
 * @returns Result with success status
 *
 * @example
 * const result = await addNativeSubissue(cwd, 42, 43);
 * if (result.success) {
 *   console.log('Sub-issue #43 linked to parent #42');
 * }
 */
export async function addNativeSubissue(
  cwd: string,
  parentIssue: number,
  subissueNumber: number
): Promise<NativeSubissueResult> {
  // GitHub API requires the sub_issue_id (internal ID), not the issue number
  // First, get the internal ID for the subissue
  const issueResult = await execCommand(
    `gh api repos/{owner}/{repo}/issues/${subissueNumber} --jq '.id'`,
    cwd
  );

  if (!issueResult.success) {
    return {
      success: false,
      error: `Failed to get issue ID: ${issueResult.stderr}`,
    };
  }

  const subissueId = issueResult.stdout;

  // Add as sub-issue using the internal ID (must be sent as integer in JSON)
  const result = await execCommand(
    `gh api repos/{owner}/{repo}/issues/${parentIssue}/sub_issues -X POST --input - <<< '{"sub_issue_id": ${subissueId}}'`,
    cwd
  );

  if (!result.success) {
    // Check for common errors
    if (result.stderr.includes('already exists')) {
      // Already linked - consider this a success
      return { success: true };
    }
    if (result.stderr.includes('Not Found') || result.stderr.includes('404')) {
      return {
        success: false,
        error: 'Native sub-issues not available for this repository',
      };
    }
    return {
      success: false,
      error: result.stderr || 'Failed to add sub-issue',
    };
  }

  return { success: true };
}

/**
 * List all sub-issues of a parent issue using GitHub's native API
 *
 * @param cwd - Current working directory (git repo)
 * @param parentIssue - Parent issue number
 * @returns Array of sub-issue information
 *
 * @example
 * const subissues = await listNativeSubissues(cwd, 42);
 * for (const sub of subissues) {
 *   console.log(`#${sub.number}: ${sub.title} (${sub.state})`);
 * }
 */
export async function listNativeSubissues(
  cwd: string,
  parentIssue: number
): Promise<NativeSubissueInfo[]> {
  const result = await execCommand(
    `gh api repos/{owner}/{repo}/issues/${parentIssue}/sub_issues --jq '.[] | {id: .id, number: .number, title: .title, state: .state, url: .html_url}'`,
    cwd
  );

  if (!result.success || !result.stdout) {
    return [];
  }

  try {
    // Parse JSONL output (one object per line)
    const lines = result.stdout.split('\n').filter(Boolean);
    return lines.map((line) => {
      const data = JSON.parse(line);
      return {
        id: data.id,
        number: data.number,
        title: data.title,
        state: data.state.toLowerCase() as 'open' | 'closed',
        url: data.url,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Remove a sub-issue from a parent issue using GitHub's native API
 *
 * This removes the parent-child relationship but does not close the issue.
 *
 * @param cwd - Current working directory (git repo)
 * @param parentIssue - Parent issue number
 * @param subissueNumber - Issue number to remove as sub-issue
 * @returns Result with success status
 */
export async function removeNativeSubissue(
  cwd: string,
  parentIssue: number,
  subissueNumber: number
): Promise<NativeSubissueResult> {
  // Get the internal ID for the subissue
  const issueResult = await execCommand(
    `gh api repos/{owner}/{repo}/issues/${subissueNumber} --jq '.id'`,
    cwd
  );

  if (!issueResult.success) {
    return {
      success: false,
      error: `Failed to get issue ID: ${issueResult.stderr}`,
    };
  }

  const subissueId = issueResult.stdout;

  const result = await execCommand(
    `gh api repos/{owner}/{repo}/issues/${parentIssue}/sub_issues/${subissueId} -X DELETE`,
    cwd
  );

  if (!result.success) {
    if (result.stderr.includes('Not Found') || result.stderr.includes('404')) {
      // Already removed or never was a sub-issue - consider success
      return { success: true };
    }
    return {
      success: false,
      error: result.stderr || 'Failed to remove sub-issue',
    };
  }

  return { success: true };
}

/**
 * Get the parent issue of a sub-issue using GitHub's native API
 *
 * @param cwd - Current working directory (git repo)
 * @param subissueNumber - Issue number to check
 * @returns Parent issue number, or null if not a sub-issue
 */
export async function getParentIssue(
  cwd: string,
  subissueNumber: number
): Promise<number | null> {
  const result = await execCommand(
    `gh api repos/{owner}/{repo}/issues/${subissueNumber}/parent --jq '.number'`,
    cwd
  );

  if (!result.success || !result.stdout) {
    return null;
  }

  const parentNumber = parseInt(result.stdout, 10);
  return isNaN(parentNumber) ? null : parentNumber;
}
