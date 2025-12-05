/**
 * Format module - Optional markdown format validation hooks
 *
 * This module provides types and utilities for creating hooks that validate
 * markdown file structure (headings, frontmatter, links) during Write and Edit operations.
 *
 * @example
 * ```ts
 * import { createFormatHookFunction, type MarkdownFormat } from '@constellos/claude-code-kit/format';
 *
 * const format: MarkdownFormat = {
 *   files: ['CLAUDE.md'],
 *   headings: [
 *     { matcher: 'Project', required: true },
 *     { matcher: 'Overview', required: true },
 *   ],
 * };
 *
 * const handler = createFormatHookFunction(format);
 * ```
 *
 * @packageDocumentation
 */

// Types
export type {
  HeadingLevel,
  HeadingRule,
  FrontmatterSchema,
  HeadingLinkValidation,
  SourceDocValidation,
  MarkdownFormat,
  ValidationIssueType,
  ValidationIssue,
  ValidationResult,
  PreToolUseMdFormatHook,
} from './types.js';

// Type guard
export { isMarkdownFormat } from './types.js';

// Utilities
export {
  isMarkdownFile,
  matchesFilePatterns,
  reconstructFileFromEdit,
  parseHeading,
  parseAllHeadings,
  matchesPattern,
  getPatternDescription,
  buildHeadingPath,
  parseFrontmatter,
  buildSourceDocIndex,
  extractHeadingLinkText,
  type ParsedHeading,
} from './utils.js';

// Validator
export { validateMarkdownFormat, formatValidationMessage } from './validator.js';

// Hook factory
export {
  createFormatHookFunction,
  runFormatHook,
  type PreToolUseHandler,
  type HookDecision,
  type HookResult,
} from './hook-factory.js';
