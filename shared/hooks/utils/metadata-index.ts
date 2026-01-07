/**
 * Metadata Index Manager
 *
 * Manages the incremental metadata index stored in `.claude/logs/metadata-index.json`.
 * Provides functions to load, save, and update file and folder metadata for
 * context-aware prompt enrichment.
 *
 * @module metadata-index
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ExportInfo } from './tsdoc-parser.js';

// ============================================================================
// Constants
// ============================================================================

const LOGS_DIR = '.claude/logs';
const INDEX_FILE = 'metadata-index.json';
const INDEX_VERSION = '1.0.0';

// ============================================================================
// Types
// ============================================================================

/**
 * Metadata for an indexed file
 *
 * Contains all context information extracted from a TypeScript file
 * including TSDoc tags, exports, and timing information.
 */
export interface FileMetadata {
  /**
   * Relative path to the file from project root
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
   * Context tags extracted from TSDoc @context and implicit naming
   */
  tags: string[];
  /**
   * Aliases extracted from TSDoc @aliases
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

/**
 * Metadata for an indexed folder
 *
 * Contains context information from CLAUDE.md files and
 * folder-level metadata.
 */
export interface FolderMetadata {
  /**
   * Relative path to the folder from project root
   */
  path: string;
  /**
   * Path to the CLAUDE.md file if present
   */
  claudeMdPath?: string;
  /**
   * Title extracted from CLAUDE.md H1 heading
   */
  title?: string;
  /**
   * Context tags from CLAUDE.md frontmatter or content
   */
  tags: string[];
  /**
   * ISO timestamp when the folder was indexed
   */
  lastIndexed: string;
}

/**
 * Cached Supabase schema information
 *
 * Stores table names and columns for database-aware context matching.
 */
export interface SupabaseSchemaCache {
  /**
   * ISO timestamp when schema was fetched
   */
  lastFetched: string;
  /**
   * Project ID this schema belongs to
   */
  projectId?: string;
  /**
   * Table metadata
   */
  tables: Array<{
    /**
     * Table name
     */
    name: string;
    /**
     * Schema name (usually 'public')
     */
    schema: string;
    /**
     * Column names
     */
    columns: string[];
    /**
     * Primary key column names
     */
    primaryKeys: string[];
  }>;
}

/**
 * Complete metadata index
 *
 * The root structure for the metadata-index.json file.
 */
export interface MetadataIndex {
  /**
   * Schema version for forward compatibility
   */
  version: string;
  /**
   * ISO timestamp of last index update
   */
  lastUpdated: string;
  /**
   * Map of file paths to their metadata
   */
  files: { [filePath: string]: FileMetadata };
  /**
   * Map of folder paths to their metadata
   */
  folders: { [folderPath: string]: FolderMetadata };
  /**
   * Optional Supabase schema cache
   */
  supabase?: SupabaseSchemaCache;
}

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Get the path to the metadata index file
 *
 * @param cwd - The working directory (project root)
 * @returns Full path to metadata-index.json
 */
function getIndexPath(cwd: string): string {
  return path.join(cwd, LOGS_DIR, INDEX_FILE);
}

// ============================================================================
// Index Management
// ============================================================================

/**
 * Load the metadata index from disk
 *
 * Reads and parses the metadata-index.json file. If the file doesn't exist
 * or is invalid, returns a fresh empty index.
 *
 * @param cwd - The working directory (project root)
 * @returns The loaded metadata index, or empty index if not found
 *
 * @example
 * ```typescript
 * import { loadIndex } from './metadata-index.js';
 *
 * const index = await loadIndex('/path/to/project');
 * console.log(`Indexed ${Object.keys(index.files).length} files`);
 * console.log(`Indexed ${Object.keys(index.folders).length} folders`);
 * ```
 */
export async function loadIndex(cwd: string): Promise<MetadataIndex> {
  const indexPath = getIndexPath(cwd);

  try {
    const content = await fs.readFile(indexPath, 'utf-8');
    const index: MetadataIndex = JSON.parse(content);

    // Validate version
    if (index.version !== INDEX_VERSION) {
      // Version mismatch - return fresh index
      // Future: could implement migrations here
      return createEmptyIndex();
    }

    return index;
  } catch {
    // File doesn't exist or is invalid
    return createEmptyIndex();
  }
}

/**
 * Create an empty metadata index
 *
 * @returns Fresh metadata index with empty collections
 */
function createEmptyIndex(): MetadataIndex {
  return {
    version: INDEX_VERSION,
    lastUpdated: new Date().toISOString(),
    files: {},
    folders: {},
  };
}

/**
 * Save the metadata index to disk
 *
 * Writes the index to .claude/logs/metadata-index.json, creating
 * the directory structure if needed.
 *
 * @param cwd - The working directory (project root)
 * @param index - The index to save
 *
 * @example
 * ```typescript
 * import { loadIndex, saveIndex } from './metadata-index.js';
 *
 * const index = await loadIndex(cwd);
 * index.files['src/auth/login.ts'] = fileMetadata;
 * await saveIndex(cwd, index);
 * ```
 */
export async function saveIndex(cwd: string, index: MetadataIndex): Promise<void> {
  const indexPath = getIndexPath(cwd);
  const indexDir = path.dirname(indexPath);

  // Update timestamp
  index.lastUpdated = new Date().toISOString();

  // Ensure directory exists
  await fs.mkdir(indexDir, { recursive: true });

  // Write with pretty formatting for debugging
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

/**
 * Update metadata for a single file
 *
 * Loads the index, updates the file entry, and saves back to disk.
 * This is a convenience function for incremental updates.
 *
 * @param cwd - The working directory (project root)
 * @param filePath - Relative path to the file
 * @param metadata - Updated file metadata
 *
 * @example
 * ```typescript
 * import { updateFileMetadata } from './metadata-index.js';
 * import { parseFileMetadata } from './tsdoc-parser.js';
 *
 * const content = await fs.readFile('src/auth/login.ts', 'utf-8');
 * const metadata = parseFileMetadata('src/auth/login.ts', content);
 * await updateFileMetadata(cwd, 'src/auth/login.ts', metadata);
 * ```
 */
export async function updateFileMetadata(
  cwd: string,
  filePath: string,
  metadata: FileMetadata
): Promise<void> {
  const index = await loadIndex(cwd);
  index.files[filePath] = metadata;
  await saveIndex(cwd, index);
}

/**
 * Update metadata for a single folder
 *
 * Loads the index, updates the folder entry, and saves back to disk.
 * This is a convenience function for incremental updates.
 *
 * @param cwd - The working directory (project root)
 * @param folderPath - Relative path to the folder
 * @param metadata - Updated folder metadata
 *
 * @example
 * ```typescript
 * import { updateFolderMetadata } from './metadata-index.js';
 *
 * await updateFolderMetadata(cwd, 'src/auth', {
 *   path: 'src/auth',
 *   claudeMdPath: 'src/auth/CLAUDE.md',
 *   title: 'Authentication Module',
 *   tags: ['authentication', 'security', 'oauth'],
 *   lastIndexed: new Date().toISOString()
 * });
 * ```
 */
export async function updateFolderMetadata(
  cwd: string,
  folderPath: string,
  metadata: FolderMetadata
): Promise<void> {
  const index = await loadIndex(cwd);
  index.folders[folderPath] = metadata;
  await saveIndex(cwd, index);
}

/**
 * Remove a file from the index
 *
 * Used when a file is deleted or renamed.
 *
 * @param cwd - The working directory (project root)
 * @param filePath - Relative path to the file to remove
 *
 * @example
 * ```typescript
 * import { removeFileMetadata } from './metadata-index.js';
 *
 * // After detecting file deletion
 * await removeFileMetadata(cwd, 'src/old-file.ts');
 * ```
 */
export async function removeFileMetadata(cwd: string, filePath: string): Promise<void> {
  const index = await loadIndex(cwd);
  delete index.files[filePath];
  await saveIndex(cwd, index);
}

/**
 * Remove a folder from the index
 *
 * Used when a folder is deleted or renamed.
 *
 * @param cwd - The working directory (project root)
 * @param folderPath - Relative path to the folder to remove
 *
 * @example
 * ```typescript
 * import { removeFolderMetadata } from './metadata-index.js';
 *
 * // After detecting folder deletion
 * await removeFolderMetadata(cwd, 'src/deprecated');
 * ```
 */
export async function removeFolderMetadata(cwd: string, folderPath: string): Promise<void> {
  const index = await loadIndex(cwd);
  delete index.folders[folderPath];
  await saveIndex(cwd, index);
}

/**
 * Update Supabase schema cache
 *
 * Stores table metadata for database-aware context matching.
 *
 * @param cwd - The working directory (project root)
 * @param schema - Supabase schema information
 *
 * @example
 * ```typescript
 * import { updateSupabaseSchema } from './metadata-index.js';
 *
 * await updateSupabaseSchema(cwd, {
 *   lastFetched: new Date().toISOString(),
 *   projectId: 'abc123',
 *   tables: [
 *     { name: 'users', schema: 'public', columns: ['id', 'email'], primaryKeys: ['id'] }
 *   ]
 * });
 * ```
 */
export async function updateSupabaseSchema(
  cwd: string,
  schema: SupabaseSchemaCache
): Promise<void> {
  const index = await loadIndex(cwd);
  index.supabase = schema;
  await saveIndex(cwd, index);
}

/**
 * Check if a file needs re-indexing
 *
 * Compares the file's modification time with the indexed timestamp.
 *
 * @param cwd - The working directory (project root)
 * @param filePath - Relative path to the file
 * @param lastModified - ISO timestamp of file's current mtime
 * @returns True if the file should be re-indexed
 *
 * @example
 * ```typescript
 * import { needsReindex } from './metadata-index.js';
 * import * as fs from 'fs/promises';
 *
 * const stat = await fs.stat('src/auth/login.ts');
 * const needsUpdate = await needsReindex(cwd, 'src/auth/login.ts', stat.mtime.toISOString());
 *
 * if (needsUpdate) {
 *   // Re-parse and update the file metadata
 * }
 * ```
 */
export async function needsReindex(
  cwd: string,
  filePath: string,
  lastModified: string
): Promise<boolean> {
  const index = await loadIndex(cwd);
  const existing = index.files[filePath];

  if (!existing) {
    return true; // Not indexed yet
  }

  // Compare modification times
  return new Date(lastModified) > new Date(existing.lastModified);
}

/**
 * Get all indexed file paths
 *
 * Returns an array of all file paths currently in the index.
 *
 * @param cwd - The working directory (project root)
 * @returns Array of indexed file paths
 *
 * @example
 * ```typescript
 * import { getIndexedFiles } from './metadata-index.js';
 *
 * const files = await getIndexedFiles(cwd);
 * console.log(`${files.length} files indexed`);
 * ```
 */
export async function getIndexedFiles(cwd: string): Promise<string[]> {
  const index = await loadIndex(cwd);
  return Object.keys(index.files);
}

/**
 * Get all indexed folder paths
 *
 * Returns an array of all folder paths currently in the index.
 *
 * @param cwd - The working directory (project root)
 * @returns Array of indexed folder paths
 *
 * @example
 * ```typescript
 * import { getIndexedFolders } from './metadata-index.js';
 *
 * const folders = await getIndexedFolders(cwd);
 * console.log(`${folders.length} folders indexed`);
 * ```
 */
export async function getIndexedFolders(cwd: string): Promise<string[]> {
  const index = await loadIndex(cwd);
  return Object.keys(index.folders);
}
