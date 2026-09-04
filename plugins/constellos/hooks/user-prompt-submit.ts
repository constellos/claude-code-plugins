/**
 * UserPromptSubmit hook: record the turn, inject the objective's context
 *
 * Two halves, both best-effort and never blocking:
 * 1. Record the prompt as a user turn on the session's thread (minting the
 *    thread lazily if SessionStart could not). No `--role` is passed - the
 *    server default is user.
 * 2. Inject: resolve the objective this session addresses and print its
 *    residual/matchExpression as context, capped at 40 lines. Resolution is
 *    `CONSTELLOS_ROOT_OBJECTIVE` (an explicit override), else the path cached
 *    for this session, else the objective the thread's own first turn is
 *    addressed BY - the edge the model mints when it creates an objective
 *    naming this thread, read back through `get`'s incoming relations and
 *    then cached. This is the point of the harness - the same guidance the
 *    web agent gets from its system prompt, delivered through the only
 *    channel hooks have.
 */

import type { UserPromptSubmitInput, UserPromptSubmitHookOutput } from '../shared/types/types.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { resolveConfig } from './lib/config.js';
import { callTool, resolveCli, sendThreadMessage, type CallOptions, type CliCommand } from './lib/transport.js';
import {
  readSessionState,
  writeSessionState,
  persistEnv,
  type SessionState,
} from './lib/session-state.js';
import {
  extractObjectiveContext,
  pickAddressingObjective,
  MAX_INJECT_LINES,
} from './lib/inject.js';

/**
 * Resolve the objective whose context this prompt should carry
 *
 * Order: the `CONSTELLOS_ROOT_OBJECTIVE` override, the path already cached for
 * this session, then a `get` on the thread's first turn asking for its
 * incoming edges - an objective that addresses this thread arrives there. The
 * discovered path is cached, so the extra round trip happens once per session.
 *
 * @param cli - argv prefix for the constellos CLI
 * @param sessionId - The Claude Code session id (the cache key)
 * @param state - The session's cached state
 * @param opts - Spawn options
 * @returns The objective's entity path, or null when none can be resolved
 */
function resolveObjective(
  cli: CliCommand,
  sessionId: string,
  state: SessionState,
  opts: CallOptions
): string | null {
  const override = process.env.CONSTELLOS_ROOT_OBJECTIVE || state.objective;
  if (override) return override;

  const threadPath = state.threadPath;
  if (!threadPath) return null;

  const got = callTool(cli, 'get', { path: threadPath, includeIncomingRelations: 'addresses' }, opts);
  if (!got.ok) {
    console.error(`constellos harness: thread read failed (${got.error.split('\n')[0]})`);
    return null;
  }
  const objective = pickAddressingObjective(got.result);
  if (objective) writeSessionState(sessionId, { objective });
  return objective;
}

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
    let state = readSessionState(input.session_id);

    // Record the turn; a missing thread (SessionStart degraded) mints one
    // lazily with this prompt as the first turn.
    const thread = process.env.CONSTELLOS_THREAD || state.thread || '';
    const sent = sendThreadMessage(cli, { thread, message: input.prompt }, opts);
    if (sent.ok && !thread) {
      const patch = {
        thread: sent.thread,
        threadPath: sent.path,
        space: config.space ?? undefined,
      };
      writeSessionState(input.session_id, patch);
      state = { ...state, ...patch };
      persistEnv({ CONSTELLOS_THREAD: sent.thread });
    } else if (!sent.ok) {
      console.error(`constellos harness: prompt not recorded (${sent.error.split('\n')[0]})`);
    }

    // Inject the addressed objective's residual - the harness's whole point.
    const objectivePath = resolveObjective(cli, input.session_id, state, opts);
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
