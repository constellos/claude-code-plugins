/**
 * SessionStart hook: mint or resume the session's Constellos thread
 *
 * On `startup` this mints a fresh thread (an empty `--thread ""` with a first
 * turn naming the session); on `resume` it reuses the slug cached for this
 * session. The slug is persisted through `$CLAUDE_ENV_FILE` and the session
 * cache so later hooks need no lookup. The emitted context tells Claude the
 * same thing the web chat's system prompt says: when the conversation has a
 * goal, create an OBJECTIVE whose spec.addresses names this thread.
 *
 * Best-effort: without a CLI, token, or network the session continues with a
 * one-line "inactive" note - the harness never blocks a turn on its own
 * availability.
 */

import * as path from 'path';
import type { SessionStartInput, SessionStartHookOutput } from '../shared/types/types.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { resolveConfig } from './lib/config.js';
import { resolveCli, sendThreadMessage } from './lib/transport.js';
import { persistEnv, readSessionState, writeSessionState } from './lib/session-state.js';

function inactive(reason: string): SessionStartHookOutput {
  console.error(`constellos harness: ${reason}`);
  return {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `Constellos harness inactive: ${reason}. The session continues normally.`,
    },
  };
}

async function handler(input: SessionStartInput): Promise<SessionStartHookOutput> {
  try {
    const config = resolveConfig(input.cwd);
    const cli = resolveCli(input.cwd);
    if (!cli) {
      return inactive('no constellos CLI found (set CONSTELLOS_CLI or build packages/constellos)');
    }

    // resume -> the slug cached for this session; startup (or a resume whose
    // cache is gone) -> mint a fresh thread with a first turn naming the session.
    let thread = process.env.CONSTELLOS_THREAD || readSessionState(input.session_id).thread || null;
    let minted = false;
    if (!thread) {
      const sent = sendThreadMessage(
        cli,
        {
          thread: '',
          message: `Claude Code session ${input.session_id} started in ${path.basename(input.cwd)}`,
        },
        { cwd: input.cwd, serverUrl: config.serverUrl, space: config.space }
      );
      if (!sent.ok) {
        return inactive(`could not mint a thread (${sent.error.split('\n')[0]})`);
      }
      thread = sent.thread;
      minted = true;
    }

    writeSessionState(input.session_id, { thread, space: config.space ?? undefined });
    const env: Record<string, string> = { CONSTELLOS_THREAD: thread };
    if (config.space) env.CONSTELLOS_SPACE = config.space;
    persistEnv(env);

    const where = config.space ? ` in space ${config.space}` : '';
    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext:
          `Constellos harness active: this session is ${minted ? 'recorded to new' : 'resuming'} ` +
          `thread messages/${thread}${where}. When this conversation converges on a goal, ` +
          `create an OBJECTIVE whose spec.addresses names this thread's message paths.`,
      },
    };
  } catch (error) {
    return inactive(error instanceof Error ? error.message : String(error));
  }
}

export { handler };

runHook(handler);
