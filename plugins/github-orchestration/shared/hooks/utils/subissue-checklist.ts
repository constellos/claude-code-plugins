/**
 * Subissue checklist management utility for GitHub workflow automation
 * Generates and updates checklists in parent issue bodies
 */

import { spawn } from 'node:child_process';

/**
 * Execute gh CLI with stdin input
 */
async function execGhWithStdin(
  command: string,
  stdin: string,
  cwd: string
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', command], { cwd });

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

    // Write stdin and close
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

/**
 * Subissue information for checklist generation
 */
export interface SubissueInfo {
  /** Issue number */
  number: number;
  /** Issue title */
  title: string;
  /** Issue state (open/closed) */
  state: 'open' | 'closed';
  /** Optional issue URL */
  url?: string;
}

/**
 * Generate checklist markdown from subissues
 *
 * @param subissues - Array of subissue information
 * @returns Markdown checklist with checkboxes
 *
 * @example
 * generateChecklistMarkdown([
 *   { number: 43, title: 'Task A', state: 'closed' },
 *   { number: 44, title: 'Task B', state: 'open' }
 * ])
 * // - [x] #43 Task A
 * // - [ ] #44 Task B
 */
export function generateChecklistMarkdown(subissues: SubissueInfo[]): string {
  return subissues
    .map((sub) => {
      const checkbox = sub.state === 'closed' ? '[x]' : '[ ]';
      const link = sub.url ? `[#${sub.number}](${sub.url})` : `#${sub.number}`;
      return `- ${checkbox} ${link} ${sub.title}`;
    })
    .join('\n');
}

/**
 * Extract checklist section from issue body
 * Looks for a section starting with "## Subtasks" or "## Tasks"
 *
 * @param issueBody - The full issue body markdown
 * @returns The checklist section if found, null otherwise
 */
export function extractChecklistSection(issueBody: string): string | null {
  const match = issueBody.match(/## (Subtasks|Tasks|Checklist)\n\n((?:- \[[ x]\] .+\n?)+)/i);
  return match ? match[2].trim() : null;
}

/**
 * Parse checklist items from markdown
 *
 * @param checklist - Checklist markdown
 * @returns Array of parsed checklist items
 *
 * @example
 * parseChecklistItems('- [x] #43 Task A\n- [ ] #44 Task B')
 * // [{ checked: true, issueNumber: 43, text: 'Task A' }, ...]
 */
export function parseChecklistItems(checklist: string): Array<{
  checked: boolean;
  issueNumber?: number;
  text: string;
}> {
  const lines = checklist.split('\n').filter((line) => line.trim().startsWith('- ['));

  return lines.map((line) => {
    const checked = line.includes('[x]');
    const issueMatch = line.match(/#(\d+)/);
    const issueNumber = issueMatch ? parseInt(issueMatch[1], 10) : undefined;
    const text = line
      .replace(/^- \[[ x]\]\s*/, '')
      .replace(/#\d+\s*/, '')
      .replace(/\[#\d+\]\([^)]+\)\s*/, '')
      .trim();

    return { checked, issueNumber, text };
  });
}

/**
 * Update parent issue body with subissue checklist
 * Replaces existing checklist section or adds new one
 *
 * @param cwd - Current working directory
 * @param parentIssue - Parent issue number
 * @param subissues - Array of subissue information
 * @returns Success boolean
 */
export async function updateParentIssueChecklist(
  cwd: string,
  parentIssue: number,
  subissues: SubissueInfo[]
): Promise<boolean> {
  // Generate checklist markdown
  const checklist = generateChecklistMarkdown(subissues);

  // Fetch current issue body
  const viewResult = await execGhWithStdin(
    `gh issue view ${parentIssue} --json body -q .body`,
    '',
    cwd
  );

  if (!viewResult.success) {
    return false;
  }

  let updatedBody = viewResult.stdout;

  // Check if checklist section exists
  const hasChecklist = /## (Subtasks|Tasks|Checklist)/i.test(updatedBody);

  if (hasChecklist) {
    // Replace existing checklist section
    updatedBody = updatedBody.replace(
      /## (Subtasks|Tasks|Checklist)\n\n(?:- \[[ x]\] .+\n?)+/i,
      `## Subtasks\n\n${checklist}`
    );
  } else {
    // Add new checklist section at the end
    updatedBody = `${updatedBody.trim()}\n\n## Subtasks\n\n${checklist}`;
  }

  // Update issue body
  const editResult = await execGhWithStdin(
    `gh issue edit ${parentIssue} --body-file -`,
    updatedBody,
    cwd
  );

  return editResult.success;
}

/**
 * Add a subissue to parent's checklist
 * Appends to existing checklist or creates new one
 *
 * @param cwd - Current working directory
 * @param parentIssue - Parent issue number
 * @param subissue - Subissue information to add
 * @returns Success boolean
 */
export async function addSubissueToChecklist(
  cwd: string,
  parentIssue: number,
  subissue: SubissueInfo
): Promise<boolean> {
  // Fetch current issue body
  const viewResult = await execGhWithStdin(
    `gh issue view ${parentIssue} --json body -q .body`,
    '',
    cwd
  );

  if (!viewResult.success) {
    return false;
  }

  let updatedBody = viewResult.stdout;
  const checkbox = subissue.state === 'closed' ? '[x]' : '[ ]';
  const link = subissue.url ? `[#${subissue.number}](${subissue.url})` : `#${subissue.number}`;
  const newItem = `- ${checkbox} ${link} ${subissue.title}`;

  // Check if checklist section exists
  const checklistMatch = updatedBody.match(/(## (?:Subtasks|Tasks|Checklist)\n\n(?:- \[[ x]\] .+\n?)+)/i);

  if (checklistMatch) {
    // Append to existing checklist
    const existingChecklist = checklistMatch[1];
    const updatedChecklist = `${existingChecklist.trim()}\n${newItem}`;
    updatedBody = updatedBody.replace(existingChecklist, updatedChecklist);
  } else {
    // Add new checklist section
    updatedBody = `${updatedBody.trim()}\n\n## Subtasks\n\n${newItem}`;
  }

  // Update issue body
  const editResult = await execGhWithStdin(
    `gh issue edit ${parentIssue} --body-file -`,
    updatedBody,
    cwd
  );

  return editResult.success;
}

/**
 * Mark a subissue as complete in parent's checklist
 *
 * @param cwd - Current working directory
 * @param parentIssue - Parent issue number
 * @param subissueNumber - Subissue number to mark complete
 * @returns Success boolean
 */
export async function markSubissueComplete(
  cwd: string,
  parentIssue: number,
  subissueNumber: number
): Promise<boolean> {
  // Fetch current issue body
  const viewResult = await execGhWithStdin(
    `gh issue view ${parentIssue} --json body -q .body`,
    '',
    cwd
  );

  if (!viewResult.success) {
    return false;
  }

  let updatedBody = viewResult.stdout;

  // Find and update the specific subissue checkbox
  const regex = new RegExp(`(- \\[[ ]\\]\\s*(?:\\[)?#${subissueNumber}(?:\\])?(?:\\([^)]+\\))?[^\\n]*)`, 'g');
  updatedBody = updatedBody.replace(regex, (match) => match.replace('[ ]', '[x]'));

  // Update issue body
  const editResult = await execGhWithStdin(
    `gh issue edit ${parentIssue} --body-file -`,
    updatedBody,
    cwd
  );

  return editResult.success;
}

/**
 * Sync subissue states with parent checklist
 * Fetches all subissues and updates checklist to match their current states
 *
 * @param cwd - Current working directory
 * @param parentIssue - Parent issue number
 * @param subissueNumbers - Array of subissue numbers to sync
 * @returns Success boolean
 */
export async function syncSubissueStates(
  cwd: string,
  parentIssue: number,
  subissueNumbers: number[]
): Promise<boolean> {
  const subissues: SubissueInfo[] = [];

  // Fetch state for each subissue
  for (const num of subissueNumbers) {
    const result = await execGhWithStdin(
      `gh issue view ${num} --json number,title,state,url`,
      '',
      cwd
    );

    if (result.success) {
      try {
        const data = JSON.parse(result.stdout);
        subissues.push({
          number: data.number,
          title: data.title,
          state: data.state.toLowerCase() as 'open' | 'closed',
          url: data.url,
        });
      } catch {
        // Skip malformed JSON
      }
    }
  }

  if (subissues.length === 0) {
    return false;
  }

  // Update parent checklist
  return updateParentIssueChecklist(cwd, parentIssue, subissues);
}
