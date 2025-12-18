/**
 * SubagentStop hook - Log agent edits and cleanup context
 *
 * This hook runs when a subagent completes execution.
 * It analyzes the agent's transcript to extract:
 * - New files created
 * - Files deleted
 * - Files edited
 * - Agent prompt and type
 *
 * Then it cleans up the saved context from SubagentStart.
 *
 * Import this hook in any plugin that needs to track subagent file operations.
 */

import type { SubagentStopInput, SubagentStopHookOutput } from '../types/types.js';
import { getAgentEdits } from './utils/subagent-state.js';
import { runHook } from './utils/io.js';

async function handler(input: SubagentStopInput): Promise<SubagentStopHookOutput> {
  const DEBUG = process.env.DEBUG === '*' || process.env.DEBUG?.includes('subagent');

  if (DEBUG) {
    console.log('[SubagentStop] Hook triggered');
    console.log('[SubagentStop] Agent ID:', input.agent_id);
    console.log('[SubagentStop] Agent Transcript:', input.agent_transcript_path);
  }

  try {
    const edits = await getAgentEdits(input.agent_transcript_path);

    if (DEBUG) {
      console.log('[SubagentStop] ─────────────────────────────────────────');
      console.log('[SubagentStop] Agent Analysis Complete');
      console.log('[SubagentStop] ─────────────────────────────────────────');
      console.log('[SubagentStop] Agent Type:', edits.subagentType);
      console.log('[SubagentStop] Agent Prompt:', edits.agentPrompt.slice(0, 100) + (edits.agentPrompt.length > 100 ? '...' : ''));

      if (edits.agentFile) {
        console.log('[SubagentStop] Agent Definition:', edits.agentFile);
      }

      if (edits.agentPreloadedSkillsFiles.length > 0) {
        console.log('[SubagentStop] Preloaded Skills:', edits.agentPreloadedSkillsFiles.length);
        edits.agentPreloadedSkillsFiles.forEach((skill) => {
          console.log('[SubagentStop]   -', skill);
        });
      }

      if (edits.agentNewFiles.length > 0) {
        console.log('[SubagentStop] Files Created:', edits.agentNewFiles.length);
        edits.agentNewFiles.forEach((file) => {
          console.log('[SubagentStop]   +', file);
        });
      }

      if (edits.agentEditedFiles.length > 0) {
        console.log('[SubagentStop] Files Edited:', edits.agentEditedFiles.length);
        edits.agentEditedFiles.forEach((file) => {
          console.log('[SubagentStop]   ~', file);
        });
      }

      if (edits.agentDeletedFiles.length > 0) {
        console.log('[SubagentStop] Files Deleted:', edits.agentDeletedFiles.length);
        edits.agentDeletedFiles.forEach((file) => {
          console.log('[SubagentStop]   -', file);
        });
      }

      if (edits.agentNewFiles.length === 0 &&
          edits.agentEditedFiles.length === 0 &&
          edits.agentDeletedFiles.length === 0) {
        console.log('[SubagentStop] No file operations detected');
      }

      console.log('[SubagentStop] ─────────────────────────────────────────');
    }

    return {};
  } catch (error) {
    if (DEBUG) {
      console.error('[SubagentStop] Error analyzing agent edits:', error);
    }
    return {};
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
