/**
 * PostToolUse[browser_eval] hook - Move screenshots to .claude/screenshots/
 *
 * This hook runs after browser_eval screenshot actions complete.
 * It automatically moves screenshot files to a dedicated directory that
 * Claude has standard access to, eliminating repeated permission requests.
 *
 * Handles:
 * - Screenshot file relocation
 * - Cross-device moves (copy+delete fallback)
 * - Filename conflict resolution (timestamp deduplication)
 * - Graceful error handling (non-blocking)
 */

import type { PostToolUseInput, PostToolUseHookOutput } from '../shared/types/types.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { promises as fs } from 'node:fs';
import { join, basename } from 'node:path';

async function handler(input: PostToolUseInput): Promise<PostToolUseHookOutput> {
  const DEBUG = process.env.DEBUG === '*' || process.env.DEBUG?.includes('browser');

  // Only process browser_eval tool calls
  if (input.tool_name !== 'browser_eval') {
    return {};
  }

  if (DEBUG) {
    console.log('[PostToolUse:browser_eval] Hook triggered');
    console.log('[PostToolUse:browser_eval] Tool Use ID:', input.tool_use_id);
  }

  try {
    // Filter: Only process screenshot actions
    const toolInput = input.tool_input as { action?: string };
    if (toolInput.action !== 'screenshot') {
      if (DEBUG) {
        console.log('[PostToolUse:browser_eval] Not a screenshot action, skipping');
      }
      return {};
    }

    if (DEBUG) {
      console.log('[PostToolUse:browser_eval] Screenshot action detected');
    }

    // Extract screenshot path from response
    // The response format varies by MCP implementation, so we need to be flexible
    const response = input.tool_response;
    let screenshotPath: string | undefined;

    // Try different response formats
    if (typeof response === 'object' && response !== null) {
      const responseObj = response as Record<string, unknown>;

      // Format 1: { screenshot: { path: "..." } }
      if (responseObj.screenshot && typeof responseObj.screenshot === 'object') {
        const screenshot = responseObj.screenshot as Record<string, unknown>;
        if (typeof screenshot.path === 'string') {
          screenshotPath = screenshot.path;
        }
      }

      // Format 2: { path: "..." }
      if (!screenshotPath && typeof responseObj.path === 'string') {
        screenshotPath = responseObj.path;
      }

      // Format 3: { file: "..." } or { filePath: "..." }
      if (!screenshotPath && typeof responseObj.file === 'string') {
        screenshotPath = responseObj.file;
      }
      if (!screenshotPath && typeof responseObj.filePath === 'string') {
        screenshotPath = responseObj.filePath;
      }
    }

    if (!screenshotPath) {
      if (DEBUG) {
        console.log('[PostToolUse:browser_eval] No screenshot path found in response');
        console.log('[PostToolUse:browser_eval] Response:', JSON.stringify(response).slice(0, 200));
      }
      return {};
    }

    if (DEBUG) {
      console.log('[PostToolUse:browser_eval] Screenshot path:', screenshotPath);
    }

    // Verify file exists before trying to move it
    try {
      await fs.access(screenshotPath);
    } catch {
      if (DEBUG) {
        console.log('[PostToolUse:browser_eval] Screenshot file not found, skipping move');
      }
      return {};
    }

    // Create target directory
    const targetDir = join(input.cwd, '.claude', 'screenshots');
    await fs.mkdir(targetDir, { recursive: true });

    // Generate target filename with timestamp deduplication
    const filename = basename(screenshotPath);
    let targetPath = join(targetDir, filename);

    // Check if file already exists, add timestamp if needed
    try {
      await fs.access(targetPath);
      // File exists, add timestamp
      const timestamp = Date.now();
      const ext = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')) : '';
      const name = filename.includes('.') ? filename.substring(0, filename.lastIndexOf('.')) : filename;
      targetPath = join(targetDir, `${name}-${timestamp}${ext}`);
    } catch {
      // File doesn't exist, use original filename
    }

    // Move file atomically (with fallback to copy+delete for cross-device moves)
    try {
      await fs.rename(screenshotPath, targetPath);
      if (DEBUG) {
        console.log('[PostToolUse:browser_eval] Screenshot moved to:', targetPath);
      }
    } catch {
      // Fallback: copy then delete (handles cross-device moves)
      if (DEBUG) {
        console.log('[PostToolUse:browser_eval] Rename failed, using copy+delete fallback');
      }
      await fs.copyFile(screenshotPath, targetPath);
      await fs.unlink(screenshotPath);
      if (DEBUG) {
        console.log('[PostToolUse:browser_eval] Screenshot copied to:', targetPath);
      }
    }

    // Return context about the move
    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `Screenshot saved to ${targetPath}`,
      },
    };
  } catch (error) {
    // Non-blocking error - log but don't stop Claude execution
    if (DEBUG) {
      console.error('[PostToolUse:browser_eval] Error moving screenshot:', error);
    }
    return {};
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
