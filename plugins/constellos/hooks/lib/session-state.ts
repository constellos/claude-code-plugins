/**
 * Per-session state for the Constellos harness
 *
 * The thread slug minted at SessionStart must reach every later hook, and the
 * per-session cache file under `~/.constellos/harness/sessions/` is what
 * carries it: hook processes do NOT inherit what a SessionStart hook wrote to
 * `$CLAUDE_ENV_FILE` (measured against Claude Code 2.1.258 — that file is
 * sourced into the session's Bash-tool shell, and `CLAUDE_ENV_FILE` is only
 * even set for SessionStart/Setup/CwdChanged/FileChanged hooks). The env write
 * is kept anyway, because it puts `$CONSTELLOS_THREAD` in front of the shell
 * the session actually runs commands in. Read order everywhere: env var first
 * (a caller may export it), cache file second.
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
  /** Entity path of the thread's first turn, e.g. `messages/<slug>/1` */
  threadPath?: string;
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
 * POSIX single-quote a value for the sourced env file
 *
 * @param value - Raw value
 * @returns The value wrapped in single quotes, with embedded quotes escaped
 */
function shellQuote(value: string): string {
  return "'" + value.split("'").join("'\\''") + "'";
}

/**
 * Persist environment variables into the session's `$CLAUDE_ENV_FILE`
 *
 * Claude Code sources this file into the session's Bash-tool shell — NOT into
 * later hook processes, which is why {@link readSessionState} is the channel
 * the hooks actually rely on. Values are written as `export K=V` so they reach
 * the shell's children too; values containing newlines are skipped (the file
 * is line-oriented) and the variable is only set for SessionStart-class hooks,
 * so a later hook calling this is a no-op.
 *
 * @param vars - Variable name/value pairs to append
 */
export function persistEnv(vars: Record<string, string>): void {
  const envFile = process.env.CLAUDE_ENV_FILE;
  if (!envFile) return;
  try {
    const lines = Object.entries(vars)
      .filter(([, v]) => !v.includes('\n'))
      .map(([k, v]) => `export ${k}=${shellQuote(v)}`)
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
