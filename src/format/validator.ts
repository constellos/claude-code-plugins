/**
 * Markdown format validation logic
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { z } from 'zod';
import type {
  MarkdownFormat,
  ValidationResult,
  ValidationIssue,
  HeadingRule,
  HeadingLevel,
  SourceDocValidation,
} from './types.js';
import {
  parseAllHeadings,
  matchesPattern,
  getPatternDescription,
  buildHeadingPath,
  parseFrontmatter,
  buildSourceDocIndex,
  extractHeadingLinkText,
  type ParsedHeading,
} from './utils.js';

// ============================================================================
// Frontmatter Validation
// ============================================================================

/**
 * Validate frontmatter against a Zod schema
 */
function validateFrontmatter(content: string, schema: z.ZodType): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  try {
    const { data } = parseFrontmatter(content);

    if (!data || Object.keys(data).length === 0) {
      issues.push({
        type: 'frontmatter',
        message: 'Frontmatter is required but not found',
      });
      return issues;
    }

    const result = schema.safeParse(data);

    if (!result.success) {
      for (const err of result.error.errors) {
        const path = err.path.join('.');
        issues.push({
          type: 'frontmatter',
          message: `Frontmatter field "${path}": ${err.message}`,
          expected: path,
        });
      }
    }
  } catch (error) {
    issues.push({
      type: 'frontmatter',
      message: `Failed to parse frontmatter: ${error}`,
    });
  }

  return issues;
}

// ============================================================================
// Heading Structure Validation
// ============================================================================

/**
 * Validate heading structure against rules
 */
function validateHeadingStructure(
  contentHeadings: ParsedHeading[],
  rules: HeadingRule[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  function validateHeadings(
    rules: HeadingRule[],
    headings: ParsedHeading[],
    parentPath: string[] = [],
    expectedLevel: HeadingLevel = 1
  ): number {
    let headingIndex = 0;

    for (const rule of rules) {
      const pattern = rule.matcher;

      // Find next heading at this level that matches the pattern
      const matchingHeadingIndex = headings
        .slice(headingIndex)
        .findIndex((h) => h.level === expectedLevel && matchesPattern(h.text, pattern));

      if (matchingHeadingIndex === -1) {
        // Required heading not found
        if (rule.required !== false) {
          issues.push({
            type: 'missing',
            message: `Required heading ${getPatternDescription(pattern)} not found`,
            headingPath: [...parentPath, getPatternDescription(pattern)],
            expected: getPatternDescription(pattern),
          });
        }
        continue;
      }

      const actualIndex = headingIndex + matchingHeadingIndex;
      const matchedHeading = headings[actualIndex];

      // Check order - only flag if there's a heading at the SAME level between current position and found
      // This allows nested subheadings (e.g., H3 under H2) without triggering order errors
      const skippedSameLevelHeadings = headings
        .slice(headingIndex, actualIndex)
        .filter((h) => h.level === expectedLevel);

      if (skippedSameLevelHeadings.length > 0) {
        issues.push({
          type: 'order',
          message: `Heading "${matchedHeading.text}" appears out of expected order`,
          headingPath: [...parentPath, matchedHeading.text],
          lineNumber: matchedHeading.lineNumber,
        });
      }

      headingIndex = actualIndex + 1;

      // Validate subheadings if defined
      if (rule.subheadings && rule.subheadings.length > 0) {
        // Find all subheadings under this heading (until next heading of same or higher level)
        const subHeadings = headings.slice(headingIndex).filter((h, i, arr) => {
          // Stop at next heading of same or higher level
          const nextHigherLevelIndex = arr.findIndex((next) => next.level <= expectedLevel);
          return nextHigherLevelIndex === -1 || i < nextHigherLevelIndex;
        });

        const consumedCount = validateHeadings(
          rule.subheadings,
          subHeadings,
          [...parentPath, matchedHeading.text],
          (expectedLevel + 1) as HeadingLevel
        );
        headingIndex += consumedCount;
      }
    }

    return headingIndex;
  }

  validateHeadings(rules, contentHeadings);
  return issues;
}

// ============================================================================
// Link Validation
// ============================================================================

/**
 * Validate heading links
 */
function validateHeadingLinks(
  contentHeadings: ParsedHeading[],
  requireValidUrls: boolean
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!requireValidUrls) {
    return issues;
  }

  for (const heading of contentHeadings) {
    // Check if heading contains a markdown link: [text](url)
    const linkMatch = heading.text.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const url = linkMatch[2];
      // Validate URL starts with http:// or https://
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        issues.push({
          type: 'link',
          message: `Heading link must be a valid http(s) URL: "${url}"`,
          lineNumber: heading.lineNumber,
          expected: 'http:// or https:// URL',
          actual: url,
        });
      }
    }
  }

  return issues;
}

// ============================================================================
// Source Document Validation
// ============================================================================

/**
 * Validate source document references in supporting docs
 */
function validateSourceDocs(
  content: string,
  contentHeadings: ParsedHeading[],
  options: SourceDocValidation,
  cwd: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Build index of source URLs to file paths
  const sourceIndex = buildSourceDocIndex(options.basePath, cwd);

  // Validate heading sources
  if (options.validateHeadingSources) {
    for (const heading of contentHeadings) {
      const linkInfo = extractHeadingLinkText(heading.text);
      if (!linkInfo) continue;

      const { linkText, url } = linkInfo;

      // Skip non-http URLs (already validated by headingLinkValidation)
      if (!url.startsWith('http://') && !url.startsWith('https://')) continue;

      // Find source doc by URL
      const sourceDocPath = sourceIndex.get(url);
      if (!sourceDocPath) {
        issues.push({
          type: 'source_doc',
          message: `No source doc found with URL: "${url}"`,
          lineNumber: heading.lineNumber,
          expected: `Doc in ${options.basePath} with source: ${url}`,
        });
        continue;
      }

      // Read source doc and check for matching heading
      try {
        const sourceContent = readFileSync(sourceDocPath, 'utf8');
        const sourceHeadings = parseAllHeadings(sourceContent);

        // Check if any heading matches (case-sensitive, level-agnostic)
        const hasMatch = sourceHeadings.some((h) => h.text === linkText);
        if (!hasMatch) {
          issues.push({
            type: 'source_doc',
            message: `Heading "${linkText}" not found in source doc`,
            lineNumber: heading.lineNumber,
            expected: `Heading "${linkText}" in ${sourceDocPath}`,
            actual: `Available headings: ${sourceHeadings
              .slice(0, 5)
              .map((h) => h.text)
              .join(', ')}${sourceHeadings.length > 5 ? '...' : ''}`,
          });
        }
      } catch {
        issues.push({
          type: 'source_doc',
          message: `Failed to read source doc: ${sourceDocPath}`,
          lineNumber: heading.lineNumber,
        });
      }
    }
  }

  // Validate References section
  if (options.validateReferences) {
    const lines = content.split('\n');
    let inReferencesSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if we're entering References section
      if (line.match(/^#{1,6}\s+References\s*$/i)) {
        inReferencesSection = true;
        continue;
      }

      // Check if we're leaving References section (next heading)
      if (inReferencesSection && line.match(/^#{1,6}\s+/)) {
        inReferencesSection = false;
        continue;
      }

      // Validate references in References section
      if (inReferencesSection) {
        // Match list items with paths: - `.claude/docs/...` or - .claude/docs/...
        const pathMatch = line.match(/^[-*]\s+`?([^`\s]+)`?\s*$/);
        if (pathMatch) {
          const refPath = pathMatch[1];

          // Check if path starts with basePath
          if (
            !refPath.startsWith(options.basePath) &&
            !refPath.startsWith('./' + options.basePath)
          ) {
            issues.push({
              type: 'source_doc',
              message: `Reference must be within ${options.basePath}: "${refPath}"`,
              lineNumber: i + 1,
              expected: `Path starting with ${options.basePath}`,
              actual: refPath,
            });
            continue;
          }

          // Check if file exists
          const normalizedPath = refPath.startsWith('./') ? refPath.slice(2) : refPath;
          const fullPath = join(cwd, normalizedPath);
          if (!existsSync(fullPath)) {
            issues.push({
              type: 'source_doc',
              message: `Referenced file does not exist: "${refPath}"`,
              lineNumber: i + 1,
              expected: `Existing file at ${fullPath}`,
            });
          }
        }
      }
    }
  }

  return issues;
}

// ============================================================================
// Main Validation Functions
// ============================================================================

/**
 * Validate markdown content against a format specification
 */
export async function validateMarkdownFormat(
  content: string,
  format: MarkdownFormat,
  cwd?: string
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];

  // Validate frontmatter if schema is provided
  if (format.frontmatter?.schema) {
    const frontmatterIssues = validateFrontmatter(content, format.frontmatter.schema);
    issues.push(...frontmatterIssues);
  }

  // Parse all headings from content
  const contentHeadings = parseAllHeadings(content);

  // Validate heading structure
  const headingIssues = validateHeadingStructure(contentHeadings, format.headings);
  issues.push(...headingIssues);

  // Validate heading links if enabled
  if (format.headingLinkValidation?.validateUrls) {
    const linkIssues = validateHeadingLinks(contentHeadings, true);
    issues.push(...linkIssues);
  }

  // Validate source document references if enabled
  if (format.sourceDocValidation && cwd) {
    const sourceDocIssues = validateSourceDocs(
      content,
      contentHeadings,
      format.sourceDocValidation,
      cwd
    );
    issues.push(...sourceDocIssues);
  }

  const valid = issues.length === 0;

  return {
    valid,
    issues,
    summary: valid
      ? 'Format validation passed'
      : `Format validation failed: ${issues.length} issue(s)`,
  };
}

/**
 * Format validation issues into a user-friendly message
 */
export function formatValidationMessage(result: ValidationResult): string {
  const { issues } = result;

  if (issues.length === 0) {
    return 'No issues found';
  }

  const parts: string[] = ['Issues:'];

  issues.forEach((issue) => {
    let msg = `  - ${issue.message}`;
    if (issue.headingPath && issue.headingPath.length > 0) {
      msg += ` (${buildHeadingPath(issue.headingPath)})`;
    }
    if (issue.lineNumber) {
      msg += ` (line ${issue.lineNumber})`;
    }
    parts.push(msg);
  });

  return parts.join('\n');
}
