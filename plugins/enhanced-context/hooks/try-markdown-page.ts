/**
 * Markdown URL preference hook for WebFetch
 *
 * PreToolUse hook that intercepts WebFetch calls and attempts to redirect
 * to markdown versions of documentation pages when available. This provides
 * better AI-friendly content for documentation parsing.
 *
 * The hook tries multiple strategies to find markdown versions:
 * 1. GitHub documentation: Convert to raw.githubusercontent.com URLs
 * 2. HTML pages: Try changing .html extension to .md
 * 3. Documentation sites: Try appending .md to the path
 *
 * If a markdown version is found (via HTTP HEAD request), the WebFetch URL
 * is automatically redirected. Otherwise, the original URL is used.
 *
 * @module try-markdown-page
 */

import type { PreToolUseInput, PreToolUseHookOutput } from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Check if a URL returns a successful response (200-299 status code)
 *
 * Uses curl with a HEAD request to efficiently check URL availability
 * without downloading the full content.
 *
 * @param url - The URL to check
 * @returns True if the URL exists and is accessible, false otherwise
 *
 * @example
 * ```typescript
 * const exists = await urlExists('https://example.com/docs/guide.md');
 * if (exists) {
 *   console.log('Markdown version found!');
 * }
 * ```
 */
async function urlExists(url: string): Promise<boolean> {
  try {
    // Use curl with HEAD request and follow redirects
    // -s: silent, -f: fail on error, -I: HEAD request, -L: follow redirects
    // -o /dev/null: discard output, --max-time 5: 5 second timeout
    const { stdout } = await execAsync(
      `curl -s -I -L --max-time 5 "${url}" | head -n 1`
    );

    // Check if response starts with HTTP and contains 2xx status code
    return /HTTP\/[\d.]+ 2\d\d/.test(stdout);
  } catch {
    return false;
  }
}

/**
 * Transform a URL to try various markdown versions
 *
 * Generates candidate URLs that might contain markdown versions of the content.
 * Strategies include:
 * - GitHub: Convert to raw.githubusercontent.com
 * - HTML files: Change .html to .md
 * - Documentation: Try appending .md
 *
 * @param url - The original URL from WebFetch
 * @returns Array of candidate markdown URLs to try
 *
 * @example
 * ```typescript
 * const candidates = getMarkdownCandidates('https://github.com/user/repo/blob/main/docs/guide.html');
 * // Returns: ['https://raw.githubusercontent.com/user/repo/main/docs/guide.md', ...]
 * ```
 */
function getMarkdownCandidates(url: string): string[] {
  const candidates: string[] = [];

  try {
    const urlObj = new URL(url);

    // GitHub repository pages -> raw.githubusercontent.com
    if (urlObj.hostname === 'github.com') {
      const match = urlObj.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
      if (match) {
        const [, owner, repo, branch, path] = match;

        // Try changing extension to .md
        const mdPath = path.replace(/\.(html?|htm)$/i, '.md');
        candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${mdPath}`);

        // If path doesn't have extension, try adding .md
        if (!/\.\w+$/.test(path)) {
          candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}.md`);
        }
      }

      // GitHub tree/main page -> try docs/README.md
      const treeMatch = urlObj.pathname.match(/^\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/);
      if (treeMatch) {
        const [, owner, repo, branch, path] = treeMatch;
        candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}/README.md`);
        candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}.md`);
      }
    }

    // For any URL, try changing .html to .md
    if (urlObj.pathname.match(/\.(html?|htm)$/i)) {
      const mdUrl = url.replace(/\.(html?|htm)$/i, '.md');
      candidates.push(mdUrl);
    }

    // For any URL without extension, try adding .md
    if (!/\.\w+$/.test(urlObj.pathname) && !urlObj.pathname.endsWith('/')) {
      candidates.push(url + '.md');
    }

  } catch {
    // Invalid URL, return empty array
    return [];
  }

  return candidates;
}

/**
 * PreToolUse hook that redirects WebFetch to markdown versions when available
 *
 * Intercepts WebFetch tool calls and attempts to find markdown versions of
 * the requested URL. If a markdown version is found and accessible, the
 * tool input is modified to fetch that URL instead.
 *
 * The hook is non-blocking and fails gracefully - if no markdown version
 * is found or if URL checking fails, the original WebFetch proceeds.
 *
 * @param input - PreToolUse hook input from Claude Code
 * @returns Hook output with potentially modified tool_input for markdown URL
 *
 * @example
 * ```typescript
 * // When WebFetch is called with:
 * const result = await handler({
 *   tool_name: 'WebFetch',
 *   tool_use_id: 'toolu_123',
 *   tool_input: {
 *     url: 'https://github.com/vercel/next.js/blob/canary/docs/app/guide.html',
 *     prompt: 'Get routing documentation'
 *   },
 *   // ... other fields
 * });
 *
 * // If https://raw.githubusercontent.com/.../docs/app/guide.md exists:
 * // Returns modified tool_input with markdown URL and additional context
 * ```
 */
async function handler(
  input: PreToolUseInput
): Promise<PreToolUseHookOutput> {
  // Only run for WebFetch operations
  if (input.tool_name !== 'WebFetch') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  const logger = createDebugLogger(input.cwd, 'try-markdown-page', true);

  try {
    await logger.logInput({
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
    });

    // Extract URL from tool input
    const toolInput = input.tool_input as { url?: string; prompt?: string };
    const originalUrl = toolInput?.url;

    if (!originalUrl) {
      await logger.logOutput({ success: false, reason: 'No URL in tool input' });
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };
    }

    // Get markdown URL candidates
    const candidates = getMarkdownCandidates(originalUrl);

    if (candidates.length === 0) {
      await logger.logOutput({
        success: true,
        reason: 'No markdown candidates generated',
        originalUrl,
      });
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };
    }

    // Try each candidate until we find one that exists
    for (const candidateUrl of candidates) {
      const exists = await urlExists(candidateUrl);

      if (exists) {
        await logger.logOutput({
          success: true,
          originalUrl,
          markdownUrl: candidateUrl,
          redirected: true,
        });

        // Modify the tool input to use the markdown URL
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
            updatedInput: {
              ...toolInput,
              url: candidateUrl,
            },
          },
          systemMessage: `📝 Found markdown version: redirecting from ${originalUrl} to ${candidateUrl}`,
        };
      }
    }

    // No markdown version found, let original request proceed
    await logger.logOutput({
      success: true,
      originalUrl,
      candidates,
      redirected: false,
      reason: 'No accessible markdown versions found',
    });

    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  } catch (error: unknown) {
    // Non-blocking on errors - let original WebFetch proceed
    await logger.logError(error as Error);
    return {
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
