/**
 * Unified Stop hook: Auto-commit and PR status check
 *
 * Combines functionality from commit-session.ts and check-pr-readiness.ts.
 * This hook performs three main functions at session end:
 *
 * 1. **Blocking validation checks** - Ensures clean git state:
 *    - Merge conflicts detection
 *    - Branch sync status (behind remote)
 *    - Claude settings validation
 *    - Hook file existence checks
 *
 * 2. **Auto-commit** - Preserves work in progress:
 *    - Automatically commits any uncommitted changes
 *    - Adds session metadata to commit message
 *    - Always blocks with commit summary when changes are committed
 *
 * 3. **PR status reporting** - Provides PR visibility:
 *    - Checks if PR exists for current branch
 *    - Fetches latest CI run status and link
 *    - Extracts Vercel preview URLs (web and marketing apps)
 *    - Detects subagent activity to skip PR encouragement intelligently
 *
 * @module commit-session-check-for-pr
 */

import type { StopInput, StopHookOutput } from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

// ============================================================================
// Command Execution
// ============================================================================

/**
 * Execute a shell command and return the result
 *
 * @param command - Shell command to execute
 * @param cwd - Working directory
 * @returns Command result with success flag, stdout, and stderr
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

// ============================================================================
// Git State Checks
// ============================================================================

/**
 * Check if there are uncommitted changes in the working directory
 *
 * @param cwd - Working directory
 * @returns True if there are uncommitted changes
 */
async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  const result = await execCommand('git status --porcelain', cwd);
  return result.success && result.stdout.length > 0;
}

/**
 * Get current git branch name
 *
 * @param cwd - Working directory
 * @returns Branch name or null if detached HEAD
 */
async function getCurrentBranch(cwd: string): Promise<string | null> {
  const result = await execCommand('git rev-parse --abbrev-ref HEAD', cwd);
  return result.success ? result.stdout : null;
}

/**
 * Check if there are merge conflicts in the working directory
 *
 * @param cwd - Working directory
 * @returns Object with conflict status and list of conflicted files
 */
async function checkMergeConflicts(cwd: string): Promise<{
  hasConflicts: boolean;
  conflictedFiles: string[];
}> {
  // Check git status for unmerged paths
  const unmergedResult = await execCommand('git ls-files --unmerged', cwd);
  const hasUnmerged = unmergedResult.stdout.length > 0;

  // Get list of conflicted files
  const conflictFilesResult = await execCommand('git diff --name-only --diff-filter=U', cwd);
  const conflictedFiles = conflictFilesResult.stdout
    ? conflictFilesResult.stdout.split('\n').filter(Boolean)
    : [];

  return {
    hasConflicts: hasUnmerged || conflictedFiles.length > 0,
    conflictedFiles,
  };
}

/**
 * Check if branch is up to date with remote
 *
 * @param cwd - Working directory
 * @returns Object with sync status, commits behind/ahead, and remote branch name
 */
async function checkBranchSync(cwd: string): Promise<{
  isSynced: boolean;
  behindBy: number;
  aheadBy: number;
  remoteBranch: string;
}> {
  // Get current branch
  const branchResult = await execCommand('git branch --show-current', cwd);
  const currentBranch = branchResult.stdout;

  if (!currentBranch) {
    return {
      isSynced: true,
      behindBy: 0,
      aheadBy: 0,
      remoteBranch: '',
    };
  }

  // Fetch latest from remote
  await execCommand('git fetch', cwd);

  // Get tracking branch
  const trackingResult = await execCommand(
    `git rev-parse --abbrev-ref ${currentBranch}@{upstream}`,
    cwd
  );

  if (!trackingResult.success) {
    // No tracking branch set up
    return {
      isSynced: true,
      behindBy: 0,
      aheadBy: 0,
      remoteBranch: '',
    };
  }

  const remoteBranch = trackingResult.stdout;

  // Check how many commits behind/ahead we are
  const revListResult = await execCommand(
    `git rev-list --left-right --count ${currentBranch}...${remoteBranch}`,
    cwd
  );

  if (!revListResult.success) {
    return {
      isSynced: true,
      behindBy: 0,
      aheadBy: 0,
      remoteBranch,
    };
  }

  // Parse output: "ahead\tbehind"
  const [aheadStr, behindStr] = revListResult.stdout.split('\t');
  const aheadBy = parseInt(aheadStr || '0', 10);
  const behindBy = parseInt(behindStr || '0', 10);

  return {
    isSynced: behindBy === 0,
    behindBy,
    aheadBy,
    remoteBranch,
  };
}

// ============================================================================
// GitHub CLI Operations
// ============================================================================

/**
 * Check if a PR exists for the current branch
 *
 * Uses GitHub CLI to query for existing PRs where the head branch
 * matches the current branch name.
 *
 * @param branch - Current branch name
 * @param cwd - Working directory
 * @returns Object with PR existence status, number, URL, or error
 */
async function checkPRExists(
  branch: string,
  cwd: string
): Promise<{
  exists: boolean;
  prNumber?: number;
  prUrl?: string;
  error?: string;
}> {
  // Check if gh CLI is available
  const ghCheck = await execCommand('gh --version', cwd);
  if (!ghCheck.success) {
    return {
      exists: false,
      error: 'GitHub CLI not installed'
    };
  }

  // Check if gh is authenticated
  const authCheck = await execCommand('gh auth status', cwd);
  if (!authCheck.success) {
    return {
      exists: false,
      error: 'GitHub CLI not authenticated'
    };
  }

  // List PRs for current branch
  const prListResult = await execCommand(
    `gh pr list --head ${branch} --json number,url --limit 1`,
    cwd
  );

  if (!prListResult.success) {
    return {
      exists: false,
      error: `gh pr list failed: ${prListResult.stderr}`
    };
  }

  // Parse JSON output
  try {
    const prs = JSON.parse(prListResult.stdout);

    if (Array.isArray(prs) && prs.length > 0) {
      return {
        exists: true,
        prNumber: prs[0].number,
        prUrl: prs[0].url,
      };
    }

    return { exists: false };
  } catch (parseError) {
    return {
      exists: false,
      error: `Failed to parse gh output: ${parseError}`
    };
  }
}

/**
 * Get the latest CI workflow run
 *
 * @param prNumber - PR number
 * @param cwd - Working directory
 * @returns Object with CI run details or error
 */
async function getLatestCIRun(
  prNumber: number,
  cwd: string
): Promise<{
  url?: string;
  status?: string;
  conclusion?: string;
  name?: string;
  error?: string;
}> {
  const runListResult = await execCommand(
    `gh run list --limit 1 --json databaseId,displayTitle,status,conclusion,url`,
    cwd
  );

  if (!runListResult.success) {
    return {};
  }

  try {
    const runs = JSON.parse(runListResult.stdout);
    if (Array.isArray(runs) && runs.length > 0) {
      const run = runs[0];
      return {
        url: run.url,
        status: run.status,
        conclusion: run.conclusion,
        name: run.displayTitle,
      };
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Extract Vercel preview URLs from PR comments
 *
 * @param prNumber - PR number
 * @param cwd - Working directory
 * @returns Object with web/marketing URLs and all found URLs
 */
async function getVercelPreviewUrls(
  prNumber: number,
  cwd: string
): Promise<{
  webUrl?: string;
  marketingUrl?: string;
  allUrls: string[];
}> {
  const commentsResult = await execCommand(
    `gh pr view ${prNumber} --json comments`,
    cwd
  );

  if (!commentsResult.success) {
    return { allUrls: [] };
  }

  try {
    const data = JSON.parse(commentsResult.stdout);
    const comments = data.comments || [];

    // Extract all Vercel URLs from comment bodies
    const vercelUrlPattern = /https:\/\/[a-z0-9-]+\.vercel\.app/g;
    const allUrls: string[] = [];

    for (const comment of comments) {
      const matches = comment.body?.match(vercelUrlPattern) || [];
      allUrls.push(...matches);
    }

    // Deduplicate URLs
    const uniqueUrls = [...new Set(allUrls)];

    // Identify web and marketing apps by URL pattern
    const webUrl = uniqueUrls.find(url =>
      url.includes('-web-') || url.includes('web-') || url.match(/web\.vercel\.app/)
    );
    const marketingUrl = uniqueUrls.find(url =>
      url.includes('-marketing-') || url.includes('marketing-') || url.match(/marketing\.vercel\.app/)
    );

    return {
      webUrl,
      marketingUrl,
      allUrls: uniqueUrls,
    };
  } catch {
    return { allUrls: [] };
  }
}

// ============================================================================
// Subagent Activity Detection
// ============================================================================

/**
 * Check if there has been recent subagent activity
 *
 * Detects if a subagent just stopped and may be awaiting user input.
 * If true, skips PR encouragement to avoid interrupting workflow.
 *
 * @param cwd - Working directory
 * @returns True if recent subagent activity detected
 */
async function hasRecentSubagentActivity(cwd: string): Promise<boolean> {
  const tasksFilePath = join(cwd, '.claude', 'logs', 'subagent-tasks.json');

  try {
    if (!existsSync(tasksFilePath)) {
      return false;
    }

    const content = readFileSync(tasksFilePath, 'utf-8');
    const tasks = JSON.parse(content);

    // If any subagent contexts exist, there's recent subagent activity
    return Object.keys(tasks).length > 0;
  } catch {
    return false;
  }
}

// ============================================================================
// Validation Checks
// ============================================================================

/**
 * Run claude doctor to check for settings issues
 *
 * Executes `claude doctor` command and parses output for errors.
 *
 * @param cwd - Working directory
 * @returns Object with health status and any issues found
 */
async function checkClaudeDoctor(cwd: string): Promise<{
  healthy: boolean;
  issues: string[];
  error?: string;
}> {
  // Check if claude CLI is available
  const claudeCheck = await execCommand('claude --version', cwd);
  if (!claudeCheck.success) {
    return {
      healthy: true, // Don't block if claude not available
      issues: [],
      error: 'Claude CLI not available'
    };
  }

  // Run claude doctor
  const doctorResult = await execCommand('claude doctor --json 2>&1', cwd);

  // Check for known non-settings errors first
  const knownNonSettingsErrors = [
    'Raw mode is not supported',
    'isRawModeSupported',
    'Ink',
    'Command failed: claude doctor',
  ];

  const errorText = doctorResult.stderr || doctorResult.stdout || '';
  const isNonSettingsError = knownNonSettingsErrors.some(
    pattern => errorText.includes(pattern)
  );

  if (!doctorResult.success && isNonSettingsError) {
    // Terminal/UI error, not a settings issue
    return {
      healthy: true,
      issues: [],
      error: 'Claude doctor failed due to terminal limitations (non-blocking)'
    };
  }

  // Parse output
  try {
    // Try to parse as JSON first
    if (doctorResult.stdout) {
      const doctorOutput = JSON.parse(doctorResult.stdout);

      // Check for errors or warnings in output
      const issues: string[] = [];

      if (doctorOutput.errors && Array.isArray(doctorOutput.errors)) {
        issues.push(...doctorOutput.errors);
      }

      if (doctorOutput.warnings && Array.isArray(doctorOutput.warnings)) {
        issues.push(...doctorOutput.warnings);
      }

      return {
        healthy: issues.length === 0,
        issues
      };
    }

    // If no JSON output, check exit code
    if (!doctorResult.success && !isNonSettingsError) {
      return {
        healthy: false,
        issues: [doctorResult.stderr || 'Unknown error']
      };
    }

    return {
      healthy: true,
      issues: []
    };
  } catch {
    // If JSON parsing fails, check exit code
    if (!doctorResult.success && !isNonSettingsError) {
      return {
        healthy: false,
        issues: [doctorResult.stderr || doctorResult.stdout || 'Claude doctor failed']
      };
    }

    return {
      healthy: true,
      issues: []
    };
  }
}

/**
 * Validate all registered hooks point to real files
 *
 * Checks both plugin hooks and .claude/hooks directory for missing files.
 *
 * @param cwd - Working directory
 * @returns Object with validation status and missing files
 */
async function validateHookFiles(cwd: string): Promise<{
  valid: boolean;
  missingFiles: string[];
  error?: string;
}> {
  const missingFiles: string[] = [];

  try {
    // Check .claude/settings.json for enabled plugins
    const settingsPath = join(cwd, '.claude', 'settings.json');

    if (!existsSync(settingsPath)) {
      // No settings file, skip validation
      return { valid: true, missingFiles: [] };
    }

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const enabledPlugins = settings.enabledPlugins || {};

    // For each enabled plugin, check hooks
    for (const [pluginName, enabled] of Object.entries(enabledPlugins)) {
      if (!enabled) continue;

      // Try to find plugin in cache
      const pluginCachePath = join(
        process.env.HOME || '/home',
        '.claude',
        'plugins',
        'cache',
        pluginName.replace('@', '/'),
        'hooks',
        'hooks.json'
      );

      if (existsSync(pluginCachePath)) {
        const hooksConfig = JSON.parse(readFileSync(pluginCachePath, 'utf-8'));

        if (hooksConfig.hooks) {
          // Validate hook files
          for (const [_eventName, eventHooks] of Object.entries(hooksConfig.hooks)) {
            if (!Array.isArray(eventHooks)) continue;

            for (const hookGroup of eventHooks) {
              if (!hookGroup.hooks) continue;

              for (const hook of hookGroup.hooks) {
                if (hook.type === 'command' && hook.command) {
                  // Extract file path from command (remove npx tsx and ${CLAUDE_PLUGIN_ROOT})
                  const commandMatch = hook.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/(.+)$/);
                  if (commandMatch) {
                    const hookFile = commandMatch[1];
                    const pluginDir = pluginCachePath.replace('/hooks/hooks.json', '');
                    const hookPath = join(pluginDir, hookFile);

                    if (!existsSync(hookPath)) {
                      missingFiles.push(`${pluginName}: ${hookFile}`);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Check local .claude/hooks directory
    const localHooksDir = join(cwd, '.claude', 'hooks');
    if (existsSync(localHooksDir)) {
      const localHooksJson = join(localHooksDir, 'hooks.json');

      if (existsSync(localHooksJson)) {
        const localHooksConfig = JSON.parse(readFileSync(localHooksJson, 'utf-8'));

        if (localHooksConfig.hooks) {
          for (const [_eventName, eventHooks] of Object.entries(localHooksConfig.hooks)) {
            if (!Array.isArray(eventHooks)) continue;

            for (const hookGroup of eventHooks) {
              if (!hookGroup.hooks) continue;

              for (const hook of hookGroup.hooks) {
                if (hook.type === 'command' && hook.command) {
                  // For local hooks, files should be relative to .claude/hooks
                  const commandMatch = hook.command.match(/hooks\/(.+\.ts)$/);
                  if (commandMatch) {
                    const hookFile = commandMatch[1];
                    const hookPath = join(localHooksDir, hookFile);

                    if (!existsSync(hookPath)) {
                      missingFiles.push(`.claude/hooks: ${hookFile}`);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return {
      valid: missingFiles.length === 0,
      missingFiles
    };
  } catch (error) {
    return {
      valid: true, // Don't block on validation errors
      missingFiles: [],
      error: `Hook validation error: ${error}`
    };
  }
}

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Format commit message with session metadata
 *
 * @param sessionId - Session ID
 * @param branch - Current branch name
 * @returns Formatted commit message
 */
function formatCommitMessage(sessionId: string, branch: string | null): string {
  const timestamp = new Date().toISOString();
  return `Session work

Auto-commit at session end to preserve work in progress.

Session-ID: ${sessionId}
Session-Timestamp: ${timestamp}${branch ? `\nBranch: ${branch}` : ''}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`;
}

/**
 * Format PR status message when commit was made and PR exists
 *
 * @param commitSha - Commit SHA
 * @param prCheck - PR details
 * @param ciRun - CI run details
 * @param vercelUrls - Vercel preview URLs
 * @returns Formatted message
 */
function formatPRStatusWithCommit(
  commitSha: string,
  prCheck: { prNumber: number; prUrl: string },
  ciRun: { url?: string; status?: string; conclusion?: string; name?: string },
  vercelUrls: { webUrl?: string; marketingUrl?: string }
): string {
  let message = `✅ Auto-committed session work: ${commitSha}\n\n`;
  message += `📋 **PR #${prCheck.prNumber}**\n`;
  message += `🔗 ${prCheck.prUrl}\n\n`;

  if (ciRun.url) {
    const statusIcon = ciRun.conclusion === 'success' ? '✓' : ciRun.conclusion === 'failure' ? '❌' : '⏳';
    message += `🔄 **Latest CI:** ${ciRun.name || 'Workflow'}\n`;
    message += `   ${statusIcon} Status: ${ciRun.status} ${ciRun.conclusion ? `(${ciRun.conclusion})` : ''}\n`;
    message += `   ${ciRun.url}\n\n`;
  }

  if (vercelUrls.webUrl || vercelUrls.marketingUrl) {
    message += `🌐 **Preview URLs:**\n`;
    if (vercelUrls.webUrl) message += `   • Web: ${vercelUrls.webUrl}\n`;
    if (vercelUrls.marketingUrl) message += `   • Marketing: ${vercelUrls.marketingUrl}\n`;
    message += '\n';
  }

  message += 'Press enter to continue.';
  return message;
}

/**
 * Format message when commit was made but no PR exists
 *
 * @param commitSha - Commit SHA
 * @param branch - Current branch name
 * @param aheadBy - Number of commits ahead
 * @param hasSubagentActivity - Whether subagent is waiting
 * @returns Formatted message
 */
function formatCommitWithNoPR(
  commitSha: string,
  branch: string,
  aheadBy: number,
  hasSubagentActivity: boolean
): string {
  let message = `✅ Auto-committed session work: ${commitSha}\n\n`;
  message += `📋 **Branch:** \`${branch}\`\n`;
  message += `📊 **Status:** ${aheadBy} commit${aheadBy === 1 ? '' : 's'} ahead\n\n`;

  if (!hasSubagentActivity) {
    message += `🚀 **Ready to create PR:**\n`;
    message += `   gh pr create --fill\n\n`;
  }

  message += 'Press enter to continue.';
  return message;
}

/**
 * Format PR status info message (non-blocking)
 *
 * @param prCheck - PR details
 * @param ciRun - CI run details
 * @param vercelUrls - Vercel preview URLs
 * @returns Formatted message
 */
function formatPRStatusInfo(
  prCheck: { prNumber: number; prUrl: string },
  ciRun: { url?: string; status?: string; conclusion?: string; name?: string },
  vercelUrls: { webUrl?: string; marketingUrl?: string }
): string {
  let message = `📋 **PR #${prCheck.prNumber}**\n`;
  message += `🔗 ${prCheck.prUrl}\n\n`;

  if (ciRun.url) {
    const statusIcon = ciRun.conclusion === 'success' ? '✓' : ciRun.conclusion === 'failure' ? '❌' : '⏳';
    message += `🔄 **Latest CI:** ${ciRun.name || 'Workflow'}\n`;
    message += `   ${statusIcon} ${ciRun.status} ${ciRun.conclusion ? `(${ciRun.conclusion})` : ''}\n`;
    message += `   ${ciRun.url}\n\n`;
  }

  if (vercelUrls.webUrl || vercelUrls.marketingUrl) {
    message += `🌐 **Preview URLs:**\n`;
    if (vercelUrls.webUrl) message += `   • Web: ${vercelUrls.webUrl}\n`;
    if (vercelUrls.marketingUrl) message += `   • Marketing: ${vercelUrls.marketingUrl}\n`;
  }

  return message;
}

/**
 * Format PR encouragement message (non-blocking)
 *
 * @param branch - Current branch name
 * @param aheadBy - Number of commits ahead
 * @returns Formatted message
 */
function formatNoPREncouragement(branch: string, aheadBy: number): string {
  return `✓ Branch ready for PR\n\n` +
         `📋 **Branch:** \`${branch}\`\n` +
         `📊 ${aheadBy} commit${aheadBy === 1 ? '' : 's'} ahead\n\n` +
         `🚀 Create PR: gh pr create --fill`;
}

/**
 * Format blocking error messages for various checks
 */
function formatConflictError(conflictedFiles: string[]): string {
  return [
    '🚨 Merge Conflicts Detected:',
    '',
    `⚠️  ${conflictedFiles.length} file(s) have unresolved conflicts:`,
    ...conflictedFiles.map(f => `  - ${f}`),
    '',
    'Please resolve these conflicts before ending the session:',
    '  • Open conflicted files and resolve markers (<<<<<<, ======, >>>>>>)',
    '  • Stage resolved files: git add <file>',
    '  • Or use: git mergetool',
  ].join('\n');
}

function formatSyncError(syncCheck: { behindBy: number; aheadBy: number; remoteBranch: string }): string {
  return [
    '🚨 Branch Out of Sync:',
    '',
    `⚠️  Your branch is ${syncCheck.behindBy} commit(s) behind ${syncCheck.remoteBranch}`,
    `  (You are ${syncCheck.aheadBy} commit(s) ahead)`,
    '',
    'Please sync your branch before ending the session:',
    '  • Pull and merge: git pull',
    '  • Or rebase: git pull --rebase',
    '',
    'This prevents conflicts and ensures you\'re working with the latest code.',
  ].join('\n');
}

function formatDoctorErrors(issues: string[]): string {
  return [
    '🚨 Claude Code Settings Issues Detected:',
    '',
    ...issues.map(issue => `⚠️  ${issue}`),
    '',
    'Please fix these settings issues before ending the session:',
    '  • Run: claude doctor',
    '  • Review and fix reported issues',
    '  • Check .claude/settings.json for configuration errors',
  ].join('\n');
}

function formatHookErrors(missingFiles: string[]): string {
  return [
    '🚨 Missing Hook Files Detected:',
    '',
    `⚠️  ${missingFiles.length} hook file(s) are missing:`,
    ...missingFiles.map(file => `  - ${file}`),
    '',
    'Please fix these hook issues before ending the session:',
    '  • Reinstall affected plugins: claude plugin install <plugin-name>',
    '  • Or remove broken plugins from .claude/settings.json',
    '  • Check plugin cache: ~/.claude/plugins/cache/',
  ].join('\n');
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Stop hook handler
 *
 * Unified hook that combines auto-commit and PR status checking.
 * Executes in four phases:
 * 1. Blocking validation checks (merge conflicts, branch sync, etc.)
 * 2. Auto-commit uncommitted changes
 * 3. PR status check (if applicable)
 * 4. Output decision based on state
 *
 * @param input - Stop hook input from Claude Code
 * @returns Hook output with blocking decision or system message
 */
async function handler(input: StopInput): Promise<StopHookOutput> {
  const logger = createDebugLogger(input.cwd, 'commit-session-check-for-pr', true);

  try {
    await logger.logInput({ session_id: input.session_id });

    // === PHASE 1: BLOCKING CHECKS ===
    // These must pass before we proceed

    // Check if in git repository
    const gitCheck = await execCommand('git rev-parse --is-inside-work-tree', input.cwd);
    if (!gitCheck.success) {
      await logger.logOutput({ skipped: true, reason: 'Not a git repository' });
      return {};
    }

    // Check Claude settings health
    const doctorCheck = await checkClaudeDoctor(input.cwd);
    if (!doctorCheck.healthy && doctorCheck.issues.length > 0) {
      return {
        decision: 'block',
        reason: formatDoctorErrors(doctorCheck.issues)
      };
    }

    // Validate hook files exist
    const hookValidation = await validateHookFiles(input.cwd);
    if (!hookValidation.valid && hookValidation.missingFiles.length > 0) {
      return {
        decision: 'block',
        reason: formatHookErrors(hookValidation.missingFiles)
      };
    }

    // Check for merge conflicts
    const conflictCheck = await checkMergeConflicts(input.cwd);
    if (conflictCheck.hasConflicts) {
      return {
        decision: 'block',
        reason: formatConflictError(conflictCheck.conflictedFiles)
      };
    }

    // Check branch sync status (behind remote)
    const syncCheck = await checkBranchSync(input.cwd);
    if (!syncCheck.isSynced && syncCheck.remoteBranch) {
      return {
        decision: 'block',
        reason: formatSyncError(syncCheck)
      };
    }

    // === PHASE 2: AUTO-COMMIT ===
    let commitMade = false;
    let commitSha = '';

    const hasChanges = await hasUncommittedChanges(input.cwd);

    if (hasChanges) {
      const branch = await getCurrentBranch(input.cwd);
      await execCommand('git add -A', input.cwd);

      const commitMessage = formatCommitMessage(input.session_id, branch);
      const commitResult = await execCommand(
        `git commit -m ${JSON.stringify(commitMessage)}`,
        input.cwd
      );

      if (commitResult.success) {
        const shaResult = await execCommand('git rev-parse HEAD', input.cwd);
        commitSha = shaResult.success ? shaResult.stdout.substring(0, 7) : 'unknown';
        commitMade = true;

        await logger.logOutput({ commit_made: true, commit_sha: commitSha });

        // Re-check branch sync after commit
        const postCommitSync = await checkBranchSync(input.cwd);
        syncCheck.aheadBy = postCommitSync.aheadBy;
      } else {
        await logger.logOutput({ commit_failed: true, error: commitResult.stderr });
      }
    }

    // === PHASE 3: PR STATUS CHECK ===
    const currentBranch = await getCurrentBranch(input.cwd);

    // Skip PR checks for main branches
    const mainBranches = ['main', 'master', 'develop'];
    if (!currentBranch || mainBranches.includes(currentBranch)) {
      if (commitMade) {
        return {
          decision: 'block',
          reason: `✅ Auto-committed session work: ${commitSha}\n\nSession end.`
        };
      }
      return {};
    }

    // Check if subagent just stopped (awaiting user input)
    const hasSubagentActivity = await hasRecentSubagentActivity(input.cwd);

    // Check if PR exists
    const prCheck = await checkPRExists(currentBranch, input.cwd);

    // === PHASE 4: OUTPUT DECISION ===

    if (commitMade) {
      // New changes were committed - always block with status
      if (prCheck.exists && prCheck.prNumber && prCheck.prUrl) {
        // Fetch PR details
        const ciRun = await getLatestCIRun(prCheck.prNumber, input.cwd);
        const vercelUrls = await getVercelPreviewUrls(prCheck.prNumber, input.cwd);

        return {
          decision: 'block',
          reason: formatPRStatusWithCommit(commitSha, { prNumber: prCheck.prNumber, prUrl: prCheck.prUrl }, ciRun, vercelUrls)
        };
      } else {
        // No PR exists - encourage creation
        return {
          decision: 'block',
          reason: formatCommitWithNoPR(commitSha, currentBranch, syncCheck.aheadBy, hasSubagentActivity)
        };
      }
    } else {
      // No new commits - show PR info if available
      if (prCheck.exists && prCheck.prNumber && prCheck.prUrl && syncCheck.aheadBy > 0) {
        const ciRun = await getLatestCIRun(prCheck.prNumber, input.cwd);
        const vercelUrls = await getVercelPreviewUrls(prCheck.prNumber, input.cwd);

        return {
          systemMessage: formatPRStatusInfo({ prNumber: prCheck.prNumber, prUrl: prCheck.prUrl }, ciRun, vercelUrls)
        };
      } else if (syncCheck.aheadBy > 0 && !hasSubagentActivity) {
        // Has commits but no PR and no subagent waiting
        return {
          systemMessage: formatNoPREncouragement(currentBranch, syncCheck.aheadBy)
        };
      }
    }

    return {};
  } catch (error) {
    await logger.logError(error as Error);

    // Don't block on errors - just log them
    return {};
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
