/**
 * PostToolUse hook for nodecraft plugin
 * 
 * Captures agent results after Task tool completion and updates task memory
 * with findings, decisions, and outcomes.
 * 
 * @module post-tool-use
 */

import type { PostToolUseInput, PostToolUseHookOutput } from '../../../shared/types/types.js';

/**
 * PostToolUse hook handler for Task tool
 * 
 * Monitors Task tool usage (reviewer/planner agents) and stores their
 * results in task memory for future context and workflow coordination.
 * 
 * @param input - PostToolUse hook input from Claude Code
 * @returns Hook output with memory update confirmation
 */
async function handler(input: PostToolUseInput): Promise<PostToolUseHookOutput> {
  try {
    // Only process Task tool calls
    if (input.tool_name !== 'Task') {
      return {};
    }

    const taskInput = input.tool_input as any;
    const agentType = taskInput?.subagent_type;

    // Track agent invocations
    if (agentType === 'reviewer' || agentType === 'planner') {
      // TODO: Once MCP server is deployed, store agent results
      // await mcp.addTaskMemory({
      //   task_id: getTaskIdFromContext(),
      //   memory_type: 'conversation',
      //   content: {
      //     agent: agentType,
      //     prompt: taskInput.prompt,
      //     result: input.tool_result
      //   }
      // });

      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `${agentType} agent completed. Results will be stored in task memory once MCP server is deployed.`,
        },
      };
    }

    return {};
  } catch (error) {
    // Non-blocking: log error but don't fail the hook
    console.error('PostToolUse hook error:', error);
    return {};
  }
}

export { handler };

// Self-executable with npx tsx
if (import.meta.url === `file://${process.argv[1]}`) {
  const { runHook } = await import('../../../shared/hooks/utils/io.js');
  runHook(handler);
}
