/**
 * UserPromptSubmit hook: record the turn, inject the objective's context
 *
 * Two halves, both best-effort and never blocking:
 * 1. Record the prompt as a user turn on the session's thread (minting the
 *    thread lazily if SessionStart could not). No `--role` is passed - the
 *    server default is user.
 * 2. Inject: fetch the objective this session addresses (from
 *    `CONSTELLOS_ROOT_OBJECTIVE` or the session cache) and print its
 *    residual/matchExpression as context, capped at 40 lines. This is the
 *    point of the harness - the same guidance the web agent gets from its
 *    system prompt, delivered through the only channel hooks have.
 */

import type { UserPromptSubmitInput, UserPromptSubmitHookOutput } from '../shared/types/types.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { resolveConfig } from './lib/config.js';
import { callTool, resolveCli, sendThreadMessage, type CallOptions, type CliCommand } from './lib/transport.js';
import { readSessionState, writeSessionState, persistEnv } from './lib/session-state.js';
import { extractObjectiveContext, MAX_INJECT_LINES } from './lib/inject.js';

function inject(cli: CliCommand, objectivePath: string, opts: CallOptions): string | null {
  const got = callTool(cli, 'get', { path: objectivePath }, opts);
  if (!got.ok) {
    console.error(`constellos harness: objective fetch failed (${got.error.split('\n')[0]})`);
    return null;
  }
  const lines = extractObjectiveContext(got.result, objectivePath);
  if (!lines.length) return null;
  return lines.slice(0, MAX_INJECT_LINES).join('\n');
}

async function handler(input: UserPromptSubmitInput): Promise<UserPromptSubmitHookOutput> {
  try {
    const config = resolveConfig(input.cwd);
    const cli = resolveCli(input.cwd);
    if (!cli) {
      console.error('constellos harness: no CLI - prompt not recorded');
      return {};
    }
    const opts: CallOptions = { cwd: input.cwd, serverUrl: config.serverUrl, space: config.space };
    const state = readSessionState(input.session_id);

    // Record the turn; a missing thread (SessionStart degraded) mints one
    // lazily with this prompt as the first turn.
    const thread = process.env.CONSTELLOS_THREAD || state.thread || '';
    const sent = sendThreadMessage(cli, { thread, message: input.prompt }, opts);
    if (sent.ok && !thread) {
      writeSessionState(input.session_id, { thread: sent.thread, space: config.space ?? undefined });
      persistEnv({ CONSTELLOS_THREAD: sent.thread });
    } else if (!sent.ok) {
      console.error(`constellos harness: prompt not recorded (${sent.error.split('\n')[0]})`);
    }

    // Inject the addressed objective's residual - the harness's whole point.
    const objectivePath = process.env.CONSTELLOS_ROOT_OBJECTIVE || state.objective || null;
    const context = objectivePath ? inject(cli, objectivePath, opts) : null;
    if (!context) return {};
    return {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: context,
      },
    };
  } catch (error) {
    console.error(
      `constellos harness: ${error instanceof Error ? error.message : String(error)}`
    );
    return {};
  }
}

export { handler };

runHook(handler);
