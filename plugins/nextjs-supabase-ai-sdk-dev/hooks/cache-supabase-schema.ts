/**
 * Supabase Schema Caching Hook
 * SessionStart hook that caches Supabase table/column metadata for context matching.
 *
 * This hook checks for existing schema cache and provides instructions to Claude
 * for refreshing stale or missing schema metadata. Since hooks cannot directly
 * call MCP tools, it outputs SQL and instructions for Claude to execute.
 *
 * @module cache-supabase-schema
 */

import type { SessionStartInput, SessionStartHookOutput } from '../shared/types/types.js';
import { createDebugLogger } from '../shared/hooks/utils/debug.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// ============================================================================
// Types
// ============================================================================

/**
 * Column metadata with extracted tags from comments
 */
interface ColumnSchema {
  name: string;
  type: string;
  comment?: string;
  tags: string[];
}

/**
 * Table metadata with columns and extracted tags from comments
 */
interface TableSchema {
  name: string;
  schema: string;
  comment?: string;
  tags: string[];
  columns: Record<string, ColumnSchema>;
}

/**
 * Complete Supabase schema cache structure
 */
interface SupabaseSchemaCache {
  projectId?: string;
  lastRefreshed: string;
  tables: Record<string, TableSchema>;
}

/**
 * Metadata index structure stored in .claude/logs/metadata-index.json
 */
interface MetadataIndex {
  version: string;
  lastUpdated: string;
  supabaseSchema?: SupabaseSchemaCache;
  [key: string]: unknown;
}

// ============================================================================
// Constants
// ============================================================================

const CACHE_FILE = '.claude/logs/metadata-index.json';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * SQL query for fetching table and column comments from PostgreSQL
 * This query extracts metadata from pg_description and pg_class
 */
const SCHEMA_QUERY_SQL = `SELECT
  c.relname as table_name,
  d.description as table_comment,
  a.attname as column_name,
  pd.description as column_comment,
  format_type(a.atttypid, a.atttypmod) as column_type
FROM pg_class c
LEFT JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = 0
LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_description pd ON pd.objoid = c.oid AND pd.objsubid = a.attnum
WHERE c.relkind = 'r'
  AND c.relnamespace = 'public'::regnamespace
ORDER BY c.relname, a.attnum;`;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if Supabase is configured in the project
 * Looks for SUPABASE_URL env var or supabase/config.toml
 */
function isSupabaseConfigured(cwd: string): boolean {
  // Check environment variable
  if (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return true;
  }

  // Check for local Supabase config
  const configPath = join(cwd, 'supabase', 'config.toml');
  return existsSync(configPath);
}

/**
 * Read the project ID from supabase/config.toml
 */
function getSupabaseProjectId(cwd: string): string | undefined {
  const configPath = join(cwd, 'supabase', 'config.toml');
  if (!existsSync(configPath)) {
    return undefined;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const match = content.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
    return match?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Read the metadata index file
 */
function readMetadataIndex(cwd: string): MetadataIndex | null {
  const cachePath = join(cwd, CACHE_FILE);
  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    const content = readFileSync(cachePath, 'utf-8');
    return JSON.parse(content) as MetadataIndex;
  } catch {
    return null;
  }
}

/**
 * Write the metadata index file
 */
function writeMetadataIndex(cwd: string, index: MetadataIndex): void {
  const cachePath = join(cwd, CACHE_FILE);
  const cacheDir = dirname(cachePath);

  try {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cachePath, JSON.stringify(index, null, 2), 'utf-8');
  } catch {
    // Silently fail - logging is not critical
  }
}

/**
 * Check if the schema cache is stale (older than 1 hour)
 */
function isCacheStale(schemaCache: SupabaseSchemaCache | undefined): boolean {
  if (!schemaCache?.lastRefreshed) {
    return true;
  }

  const lastRefreshed = new Date(schemaCache.lastRefreshed).getTime();
  const now = Date.now();
  return now - lastRefreshed > CACHE_TTL_MS;
}

/**
 * Extract tags from a comment string
 * Tags are denoted with #hashtag or @tag format
 */
function extractTags(comment: string | undefined): string[] {
  if (!comment) return [];
  const tagMatches = comment.match(/[#@]\w+/g);
  return tagMatches ? tagMatches.map((t) => t.slice(1)) : [];
}

/**
 * Generate a summary of cached tables
 */
function generateCacheSummary(schemaCache: SupabaseSchemaCache): string {
  const tableNames = Object.keys(schemaCache.tables);
  const tableCount = tableNames.length;

  if (tableCount === 0) {
    return 'Schema cache exists but contains no tables.';
  }

  // Get tables with comments (more useful for context)
  const tablesWithComments = tableNames.filter((name) => schemaCache.tables[name].comment);

  let summary = `Supabase schema cached: ${tableCount} tables`;
  if (schemaCache.projectId) {
    summary += ` (project: ${schemaCache.projectId})`;
  }
  summary += `\n`;

  // List tables (max 10)
  const displayTables = tableNames.slice(0, 10);
  summary += `Tables: ${displayTables.join(', ')}`;
  if (tableNames.length > 10) {
    summary += `, +${tableNames.length - 10} more`;
  }
  summary += '\n';

  if (tablesWithComments.length > 0) {
    summary += `Tables with documentation: ${tablesWithComments.length}\n`;
  }

  const lastRefreshed = new Date(schemaCache.lastRefreshed);
  summary += `Last refreshed: ${lastRefreshed.toLocaleString()}`;

  return summary;
}

/**
 * Generate instructions for Claude to refresh the schema cache
 */
function generateRefreshInstructions(projectId?: string): string {
  const instructions = [
    'Supabase schema cache is stale or missing.',
    '',
    'To refresh the schema cache, use the Supabase MCP tool to execute this SQL:',
    '',
    '```sql',
    SCHEMA_QUERY_SQL,
    '```',
    '',
    'After running the query, the schema metadata will be available for context matching.',
  ];

  if (projectId) {
    instructions.splice(1, 0, `Project ID: ${projectId}`);
  }

  return instructions.join('\n');
}

// ============================================================================
// Schema Parsing (for when Claude provides query results)
// ============================================================================

/**
 * Parse schema query results into SupabaseSchemaCache format
 * This function can be called to update the cache when new data is available
 */
export function parseSchemaResults(
  results: Array<{
    table_name: string;
    table_comment?: string;
    column_name?: string;
    column_comment?: string;
    column_type?: string;
  }>,
  projectId?: string
): SupabaseSchemaCache {
  const tables: Record<string, TableSchema> = {};

  for (const row of results) {
    const tableName = row.table_name;

    // Initialize table if not exists
    if (!tables[tableName]) {
      tables[tableName] = {
        name: tableName,
        schema: 'public',
        comment: row.table_comment ?? undefined,
        tags: extractTags(row.table_comment ?? undefined),
        columns: {},
      };
    }

    // Add column if present
    if (row.column_name) {
      tables[tableName].columns[row.column_name] = {
        name: row.column_name,
        type: row.column_type || 'unknown',
        comment: row.column_comment ?? undefined,
        tags: extractTags(row.column_comment ?? undefined),
      };
    }
  }

  return {
    projectId,
    lastRefreshed: new Date().toISOString(),
    tables,
  };
}

/**
 * Update the metadata index with new schema cache
 */
export function updateSchemaCache(cwd: string, schemaCache: SupabaseSchemaCache): void {
  let index = readMetadataIndex(cwd);

  if (!index) {
    index = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
    };
  }

  index.supabaseSchema = schemaCache;
  index.lastUpdated = new Date().toISOString();

  writeMetadataIndex(cwd, index);
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * SessionStart hook handler
 * Checks for Supabase configuration and schema cache status
 */
async function handler(input: SessionStartInput): Promise<SessionStartHookOutput> {
  const logger = createDebugLogger(input.cwd, 'cache-supabase-schema', true);
  const messages: string[] = [];

  try {
    await logger.logInput({
      source: input.source,
      session_id: input.session_id,
    });

    // Check if Supabase is configured
    if (!isSupabaseConfigured(input.cwd)) {
      const message = 'Supabase not configured in this project. Skipping schema cache check.';
      await logger.logOutput({ success: true, message });

      return {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: '', // No context if Supabase not configured
        },
      };
    }

    const projectId = getSupabaseProjectId(input.cwd);

    // Read existing metadata index
    const index = readMetadataIndex(input.cwd);
    const schemaCache = index?.supabaseSchema;

    // Check if cache exists and is fresh
    if (schemaCache && !isCacheStale(schemaCache)) {
      const summary = generateCacheSummary(schemaCache);
      messages.push('[Supabase Schema Cache]');
      messages.push(summary);

      await logger.logOutput({
        success: true,
        status: 'cache_valid',
        tableCount: Object.keys(schemaCache.tables).length,
      });
    } else {
      // Cache is stale or missing - provide refresh instructions
      const instructions = generateRefreshInstructions(projectId);
      messages.push('[Supabase Schema Cache]');
      messages.push(instructions);

      await logger.logOutput({
        success: true,
        status: schemaCache ? 'cache_stale' : 'cache_missing',
        projectId,
      });
    }

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: messages.join('\n'),
      },
    };
  } catch (error) {
    await logger.logError(error as Error);

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `Supabase schema cache error: ${error}`,
      },
    };
  }
}

export { handler };
runHook(handler);
