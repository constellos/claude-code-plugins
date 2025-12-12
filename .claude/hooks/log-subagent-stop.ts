/**
 * SubagentStop Hook - Log agent edits and cleanup
 *
 * This hook fires when a subagent completes execution. It retrieves the agent's
 * edits, logs them, and cleans up the saved context.
 *
 * @module hooks/log-subagent-stop
 */

import type { SubagentStopInput, SubagentStopHookOutput } from 'claude-code-kit-ts';
import { getAgentEdits, createDebugLogger } from 'claude-code-kit-ts';

/**
 * SubagentStop hook handler
 *
 * Analyzes the agent's transcript to extract file operations (new, edited, deleted files)
 * and logs them for debugging. Automatically cleans up the saved agent context.
 *
 * @param input - SubagentStop hook input from Claude Code
 * @returns Hook output (always continues execution)
 *
 * @example
 * This hook is automatically called by Claude Code when an agent completes.
 * It provides visibility into:
 * - agentNewFiles: Files created by the agent
 * - agentEditedFiles: Files modified by the agent
 * - agentDeletedFiles: Files deleted by the agent
 * - agentPrompt: The original prompt given to the agent
 * - subagentType: Type of agent that ran
 */
export default async function (
  input: SubagentStopInput
): Promise<SubagentStopHookOutput> {
  const logger = createDebugLogger(input.cwd, 'log-subagent-stop', true);

  try {
    await logger.logInput(input);

    // Get agent edits and cleanup saved context
    const edits = await getAgentEdits(input.agent_transcript_path, {
      cwd: input.cwd,
    });

    // Log the agent's actions
    const summary = {
      agent_id: input.agent_id,
      subagent_type: edits.subagentType,
      session_id: edits.sessionId,
      agent_session_id: edits.agentSessionId,
      new_files: edits.agentNewFiles,
      edited_files: edits.agentEditedFiles,
      deleted_files: edits.agentDeletedFiles,
      total_changes:
        edits.agentNewFiles.length +
        edits.agentEditedFiles.length +
        edits.agentDeletedFiles.length,
    };

    await logger.logOutput(summary);

    return {
      continue: true,
    };
  } catch (error) {
    await logger.logError(error as Error);

    // Don't block execution if logging fails
    return {
      continue: true,
      systemMessage: `Warning: Failed to log agent edits: ${error}`,
    };
  }
}
