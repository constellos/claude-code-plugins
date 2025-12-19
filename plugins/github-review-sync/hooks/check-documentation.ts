/**
 * SubagentStop Hook - Check for needed documentation updates
 *
 * This hook fires when a subagent completes and analyzes the agent's work
 * to suggest documentation updates. It provides non-blocking guidance about:
 * - Folder-level CLAUDE.md files that may need updates
 * - Agent definitions that may be deprecated or missing
 * - Skill definitions that may need updates
 * - Missing documentation for new features
 *
 * @module hooks/check-documentation
 */

import type { SubagentStopInput, SubagentStopHookOutput } from '../../../shared/types/types.js';
import { createDebugLogger } from '../../../shared/hooks/utils/debug.js';
import { runHook } from '../../../shared/hooks/utils/io.js';
import { getTaskEdits } from '../../../shared/hooks/utils/task-state.js';
import fs from 'node:fs/promises';
import path from 'node:path';

interface DocumentationIssue {
  type: 'missing' | 'deprecated' | 'update_needed';
  file: string;
  reason: string;
  suggestedChanges: string;
}

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all unique directories from file paths
 */
function getDirectories(filePaths: string[]): string[] {
  const dirs = new Set<string>();
  for (const filePath of filePaths) {
    const dir = path.dirname(filePath);
    // Add directory and all parent directories up to cwd
    let currentDir = dir;
    while (currentDir && currentDir !== '.' && currentDir !== '/') {
      dirs.add(currentDir);
      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }
  }
  return Array.from(dirs).sort();
}

/**
 * Check for CLAUDE.md files in directories that may need updates
 */
async function checkFolderDocumentation(
  modifiedFiles: string[],
  cwd: string
): Promise<DocumentationIssue[]> {
  const issues: DocumentationIssue[] = [];
  const directories = getDirectories(modifiedFiles);

  for (const dir of directories) {
    const claudeMdPath = path.join(cwd, dir, 'CLAUDE.md');
    const dirRelative = path.relative(cwd, path.join(cwd, dir));

    if (await fileExists(claudeMdPath)) {
      // CLAUDE.md exists - may need updates
      const filesInDir = modifiedFiles.filter(f => path.dirname(f) === dirRelative);

      if (filesInDir.length > 0) {
        issues.push({
          type: 'update_needed',
          file: path.join(dirRelative, 'CLAUDE.md'),
          reason: `Files modified in directory: ${filesInDir.join(', ')}`,
          suggestedChanges: `Review and update ${path.join(dirRelative, 'CLAUDE.md')} to reflect changes to: ${filesInDir.map(f => path.basename(f)).join(', ')}`,
        });
      }
    } else {
      // Check if this directory has significant code files
      const filesInDir = modifiedFiles.filter(f => {
        const fileDir = path.dirname(f);
        return fileDir === dirRelative && /\.(ts|tsx|js|jsx|py|go|rs|java)$/.test(f);
      });

      if (filesInDir.length >= 2) {
        // Multiple code files added - may need CLAUDE.md
        issues.push({
          type: 'missing',
          file: path.join(dirRelative, 'CLAUDE.md'),
          reason: `Multiple new files added without folder documentation`,
          suggestedChanges: `Consider creating ${path.join(dirRelative, 'CLAUDE.md')} to document the purpose and structure of this directory`,
        });
      }
    }
  }

  return issues;
}

/**
 * Check for skill and agent documentation updates
 */
async function checkAgentSkillDocumentation(
  modifiedFiles: string[],
  cwd: string
): Promise<DocumentationIssue[]> {
  const issues: DocumentationIssue[] = [];

  // Check for agent definitions
  const agentFiles = modifiedFiles.filter(f => f.includes('/.claude/agents/') && f.endsWith('.json'));
  const skillFiles = modifiedFiles.filter(f => f.includes('/.claude/skills/') && f.endsWith('.md'));

  // Check if agent was modified
  for (const agentFile of agentFiles) {
    const agentName = path.basename(agentFile, '.json');
    const agentPath = path.join(cwd, agentFile);

    try {
      const content = await fs.readFile(agentPath, 'utf-8');
      const agent = JSON.parse(content);

      issues.push({
        type: 'update_needed',
        file: agentFile,
        reason: 'Agent definition was modified',
        suggestedChanges: `Verify that the agent "${agentName}" documentation matches its updated configuration. Check: ${agent.description || 'description'}, required tools, and usage examples.`,
      });
    } catch {
      // Ignore invalid agent files
    }
  }

  // Check if skill was modified
  for (const skillFile of skillFiles) {
    const skillName = path.basename(skillFile, '.md');

    issues.push({
      type: 'update_needed',
      file: skillFile,
      reason: 'Skill documentation was modified',
      suggestedChanges: `Verify that the skill "${skillName}" documentation is complete and accurate. Check examples, usage patterns, and any referenced files.`,
    });
  }

  return issues;
}

/**
 * Format documentation issues as a report
 */
function formatDocumentationReport(issues: DocumentationIssue[]): string {
  if (issues.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('📚 **Documentation Update Recommendations**');
  lines.push('');
  lines.push('The following documentation may need updates based on the agent\'s work:');
  lines.push('');

  // Group by type
  const missing = issues.filter(i => i.type === 'missing');
  const updateNeeded = issues.filter(i => i.type === 'update_needed');
  const deprecated = issues.filter(i => i.type === 'deprecated');

  if (missing.length > 0) {
    lines.push('**Missing Documentation:**');
    for (const issue of missing) {
      lines.push(`- \`${issue.file}\`: ${issue.reason}`);
      lines.push(`  → ${issue.suggestedChanges}`);
    }
    lines.push('');
  }

  if (updateNeeded.length > 0) {
    lines.push('**Updates Needed:**');
    for (const issue of updateNeeded) {
      lines.push(`- \`${issue.file}\`: ${issue.reason}`);
      lines.push(`  → ${issue.suggestedChanges}`);
    }
    lines.push('');
  }

  if (deprecated.length > 0) {
    lines.push('**Deprecated/Outdated:**');
    for (const issue of deprecated) {
      lines.push(`- \`${issue.file}\`: ${issue.reason}`);
      lines.push(`  → ${issue.suggestedChanges}`);
    }
    lines.push('');
  }

  lines.push('*This is a non-blocking suggestion. Review and update documentation as appropriate.*');

  return lines.join('\n');
}

/**
 * SubagentStop hook handler for documentation checks
 *
 * Analyzes the agent's file operations and suggests documentation updates.
 * This is a non-blocking hook - it only provides guidance.
 *
 * @param input - SubagentStop hook input from Claude Code
 * @returns Hook output with documentation suggestions
 */
async function handler(input: SubagentStopInput): Promise<SubagentStopHookOutput> {
  const logger = createDebugLogger(input.cwd, 'check-documentation', true);

  try {
    await logger.logInput({
      agent_id: input.agent_id,
      agent_transcript_path: input.agent_transcript_path,
    });

    // Get task edits (file operations and prompt)
    let taskEdits;
    try {
      taskEdits = await getTaskEdits(input.agent_transcript_path);
    } catch (error) {
      await logger.logOutput({
        skipped: true,
        reason: 'Could not analyze task edits',
        error: String(error),
      });
      return {};
    }

    const { agentNewFiles, agentEditedFiles, agentDeletedFiles } = taskEdits;

    // Combine all modified files
    const allModifiedFiles = [...agentNewFiles, ...agentEditedFiles, ...agentDeletedFiles];

    if (allModifiedFiles.length === 0) {
      await logger.logOutput({ skipped: true, reason: 'No files modified by agent' });
      return {};
    }

    // Collect documentation issues
    const issues: DocumentationIssue[] = [];

    // Check folder-level documentation
    const folderIssues = await checkFolderDocumentation(allModifiedFiles, input.cwd);
    issues.push(...folderIssues);

    // Check agent/skill documentation
    const agentSkillIssues = await checkAgentSkillDocumentation(allModifiedFiles, input.cwd);
    issues.push(...agentSkillIssues);

    await logger.logOutput({
      issues_found: issues.length,
      missing_docs: issues.filter(i => i.type === 'missing').length,
      updates_needed: issues.filter(i => i.type === 'update_needed').length,
      deprecated: issues.filter(i => i.type === 'deprecated').length,
    });

    if (issues.length === 0) {
      return {};
    }

    // Format and return documentation report (non-blocking)
    const report = formatDocumentationReport(issues);

    return {
      systemMessage: report,
    };
  } catch (error) {
    await logger.logError(error as Error);
    // Don't block on errors - just skip documentation check
    return {};
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
