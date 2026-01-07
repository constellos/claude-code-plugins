/**
 * TSDoc metadata parser for TypeScript files
 *
 * Extracts context metadata from TSDoc comments including @context and @aliases tags,
 * as well as implicit tags from exported function/component/class names.
 * Uses regex-based parsing for zero external dependencies.
 *
 * @module tsdoc-parser
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Metadata extracted from TSDoc comments
 *
 * Contains context tags, aliases, and optional description
 * extracted from JSDoc-style comments.
 */
export interface TSDocMetadata {
  /**
   * Context tags from @context (comma-separated values)
   * @example ['authentication', 'user-management', 'security']
   */
  tags: string[];
  /**
   * Aliases from @aliases (comma-separated values)
   * @example ['login', 'signin', 'auth']
   */
  aliases: string[];
  /**
   * Description extracted from the first line of the comment
   */
  description?: string;
}

/**
 * Information about an exported item from a TypeScript file
 *
 * Captures the name, type, associated TSDoc metadata, and line number
 * for each export in a file.
 */
export interface ExportInfo {
  /**
   * Name of the exported item
   */
  name: string;
  /**
   * Type of export
   */
  type: 'function' | 'component' | 'class' | 'constant' | 'type';
  /**
   * TSDoc metadata associated with this export
   */
  metadata: TSDocMetadata;
  /**
   * Line number where the export is defined (1-indexed)
   */
  line: number;
}

/**
 * Complete metadata for a parsed TypeScript file
 *
 * Combines file-level metadata with all export information.
 */
export interface FileMetadata {
  /**
   * Relative path to the file
   */
  path: string;
  /**
   * ISO timestamp of last file modification
   */
  lastModified: string;
  /**
   * ISO timestamp when the file was indexed
   */
  lastIndexed: string;
  /**
   * Aggregated tags from all exports and file-level comments
   */
  tags: string[];
  /**
   * Aggregated aliases from all exports and file-level comments
   */
  aliases: string[];
  /**
   * All exports found in the file
   */
  exports: ExportInfo[];
  /**
   * File-level description from leading comment
   */
  description?: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Regex to match JSDoc-style comments (both block and doc comments)
 */
const JSDOC_COMMENT_REGEX = /\/\*\*?([\s\S]*?)\*\//g;

/**
 * Regex to match @context tag with comma-separated values
 */
const CONTEXT_TAG_REGEX = /@context\s+([^\n@]+)/gi;

/**
 * Regex to match @aliases tag with comma-separated values
 */
const ALIASES_TAG_REGEX = /@aliases?\s+([^\n@]+)/gi;

/**
 * Regex to match first line description (before any @tags)
 */
const DESCRIPTION_REGEX = /^\s*\*?\s*([^@\n*][^\n]*)/m;

/**
 * Regex patterns for different export types
 */
const EXPORT_PATTERNS = {
  // export function name() or export async function name()
  function: /^export\s+(?:async\s+)?function\s+(\w+)/,
  // export const Name = () => or export const name =
  arrowFunction: /^export\s+const\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=])*=>/,
  // export const name = value (not arrow function)
  constant: /^export\s+const\s+(\w+)\s*=/,
  // export class Name
  class: /^export\s+class\s+(\w+)/,
  // export type Name or export interface Name
  type: /^export\s+(?:type|interface)\s+(\w+)/,
  // export default function or export default class
  defaultExport: /^export\s+default\s+(?:function|class)\s+(\w+)/,
};

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parse comma-separated values from a tag value string
 *
 * Handles whitespace, quotes, and empty values.
 *
 * @param value - Raw tag value string
 * @returns Array of trimmed, non-empty values
 *
 * @example
 * ```typescript
 * parseCommaSeparated('auth, user-management, security')
 * // Returns: ['auth', 'user-management', 'security']
 * ```
 */
function parseCommaSeparated(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Extract TSDoc metadata from a single comment block
 *
 * Parses @context and @aliases tags, and extracts the first line
 * as a description if it doesn't start with @.
 *
 * @param comment - Comment content (without delimiters)
 * @returns Parsed TSDoc metadata
 *
 * @example
 * ```typescript
 * const metadata = extractTSDocFromComment(`
 *   * Authenticates a user with credentials
 *   * @context authentication, security
 *   * @aliases login, signin
 * `);
 * // Returns: {
 * //   tags: ['authentication', 'security'],
 * //   aliases: ['login', 'signin'],
 * //   description: 'Authenticates a user with credentials'
 * // }
 * ```
 */
function extractTSDocFromComment(comment: string): TSDocMetadata {
  const tags: string[] = [];
  const aliases: string[] = [];
  let description: string | undefined;

  // Extract @context tags
  let match: RegExpExecArray | null;
  const contextRegex = new RegExp(CONTEXT_TAG_REGEX.source, 'gi');
  while ((match = contextRegex.exec(comment)) !== null) {
    tags.push(...parseCommaSeparated(match[1]));
  }

  // Extract @aliases tags
  const aliasesRegex = new RegExp(ALIASES_TAG_REGEX.source, 'gi');
  while ((match = aliasesRegex.exec(comment)) !== null) {
    aliases.push(...parseCommaSeparated(match[1]));
  }

  // Extract description (first non-@ line)
  const descMatch = comment.match(DESCRIPTION_REGEX);
  if (descMatch) {
    description = descMatch[1].trim();
    // Remove leading asterisks from multi-line comments
    description = description.replace(/^\*\s*/, '');
    // Limit to 100 chars
    if (description.length > 100) {
      description = description.substring(0, 97) + '...';
    }
  }

  return { tags, aliases, description };
}

/**
 * Extract TSDoc metadata from file content
 *
 * Finds the first JSDoc comment in the file (typically module-level)
 * and extracts @context and @aliases tags from it.
 *
 * @param content - Full TypeScript file content
 * @returns Aggregated TSDoc metadata from all comments
 *
 * @example
 * ```typescript
 * import { extractTSDocMetadata } from './tsdoc-parser.js';
 *
 * const content = `
 * /**
 *  * User authentication module
 *  * @context authentication, security
 *  * @aliases auth, login
 *  *\/
 * export function authenticate() {}
 * `;
 *
 * const metadata = extractTSDocMetadata(content);
 * // Returns: {
 * //   tags: ['authentication', 'security'],
 * //   aliases: ['auth', 'login'],
 * //   description: 'User authentication module'
 * // }
 * ```
 */
export function extractTSDocMetadata(content: string): TSDocMetadata {
  const allTags: string[] = [];
  const allAliases: string[] = [];
  let firstDescription: string | undefined;

  // Find all JSDoc comments
  const commentRegex = new RegExp(JSDOC_COMMENT_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = commentRegex.exec(content)) !== null) {
    const metadata = extractTSDocFromComment(match[1]);
    allTags.push(...metadata.tags);
    allAliases.push(...metadata.aliases);
    if (!firstDescription && metadata.description) {
      firstDescription = metadata.description;
    }
  }

  // Deduplicate tags and aliases
  return {
    tags: [...new Set(allTags)],
    aliases: [...new Set(allAliases)],
    description: firstDescription,
  };
}

/**
 * Determine if a name is likely a React component
 *
 * React components by convention start with an uppercase letter.
 *
 * @param name - Export name to check
 * @returns True if the name follows React component naming convention
 */
function isLikelyComponent(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

/**
 * Find the JSDoc comment immediately preceding a line
 *
 * Searches backwards from the given line to find an associated comment.
 *
 * @param lines - Array of file lines
 * @param lineIndex - Index of the export line (0-indexed)
 * @returns Comment content if found, undefined otherwise
 */
function findPrecedingComment(lines: string[], lineIndex: number): string | undefined {
  // Look for a comment ending on the line before
  let i = lineIndex - 1;

  // Skip blank lines
  while (i >= 0 && lines[i].trim() === '') {
    i--;
  }

  if (i < 0) return undefined;

  // Check if this line ends a block comment
  const endLine = lines[i].trim();
  if (!endLine.endsWith('*/')) return undefined;

  // Find the start of the comment
  const commentLines: string[] = [];
  while (i >= 0) {
    const line = lines[i];
    commentLines.unshift(line);
    if (line.includes('/**') || line.includes('/*')) {
      break;
    }
    i--;
  }

  return commentLines.join('\n');
}

/**
 * Extract all exports from a TypeScript file
 *
 * Parses the file to find all exported functions, components, classes,
 * constants, and types. Associates each export with its TSDoc metadata.
 *
 * @param content - Full TypeScript file content
 * @returns Array of export information with metadata
 *
 * @example
 * ```typescript
 * import { extractExports } from './tsdoc-parser.js';
 *
 * const content = `
 * /**
 *  * Button component
 *  * @context ui, components
 *  *\/
 * export function Button() { return <button />; }
 *
 * /**
 *  * Input field component
 *  * @context ui, forms
 *  *\/
 * export const Input = () => <input />;
 * `;
 *
 * const exports = extractExports(content);
 * // Returns: [
 * //   { name: 'Button', type: 'component', metadata: {...}, line: 5 },
 * //   { name: 'Input', type: 'component', metadata: {...}, line: 11 }
 * // ]
 * ```
 */
export function extractExports(content: string): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip non-export lines
    if (!trimmedLine.startsWith('export')) continue;

    let name: string | undefined;
    let type: ExportInfo['type'] = 'constant';

    // Try each pattern
    for (const [patternType, regex] of Object.entries(EXPORT_PATTERNS)) {
      const match = trimmedLine.match(regex);
      if (match) {
        name = match[1];

        // Determine type
        if (patternType === 'function' || patternType === 'arrowFunction') {
          type = isLikelyComponent(name) ? 'component' : 'function';
        } else if (patternType === 'class') {
          type = 'class';
        } else if (patternType === 'type') {
          type = 'type';
        } else if (patternType === 'defaultExport') {
          type = isLikelyComponent(name) ? 'component' : 'function';
        } else {
          // Check if it's a component based on naming
          type = isLikelyComponent(name) ? 'component' : 'constant';
        }
        break;
      }
    }

    if (!name) continue;

    // Find preceding JSDoc comment
    const commentContent = findPrecedingComment(lines, i);
    let metadata: TSDocMetadata = { tags: [], aliases: [] };

    if (commentContent) {
      // Extract from the comment block
      const commentMatch = commentContent.match(/\/\*\*?([\s\S]*?)\*\//);
      if (commentMatch) {
        metadata = extractTSDocFromComment(commentMatch[1]);
      }
    }

    // Add the export name as an implicit tag (converted to kebab-case)
    const implicitTag = name
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase();
    if (!metadata.tags.includes(implicitTag)) {
      metadata.tags.push(implicitTag);
    }

    exports.push({
      name,
      type,
      metadata,
      line: i + 1, // Convert to 1-indexed
    });
  }

  return exports;
}

/**
 * Parse complete metadata for a TypeScript file
 *
 * Combines file-level TSDoc metadata with all export metadata
 * to create a complete picture of the file's context.
 *
 * @param filePath - Path to the file (for metadata)
 * @param content - Full file content
 * @returns Complete file metadata
 *
 * @example
 * ```typescript
 * import { parseFileMetadata } from './tsdoc-parser.js';
 * import * as fs from 'fs/promises';
 *
 * const content = await fs.readFile('src/auth/login.ts', 'utf-8');
 * const metadata = parseFileMetadata('src/auth/login.ts', content);
 *
 * console.log(metadata.tags);    // ['authentication', 'security', 'login-form']
 * console.log(metadata.exports); // Array of ExportInfo
 * ```
 */
export function parseFileMetadata(filePath: string, content: string): FileMetadata {
  const now = new Date().toISOString();

  // Get file-level metadata from first comment
  const fileMetadata = extractTSDocMetadata(content);

  // Get all exports with their metadata
  const exports = extractExports(content);

  // Aggregate all tags and aliases
  const allTags = new Set<string>(fileMetadata.tags);
  const allAliases = new Set<string>(fileMetadata.aliases);

  for (const exp of exports) {
    for (const tag of exp.metadata.tags) {
      allTags.add(tag);
    }
    for (const alias of exp.metadata.aliases) {
      allAliases.add(alias);
    }
  }

  return {
    path: filePath,
    lastModified: now, // Caller should set this from file stat
    lastIndexed: now,
    tags: [...allTags],
    aliases: [...allAliases],
    exports,
    description: fileMetadata.description,
  };
}
