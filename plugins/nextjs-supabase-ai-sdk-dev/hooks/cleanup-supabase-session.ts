/**
 * Supabase Session Cleanup Hook (SessionEnd)
 * SessionEnd hook that:
 * 1. Stops Supabase containers for the current session
 * 2. Restores config.toml from backup (for worktree sessions)
 * 3. Marks session state as stopped
 *
 * This is the primary cleanup hook that runs when the user exits the session
 * (Ctrl+C, /clear, logout, etc.)
 *
 * @module cleanup-supabase-session
 */

import type { SessionEndInput, SessionEndHookOutput } from '../shared/types/types.js';
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

/**
 * Execute a command and return result
 */
async function execCommand(
  command: string,
  options: { cwd: string; timeout?: number }
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: options.cwd,
      timeout: options.timeout ?? 30000,
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
 * SessionEnd hook handler - cleanup Supabase containers on session end
 */
async function handler(input: SessionEndInput): Promise<SessionEndHookOutput> {
  const logger = createDebugLogger(input.cwd, 'cleanup-supabase-session', true);
  await logger.logInput({
    session_id: input.session_id,
    reason: input.reason,
  });

  const worktreeInfo = detectWorktree(input.cwd);

  // Load session state
  const session = await loadWorktreeSupabaseSession(input.cwd, worktreeInfo.worktreeId);

  // Only cleanup if:
  // 1. Session exists and is running
  // 2. Session was started by this Claude session (matching sessionId)
  if (!session?.running) {
    await logger.logOutput({ success: true, reason: 'no_running_session' });
    return {};
  }

  if (session.sessionId && session.sessionId !== input.session_id) {
    await logger.logOutput({
      success: true,
      reason: 'different_session',
      current: input.session_id,
      session_owner: session.sessionId,
    });
    return {};
  }

  // Stop Supabase containers using docker directly
  // This is faster and more reliable than `supabase stop` during exit
  if (session.worktreeProjectId) {
    await execCommand(
      `docker ps -q --filter "name=supabase_.*_${session.worktreeProjectId}" | xargs -r docker stop`,
      { cwd: input.cwd, timeout: 30000 }
    );
  }

  // Restore config.toml from backup (for worktree sessions)
  if (session.configBackupPath && existsSync(session.configBackupPath)) {
    const configPath = getSupabaseConfigPath(input.cwd);
    restoreSupabaseConfig(configPath, `.backup-${worktreeInfo.worktreeId}`);
  }

  // Mark session as stopped
  await updateWorktreeSupabaseSession(input.cwd, worktreeInfo.worktreeId, {
    running: false,
  });

  await logger.logOutput({
    success: true,
    cleaned: session.worktreeProjectId,
    reason: input.reason,
  });

  // SessionEnd hooks return empty object (cannot block session termination)
  return {};
}

export { handler };
runHook(handler);
