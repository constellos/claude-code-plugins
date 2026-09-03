/**
 * Stop hook: record the assistant reply as an assistant turn
 *
 * Uses `last_assistant_message` from the hook input (per the hooks doc -
 * never the transcript file, which is written asynchronously). Guards:
 * - `stop_hook_active` -> exit clean (the turn is already continuing because
 *   of a stop hook; recording again would loop).
 * - Until spec PR-B lands the server's `message` tool has no `role` field;
 *   recording without it would land the reply mislabeled as a user turn -
 *   the exact defect D4 fixes - so on an unknown-argument rejection this
 *   caches role-unsupported for the session and skips.
 *
 * Never blocks: every failure is a stderr line and a clean exit.
 */

import type { StopInput, StopHookOutput } from '../shared/types/types.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { resolveConfig } from './lib/config.js';
import { resolveCli, sendThreadMessage } from './lib/transport.js';
import { readSessionState, writeSessionState, resolveThread } from './lib/session-state.js';

/** Stop input plus the reply field the shared types don't carry yet */
type StopInputWithReply = StopInput & { last_assistant_message?: string };

async function handler(input: StopInputWithReply): Promise<StopHookOutput> {
  try {
    if (input.stop_hook_active) return {};

    const reply = input.last_assistant_message;
    if (typeof reply !== 'string' || !reply.trim()) return {};

    const thread = resolveThread(input.session_id);
    if (!thread) {
      console.error('constellos harness: no thread for this session - reply not recorded');
      return {};
    }

    const state = readSessionState(input.session_id);
    if (state.roleSupported === false) {
      console.error(
        'constellos harness: server lacks message role support (spec PR-B) - assistant turn not recorded'
      );
      return {};
    }

    const cli = resolveCli(input.cwd);
    if (!cli) {
      console.error('constellos harness: no CLI - reply not recorded');
      return {};
    }

    const config = resolveConfig(input.cwd);
    const sent = sendThreadMessage(
      cli,
      { thread, message: reply, role: 'assistant' },
      { cwd: input.cwd, serverUrl: config.serverUrl, space: config.space }
    );
    if (!sent.ok) {
      if (sent.roleUnsupported) {
        writeSessionState(input.session_id, { roleSupported: false });
        console.error(
          'constellos harness: server rejected the role argument - assistant turns will be ' +
            'skipped this session (recording without role would mislabel them as user turns)'
        );
      } else {
        console.error(`constellos harness: reply not recorded (${sent.error.split('\n')[0]})`);
      }
    }
    return {};
  } catch (error) {
    console.error(
      `constellos harness: ${error instanceof Error ? error.message : String(error)}`
    );
    return {};
  }
}

export { handler };

runHook(handler);
