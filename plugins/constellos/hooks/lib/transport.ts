/**
 * Transport for the Constellos harness: the `constellos` CLI
 *
 * The spec (D5/section 7) fixes the transport as the constellos CLI - an
 * authenticated MCP client - invoked against the bare server origin. This
 * module resolves a CLI to run, invokes tools through it, and normalizes
 * results. Everything is best-effort: a missing CLI, missing token, or
 * network failure yields `{ok: false}` - never a thrown error - so hooks
 * degrade to a stderr note instead of blocking the session.
 *
 * Authoring traps encoded here (from the spec):
 * - Arguments are always discrete argv entries with explicit values; a flag
 *   as the last argv with nothing after it would store `undefined` and be
 *   dropped by the CLI's JSON serialization.
 * - The CLI performs a tools/list round trip before every tools/call, so a
 *   single call is two HTTP requests - callers budget >= 10s.
 *
 * @module transport
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/** Per-CLI-call timeout; a hook makes at most two calls inside its 30s budget */
export const CLI_TIMEOUT_MS = 12_000;

/** Result of one CLI tool call */
export type ToolCallResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

/** Result of recording a thread turn */
export type ThreadSendResult =
  | { ok: true; thread: string; seq?: number; path?: string }
  | { ok: false; error: string; roleUnsupported?: boolean };

/** How to invoke the resolved CLI: argv[0] plus leading arguments */
export type CliCommand = string[];

/**
 * Resolve a runnable constellos CLI
 *
 * Chain: `CONSTELLOS_CLI` env (a script path or executable) -> `constellos`
 * on PATH -> `<project>/packages/constellos/dist/index.js` under
 * `CLAUDE_PROJECT_DIR` or the given cwd. Null means degraded mode.
 *
 * @param cwd - The session's working directory
 * @returns argv prefix for the CLI, or null when none is available
 */
export function resolveCli(cwd: string): CliCommand | null {
  const fromEnv = process.env.CONSTELLOS_CLI;
  if (fromEnv) {
    return /\.(mjs|cjs|js)$/.test(fromEnv) ? ['node', fromEnv] : [fromEnv];
  }

  const which = spawnSync('which', ['constellos'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) {
    return ['constellos'];
  }

  for (const root of [process.env.CLAUDE_PROJECT_DIR, cwd]) {
    if (!root) continue;
    const dist = path.join(root, 'packages', 'constellos', 'dist', 'index.js');
    if (fs.existsSync(dist)) {
      return ['node', dist];
    }
  }

  return null;
}

/**
 * Unwrap a CLI tool-call result to the tool's own JSON payload
 *
 * The CLI prints the MCP result envelope. The payload may sit in
 * `structuredContent`, or JSON-encoded inside `content[0].text`, or the
 * parsed value may already be the payload.
 *
 * @param parsed - The JSON the CLI printed
 * @returns The innermost payload this function can reach
 */
export function unwrapToolResult(parsed: unknown): unknown {
  if (typeof parsed !== 'object' || parsed === null) return parsed;
  const obj = parsed as { structuredContent?: unknown; content?: unknown };
  if (obj.structuredContent !== undefined) return obj.structuredContent;
  if (Array.isArray(obj.content)) {
    const text = (obj.content as Array<{ type?: string; text?: unknown }>).find(
      (c) => c?.type === 'text' && typeof c.text === 'string'
    )?.text as string | undefined;
    if (text !== undefined) {
      try {
        return JSON.parse(text);
      } catch {
        return { text };
      }
    }
  }
  return parsed;
}

/**
 * Heuristic: did the server reject the `role` argument as unknown?
 *
 * Until spec PR-B lands, the Go `message` tool has no `role` field and an
 * old server refuses unknown tool arguments. Matching this lets the Stop
 * hook cache role-unsupported and stop retrying for the session.
 *
 * @param text - Combined stdout/stderr of a failed call
 * @returns true when the failure looks like an unknown `role` argument
 */
export function looksLikeRoleUnsupported(text: string): boolean {
  return (
    /role/i.test(text) &&
    /(unknown|unexpected|invalid|not allowed|additional ?propert|unrecognized)/i.test(text)
  );
}

/** Options for a CLI tool call */
export interface CallOptions {
  /** Working directory to spawn in */
  cwd: string;
  /** Bare server origin, exported as CONSTELLOS_SERVER_URL */
  serverUrl: string;
  /** Space slug, passed as the CLI's global --space flag; null omits it */
  space: string | null;
}

/**
 * Invoke one Constellos tool through the CLI
 *
 * @param cli - argv prefix from {@link resolveCli}
 * @param tool - Tool name, e.g. "message" or "get"
 * @param args - Tool arguments; each becomes `--key value` (empty string allowed)
 * @param opts - Spawn options
 * @returns The unwrapped tool payload, or a degraded failure
 */
export function callTool(
  cli: CliCommand,
  tool: string,
  args: Record<string, string>,
  opts: CallOptions
): ToolCallResult {
  const argv = [...cli.slice(1), tool];
  if (opts.space) argv.push('--space', opts.space);
  for (const [key, value] of Object.entries(args)) {
    argv.push(`--${key}`, value);
  }

  const proc = spawnSync(cli[0], argv, {
    cwd: opts.cwd,
    encoding: 'utf8',
    timeout: CLI_TIMEOUT_MS,
    env: { ...process.env, CONSTELLOS_SERVER_URL: opts.serverUrl },
  });

  if (proc.error) {
    return { ok: false, error: String(proc.error.message ?? proc.error) };
  }
  if (proc.status !== 0) {
    const detail = [proc.stderr, proc.stdout].filter(Boolean).join('\n').trim();
    return { ok: false, error: detail || `constellos ${tool} exited ${proc.status}` };
  }

  try {
    return { ok: true, result: unwrapToolResult(JSON.parse(proc.stdout)) };
  } catch {
    return { ok: false, error: `unparseable CLI output: ${proc.stdout.slice(0, 200)}` };
  }
}

/**
 * Record a turn on a Constellos thread via the `message` tool
 *
 * User turns never pass `--role` (the server default is user, which keeps
 * this forward- and backward-compatible). Assistant turns pass
 * `--role assistant`; when the server rejects it as unknown, the result
 * carries `roleUnsupported` so the caller can cache that and skip - a turn
 * recorded without the role would land mislabeled as user, the exact defect
 * spec D4 exists to fix.
 *
 * @param cli - argv prefix from {@link resolveCli}
 * @param turn - Thread slug ("" mints a fresh thread), message body, optional role
 * @param opts - Spawn options
 * @returns The recorded turn's thread/seq/path, or a degraded failure
 */
export function sendThreadMessage(
  cli: CliCommand,
  turn: { thread: string; message: string; role?: 'assistant' },
  opts: CallOptions
): ThreadSendResult {
  const args: Record<string, string> = { thread: turn.thread, message: turn.message };
  if (turn.role === 'assistant') args.role = 'assistant';

  const call = callTool(cli, 'message', args, opts);
  if (!call.ok) {
    return {
      ok: false,
      error: call.error,
      roleUnsupported: turn.role === 'assistant' && looksLikeRoleUnsupported(call.error),
    };
  }

  const payload = call.result as { thread?: unknown; seq?: unknown; path?: unknown };
  const thread = typeof payload?.thread === 'string' && payload.thread ? payload.thread : turn.thread;
  if (!thread) {
    return { ok: false, error: 'no thread slug in message result' };
  }
  return {
    ok: true,
    thread,
    seq: typeof payload?.seq === 'number' ? payload.seq : undefined,
    path: typeof payload?.path === 'string' ? payload.path : undefined,
  };
}
