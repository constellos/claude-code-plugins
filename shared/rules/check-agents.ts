/**
 * Rule: .claude/agents/ structure validation
 *
 * Placeholder for validating Claude Code agent definitions in .claude/agents/
 *
 * Planned validations:
 * - Agent configuration structure
 * - Required fields (name, description, tools, etc.)
 * - Tool allowlist/denylist syntax
 * - Permission boundaries
 */

import type { PostToolUseInput, PostToolUseHookOutput } from '../types/types.js';

export default async function (_input: PostToolUseInput): Promise<PostToolUseHookOutput> {
  // Placeholder - no validation implemented yet
  return {};
}
