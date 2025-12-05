/**
 * Factory for creating format validation hooks
 */

import type { MarkdownFormat } from './types.js';
import type { FileWriteInput, FileEditInput } from '../schemas/tools.js';
import { isMarkdownFile, matchesFilePatterns, reconstructFileFromEdit } from './utils.js';
import { validateMarkdownFormat, formatValidationMessage } from './validator.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Decision result for hook handlers
 */
export interface HookDecision {
  /** Whether to allow the operation */
  decision: 'allow' | 'deny';
  /** Reason for the decision (shown to user on deny) */
  reason?: string;
}

/**
 * PreToolUse hook handler function type
 * Receives tool input and returns a decision
 */
export type PreToolUseHandler = (
  toolName: string,
  toolInput: Record<string, unknown>,
  cwd: string
) => Promise<HookDecision>;

/**
 * Hook handler result for Claude Code hooks system
 */
export interface HookResult {
  /** Whether to continue execution */
  continue: boolean;
  /** Reason shown to user when continue is false */
  stopReason?: string;
}

// ============================================================================
// Hook Factory
// ============================================================================

/**
 * Create a format validation hook function from a MarkdownFormat specification
 *
 * The created hook:
 * - Only handles Write and Edit tools
 * - Checks if the target file matches format.files patterns
 * - Validates content against format.headings
 * - Returns allow/deny decision based on validation
 *
 * @param format - The markdown format specification
 * @returns A PreToolUse handler function
 *
 * @example
 * ```ts
 * const format: MarkdownFormat = {
 *   files: ['CLAUDE.md'],
 *   headings: [
 *     { matcher: 'Project', required: true },
 *     { matcher: 'Overview', required: true },
 *   ],
 * };
 *
 * const handler = createFormatHookFunction(format);
 *
 * // In hook runner:
 * const result = await handler('Write', { file_path: '/path/to/CLAUDE.md', content: '...' }, '/project');
 * ```
 */
export function createFormatHookFunction(format: MarkdownFormat): PreToolUseHandler {
  return async (
    toolName: string,
    toolInput: Record<string, unknown>,
    cwd: string
  ): Promise<HookDecision> => {
    // Only handle Write and Edit tools
    if (toolName !== 'Write' && toolName !== 'Edit') {
      return { decision: 'allow' };
    }

    // Extract file path based on tool type
    const filePath =
      toolName === 'Write'
        ? (toolInput as FileWriteInput).file_path
        : (toolInput as FileEditInput).file_path;

    if (!filePath) {
      return { decision: 'allow' };
    }

    // Only validate markdown files
    if (!isMarkdownFile(filePath)) {
      return { decision: 'allow' };
    }

    // Check if file matches format patterns
    if (!matchesFilePatterns(filePath, format.files, cwd)) {
      return { decision: 'allow' };
    }

    // Get content to validate
    let content: string;

    try {
      if (toolName === 'Write') {
        content = (toolInput as FileWriteInput).content;
      } else {
        // For Edit, reconstruct the file content after the edit
        content = await reconstructFileFromEdit(toolInput as FileEditInput);
      }
    } catch (error) {
      // If we can't reconstruct the content, deny with error
      return {
        decision: 'deny',
        reason: `Failed to get content for validation: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Validate content against format
    const result = await validateMarkdownFormat(content, format, cwd);

    if (result.valid) {
      return { decision: 'allow' };
    }

    return {
      decision: 'deny',
      reason: formatValidationMessage(result),
    };
  };
}

/**
 * Adapter to convert PreToolUseHandler to Claude Code hook result format
 *
 * @param handler - The PreToolUse handler
 * @param toolName - Name of the tool being used
 * @param toolInput - Input to the tool
 * @param cwd - Current working directory
 * @returns Hook result in Claude Code format
 */
export async function runFormatHook(
  handler: PreToolUseHandler,
  toolName: string,
  toolInput: Record<string, unknown>,
  cwd: string
): Promise<HookResult> {
  const decision = await handler(toolName, toolInput, cwd);

  return {
    continue: decision.decision === 'allow',
    stopReason: decision.reason,
  };
}
