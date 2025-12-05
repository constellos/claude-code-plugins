/**
 * Utility functions for format validation
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { relative, isAbsolute, join } from 'path';
import { minimatch } from 'minimatch';
import matter from 'gray-matter';
import type { FileEditInput } from '../schemas/tools.js';
import type { HeadingLevel } from './types.js';

// ============================================================================
// File Utilities
// ============================================================================

/**
 * Check if a file path is a markdown file
 */
export function isMarkdownFile(filePath: string): boolean {
  return filePath.endsWith('.md');
}

/**
 * Check if a file path matches any of the gitignore-style patterns
 *
 * Pattern syntax:
 * - `/CLAUDE.md` - matches only root CLAUDE.md (leading / = project root)
 * - `** /CLAUDE.md` - matches CLAUDE.md in any subdirectory
 * - `!pattern` - negates a pattern (excludes matches)
 * - `src/** /*.md` - matches any .md file under src/
 *
 * @param filePath - Absolute file path to check
 * @param patterns - Array of gitignore-style patterns
 * @param cwd - Current working directory (project root)
 * @returns true if file matches patterns (considering negations)
 */
export function matchesFilePatterns(
  filePath: string,
  patterns: string[],
  cwd: string
): boolean {
  // Convert absolute path to relative path from cwd
  const relativePath = isAbsolute(filePath) ? relative(cwd, filePath) : filePath;

  // Process patterns in order, tracking match state
  let matched = false;

  for (const pattern of patterns) {
    // Handle negation patterns
    if (pattern.startsWith('!')) {
      const negatedPattern = pattern.slice(1);
      if (matchSinglePattern(relativePath, negatedPattern)) {
        matched = false;
      }
    } else {
      if (matchSinglePattern(relativePath, pattern)) {
        matched = true;
      }
    }
  }

  return matched;
}

/**
 * Match a single pattern against a relative path
 *
 * Pattern behavior:
 * - `/pattern` - matches only at root (no subdirectories)
 * - `** /pattern` - matches in any directory
 * - `pattern` (no slashes) - matches only at root (gitignore behavior)
 * - `dir/pattern` - matches relative path from root
 */
function matchSinglePattern(relativePath: string, pattern: string): boolean {
  // Handle leading slash (means root-only, explicit)
  if (pattern.startsWith('/')) {
    // Remove leading slash and match exactly from root
    const rootPattern = pattern.slice(1);
    return minimatch(relativePath, rootPattern, { dot: true });
  }

  // If pattern has no slashes, it should only match at root (gitignore behavior)
  // e.g., "CLAUDE.md" only matches root CLAUDE.md, not src/CLAUDE.md
  if (!pattern.includes('/')) {
    return minimatch(relativePath, pattern, { dot: true, matchBase: false });
  }

  // Pattern has slashes - match as full path
  return minimatch(relativePath, pattern, { dot: true });
}

// ============================================================================
// File Content Utilities
// ============================================================================

/**
 * Reconstruct file content from an Edit tool input
 * @throws Error if file_path is missing or old_string is not found
 */
export async function reconstructFileFromEdit(toolInput: FileEditInput): Promise<string> {
  if (!toolInput.file_path) {
    throw new Error('file_path is required but was empty or undefined');
  }

  const currentContent = readFileSync(toolInput.file_path, 'utf8');

  // Handle replace_all option
  if (toolInput.replace_all) {
    const newContent = currentContent.split(toolInput.old_string).join(toolInput.new_string);
    if (newContent === currentContent) {
      throw new Error('Old string not found in file - edit would have no effect');
    }
    return newContent;
  }

  // Simple string replacement (first occurrence)
  const newContent = currentContent.replace(toolInput.old_string, toolInput.new_string);

  if (newContent === currentContent) {
    throw new Error('Old string not found in file - edit would have no effect');
  }

  return newContent;
}

// ============================================================================
// Heading Utilities
// ============================================================================

/**
 * Parsed heading information
 */
export interface ParsedHeading {
  level: HeadingLevel;
  text: string;
  lineNumber: number;
}

/**
 * Parse a heading line
 * @returns {level, text} or null if not a heading
 */
export function parseHeading(line: string): { level: HeadingLevel; text: string } | null {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  if (!match) return null;

  const level = match[1].length as HeadingLevel;
  const text = match[2].trim();

  return { level, text };
}

/**
 * Parse all headings from markdown content
 */
export function parseAllHeadings(content: string): ParsedHeading[] {
  const headings: ParsedHeading[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const heading = parseHeading(lines[i]);
    if (heading) {
      headings.push({ ...heading, lineNumber: i + 1 });
    }
  }

  return headings;
}

/**
 * Check if a heading text matches a single sub-pattern
 * - `*` matches any heading
 * - `Name` matches exactly "Name"
 * - `Prefix *` matches any heading starting with "Prefix "
 */
function matchesSingleSubPattern(text: string, subPattern: string): boolean {
  // Wildcard - matches anything
  if (subPattern === '*') {
    return true;
  }

  // Prefix pattern - ends with " *"
  if (subPattern.endsWith(' *')) {
    const prefix = subPattern.slice(0, -2); // remove " *"
    return text.startsWith(prefix);
  }

  // Exact match
  return text === subPattern;
}

/**
 * Check if a heading text matches a pattern
 * - `*` matches any heading
 * - `Name` matches exactly "Name"
 * - `Prefix *` matches any heading starting with "Prefix "
 * - `Pattern1|Pattern2` matches if ANY sub-pattern matches (pipe-separated alternatives)
 */
export function matchesPattern(text: string, pattern: string): boolean {
  // Split on pipe for alternatives
  const subPatterns = pattern.split('|');

  // Return true if ANY sub-pattern matches
  return subPatterns.some((subPattern) => matchesSingleSubPattern(text, subPattern.trim()));
}

/**
 * Get a description of a pattern for error messages
 */
export function getPatternDescription(pattern: string): string {
  if (pattern === '*') return 'any heading';
  if (pattern.endsWith(' *')) return `heading starting with "${pattern.slice(0, -2)}"`;
  if (pattern.includes('|')) return `one of: ${pattern.split('|').join(', ')}`;
  return `"${pattern}"`;
}

/**
 * Build a heading path string for error messages
 */
export function buildHeadingPath(path: string[]): string {
  return path.join(' > ');
}

// ============================================================================
// Frontmatter Utilities
// ============================================================================

/**
 * Parse frontmatter from markdown content
 */
export function parseFrontmatter(content: string): { data: Record<string, unknown>; content: string } {
  const result = matter(content);
  return {
    data: result.data as Record<string, unknown>,
    content: result.content,
  };
}

// ============================================================================
// Source Document Utilities
// ============================================================================

/**
 * Build an index of source URLs to file paths by scanning docs directory
 */
export function buildSourceDocIndex(docsBasePath: string, cwd: string): Map<string, string> {
  const index = new Map<string, string>();
  const fullDocsPath = join(cwd, docsBasePath);

  if (!existsSync(fullDocsPath)) {
    return index;
  }

  function scanDir(dir: string) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.endsWith('.md')) {
        try {
          const content = readFileSync(fullPath, 'utf8');
          const { data } = matter(content);
          if (data.source && typeof data.source === 'string') {
            index.set(data.source, fullPath);
          }
        } catch {
          // Skip files that can't be parsed
        }
      }
    }
  }

  scanDir(fullDocsPath);
  return index;
}

/**
 * Extract heading text from a markdown link in heading
 * e.g., "[Create a custom output style](url)" -> "Create a custom output style"
 */
export function extractHeadingLinkText(headingText: string): { linkText: string; url: string } | null {
  const match = headingText.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (!match) return null;
  return { linkText: match[1], url: match[2] };
}
