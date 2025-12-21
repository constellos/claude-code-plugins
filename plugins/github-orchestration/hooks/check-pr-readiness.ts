/**
 * PR readiness and branch status validation hook
 *
 * Stop (SessionEnd) hook that validates branch state and encourages PR creation.
 * Ensures clean exits from Claude Code sessions with helpful Git workflow guidance.
 *
 * This hook performs three types of checks:
 * 1. **BLOCKING checks** - Prevents session end if critical issues exist
 *    - Merge conflicts in working directory
 *    - Branch behind remote (needs pull/rebase)
 *
 * 2. **NON-BLOCKING reminders** - Encourages good practices when ready
 *    - Suggests PR creation when branch has unpushed commits and no PR exists
 *    - Provides helpful gh CLI commands
 *
 * 3. **Silent operation** - No output when
 *    - No commits to push (aheadBy === 0)
 *    - PR already exists for branch
 *    - On main/master/develop branch
 *    - GitHub CLI not available
 *
 * @module check-pr-readiness
 */

import type { SessionEndInput, SessionEndHookOutput } from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

/**
 * Execute a git command and return the result
 */
async function gitExec(
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
 * Check if there are merge conflicts in the working directory
 */
async function checkMergeConflicts(cwd: string): Promise<{
  hasConflicts: boolean;
  conflictedFiles: string[];
}> {
  // Check git status for unmerged paths
  const unmergedResult = await gitExec('git ls-files --unmerged', cwd);
  const hasUnmerged = unmergedResult.stdout.length > 0;

  // Get list of conflicted files
  const conflictFilesResult = await gitExec('git diff --name-only --diff-filter=U', cwd);
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
 */
async function checkBranchSync(cwd: string): Promise<{
  isSynced: boolean;
  behindBy: number;
  aheadBy: number;
  remoteBranch: string;
}> {
  // Get current branch
  const branchResult = await gitExec('git branch --show-current', cwd);
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
  await gitExec('git fetch', cwd);

  // Get tracking branch
  const trackingResult = await gitExec(
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
  const revListResult = await gitExec(
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
  const ghCheck = await gitExec('gh --version', cwd);
  if (!ghCheck.success) {
    return {
      exists: false,
      error: 'GitHub CLI not installed'
    };
  }

  // Check if gh is authenticated
  const authCheck = await gitExec('gh auth status', cwd);
  if (!authCheck.success) {
    return {
      exists: false,
      error: 'GitHub CLI not authenticated'
    };
  }

  // List PRs for current branch
  const prListResult = await gitExec(
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
 * Run claude doctor to check for settings issues
 *
 * Executes `claude doctor` command and parses output for errors.
 *
 * @param cwd - Working directory
 * @returns Object with health status and any issues found
 */
async function _checkClaudeDoctor(cwd: string): Promise<{
  healthy: boolean;
  issues: string[];
  error?: string;
}> {
  // Check if claude CLI is available
  const claudeCheck = await gitExec('claude --version', cwd);
  if (!claudeCheck.success) {
    return {
      healthy: true, // Don't block if claude not available
      issues: [],
      error: 'Claude CLI not available'
    };
  }

  // Run claude doctor
  const doctorResult = await gitExec('claude doctor --json 2>&1', cwd);

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
    return {
      healthy: doctorResult.success,
      issues: doctorResult.success ? [] : [doctorResult.stderr || 'Unknown error']
    };
  } catch {
    // If JSON parsing fails, check exit code
    if (!doctorResult.success) {
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
async function _validateHookFiles(cwd: string): Promise<{
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

/**
 * SessionEnd hook handler
 *
 * Checks branch status and merge conflicts at session end.
 * Returns blocking error if issues are found.
 *
 * @param input - SessionEnd hook input from Claude Code
 * @returns Hook output with error if issues detected
 */
async function handler(input: SessionEndInput): Promise<SessionEndHookOutput> {
  const logger = createDebugLogger(input.cwd, 'check-pr-readiness', true);

  try {
    await logger.logInput({ session_id: input.session_id });

    // Check if we're in a git repository
    const gitCheck = await gitExec('git rev-parse --is-inside-work-tree', input.cwd);
    if (!gitCheck.success) {
      await logger.logOutput({ skipped: true, reason: 'Not a git repository' });
      return {};
    }

    // Check Claude Code settings health
    const doctorCheck = await _checkClaudeDoctor(input.cwd);
    if (!doctorCheck.healthy && doctorCheck.issues.length > 0) {
      const errorMessage = [
        '🚨 Claude Code Settings Issues Detected:',
        '',
        ...doctorCheck.issues.map(issue => `⚠️  ${issue}`),
        '',
        'Please fix these settings issues before ending the session:',
        '  • Run: claude doctor',
        '  • Review and fix reported issues',
        '  • Check .claude/settings.json for configuration errors',
      ].join('\n');

      return { systemMessage: errorMessage };
    }

    // Validate hook files exist
    const hookValidation = await _validateHookFiles(input.cwd);
    if (!hookValidation.valid && hookValidation.missingFiles.length > 0) {
      const errorMessage = [
        '🚨 Missing Hook Files Detected:',
        '',
        `⚠️  ${hookValidation.missingFiles.length} hook file(s) are missing:`,
        ...hookValidation.missingFiles.map(file => `  - ${file}`),
        '',
        'Please fix these hook issues before ending the session:',
        '  • Reinstall affected plugins: claude plugin install <plugin-name>',
        '  • Or remove broken plugins from .claude/settings.json',
        '  • Check plugin cache: ~/.claude/plugins/cache/',
      ].join('\n');

      return { systemMessage: errorMessage };
    }

    // Check for merge conflicts
    const conflictCheck = await checkMergeConflicts(input.cwd);
    if (conflictCheck.hasConflicts) {
      const errorMessage = [
        '🚨 Merge Conflicts Detected:',
        '',
        `⚠️  ${conflictCheck.conflictedFiles.length} file(s) have unresolved conflicts:`,
        ...conflictCheck.conflictedFiles.map(f => `  - ${f}`),
        '',
        'Please resolve these conflicts before ending the session:',
        '  • Open conflicted files and resolve markers (<<<<<<, ======, >>>>>>)',
        '  • Stage resolved files: git add <file>',
        '  • Or use: git mergetool',
      ].join('\n');

      return { systemMessage: errorMessage };
    }

    // Check branch sync status
    const syncCheck = await checkBranchSync(input.cwd);

    // Block if behind remote
    if (!syncCheck.isSynced && syncCheck.remoteBranch) {
      const errorMessage = [
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

      return { systemMessage: errorMessage };
    }

    // Get current branch for PR check
    const branchResult = await gitExec('git branch --show-current', input.cwd);
    const currentBranch = branchResult.stdout;

    // Check if there are commits to push
    if (syncCheck.aheadBy === 0 || !currentBranch) {
      // No commits ahead or detached HEAD - nothing to create PR for
      await logger.logOutput({
        skipped: true,
        reason: 'No unpushed commits or detached HEAD',
        ahead_by: syncCheck.aheadBy,
        branch: currentBranch,
      });
      return {};
    }

    // Don't encourage PRs from main branches
    const mainBranches = ['main', 'master', 'develop'];
    if (mainBranches.includes(currentBranch)) {
      await logger.logOutput({
        skipped: true,
        reason: 'On main branch',
        branch: currentBranch,
      });
      return {};
    }

    // Check if PR already exists
    const prCheck = await checkPRExists(currentBranch, input.cwd);

    if (prCheck.error) {
      // Can't check PR status - log but don't block or encourage
      await logger.logOutput({
        skipped: true,
        reason: 'Cannot check PR status',
        error: prCheck.error,
      });
      return {};
    }

    if (prCheck.exists) {
      // PR already exists - silent exit
      await logger.logOutput({
        skipped: true,
        reason: 'PR already exists',
        pr_number: prCheck.prNumber,
        pr_url: prCheck.prUrl,
      });
      return {};
    }

    // Ready for PR - non-blocking encouragement
    await logger.logOutput({
      ready_for_pr: true,
      branch: currentBranch,
      commits_ahead: syncCheck.aheadBy,
      remote_branch: syncCheck.remoteBranch,
      has_conflicts: false,
      is_synced: true,
    });

    const commitWord = syncCheck.aheadBy === 1 ? 'commit' : 'commits';
    const reminderMessage = [
      '✓ Branch is ready for pull request!',
      '',
      `📋 **Branch:** \`${currentBranch}\``,
      `📊 **Status:** ${syncCheck.aheadBy} ${commitWord} ahead of ${syncCheck.remoteBranch}`,
      '',
      '🚀 **Ready to create PR:**',
      `   gh pr create --fill`,
      '',
      'Or create PR with custom title and body:',
      `   gh pr create --title "Your PR title" --body "Description"`,
      '',
      '*This is a reminder, not a requirement. Create a PR when you\'re ready!*',
    ].join('\n');

    return { systemMessage: reminderMessage };
  } catch (error) {
    await logger.logError(error as Error);

    return {
      systemMessage: `Branch status check error: ${error}`,
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
