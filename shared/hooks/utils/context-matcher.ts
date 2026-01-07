/**
 * Context Matcher
 *
 * Matches user prompt words against the metadata index and returns
 * SERP-style ranked results. Used by UserPromptSubmit hooks to enrich
 * prompts with relevant file and folder context.
 *
 * @module context-matcher
 */

import type { MetadataIndex, FileMetadata, FolderMetadata, SupabaseSchemaCache } from './metadata-index.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum number of folder results to return
 */
const DEFAULT_MAX_FOLDERS = 5;

/**
 * Maximum number of file results to return
 */
const DEFAULT_MAX_FILES = 10;

/**
 * Maximum characters for item descriptions
 */
const MAX_DESCRIPTION_LENGTH = 100;

/**
 * Common words to exclude from matching
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at',
  'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here',
  'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until',
  'while', 'this', 'that', 'these', 'those', 'it', 'its', 'i', 'me', 'my',
  'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them',
  'their', 'what', 'which', 'who', 'whom', 'want', 'need', 'please', 'help',
  'make', 'create', 'add', 'update', 'fix', 'change', 'modify', 'edit', 'remove',
  'delete', 'get', 'set', 'use', 'using', 'like', 'file', 'files', 'code',
]);

// ============================================================================
// Types
// ============================================================================

/**
 * A single match result from context matching
 */
export interface MatchResult {
  /**
   * Type of matched item
   */
  type: 'file' | 'folder' | 'table';
  /**
   * Path to the matched item (or table name for Supabase)
   */
  path: string;
  /**
   * Terms from the prompt that matched
   */
  matchedTerms: string[];
  /**
   * Relevance score (higher is better)
   */
  score: number;
  /**
   * Title or description (truncated to 100 chars)
   */
  title?: string;
}

/**
 * Options for context matching
 */
export interface MatchOptions {
  /**
   * Maximum number of folder results
   * @default 5
   */
  maxFolders?: number;
  /**
   * Maximum number of file results
   * @default 10
   */
  maxFiles?: number;
  /**
   * Minimum score threshold for results
   * @default 0.1
   */
  minScore?: number;
}

// ============================================================================
// Tokenization
// ============================================================================

/**
 * Tokenize a user prompt into searchable terms
 *
 * Extracts meaningful words from the prompt, filtering out stop words
 * and normalizing to lowercase. Also handles camelCase and kebab-case.
 *
 * @param prompt - User prompt text
 * @returns Array of normalized search terms
 *
 * @example
 * ```typescript
 * import { tokenizePrompt } from './context-matcher.js';
 *
 * const terms = tokenizePrompt('Update the UserAuthentication component');
 * // Returns: ['user', 'authentication', 'component', 'userauthentication']
 * ```
 */
export function tokenizePrompt(prompt: string): string[] {
  // Convert to lowercase
  const lower = prompt.toLowerCase();

  // Extract words (alphanumeric sequences)
  const words = lower.match(/[a-z0-9]+/g) || [];

  // Also extract camelCase parts
  const camelParts: string[] = [];
  for (const word of words) {
    // Split camelCase: 'userAuth' -> ['user', 'auth']
    const parts = word.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(' ');
    if (parts.length > 1) {
      camelParts.push(...parts);
    }
  }

  // Combine and deduplicate
  const allTerms = [...new Set([...words, ...camelParts])];

  // Filter out stop words and very short terms
  return allTerms.filter((term) => term.length > 2 && !STOP_WORDS.has(term));
}

// ============================================================================
// Scoring
// ============================================================================

/**
 * Calculate match score for a file
 *
 * Scores based on:
 * - Tag matches (high weight)
 * - Alias matches (high weight)
 * - Export name matches (medium weight)
 * - Path segment matches (low weight)
 *
 * @param file - File metadata to score
 * @param terms - Search terms from prompt
 * @returns Score object with total and matched terms
 */
function scoreFile(
  file: FileMetadata,
  terms: string[]
): { score: number; matchedTerms: string[] } {
  let score = 0;
  const matchedTerms: string[] = [];

  for (const term of terms) {
    // Check tags (high weight: 3 points)
    if (file.tags.some((tag) => tag.toLowerCase().includes(term))) {
      score += 3;
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
    }

    // Check aliases (high weight: 3 points)
    if (file.aliases.some((alias) => alias.toLowerCase().includes(term))) {
      score += 3;
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
    }

    // Check export names (medium weight: 2 points)
    if (file.exports.some((exp) => exp.name.toLowerCase().includes(term))) {
      score += 2;
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
    }

    // Check path segments (low weight: 1 point)
    const pathLower = file.path.toLowerCase();
    if (pathLower.includes(term)) {
      score += 1;
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
    }

    // Check description (low weight: 1 point)
    if (file.description && file.description.toLowerCase().includes(term)) {
      score += 1;
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
    }
  }

  // Normalize by number of terms to prevent bias toward longer prompts
  const normalizedScore = terms.length > 0 ? score / terms.length : 0;

  return { score: normalizedScore, matchedTerms };
}

/**
 * Calculate match score for a folder
 *
 * Scores based on:
 * - Tag matches (high weight)
 * - Title matches (medium weight)
 * - Path segment matches (low weight)
 *
 * @param folder - Folder metadata to score
 * @param terms - Search terms from prompt
 * @returns Score object with total and matched terms
 */
function scoreFolder(
  folder: FolderMetadata,
  terms: string[]
): { score: number; matchedTerms: string[] } {
  let score = 0;
  const matchedTerms: string[] = [];

  for (const term of terms) {
    // Check tags (high weight: 3 points)
    if (folder.tags.some((tag) => tag.toLowerCase().includes(term))) {
      score += 3;
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
    }

    // Check title (medium weight: 2 points)
    if (folder.title && folder.title.toLowerCase().includes(term)) {
      score += 2;
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
    }

    // Check path segments (low weight: 1 point)
    const pathLower = folder.path.toLowerCase();
    if (pathLower.includes(term)) {
      score += 1;
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
    }
  }

  // Normalize by number of terms
  const normalizedScore = terms.length > 0 ? score / terms.length : 0;

  return { score: normalizedScore, matchedTerms };
}

/**
 * Calculate match score for a Supabase table
 *
 * Scores based on:
 * - Table name matches (high weight)
 * - Column name matches (medium weight)
 *
 * @param table - Table metadata to score
 * @param terms - Search terms from prompt
 * @returns Score object with total and matched terms
 */
function scoreTable(
  table: SupabaseSchemaCache['tables'][number],
  terms: string[]
): { score: number; matchedTerms: string[] } {
  let score = 0;
  const matchedTerms: string[] = [];

  for (const term of terms) {
    // Check table name (high weight: 3 points)
    if (table.name.toLowerCase().includes(term)) {
      score += 3;
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
    }

    // Check column names (medium weight: 2 points per column)
    const matchingColumns = table.columns.filter((col) => col.toLowerCase().includes(term));
    if (matchingColumns.length > 0) {
      score += 2;
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
    }
  }

  // Normalize by number of terms
  const normalizedScore = terms.length > 0 ? score / terms.length : 0;

  return { score: normalizedScore, matchedTerms };
}

// ============================================================================
// Matching
// ============================================================================

/**
 * Match prompt against the metadata index
 *
 * Tokenizes the prompt and matches against all indexed files, folders,
 * and optionally Supabase tables. Returns ranked results limited by
 * the options.
 *
 * @param prompt - User prompt text
 * @param index - Loaded metadata index
 * @param options - Matching options
 * @returns Array of match results, sorted by score descending
 *
 * @example
 * ```typescript
 * import { matchContext } from './context-matcher.js';
 * import { loadIndex } from './metadata-index.js';
 *
 * const index = await loadIndex(cwd);
 * const results = matchContext('authentication login form', index);
 *
 * for (const result of results) {
 *   console.log(`${result.type}: ${result.path} (score: ${result.score})`);
 * }
 * ```
 */
export function matchContext(
  prompt: string,
  index: MetadataIndex,
  options: MatchOptions = {}
): MatchResult[] {
  const {
    maxFolders = DEFAULT_MAX_FOLDERS,
    maxFiles = DEFAULT_MAX_FILES,
    minScore = 0.1,
  } = options;

  // Tokenize prompt
  const terms = tokenizePrompt(prompt);

  if (terms.length === 0) {
    return [];
  }

  // Score all files
  const fileResults: MatchResult[] = [];
  for (const [filePath, file] of Object.entries(index.files)) {
    const { score, matchedTerms } = scoreFile(file, terms);
    if (score >= minScore && matchedTerms.length > 0) {
      fileResults.push({
        type: 'file',
        path: filePath,
        matchedTerms,
        score,
        title: truncateDescription(file.description || getFileName(filePath)),
      });
    }
  }

  // Score all folders
  const folderResults: MatchResult[] = [];
  for (const [folderPath, folder] of Object.entries(index.folders)) {
    const { score, matchedTerms } = scoreFolder(folder, terms);
    if (score >= minScore && matchedTerms.length > 0) {
      folderResults.push({
        type: 'folder',
        path: folderPath,
        matchedTerms,
        score,
        title: truncateDescription(folder.title || folderPath),
      });
    }
  }

  // Score Supabase tables if available
  const tableResults: MatchResult[] = [];
  if (index.supabase) {
    for (const table of index.supabase.tables) {
      const { score, matchedTerms } = scoreTable(table, terms);
      if (score >= minScore && matchedTerms.length > 0) {
        tableResults.push({
          type: 'table',
          path: `${table.schema}.${table.name}`,
          matchedTerms,
          score,
          title: truncateDescription(`Table: ${table.name} (${table.columns.length} columns)`),
        });
      }
    }
  }

  // Sort each category by score
  fileResults.sort((a, b) => b.score - a.score);
  folderResults.sort((a, b) => b.score - a.score);
  tableResults.sort((a, b) => b.score - a.score);

  // Take top results from each category
  const topFiles = fileResults.slice(0, maxFiles);
  const topFolders = folderResults.slice(0, maxFolders);
  const topTables = tableResults.slice(0, 3); // Max 3 tables

  // Combine and sort by score
  return [...topFolders, ...topFiles, ...topTables].sort((a, b) => b.score - a.score);
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Truncate a description to maximum length
 *
 * @param text - Text to truncate
 * @returns Truncated text with ellipsis if needed
 */
function truncateDescription(text: string): string {
  if (text.length <= MAX_DESCRIPTION_LENGTH) {
    return text;
  }
  return text.substring(0, MAX_DESCRIPTION_LENGTH - 3) + '...';
}

/**
 * Get file name from path
 *
 * @param filePath - Full file path
 * @returns Just the file name
 */
function getFileName(filePath: string): string {
  const parts = filePath.split('/');
  return parts[parts.length - 1] || filePath;
}

/**
 * Format match results as SERP-style output
 *
 * Creates a human-readable summary of matches suitable for
 * injection into Claude's context.
 *
 * @param results - Array of match results
 * @returns Formatted string with results
 *
 * @example
 * ```typescript
 * import { matchContext, formatSERPOutput } from './context-matcher.js';
 *
 * const results = matchContext('authentication', index);
 * const output = formatSERPOutput(results);
 *
 * // Returns:
 * // ## Relevant Context
 * //
 * // ### Folders
 * // - **src/auth/** - Authentication Module (matched: auth, authentication)
 * //
 * // ### Files
 * // - **src/auth/login.ts** - User login handler (matched: auth, login)
 * // - **src/auth/logout.ts** - Logout handler (matched: auth)
 * ```
 */
export function formatSERPOutput(results: MatchResult[]): string {
  if (results.length === 0) {
    return '';
  }

  const lines: string[] = ['## Relevant Context', ''];

  // Group by type
  const folders = results.filter((r) => r.type === 'folder');
  const files = results.filter((r) => r.type === 'file');
  const tables = results.filter((r) => r.type === 'table');

  if (folders.length > 0) {
    lines.push('### Folders');
    for (const folder of folders) {
      const matched = folder.matchedTerms.join(', ');
      lines.push(`- **${folder.path}/** - ${folder.title || ''} (matched: ${matched})`);
    }
    lines.push('');
  }

  if (files.length > 0) {
    lines.push('### Files');
    for (const file of files) {
      const matched = file.matchedTerms.join(', ');
      lines.push(`- **${file.path}** - ${file.title || ''} (matched: ${matched})`);
    }
    lines.push('');
  }

  if (tables.length > 0) {
    lines.push('### Database Tables');
    for (const table of tables) {
      const matched = table.matchedTerms.join(', ');
      lines.push(`- **${table.path}** - ${table.title || ''} (matched: ${matched})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format match results as compact inline context
 *
 * Creates a single-line summary for minimal context injection.
 *
 * @param results - Array of match results
 * @returns Compact string with file paths
 *
 * @example
 * ```typescript
 * const compact = formatCompactOutput(results);
 * // Returns: "Context: src/auth/login.ts, src/auth/logout.ts (2 more)"
 * ```
 */
export function formatCompactOutput(results: MatchResult[]): string {
  if (results.length === 0) {
    return '';
  }

  const maxShow = 3;
  const paths = results.slice(0, maxShow).map((r) => r.path);
  const remaining = results.length - maxShow;

  let output = `Context: ${paths.join(', ')}`;
  if (remaining > 0) {
    output += ` (+${remaining} more)`;
  }

  return output;
}
