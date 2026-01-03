/**
 * Task-to-subissue synchronization hook
 *
 * PostToolUse hook that automatically creates GitHub subissues from Task tool calls.
 * Creates a linked subissue for each non-Plan/Explore agent task.
 *
 * This hook provides:
 * - **Automatic subissue creation** - Creates subissue when Task tool is called
 * - **Agent filtering** - Skips Plan and Explore agents (too transient)
 * - **Parent linking** - Links subissue to branch's parent issue
 * - **Duplicate prevention** - Tracks created subissues to avoid duplicates
 *
 * State is tracked in .claude/logs/task-subissues.json to remember which
 * tasks have already created subissues.
 *
 * @module sync-task-to-subissue
 */

import type { PostToolUseInputTyped, PostToolUseHookOutput, TaskToolInput } from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const execAsync = promisify(exec);

/** Agents to exclude from subissue creation (too transient/exploratory) */
const EXCLUDED_AGENTS = ['Plan', 'Explore', 'plan', 'explore'];

interface TaskSubissueEntry {
  prompt: string;
  description: string;
  subagentType: string;
  parentIssueNumber: number;
  subissueNumber: number;
  subissueUrl: string;
  branch: string;
  createdAt: string;
}

interface TaskSubissueState {
  [taskId: string]: TaskSubissueEntry;
}

interface BranchIssueEntry {
  issueNumber: number;
  issueUrl: string;
  createdAt: string;
  createdFromPrompt: boolean;
  linkedFromBranchPrefix?: boolean;
}

interface BranchIssueState {
  [branchName: string]: BranchIssueEntry;
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
 * Execute gh command with stdin for large body content
 */
async function execGhWithStdin(
  args: string[],
  stdin: string,
  cwd: string
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('gh', args, { cwd });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        success: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        stdout: '',
        stderr: error.message,
      });
    });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}

/**
 * Get current git branch name
 */
async function getCurrentBranch(cwd: string): Promise<string> {
  const result = await execCommand('git rev-parse --abbrev-ref HEAD', cwd);
  return result.success ? result.stdout : '';
}

/**
 * Check if gh CLI is available and authenticated
 */
async function isGhAvailable(cwd: string): Promise<boolean> {
  const authCheck = await execCommand('gh auth status', cwd);
  return authCheck.success;
}

/**
 * Generate unique task ID from prompt (first 100 chars hashed)
 */
function generateTaskId(prompt: string, description: string): string {
  const content = `${description}:${prompt.slice(0, 100)}`;
  return crypto.createHash('md5').update(content).digest('hex').slice(0, 12);
}

/**
 * Load task subissue state from disk
 */
async function loadTaskSubissueState(cwd: string): Promise<TaskSubissueState> {
  const stateFile = path.join(cwd, '.claude', 'logs', 'task-subissues.json');

  try {
    const data = await fs.readFile(stateFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * Load branch issue state from disk
 */
async function loadBranchIssueState(cwd: string): Promise<BranchIssueState> {
  const stateFile = path.join(cwd, '.claude', 'logs', 'branch-issues.json');

  try {
    const data = await fs.readFile(stateFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * Save task subissue state to disk
 */
async function saveTaskSubissueState(cwd: string, state: TaskSubissueState): Promise<void> {
  const stateDir = path.join(cwd, '.claude', 'logs');
  const stateFile = path.join(stateDir, 'task-subissues.json');

  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
}

/**
 * Create a subissue linked to parent issue
 */
async function createSubissue(
  cwd: string,
  parentIssueNumber: number,
  title: string,
  body: string
): Promise<{ issueNumber: number; issueUrl: string }> {
  const result = await execGhWithStdin(
    ['issue', 'create', '--title', title, '--body-file', '-', '--label', 'task', '--label', 'subissue'],
    body,
    cwd
  );

  if (!result.success) {
    throw new Error(`Failed to create subissue: ${result.stderr || result.stdout}`);
  }

  const issueUrl = result.stdout.match(/https:\/\/github\.com\/[^\s]+/)?.[0] || '';
  const issueNumber = parseInt(issueUrl.match(/\/(\d+)$/)?.[1] || '0', 10);

  if (!issueNumber) {
    throw new Error('Failed to extract issue number from gh output');
  }

  return { issueNumber, issueUrl };
}

/**
 * PostToolUse hook handler for Task tool sync
 *
 * Detects Task tool calls and creates linked subissues.
 *
 * @param input - PostToolUse hook input from Claude Code
 * @returns Hook output with subissue creation status
 */
async function handler(input: PostToolUseInputTyped): Promise<PostToolUseHookOutput> {
  const logger = createDebugLogger(input.cwd, 'sync-task-to-subissue', true);

  try {
    // Only process Task tool
    if (input.tool_name !== 'Task') {
      return {};
    }

    // Type narrowing for Task tool
    const taskInput = input.tool_input as TaskToolInput;
    const { prompt, description, subagent_type } = taskInput;

    // Skip excluded agents (Plan, Explore)
    if (EXCLUDED_AGENTS.includes(subagent_type)) {
      await logger.logOutput({ skipped: true, reason: `Excluded agent type: ${subagent_type}` });
      return {};
    }

    await logger.logInput({
      session_id: input.session_id,
      tool_name: input.tool_name,
      subagent_type,
      description,
    });

    // Check if we're in a git repository
    const gitCheck = await execCommand('git rev-parse --is-inside-work-tree', input.cwd);
    if (!gitCheck.success) {
      await logger.logOutput({ skipped: true, reason: 'Not a git repository' });
      return {};
    }

    // Check if gh CLI is available
    if (!(await isGhAvailable(input.cwd))) {
      await logger.logOutput({ skipped: true, reason: 'gh CLI not authenticated' });
      return {};
    }

    // Get current branch
    const branch = await getCurrentBranch(input.cwd);
    if (!branch) {
      await logger.logOutput({ skipped: true, reason: 'Could not determine current branch' });
      return {};
    }

    // Get parent issue from branch-issues.json
    const branchState = await loadBranchIssueState(input.cwd);
    const branchIssue = branchState[branch];

    if (!branchIssue || !branchIssue.issueNumber) {
      await logger.logOutput({ skipped: true, reason: 'No parent issue linked to branch' });
      return {};
    }

    const parentIssueNumber = branchIssue.issueNumber;

    // Generate task ID and check for duplicates
    const taskId = generateTaskId(prompt, description);
    const taskState = await loadTaskSubissueState(input.cwd);

    if (taskState[taskId]) {
      // Already created subissue for this task
      await logger.logOutput({
        skipped: true,
        reason: 'Subissue already exists',
        existing_subissue: taskState[taskId].subissueNumber,
      });
      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `Task already tracked in subissue #${taskState[taskId].subissueNumber}`,
        },
      };
    }

    // Create subissue
    const subissueBody = `**Parent Issue:** #${parentIssueNumber}
**Agent Type:** ${subagent_type}
**Branch:** \`${branch}\`

---

## Task Description

${description}

## Task Prompt

${prompt}`;

    const subissueTitle = `[${subagent_type}] ${description}`;
    const { issueNumber: subissueNumber, issueUrl: subissueUrl } = await createSubissue(
      input.cwd,
      parentIssueNumber,
      subissueTitle,
      subissueBody
    );

    // Save state
    taskState[taskId] = {
      prompt,
      description,
      subagentType: subagent_type,
      parentIssueNumber,
      subissueNumber,
      subissueUrl,
      branch,
      createdAt: new Date().toISOString(),
    };
    await saveTaskSubissueState(input.cwd, taskState);

    await logger.logOutput({
      action: 'created',
      subissue_number: subissueNumber,
      subissue_url: subissueUrl,
      parent_issue: parentIssueNumber,
      branch,
    });

    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `Created subissue #${subissueNumber} for ${subagent_type} task: ${subissueUrl}`,
      },
    };
  } catch (error) {
    await logger.logError(error as Error);

    // Non-blocking error
    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `Could not create task subissue: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
