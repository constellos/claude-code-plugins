/**
 * PostToolUse Hook - Enforce Plan-Based Path Scoping
 *
 * This hook fires after Write, Edit, or Read operations to enforce path
 * restrictions defined in the active plan file.
 *
 * The hook:
 * 1. Checks for a PLAN.md symlink in the project root
 * 2. Reads and parses the plan frontmatter
 * 3. Determines agent context (main agent vs subagent)
 * 4. Validates the file path against the appropriate scope
 * 5. For Write/Edit: Denies operations outside allowed scope
 * 6. For Read: Returns non-blocking warning if outside scope
 *
 * @module hooks/enforce-plan-scoping
 */

import type { PostToolUseInput, PostToolUseHookOutput } from '../types/types.js';
import { createDebugLogger } from './utils/debug.js';
import { runHook } from './utils/io.js';
import { wasToolEventMainAgent } from './utils/was-tool-event-main-agent.js';
import matter from './utils/frontmatter.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Path configuration for an agent type
 */
interface PathConfig {
  allowedPaths?: string[];
  forbiddenPaths?: string[];
}

/**
 * Plan frontmatter structure
 */
interface PlanFrontmatter {
  paths?: {
    'main-agent'?: PathConfig;
    subagents?: PathConfig;
  };
  [key: string]: unknown;
}

/**
 * Path validation result
 */
interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Check if a string matches a gitignore-style pattern
 *
 * Supports:
 * - Exact matches
 * - * (glob - matches any characters)
 * - ? (single character)
 *
 * @param value - The value to test
 * @param pattern - The gitignore-style pattern
 * @returns true if the value matches the pattern
 */
function matchesGitignorePattern(value: string, pattern: string): boolean {
  if (value === pattern) {
    return true;
  }

  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(value);
}

/**
 * Validate a file path against allowed and forbidden patterns
 *
 * @param filePath - The file path to validate (relative to cwd)
 * @param allowed - Array of allowed gitignore-style patterns
 * @param forbidden - Array of forbidden gitignore-style patterns
 * @returns Validation result with valid flag and reason if invalid
 */
function validatePath(
  filePath: string,
  allowed: string[],
  forbidden: string[]
): ValidationResult {
  // Check forbidden patterns first (takes precedence)
  for (const pattern of forbidden) {
    if (matchesGitignorePattern(filePath, pattern)) {
      return {
        valid: false,
        reason: `Path matches forbidden pattern: "${pattern}"`,
      };
    }
  }

  // Check allowed patterns (if specified, path must match at least one)
  if (allowed.length > 0) {
    const matches = allowed.some((p) => matchesGitignorePattern(filePath, p));
    if (!matches) {
      return {
        valid: false,
        reason: `Path not in allowed patterns: ${allowed.join(', ')}`,
      };
    }
  }

  return { valid: true };
}

/**
 * PostToolUse hook handler for enforcing plan-based path scoping
 *
 * Executes after Write, Edit, or Read operations to validate file paths
 * against plan restrictions.
 *
 * @param input - PostToolUse hook input from Claude Code
 * @returns Hook output (blocking for writes/edits, non-blocking for reads)
 *
 * @example
 * ```typescript
 * // This hook is automatically called by Claude Code
 * // after any Write, Edit, or Read operation
 * ```
 */
async function handler(input: PostToolUseInput): Promise<PostToolUseHookOutput> {
  const logger = createDebugLogger(input.cwd, 'enforce-plan-scoping', input.debug);

  try {
    await logger.logInput({
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
    });

    // Only run for Write, Edit, or Read tools
    if (input.tool_name !== 'Write' && input.tool_name !== 'Edit' && input.tool_name !== 'Read') {
      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
        },
      };
    }

    const toolInput = input.tool_input as { file_path?: string };
    const filePath = toolInput.file_path;

    if (!filePath) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
        },
      };
    }

    // Resolve to absolute path
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(input.cwd, filePath);

    // Convert to relative path for pattern matching
    const relativePath = path.relative(input.cwd, absolutePath);

    await logger.logOutput({
      filePath,
      absolutePath,
      relativePath,
    });

    // Skip enforcement for plan files and PLAN.md symlink
    const isPlanFile = absolutePath.includes(path.join('.claude', 'plans'));
    const isPlanSymlink = path.basename(absolutePath) === 'PLAN.md';

    if (isPlanFile || isPlanSymlink) {
      await logger.logOutput({
        action: 'skip',
        reason: 'Plan file or PLAN.md symlink',
      });

      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
        },
      };
    }

    // Check if PLAN.md symlink exists
    const symlinkPath = path.join(input.cwd, 'PLAN.md');
    let planExists = false;

    try {
      const stats = await fs.lstat(symlinkPath);
      planExists = stats.isSymbolicLink();
    } catch {
      // PLAN.md doesn't exist - no enforcement
      await logger.logOutput({
        action: 'skip',
        reason: 'No PLAN.md symlink found',
      });

      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
        },
      };
    }

    if (!planExists) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
        },
      };
    }

    // Read plan file via symlink
    const planContent = await fs.readFile(symlinkPath, 'utf-8');
    const { data: frontmatter } = matter(planContent);
    const planData = frontmatter as PlanFrontmatter;

    await logger.logOutput({
      action: 'plan-loaded',
      hasPaths: !!planData.paths,
    });

    // Skip enforcement if no paths configuration
    if (!planData.paths) {
      await logger.logOutput({
        action: 'skip',
        reason: 'No paths configuration in plan',
      });

      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
        },
      };
    }

    // Determine agent context
    const isMain = await wasToolEventMainAgent(input.transcript_path, input.tool_use_id);
    const agentType = isMain ? 'main-agent' : 'subagents';

    await logger.logOutput({
      agentType,
      isMainAgent: isMain,
    });

    // Get path configuration for this agent type
    const config = planData.paths[agentType];

    if (!config) {
      await logger.logOutput({
        action: 'skip',
        reason: `No path configuration for ${agentType}`,
      });

      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
        },
      };
    }

    const allowed = config.allowedPaths || [];
    const forbidden = config.forbiddenPaths || [];

    // Validate path
    const validation = validatePath(relativePath, allowed, forbidden);

    await logger.logOutput({
      validation,
      allowed,
      forbidden,
      relativePath,
    });

    if (!validation.valid) {
      if (input.tool_name === 'Read') {
        // Non-blocking warning for reads
        const message = isMain
          ? `Note: Plan indicates this file is outside main agent scope. Consider requesting plan updates or using a subagent for this area.`
          : `Note: Plan indicates this file is outside subagent scope. This may load expensive context. Consider having the main agent handle this or request plan updates.`;

        return {
          additionalContext: `\n\n${message}\n\nPath: ${relativePath}\nReason: ${validation.reason}`,
          hookSpecificOutput: {
            hookEventName: 'PostToolUse',
          },
        };
      } else {
        // Blocking denial for writes/edits
        const message = isMain
          ? `Write denied: ${validation.reason}\n\nMain agent scope is restricted by plan. Use Plan agent to update scope or delegate to subagents.\n\nPath: ${relativePath}`
          : `Write denied: ${validation.reason}\n\nSubagent scope is restricted by plan. Have main agent handle this area or update plan.\n\nPath: ${relativePath}`;

        return {
          hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: message,
          },
        };
      }
    }

    // Path is valid
    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
      },
    };
  } catch (error: unknown) {
    await logger.logError(error as Error);

    // Non-blocking: allow operation if enforcement fails
    return {
      systemMessage: `Plan scoping enforcement failed: ${(error as Error).message || 'Unknown error'}`,
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
      },
    };
  }
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
