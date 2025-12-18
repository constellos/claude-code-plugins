/**
 * PostToolUse Hook - Await PR CI checks
 *
 * This hook fires after Bash tool calls that create PRs (gh pr create).
 * It waits for CI checks to complete using `gh run watch` and reports the results.
 *
 * @module hooks/await-pr-checks
 */

import type { PostToolUseInput, PostToolUseHookOutput } from '../../../shared/types/types.js';
import { createDebugLogger } from '../../../shared/hooks/utils/debug.js';
import { runHook } from '../../../shared/hooks/utils/io.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Patterns to detect PR creation commands and extract PR URL
const PR_CREATE_PATTERNS = [
  /gh\s+pr\s+create/,
  /hub\s+pull-request/,
];

// Pattern to extract PR URL from gh pr create output
const PR_URL_PATTERN = /https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/;

/**
 * Extract PR URL from command output
 */
function extractPrUrl(output: string): string | null {
  const match = output.match(PR_URL_PATTERN);
  return match ? match[0] : null;
}

/**
 * Check if this is a PR creation command
 */
function isPrCreateCommand(command: string): boolean {
  return PR_CREATE_PATTERNS.some((pattern) => pattern.test(command));
}

/**
 * Extract PR number from URL
 */
function extractPrNumber(url: string): string | null {
  const match = url.match(/\/pull\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * PostToolUse hook handler for awaiting PR checks
 *
 * Watches for `gh pr create` Bash commands and waits for CI to complete.
 * Returns a blocking decision if CI fails.
 *
 * @param input - PostToolUse hook input from Claude Code
 * @returns Hook output with CI status or blocking decision on failure
 */
async function handler(
  input: PostToolUseInput
): Promise<PostToolUseHookOutput> {
  // Only process Bash tool calls
  if (input.tool_name !== 'Bash') {
    return {};
  }

  const toolInput = input.tool_input as { command?: string };
  const command = toolInput?.command || '';

  // Only process PR creation commands
  if (!isPrCreateCommand(command)) {
    return {};
  }

  const logger = createDebugLogger(input.cwd, 'await-pr-checks', true);

  try {
    await logger.logInput({
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
      command,
    });

    // Get the tool response (output from gh pr create)
    const toolResponse = input.tool_response as { stdout?: string; stderr?: string; output?: string } | string;
    const output = typeof toolResponse === 'string'
      ? toolResponse
      : toolResponse?.stdout || toolResponse?.output || '';

    // Extract PR URL from the output
    const prUrl = extractPrUrl(output);

    if (!prUrl) {
      await logger.logOutput({
        success: false,
        error: 'Could not find PR URL in command output',
        output: output.slice(0, 500),
      });

      return {
        decision: 'block',
        reason: 'PR URL not found in gh pr create output',
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `Could not find PR URL in the gh pr create output. Expected output to contain a URL like https://github.com/owner/repo/pull/123\n\nOutput received:\n${output.slice(0, 500)}`,
        },
      };
    }

    const prNumber = extractPrNumber(prUrl);

    await logger.logOutput({
      pr_url: prUrl,
      pr_number: prNumber,
      status: 'waiting_for_checks',
    });

    // Wait for CI checks to complete using gh run watch
    // Use a 10-minute timeout (600000ms) for CI to complete
    try {
      const { stdout: watchOutput, stderr: watchStderr } = await execAsync(
        `gh pr checks ${prNumber} --watch`,
        {
          cwd: input.cwd,
          timeout: 600000, // 10 minute timeout
        }
      );

      const combinedOutput = `${watchOutput}\n${watchStderr}`.trim();

      // Check if all checks passed
      const hasFailures = combinedOutput.includes('fail') ||
                          combinedOutput.includes('X ') ||
                          combinedOutput.includes('cancelled');

      if (hasFailures) {
        await logger.logOutput({
          success: false,
          pr_url: prUrl,
          ci_status: 'failed',
          output: combinedOutput,
        });

        return {
          decision: 'block',
          reason: 'CI checks failed',
          hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext: `CI checks failed for PR ${prUrl}\n\nTo view details, run:\n  gh pr checks ${prNumber}\n  gh run view\n\nCheck output:\n${combinedOutput}`,
          },
        };
      }

      await logger.logOutput({
        success: true,
        pr_url: prUrl,
        ci_status: 'passed',
        output: combinedOutput,
      });

      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `CI checks passed for PR ${prUrl}\n\nTo view the PR: ${prUrl}\nTo view run details: gh run view`,
        },
      };
    } catch (watchError: unknown) {
      const err = watchError as { stdout?: string; stderr?: string; message?: string; killed?: boolean };
      const errorOutput = err.stdout || err.stderr || err.message || 'Unknown error';

      // Check if it was a timeout
      if (err.killed) {
        await logger.logOutput({
          success: false,
          pr_url: prUrl,
          ci_status: 'timeout',
          error: 'CI check watch timed out after 10 minutes',
        });

        return {
          decision: 'block',
          reason: 'CI checks timed out',
          hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext: `CI checks timed out after 10 minutes for PR ${prUrl}\n\nTo check status manually:\n  gh pr checks ${prNumber}\n  gh run view`,
          },
        };
      }

      await logger.logOutput({
        success: false,
        pr_url: prUrl,
        ci_status: 'error',
        error: errorOutput,
      });

      return {
        decision: 'block',
        reason: 'CI check watch failed',
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `Failed to watch CI checks for PR ${prUrl}\n\nError: ${errorOutput}\n\nTo check status manually:\n  gh pr checks ${prNumber}\n  gh run view`,
        },
      };
    }
  } catch (error) {
    await logger.logError(error as Error);

    return {
      decision: 'block',
      reason: 'await-pr-checks hook error',
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `await-pr-checks hook encountered an error: ${error}`,
      },
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
