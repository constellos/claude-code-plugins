/**
 * Rule: .claude/skills/ structure validation
 *
 * Placeholder for validating Claude Code skill definitions in .claude/skills/
 *
 * Planned validations:
 * - Skill YAML frontmatter structure
 * - Required metadata (name, description, location)
 * - Skill content format
 * - Skill invocation patterns
 */

import type { PostToolUseInput, PostToolUseHookOutput } from '../types/types.js';

export default async function (_input: PostToolUseInput): Promise<PostToolUseHookOutput> {
  // Placeholder - no validation implemented yet
  return {};
}
