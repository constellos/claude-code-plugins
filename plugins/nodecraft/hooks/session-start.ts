/**
 * SessionStart hook for nodecraft plugin
 * 
 * Initializes task queue connection and displays pending tasks for the user
 * at the start of each Claude Code session.
 * 
 * @module session-start
 */

import type { SessionStartInput, SessionStartHookOutput } from '../../../shared/types/types.js';

/**
 * SessionStart hook handler
 * 
 * Connects to constellos-mcp and retrieves active tasks for the current user.
 * Displays pending and running tasks to provide context at session start.
 * 
 * @param _input - SessionStart hook input from Claude Code
 * @returns Hook output with task context for Claude
 */
async function handler(_input: SessionStartInput): Promise<SessionStartHookOutput> {
  try {
    // TODO: Once MCP server is deployed, fetch active tasks
    // const activeTasks = await mcp.listTasks({ status: ['pending', 'running'] });
    
    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `Nodecraft task queue initialized.

Task queue and agent workflow system is ready.

Available agents:
- reviewer: Analyzes code/docs and creates structured review reports
- planner: Creates implementation plans from review findings

MCP servers configured:
- constellos-mcp: Task queue operations (pending deployment)
- nodes-md: Nodeset operations

Use the reviewer or planner agents to start workflows.`,
      },
    };
  } catch (error) {
    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `Nodecraft plugin loaded with warnings: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
    };
  }
}

export { handler };

// Self-executable with npx tsx
if (import.meta.url === `file://${process.argv[1]}`) {
  const { runHook } = await import('../../../shared/hooks/utils/io.js');
  runHook(handler);
}
