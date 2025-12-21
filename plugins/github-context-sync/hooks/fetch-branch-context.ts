/**
 * Branch context and issue discovery hook
 *
 * SessionStart hook that displays context about the current branch's work when
 * starting a new session. Provides full details of linked issues and awareness
 * of outstanding unlinked issues.
 *
 * This hook provides:
 * - **Full linked issue display** - Shows complete issue content (title, body, comments) for current branch
 * - **Outstanding issue awareness** - Lists titles of open issues not linked to any branch
 * - **Context discovery** - Cascading search through state file, GitHub search, and issue body markers
 * - **Non-blocking** - All errors are gracefully handled without stopping session start
 *
 * Issue-to-branch linking is discovered from:
 * 1. `.claude/logs/plan-issues.json` state file (primary source)
 * 2. GitHub search by branch name (fallback)
 * 3. Issue body `**Branch:** \`name\`` markers (last resort)
 *
 * @module fetch-branch-context
 */

import type { SessionStartInput, SessionStartHookOutput } from '../../../shared/types/types.js';
import { createDebugLogger } from '../../../shared/hooks/utils/debug.js';
import { runHook } from '../../../shared/hooks/utils/io.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execAsync = promisify(exec);

interface PlanIssueState {
  [sessionId: string]: {
    planPath: string;
    issueNumber: number;
    issueUrl: string;
    branch: string;
    createdAt: string;
    lastUpdated: string;
  };
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  comments?: Array<{
    author: { login: string };
    body: string;
    createdAt: string;
  }>;
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
 * Load plan issue state from disk
 */
async function loadPlanIssueState(cwd: string): Promise<PlanIssueState> {
  const stateFile = path.join(cwd, '.claude', 'logs', 'plan-issues.json');

  try {
    const data = await fs.readFile(stateFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    // File doesn't exist yet or is invalid
    return {};
  }
}

/**
 * Fetch full issue details from GitHub
 */
async function fetchFullIssue(issueNumber: number, cwd: string): Promise<GitHubIssue | null> {
  const result = await execCommand(
    `gh issue view ${issueNumber} --json number,title,body,comments`,
    cwd
  );

  if (!result.success) {
    return null;
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

/**
 * Find issue linked to current branch using cascading fallback strategy
 *
 * Strategy:
 * 1. Check plan-issues.json state file (by session ID and branch name)
 * 2. Search GitHub using branch name
 * 3. Scan issue bodies for "Branch: `name`" marker
 */
async function findBranchIssue(
  branch: string,
  cwd: string,
  sessionId: string
): Promise<{ issueNumber: number; fullIssue: GitHubIssue } | null> {
  // STRATEGY 1: Check plan-issues.json state file
  const state = await loadPlanIssueState(cwd);

  // Find by session ID
  if (state[sessionId]?.branch === branch) {
    const fullIssue = await fetchFullIssue(state[sessionId].issueNumber, cwd);
    if (fullIssue) {
      return { issueNumber: state[sessionId].issueNumber, fullIssue };
    }
  }

  // Find by branch name across all sessions
  for (const sessionState of Object.values(state)) {
    if (sessionState.branch === branch) {
      const fullIssue = await fetchFullIssue(sessionState.issueNumber, cwd);
      if (fullIssue) {
        return { issueNumber: sessionState.issueNumber, fullIssue };
      }
    }
  }

  // STRATEGY 2: Search GitHub using gh CLI
  const searchResult = await execCommand(
    `gh issue list --search "in:body branch:${branch}" --json number,title,body,comments --limit 1`,
    cwd
  );

  if (searchResult.success && searchResult.stdout) {
    try {
      const issues = JSON.parse(searchResult.stdout);
      if (issues.length > 0) {
        return { issueNumber: issues[0].number, fullIssue: issues[0] };
      }
    } catch {
      // JSON parse failed, continue to next strategy
    }
  }

  // STRATEGY 3: Check issue body for "Branch: `name`" marker
  const allIssuesResult = await execCommand(
    'gh issue list --state open --json number,body --limit 50',
    cwd
  );

  if (allIssuesResult.success) {
    try {
      const issues = JSON.parse(allIssuesResult.stdout);
      const branchMarker = `**Branch:** \`${branch}\``;

      for (const issue of issues) {
        if (issue.body?.includes(branchMarker)) {
          const fullIssue = await fetchFullIssue(issue.number, cwd);
          if (fullIssue) {
            return { issueNumber: issue.number, fullIssue };
          }
        }
      }
    } catch {
      // JSON parse failed
    }
  }

  return null;
}

/**
 * Find all open issues NOT linked to existing branches
 */
async function findUnlinkedIssues(
  cwd: string
): Promise<Array<{ number: number; title: string }>> {
  // Get all branches (local and remote)
  const branchesResult = await execCommand('git branch -a --format="%(refname:short)"', cwd);

  if (!branchesResult.success) {
    return [];
  }

  const branches = new Set(
    branchesResult.stdout
      .split('\n')
      .map((b) => b.trim().replace(/^origin\//, ''))
      .filter(Boolean)
  );

  // Get all open issues
  const issuesResult = await execCommand(
    'gh issue list --state open --json number,title,body,labels --limit 100',
    cwd
  );

  if (!issuesResult.success) {
    return [];
  }

  try {
    const allIssues = JSON.parse(issuesResult.stdout);
    const unlinkedIssues: Array<{ number: number; title: string }> = [];

    // Load state file to check for linked issues
    const state = await loadPlanIssueState(cwd);
    const linkedIssueNumbers = new Set(
      Object.values(state).map((s) => s.issueNumber)
    );

    for (const issue of allIssues) {
      let isLinked = false;

      // Check if issue is in state file
      if (linkedIssueNumbers.has(issue.number)) {
        isLinked = true;
      }

      // Check if issue body contains a branch reference
      if (!isLinked && issue.body) {
        const branchMatch = issue.body.match(/\*\*Branch:\*\*\s+`([^`]+)`/);
        if (branchMatch && branches.has(branchMatch[1])) {
          isLinked = true;
        }
      }

      if (!isLinked) {
        unlinkedIssues.push({
          number: issue.number,
          title: issue.title,
        });
      }
    }

    return unlinkedIssues;
  } catch {
    return [];
  }
}

/**
 * Format issue comments for display
 */
function formatComments(comments: GitHubIssue['comments']): string[] {
  if (!comments || comments.length === 0) {
    return [];
  }

  const formatted: string[] = ['', '### Comments'];

  for (const comment of comments) {
    formatted.push('');
    formatted.push(`**@${comment.author.login}** commented ${comment.createdAt}:`);
    formatted.push(comment.body);
  }

  return formatted;
}

/**
 * SessionStart hook handler
 *
 * Executes at session start to display context about current branch work and
 * outstanding issues.
 *
 * @param input - SessionStart hook input from Claude Code
 * @returns Hook output with formatted issue context
 *
 * @example
 * ```typescript
 * // This hook is automatically called by Claude Code when a new session starts
 * ```
 */
async function handler(input: SessionStartInput): Promise<SessionStartHookOutput> {
  const logger = createDebugLogger(input.cwd, 'fetch-branch-context', true);

  try {
    // Check if we're in a git repository
    const gitCheck = await execCommand('git rev-parse --is-inside-work-tree', input.cwd);
    if (!gitCheck.success) {
      await logger.logOutput({ skipped: true, reason: 'Not a git repository' });
      return {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: '',
        },
      };
    }

    // Check if gh CLI is authenticated
    const ghCheck = await execCommand('gh auth status', input.cwd);
    if (!ghCheck.success) {
      await logger.logOutput({ skipped: true, reason: 'gh CLI not authenticated' });
      return {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: '⚠ GitHub CLI not authenticated. Run: gh auth login',
        },
      };
    }

    // Get current branch
    const branchResult = await execCommand('git rev-parse --abbrev-ref HEAD', input.cwd);
    const currentBranch = branchResult.stdout;

    if (!currentBranch || currentBranch === 'HEAD') {
      // Detached HEAD state
      await logger.logOutput({ skipped: true, reason: 'Detached HEAD' });
      return {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: '',
        },
      };
    }

    await logger.logInput({
      session_id: input.session_id,
      current_branch: currentBranch,
    });

    // Find linked issue for current branch
    const branchIssue = await findBranchIssue(currentBranch, input.cwd, input.session_id);

    // Find unlinked issues
    const unlinkedIssues = await findUnlinkedIssues(input.cwd);

    // Format output
    const sections: string[] = [];

    // Section 1: Current branch issue (FULL content)
    sections.push('## Current Branch Work');
    sections.push('');
    sections.push(`**Branch:** \`${currentBranch}\``);

    if (branchIssue?.fullIssue) {
      sections.push(`**Issue:** #${branchIssue.issueNumber} - ${branchIssue.fullIssue.title}`);
      sections.push('');
      sections.push('### Issue Description');
      sections.push(branchIssue.fullIssue.body || '(no description)');

      // Include comments if any
      const commentLines = formatComments(branchIssue.fullIssue.comments);
      sections.push(...commentLines);
    } else {
      sections.push('**Issue:** No linked issue found');
      sections.push('');
      sections.push('💡 Create an issue for this branch using a plan file, or link manually.');
    }

    // Section 2: Outstanding issues (TITLES only)
    if (unlinkedIssues.length > 0) {
      sections.push('');
      sections.push('---');
      sections.push('');
      sections.push('## Outstanding Issues (Not Linked to Branches)');
      sections.push('');
      for (const issue of unlinkedIssues) {
        sections.push(`- #${issue.number}: ${issue.title}`);
      }
      sections.push('');
      sections.push('💡 These issues are available for work. Create a branch to link one.');
    }

    await logger.logOutput({
      branch: currentBranch,
      linked_issue: branchIssue?.issueNumber,
      unlinked_issues_count: unlinkedIssues.length,
    });

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: sections.join('\n'),
      },
    };
  } catch (error) {
    await logger.logError(error as Error);

    // Non-blocking - just log error
    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `⚠ Could not fetch branch context: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
