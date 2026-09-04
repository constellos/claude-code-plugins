/**
 * Per-session state for the Constellos harness
 *
 * The thread slug minted at SessionStart must reach every later hook. Two
 * channels carry it: `$CLAUDE_ENV_FILE` (environment persisted by Claude Code
 * for later hooks in the same session) and a per-session cache file under
 * `~/.constellos/harness/sessions/` (survives resume, where the env file
 * starts fresh). Read order everywhere: env var first, cache file second.
 *
 * All I/O here is best-effort: a failed read returns empty state and a failed
 * write is swallowed - harness bookkeeping must never break a session.
 *
 * @module session-state
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Cached state for one Claude Code session */
export interface SessionState {
  /** Thread slug this session records to */
  thread?: string;
  /** Space slug the thread lives in */
  space?: string;
  /** false once the server rejected a `role` argument (pre-PR-B server) */
  roleSupported?: boolean;
  /** Objective path to inject context from on each prompt */
  objective?: string;
}

/** Directory holding one JSON file per session */
function sessionsDir(): string {
  return path.join(os.homedir(), '.constellos', 'harness', 'sessions');
}

function stateFile(sessionId: string): string {
  // Session ids are UUIDs, but sanitize anyway - this becomes a filename.
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(sessionsDir(), `${safe}.json`);
}

/**
 * Read the cached state for a session
 *
 * @param sessionId - The Claude Code session id
 * @returns The cached state, or an empty object when absent or unreadable
 */
export function readSessionState(sessionId: string): SessionState {
  try {
    const raw = fs.readFileSync(stateFile(sessionId), 'utf8');
    const parsed = JSON.parse(raw) as SessionState;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Merge fields into a session's cached state
 *
 * @param sessionId - The Claude Code session id
 * @param patch - Fields to merge over the existing state
 */
export function writeSessionState(sessionId: string, patch: SessionState): void {
  try {
    fs.mkdirSync(sessionsDir(), { recursive: true });
    const merged = { ...readSessionState(sessionId), ...patch };
    fs.writeFileSync(stateFile(sessionId), JSON.stringify(merged) + '\n', 'utf8');
  } catch {
    // Best-effort - never break the session over cache I/O
  }
}

/**
 * Persist environment variables for later hooks via `$CLAUDE_ENV_FILE`
 *
 * Claude Code sources this file for subsequent hooks in the same session.
 * Values containing newlines are skipped (the file is line-oriented).
 *
 * @param vars - Variable name/value pairs to append
 */
export function persistEnv(vars: Record<string, string>): void {
  const envFile = process.env.CLAUDE_ENV_FILE;
  if (!envFile) return;
  try {
    const lines = Object.entries(vars)
      .filter(([, v]) => !v.includes('\n'))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    if (lines) fs.appendFileSync(envFile, lines + '\n', 'utf8');
  } catch {
    // Best-effort - the cache file still carries the state
  }
}

/**
 * Resolve the thread slug for the current session
 *
 * @param sessionId - The Claude Code session id
 * @returns The thread slug from `CONSTELLOS_THREAD` or the session cache, or null
 */
export function resolveThread(sessionId: string): string | null {
  return process.env.CONSTELLOS_THREAD || readSessionState(sessionId).thread || null;
}
