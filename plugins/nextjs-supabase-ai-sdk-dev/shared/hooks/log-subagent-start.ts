/**
 * SubagentStart hook - Save agent context for later retrieval
 *
 * This hook runs when a subagent begins execution (via Task tool).
 * It saves the agent's context (type, prompt, toolUseId) to .claude/logs/subagent-tasks.json
 * so it can be retrieved later in SubagentStop.
 *
 * Import this hook in any plugin that needs to track subagent execution.
 */

import type { SubagentStartInput, SubagentStartHookOutput } from '../types/types.js';
import { saveAgentStartContext } from './utils/subagent-state.js';
import { runHook } from './utils/io.js';

async function handler(input: SubagentStartInput): Promise<SubagentStartHookOutput> {
  const DEBUG = process.env.DEBUG === '*' || process.env.DEBUG?.includes('subagent');

  if (DEBUG) {
    console.log('[SubagentStart] Hook triggered');
    console.log('[SubagentStart] Agent ID:', input.agent_id);
    console.log('[SubagentStart] Agent Type:', input.agent_type);
    console.log('[SubagentStart] Session ID:', input.session_id);
  }

  try {
    const context = await saveAgentStartContext({
      agent_id: input.agent_id,
      agent_type: input.agent_type,
      session_id: input.session_id,
      cwd: input.cwd,
      transcript_path: input.transcript_path,
    });

    if (DEBUG) {
      console.log('[SubagentStart] Saved agent context');
      console.log('[SubagentStart] Prompt:', context.prompt.slice(0, 100) + (context.prompt.length > 100 ? '...' : ''));
      console.log('[SubagentStart] Tool Use ID:', context.toolUseId);
      console.log('[SubagentStart] Timestamp:', context.timestamp);
    }

    return {
      hookSpecificOutput: {
        hookEventName: 'SubagentStart',
      },
    };
  } catch (error) {
    if (DEBUG) {
      console.error('[SubagentStart] Error saving agent context:', error);
    }
    return {
      hookSpecificOutput: {
        hookEventName: 'SubagentStart',
      },
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
