/**
 * Vitest check for SubagentStop hooks
 *
 * Runs vitest for all files edited during the agent's task.
 * Blocks if tests fail.
 *
 * @module run-task-vitests
 */

import type { SubagentStopInput, SubagentStopHookOutput } from '../shared/types/types.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { getAgentEdits } from '../shared/hooks/utils/subagent-state.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** Maximum characters for check output to prevent context bloat */
const MAX_OUTPUT_CHARS = 500;

/** Timeout for vitest in milliseconds (30 seconds) */
const TIMEOUT_MS = 30000;

/** File extensions to check for tests */
const TEST_EXTENSIONS = ['.ts', '.tsx'];

/**
 * Truncate output to MAX_OUTPUT_CHARS
 */
function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) {
    return output;
  }

  const truncated = output.slice(0, MAX_OUTPUT_CHARS);
  const remaining = output.length - MAX_OUTPUT_CHARS;
  return `${truncated}\n... (${remaining} more chars truncated)`;
}

/**
 * Filter to only testable files
 */
function getTestableFiles(files: string[]): string[] {
  return files.filter((file) => {
    // Skip test files themselves
    if (file.includes('.test.') || file.includes('.spec.')) {
      return false;
    }
    return TEST_EXTENSIONS.some((ext) => file.endsWith(ext));
  });
}

/**
 * SubagentStop hook handler
 *
 * Runs vitest related for all edited files. Blocks if tests fail.
 */
async function handler(input: SubagentStopInput): Promise<SubagentStopHookOutput> {
  const DEBUG = process.env.DEBUG === '*' || process.env.DEBUG?.includes('task-vitests');

  if (DEBUG) {
    console.log('[run-task-vitests] Hook triggered');
    console.log('[run-task-vitests] Agent ID:', input.agent_id);
  }

  try {
    // Get all files edited by the agent
    const edits = await getAgentEdits(input.agent_transcript_path);
    const allEditedFiles = [...edits.agentNewFiles, ...edits.agentEditedFiles];
    const testableFiles = getTestableFiles(allEditedFiles);

    if (DEBUG) {
      console.log('[run-task-vitests] Edited files:', allEditedFiles.length);
      console.log('[run-task-vitests] Testable files:', testableFiles.length);
    }

    if (testableFiles.length === 0) {
      // No testable files, skip
      return {};
    }

    // Run vitest related for all edited files
    const filesArg = testableFiles.map((f) => `"${f}"`).join(' ');
    const command = `npx vitest related ${filesArg} --run --reporter=verbose`;

    if (DEBUG) {
      console.log('[run-task-vitests] Running:', command);
    }

    try {
      await execAsync(command, {
        cwd: input.cwd,
        timeout: TIMEOUT_MS,
      });

      // Tests passed
      return {};
    } catch (error) {
      // Tests failed
      const err = error as { stdout?: string; stderr?: string; message?: string };
      const output = err.stdout || err.stderr || err.message || 'Tests failed';

      return {
        decision: 'block',
        reason: `Fix test failures before continuing:\n\n${truncateOutput(output)}`,
      };
    }
  } catch (error) {
    if (DEBUG) {
      console.error('[run-task-vitests] Error:', error);
    }
    // Don't block on transcript parsing errors
    return {};
  }
}

export { handler };
runHook(handler);
