/**
 * Await PR checks after PR creation
 *
 * PostToolUse[Bash] hook that detects `gh pr create` commands and automatically
 * waits for CI checks to complete on the newly created PR.
 *
 * **What it does:**
 * - Detects when a PR is created via `gh pr create`
 * - Extracts PR number from the output URL
 * - Waits for all CI checks to complete (10-minute timeout)
 * - Reports CI status and preview URLs
 * - Blocks if CI fails, approves if CI passes
 *
 * **Non-blocking:** This hook is informational only and does not block execution.
 *
 * @module await-pr-checks
 */

import type {
  PostToolUseInput,
  PostToolUseHookOutput,
} from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import {
  saveOutputToLog,
  parseCiChecks,
  formatCiChecksTable,
} from '../../../shared/hooks/utils/log-file.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Execute a shell command
 *
 * @param command - Command to execute
 * @param cwd - Working directory
 * @returns Command result with success flag and output
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
 * Wait for CI checks to complete on a PR
 *
 * Uses `gh pr checks --watch` to wait for all CI checks to finish.
 *
 * @param prNumber - PR number
 * @param cwd - Working directory
 * @returns Object with success status and combined output
 */
async function waitForCIChecks(
  prNumber: number,
  cwd: string
): Promise<{
  success: boolean;
  output: string;
  error?: string;
}> {
  try {
    // Wait for CI checks to complete using gh pr checks --watch
    // Use a 10-minute timeout (600000ms) for CI to complete
    const { stdout: watchOutput, stderr: watchStderr } = await execAsync(
      `gh pr checks ${prNumber} --watch`,
      {
        cwd,
        timeout: 600000, // 10 minute timeout
      }
    );

    const combinedOutput = `${watchOutput}\n${watchStderr}`.trim();

    // Check if all checks passed
    const hasFailures = combinedOutput.includes('fail') ||
                        combinedOutput.includes('X ') ||
                        combinedOutput.includes('cancelled');

    return {
      success: !hasFailures,
      output: combinedOutput,
    };
  } catch (watchError: unknown) {
    const err = watchError as { stdout?: string; stderr?: string; message?: string; killed?: boolean };
    const errorOutput = err.stdout || err.stderr || err.message || 'Unknown error';

    // Check if timeout
    if (err.killed) {
      return {
        success: false,
        output: errorOutput,
        error: 'CI check timeout (10 minutes)',
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
 * Get latest CI run details for a PR
 *
 * @param prNumber - PR number
 * @param cwd - Working directory
 * @returns CI run details with status and URL
 */
async function getLatestCIRun(
  prNumber: number,
  cwd: string
): Promise<{
  status: string;
  url: string;
} | null> {
  const result = await execCommand(
    `gh pr view ${prNumber} --json statusCheckRollup`,
    cwd
  );

  if (!result.success) {
    return null;
  }

  try {
    const data = JSON.parse(result.stdout);
    const rollup = data.statusCheckRollup || [];

    if (rollup.length === 0) {
      return null;
    }

    // Get the most recent check
    const latestCheck = rollup[0];
    return {
      status: latestCheck.conclusion || latestCheck.status || 'unknown',
      url: latestCheck.detailsUrl || '',
    };
  } catch {
    return null;
  }
}

/**
 * Get Vercel preview URLs from PR comments
 *
 * @param prNumber - PR number
 * @param cwd - Working directory
 * @returns Array of Vercel preview URLs
 */
async function getVercelPreviewUrls(
  prNumber: number,
  cwd: string
): Promise<string[]> {
  const result = await execCommand(
    `gh pr view ${prNumber} --json comments`,
    cwd
  );

  if (!result.success) {
    return [];
  }

  try {
    const data = JSON.parse(result.stdout);
    const comments = data.comments || [];

    const vercelUrls: string[] = [];

    // Look for Vercel bot comments
    for (const comment of comments) {
      if (comment.author?.login === 'vercel[bot]') {
        // Extract URLs from comment body
        const urlMatches = comment.body.matchAll(/https:\/\/[^\s]+\.vercel\.app/g);
        for (const match of urlMatches) {
          vercelUrls.push(match[0]);
        }
      }
    }

    return vercelUrls;
  } catch {
    return [];
  }
}

/**
 * Extract PR number from gh pr create output
 *
 * @param output - Command output containing PR URL
 * @returns PR number or null
 */
function extractPRNumber(output: string): number | null {
  // Look for PR URL pattern: https://github.com/owner/repo/pull/123
  const match = output.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * PostToolUse hook handler for awaiting PR checks
 *
 * Detects `gh pr create` commands and waits for CI checks to complete.
 *
 * @param input - PostToolUse hook input from Claude Code
 * @returns Hook output with CI status as additional context
 */
async function handler(
  input: PostToolUseInput
): Promise<PostToolUseHookOutput> {
  // Only run for Bash tool
  if (input.tool_name !== 'Bash') {
    return {};
  }

  const logger = createDebugLogger(input.cwd, 'await-pr-checks', true);

  try {
    await logger.logInput({
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
    });

    // Get the bash command from tool input
    const toolInput = input.tool_input as { command?: string };
    const command = toolInput?.command || '';

    // Only run for gh pr create commands
    if (!command.includes('gh pr create') && !command.includes('gh pr')) {
      return {};
    }

    // Get the tool response to extract PR number
    const toolResponse = input.tool_response as { content?: Array<{ text?: string }> };
    const resultText = toolResponse?.content?.[0]?.text || '';

    // Extract PR number from output
    const prNumber = extractPRNumber(resultText);

    if (!prNumber) {
      await logger.logOutput({
        success: false,
        reason: 'Could not extract PR number from output',
      });
      return {};
    }

    await logger.logOutput({
      success: true,
      pr_number: prNumber,
      message: 'PR created, waiting for CI checks...',
    });

    // Wait for CI checks to complete
    const ciCheckResult = await waitForCIChecks(prNumber, input.cwd);

    // Get latest CI run details
    const ciRun = await getLatestCIRun(prNumber, input.cwd);

    // Get Vercel preview URLs
    const vercelUrls = await getVercelPreviewUrls(prNumber, input.cwd);

    // Save full CI output to log file if there's output
    let logPath: string | undefined;
    if (ciCheckResult.output) {
      logPath = await saveOutputToLog(input.cwd, 'ci', `pr-${prNumber}`, ciCheckResult.output);
    }

    // Parse CI checks into emoji table
    const checks = parseCiChecks(ciCheckResult.output);
    const checksTable = formatCiChecksTable(checks, logPath);

    // Build concise status message
    let statusMessage = `**PR #${prNumber}**\n`;

    if (ciCheckResult.success) {
      statusMessage += `✅ All CI checks passed\n`;
    } else if (ciCheckResult.error) {
      statusMessage += `⏱️ ${ciCheckResult.error}\n`;
    } else {
      statusMessage += `❌ CI checks failed\n`;
    }

    // Add emoji status table
    if (checksTable) {
      statusMessage += `\n${checksTable}\n`;
    }

    // Add CI run link
    if (ciRun?.url) {
      statusMessage += `\n🔗 [CI Run](${ciRun.url})`;
    }

    // Add Vercel preview URLs (concise)
    if (vercelUrls.length > 0) {
      statusMessage += `\n🔗 Preview: ${vercelUrls[0]}`;
      if (vercelUrls.length > 1) {
        statusMessage += ` (+${vercelUrls.length - 1} more)`;
      }
    }

    await logger.logOutput({
      success: ciCheckResult.success,
      ci_status: ciRun?.status,
      vercel_urls: vercelUrls,
    });

    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: statusMessage,
      },
    };
  } catch (error: unknown) {
    await logger.logError(error as Error);
    return {};
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with npx tsx
runHook(handler);
