/**
 * Supabase Session Cleanup Hook
 * Stop hook that:
 * 1. Stops Supabase containers for worktree sessions
 * 2. Restores config.toml from backup
 * 3. Updates session state to mark as stopped
 * @module stop-supabase-session
 */

import type { StopInput, StopHookOutput } from '../shared/types/types.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { detectWorktree } from '../shared/hooks/utils/worktree.js';
import {
  loadWorktreeSupabaseSession,
  updateWorktreeSupabaseSession,
} from '../shared/hooks/utils/session-state.js';
import {
  restoreSupabaseConfig,
  getSupabaseConfigPath,
} from '../shared/hooks/utils/supabase-ports.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

interface ExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

/**
 * Execute a command and return result
 */
async function execCommand(command: string, options: { cwd: string }): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: options.cwd,
      timeout: 30000, // 30 seconds
    });
    return { success: true, stdout, stderr };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      success: false,
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || 'Unknown error',
    };
  }
}

/**
 * Stop hook handler
 */
async function handler(input: StopInput): Promise<StopHookOutput> {
  const logger = createDebugLogger(input.cwd, 'stop-supabase-session', true);
  await logger.logInput(input);

  const worktreeInfo = detectWorktree(input.cwd);

  // Only auto-cleanup worktrees (not main repo)
  if (!worktreeInfo.isWorktree) {
    const output: StopHookOutput = {
      decision: 'approve',
      systemMessage: 'Main repo - skipping automatic Supabase cleanup',
    };
    await logger.logOutput(output);
    return output;
  }

  // Load session state
  const session = await loadWorktreeSupabaseSession(input.cwd, worktreeInfo.worktreeId);
  if (!session || !session.running) {
    const output: StopHookOutput = {
      decision: 'approve',
      systemMessage: 'No running Supabase session found',
    };
    await logger.logOutput(output);
    return output;
  }

  const messages: string[] = [];
  messages.push(`🧹 Cleaning up Supabase for worktree: ${worktreeInfo.worktreeName}`);
  messages.push(`   Project ID: ${session.worktreeProjectId}`);

  // Stop Supabase containers
  const stopResult = await execCommand(`supabase stop`, { cwd: input.cwd });
  if (stopResult.success) {
    messages.push(`✓ Stopped Supabase containers (${session.worktreeProjectId})`);
  } else {
    messages.push(`⚠️ Failed to stop Supabase: ${stopResult.stderr}`);
  }

  // Restore config.toml from backup
  if (session.configBackupPath && existsSync(session.configBackupPath)) {
    const configPath = getSupabaseConfigPath(input.cwd);
    const restored = restoreSupabaseConfig(configPath, `.backup-${worktreeInfo.worktreeId}`);
    if (restored) {
      messages.push('✓ Restored config.toml from backup');
    } else {
      messages.push('⚠️ Failed to restore config.toml');
    }
  }

  // Mark session as stopped
  await updateWorktreeSupabaseSession(input.cwd, worktreeInfo.worktreeId, { running: false });
  messages.push('✓ Session state updated');

  const output: StopHookOutput = {
    decision: 'approve',
    systemMessage: messages.join('\n'),
  };

  await logger.logOutput(output);
  return output;
}

export { handler };
runHook(handler);
