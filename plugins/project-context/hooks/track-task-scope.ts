/**
 * Task scope advisory hook for PostToolUse[Write|Edit]
 *
 * Provides advisory warnings when files are edited outside their expected
 * task scope. Parses the active plan file in `.claude/plans/` to find task
 * definitions and checks if the edited file matches a different task.
 *
 * This is a non-blocking advisory hook - it only provides context to Claude
 * about potential task scope issues, it does not prevent the edit.
 *
 * @module track-task-scope
 */

import type { PostToolUseInput, PostToolUseHookOutput } from '../shared/types/types.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { parsePlanFrontmatter, findTaskByPath } from '../shared/hooks/utils/plan-parser.js';
import { readdir, readFile, stat } from 'fs/promises';
import { join, relative } from 'path';
import { existsSync } from 'fs';

/**
 * Get the most recently modified plan file from .claude/plans/
 *
 * @param cwd - Current working directory
 * @returns Path to the active plan file, or null if none found
 */
async function getActivePlanFile(cwd: string): Promise<string | null> {
  const plansDir = join(cwd, '.claude', 'plans');

  if (!existsSync(plansDir)) {
    return null;
  }

  try {
    const entries = await readdir(plansDir, { withFileTypes: true });
    const planFiles: { path: string; mtime: Date }[] = [];

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const filePath = join(plansDir, entry.name);
        const stats = await stat(filePath);
        planFiles.push({ path: filePath, mtime: stats.mtime });
      }
    }

    if (planFiles.length === 0) {
      return null;
    }

    // Sort by modification time, most recent first
    planFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    return planFiles[0].path;
  } catch {
    return null;
  }
}

/**
 * PostToolUse[Write|Edit] hook handler
 *
 * Checks if the edited file falls within the scope of a different task
 * than the current context suggests, and provides an advisory warning.
 *
 * @param input - PostToolUse hook input from Claude Code
 * @returns Hook output with optional advisory context
 */
async function handler(input: PostToolUseInput): Promise<PostToolUseHookOutput> {
  // Only process Write and Edit tools
  if (input.tool_name !== 'Write' && input.tool_name !== 'Edit') {
    return {};
  }

  const logger = createDebugLogger(input.cwd, 'track-task-scope', true);

  try {
    // Get file path from tool input
    const toolInput = input.tool_input as { file_path?: string };
    const filePath = toolInput?.file_path;

    if (!filePath) {
      return {};
    }

    await logger.logInput({
      tool_name: input.tool_name,
      file_path: filePath,
    });

    // Find the active plan file
    const activePlan = await getActivePlanFile(input.cwd);

    if (!activePlan) {
      await logger.logOutput({ success: true, reason: 'No plan file found' });
      return {};
    }

    // Read and parse the plan file
    const planContent = await readFile(activePlan, 'utf-8');
    const metadata = parsePlanFrontmatter(planContent);

    if (!metadata || metadata.tasks.length === 0) {
      await logger.logOutput({ success: true, reason: 'No tasks in plan' });
      return {};
    }

    // Get relative path for matching
    const relativePath = relative(input.cwd, filePath);

    // Find if any task owns this file
    const matchingTask = findTaskByPath(metadata.tasks, relativePath);

    if (!matchingTask) {
      // File doesn't match any task scope - no advisory needed
      await logger.logOutput({ success: true, reason: 'File not in any task scope' });
      return {};
    }

    // We found a matching task - provide advisory context
    // The hook doesn't know the "current" task context, so we just inform
    // which task this file belongs to
    const advisory = `Task Scope Advisory: File '${relativePath}' matches task '${matchingTask.id}' assigned to agent '${matchingTask.agent}'.\nCurrent task context may differ.`;

    await logger.logOutput({
      success: true,
      file: relativePath,
      matchingTask: matchingTask.id,
      agent: matchingTask.agent,
    });

    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: advisory,
      },
    };
  } catch (error: unknown) {
    // Non-blocking on errors - just log and return empty
    await logger.logError(error as Error);
    return {};
  }
}

export { handler };
runHook(handler);
