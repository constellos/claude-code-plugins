/**
 * Rules file structure validation hook
 *
 * PreToolUse hook that validates the structure of rule files in .claude/rules/
 * before Write and Edit operations. Ensures all rule files follow the required
 * format with proper frontmatter and headings.
 *
 * This hook enforces:
 * - Required frontmatter field: "Required Skills" (specifies which skills must be invoked)
 * - Required heading: "## Rules" (contains the actual rule definitions)
 *
 * The "Required Skills" field can contain:
 * - A comma-separated list of skill names: "skill1, skill2"
 * - The value "None" if no skills are required
 *
 * This validation ensures consistency across all rule files and helps maintain
 * the plugin system's contract that rules declare their skill dependencies upfront.
 *
 * @module validate-rules-structure
 */

import type { PreToolUseInput, PreToolUseHookOutput } from '../shared/types/types.js';
import { runHook } from '../shared/hooks/utils/io.js';
import matter from 'gray-matter';

/**
 * PreToolUse hook that validates rules file structure
 *
 * Intercepts Write and Edit operations on .claude/rules/ markdown files to ensure
 * they meet structural requirements. Blocks operations that would create invalid
 * rule files.
 *
 * Validation checks:
 * 1. Valid YAML frontmatter parsing
 * 2. Presence of "Required Skills" frontmatter field
 * 3. Presence of "## Rules" heading in content
 *
 * @param input - PreToolUse hook input with tool information
 * @returns Hook output with permissionDecision (allow/deny)
 *
 * @example
 * ```typescript
 * // Valid rule file - allowed
 * const result1 = await handler({
 *   tool_name: 'Write',
 *   tool_use_id: 'toolu_123',
 *   tool_input: {
 *     file_path: '.claude/rules/typescript-rule.md',
 *     content: `---
 * Required Skills: claude-plugins, typescript
 * ---
 * # TypeScript Rules
 *
 * ## Rules
 *
 * 1. Use strict mode
 * 2. Define explicit types
 *     `
 *   },
 *   cwd: '/project',
 *   // ... other fields
 * });
 * // Returns: { hookSpecificOutput: { permissionDecision: 'allow' } }
 *
 * // Invalid rule file (missing frontmatter) - denied
 * const result2 = await handler({
 *   tool_name: 'Write',
 *   tool_use_id: 'toolu_456',
 *   tool_input: {
 *     file_path: '.claude/rules/my-rule.md',
 *     content: `# My Rule
 *
 * ## Rules
 *
 * 1. Follow best practices
 *     `
 *   },
 *   cwd: '/project',
 *   // ... other fields
 * });
 * // Returns: {
 * //   hookSpecificOutput: {
 * //     permissionDecision: 'deny',
 * //     permissionDecisionReason: 'Rules file validation failed...\n\n- Missing "Required Skills" field in frontmatter'
 * //   }
 * // }
 *
 * // Non-rules file - allowed (no validation)
 * const result3 = await handler({
 *   tool_name: 'Write',
 *   tool_use_id: 'toolu_789',
 *   tool_input: {
 *     file_path: 'docs/README.md',
 *     content: '# Documentation'
 *   },
 *   cwd: '/project',
 *   // ... other fields
 * });
 * // Returns: { hookSpecificOutput: { permissionDecision: 'allow' } }
 * ```
 */
async function handler(input: PreToolUseInput): Promise<PreToolUseHookOutput> {
  // Only validate Write and Edit operations
  if (input.tool_name !== 'Write' && input.tool_name !== 'Edit') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  const toolInput = input.tool_input as { file_path?: string; content?: string; new_string?: string };
  const filePath = toolInput.file_path;

  // Only validate .claude/rules/*.md files
  if (!filePath || !filePath.match(/\.claude\/rules\/.*\.md$/)) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  const content = input.tool_name === 'Write' ? toolInput.content : toolInput.new_string;

  if (!content) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  const errors: string[] = [];

  // Parse frontmatter
  let frontmatter: Record<string, unknown> = {};
  try {
    const parsed = matter(content);
    frontmatter = parsed.data;
  } catch {
    errors.push('Invalid YAML frontmatter');
  }

  // Check for required frontmatter: Required Skills
  const requiredSkills = frontmatter['Required Skills'];
  if (!requiredSkills) {
    errors.push('Missing "Required Skills" field in frontmatter');
  }

  // Check for required heading: ## Rules
  if (!content.includes('## Rules')) {
    errors.push('Missing required heading: "## Rules"');
  }

  // If there are errors, deny the operation
  if (errors.length > 0) {
    const fileName = filePath.split('/').pop();
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Rules file validation failed for ${fileName}:\n\n${errors.map((e) => `- ${e}`).join('\n')}\n\nPlease ensure all required fields and headings are present.`,
      },
    };
  }

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  };
}

export { handler };
runHook(handler);
