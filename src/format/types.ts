/**
 * Format hooks types for enforcing markdown structure in Write and Edit tool calls
 *
 * Format files (*.format.ts) export a default MarkdownFormat constant.
 * The hook runner automatically interprets these as PreToolUse validators.
 */

import type { z } from 'zod';

// ============================================================================
// Heading Definition Types
// ============================================================================

/**
 * Heading level (1-6 for # to ######)
 */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Recursive heading definition
 *
 * @property matcher - Pattern for matching heading text:
 *   - `*` matches any heading
 *   - `Name` matches exactly "Name"
 *   - `Prefix *` matches any heading starting with "Prefix "
 *   - `Pattern1|Pattern2` matches if ANY sub-pattern matches
 * @property required - Whether this heading is required (default: true)
 * @property subheadings - Optional nested subheadings under this heading
 * @property allowAdditionalSubheadings - Whether to allow additional subheadings after defined ones (default: false)
 */
export interface HeadingRule {
  /** Pattern for matching heading text */
  matcher: string;
  /** Whether this heading is required (default: true) */
  required?: boolean;
  /** Optional nested subheadings under this heading */
  subheadings?: HeadingRule[];
  /** Whether to allow additional subheadings after the defined ones (default: false) */
  allowAdditionalSubheadings?: boolean;
}

// ============================================================================
// Markdown Format Types
// ============================================================================

/**
 * Frontmatter validation schema
 */
export interface FrontmatterSchema {
  /** Zod schema to validate frontmatter against */
  schema: z.ZodType;
}

/**
 * Heading link validation options
 */
export interface HeadingLinkValidation {
  /** If true, any heading containing a markdown link must have a valid http(s) URL */
  validateUrls?: boolean;
  /** Validate heading anchor links (not yet implemented) */
  validateAnchors?: boolean;
}

/**
 * Source document validation options for skill supporting docs
 */
export interface SourceDocValidation {
  /** Base path for source docs relative to project root (e.g., '.claude/docs') */
  basePath: string;
  /** Validate heading links point to existing docs and section headings match */
  validateHeadingSources?: boolean;
  /** Validate References section only contains paths within basePath */
  validateReferences?: boolean;
}

/**
 * Complete markdown format specification
 * This is what format files (*.format.ts) should export as default
 *
 * Note: Order is always enforced - headings must appear in the order defined
 */
export interface MarkdownFormat {
  /**
   * Gitignore-style file patterns to match against
   *
   * @example "CLAUDE.md" - matches only root CLAUDE.md
   * @example "**\/CLAUDE.md" - matches CLAUDE.md in any subdirectory
   * @example "src/**\/*.md" - matches any .md file under src/
   * @example "!pattern" - negates a pattern (excludes matches)
   */
  files: string[];
  /** Optional frontmatter validation */
  frontmatter?: FrontmatterSchema;
  /** Optional heading link validation */
  headingLinkValidation?: HeadingLinkValidation;
  /** Optional source document validation for skill supporting docs */
  sourceDocValidation?: SourceDocValidation;
  /** Top-level heading structure */
  headings: HeadingRule[];
}

// ============================================================================
// Validation Result Types
// ============================================================================

/**
 * Type of validation issue
 */
export type ValidationIssueType =
  | 'missing'
  | 'unexpected'
  | 'order'
  | 'frontmatter'
  | 'link'
  | 'source_doc';

/**
 * A single validation issue
 */
export interface ValidationIssue {
  /** Type of issue */
  type: ValidationIssueType;
  /** Human-readable message describing the issue */
  message: string;
  /** Path of headings leading to the issue */
  headingPath?: string[];
  /** Line number where the issue was found */
  lineNumber?: number;
  /** What was expected */
  expected?: string;
  /** What was actually found */
  actual?: string;
}

/**
 * Result of validating markdown content
 */
export interface ValidationResult {
  /** Whether the content is valid */
  valid: boolean;
  /** List of issues found */
  issues: ValidationIssue[];
  /** Summary message */
  summary: string;
}

/**
 * PreToolUse markdown format hook type
 *
 * Export a default object of this type from your hook file to create
 * a markdown format validation hook. The hook runner will automatically
 * detect this and run format validation on Write/Edit operations.
 *
 * @example
 * ```ts
 * import type { PreToolUseMdFormatHook } from '@constellos/claude-code-kit/format';
 *
 * const MyFormat: PreToolUseMdFormatHook = {
 *   files: ['CLAUDE.md'],
 *   headings: [
 *     { matcher: 'Project', required: true },
 *     { matcher: 'Overview', required: true },
 *   ],
 * };
 *
 * export default MyFormat;
 * ```
 */
export type PreToolUseMdFormatHook = MarkdownFormat;

/**
 * Type guard to check if an object is a MarkdownFormat
 *
 * Used by the hook runner to detect format hooks vs regular hook functions.
 *
 * @param obj - Object to check
 * @returns True if the object is a MarkdownFormat
 */
export function isMarkdownFormat(obj: unknown): obj is MarkdownFormat {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'files' in obj &&
    Array.isArray((obj as MarkdownFormat).files) &&
    'headings' in obj &&
    Array.isArray((obj as MarkdownFormat).headings)
  );
}
