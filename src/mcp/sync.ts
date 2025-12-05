/**
 * MCP Type Sync Module
 *
 * This module provides functionality for synchronizing MCP (Model Context Protocol)
 * server tool definitions and generating TypeScript types. It reads project-scoped
 * configuration from `~/.claude.json` and generates per-server type files.
 *
 * @module mcp/sync
 *
 * @example
 * ```typescript
 * import { syncMcpTypes, getProjectMcpServers } from '@constellos/claude-code-kit/mcp';
 *
 * // Get configured servers for a project
 * const servers = getProjectMcpServers('/path/to/project');
 *
 * // Sync types (with change detection)
 * const result = await syncMcpTypes({ projectPath: '/path/to/project' });
 *
 * if (!result.skipped) {
 *   console.log('Synced:', result.synced);
 *   console.log('Errors:', result.errors);
 * }
 * ```
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import { generateServerTypes } from './type-generator.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for an MCP server using stdio transport.
 *
 * Stdio servers are spawned as child processes and communicate via stdin/stdout.
 *
 * @example
 * ```typescript
 * const config: StdioServerConfig = {
 *   type: 'stdio',
 *   command: 'npx',
 *   args: ['-y', '@anthropic/mcp-server-filesystem'],
 *   env: { HOME: '/home/user' }
 * };
 * ```
 */
export interface StdioServerConfig {
  /** Transport type identifier */
  type: 'stdio';
  /** Command to execute (e.g., 'npx', 'node', 'python') */
  command: string;
  /** Command line arguments */
  args?: string[];
  /** Environment variables to pass to the process */
  env?: Record<string, string>;
}

/**
 * Configuration for an MCP server using HTTP transport.
 *
 * HTTP servers communicate over HTTP/HTTPS using the Streamable HTTP transport.
 *
 * @example
 * ```typescript
 * const config: HttpServerConfig = {
 *   type: 'http',
 *   url: 'https://mcp.example.com/api'
 * };
 * ```
 */
export interface HttpServerConfig {
  /** Transport type identifier */
  type: 'http';
  /** URL of the MCP server endpoint */
  url: string;
}

/**
 * Union type for all supported MCP server configurations.
 * Currently supports stdio and HTTP transports.
 */
export type McpServerConfig = StdioServerConfig | HttpServerConfig;

/**
 * Map of server names to their configurations.
 * Server names should match the keys used in `~/.claude.json`.
 */
export type McpServersConfig = Record<string, McpServerConfig>;

/**
 * Options for the {@link syncMcpTypes} function.
 */
export interface SyncOptions {
  /**
   * Project path to read config for.
   * This path is used as the key in `~/.claude.json` under `projects.<path>.mcpServers`.
   * @default process.cwd()
   */
  projectPath?: string;
  /**
   * Output directory for generated type files.
   * @default '<projectPath>/.claude/hooks/utils/mcp-tools'
   */
  outputDir?: string;
  /**
   * Timeout in milliseconds for connecting to MCP servers.
   * @default 15000
   */
  timeout?: number;
  /**
   * Force sync even if configuration hasn't changed since last sync.
   * Useful when regenerating types after updating this package.
   * @default false
   */
  force?: boolean;
}

/**
 * Result returned by {@link syncMcpTypes}.
 */
export interface SyncResult {
  /**
   * Whether sync was skipped due to unchanged configuration.
   * When true, `synced` and `errors` will be empty arrays.
   */
  skipped: boolean;
  /**
   * Names of servers that were successfully synced.
   * Each server will have a corresponding `.types.ts` file in the output directory.
   */
  synced: string[];
  /**
   * Error messages for servers that failed to sync.
   * Format: `"server-name: error message"`
   */
  errors: string[];
  /**
   * Absolute path to the output directory where files were written.
   */
  outputDir: string;
}

// ============================================================================
// Config Reading
// ============================================================================

/** Default timeout for MCP server connections in milliseconds */
const CONNECTION_TIMEOUT = 15000;

/**
 * Get the path to the Claude Code global configuration file.
 *
 * @returns Absolute path to `~/.claude.json`
 * @internal
 */
function getClaudeConfigPath(): string {
  return path.join(os.homedir(), '.claude.json');
}

/**
 * Get the path to the per-server hash file for change detection.
 *
 * @param projectPath - The project path
 * @returns Absolute path to `mcp-hashes.json` file
 * @internal
 */
function getHashFilePath(projectPath: string): string {
  return path.join(projectPath, 'node_modules', '.cache', 'claude-code-kit', 'mcp-hashes.json');
}

/**
 * Read MCP server configurations for a specific project from `~/.claude.json`.
 *
 * Looks up the project path in `~/.claude.json` under `projects.<projectPath>.mcpServers`
 * and normalizes the server configurations.
 *
 * @param projectPath - Absolute path to the project directory
 * @returns Map of server names to their configurations
 *
 * @example
 * ```typescript
 * const servers = getProjectMcpServers('/home/user/my-project');
 * // Returns: { 'filesystem': { type: 'stdio', command: 'npx', args: [...] }, ... }
 * ```
 */
export function getProjectMcpServers(projectPath: string): McpServersConfig {
  const configPath = getClaudeConfigPath();
  if (!fs.existsSync(configPath)) return {};

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    const servers = config.projects?.[projectPath]?.mcpServers ?? {};

    // Normalize server configs (add type: 'stdio' if not specified)
    const normalized: McpServersConfig = {};
    for (const [name, serverConfig] of Object.entries(servers)) {
      const sc = serverConfig as Record<string, unknown>;
      if (sc.url && typeof sc.url === 'string') {
        normalized[name] = { type: 'http', url: sc.url };
      } else if (sc.command && typeof sc.command === 'string') {
        normalized[name] = {
          type: 'stdio',
          command: sc.command,
          args: Array.isArray(sc.args) ? sc.args : undefined,
          env: typeof sc.env === 'object' && sc.env !== null
            ? (sc.env as Record<string, string>)
            : undefined,
        };
      }
    }
    return normalized;
  } catch {
    return {};
  }
}

/**
 * Compute a hash of the server configuration for change detection.
 *
 * Uses SHA-256 truncated to 16 characters for a compact but collision-resistant hash.
 *
 * @param servers - Map of server configurations
 * @returns 16-character hex hash string
 *
 * @example
 * ```typescript
 * const hash = computeConfigHash(servers);
 * // Returns: "a1b2c3d4e5f67890"
 * ```
 */
export function computeConfigHash(servers: McpServersConfig): string {
  const normalized = JSON.stringify(servers, Object.keys(servers).sort());
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Compute hash for a single server configuration.
 *
 * @param config - Single server configuration
 * @returns 16-character hex hash string
 * @internal
 */
function computeServerHash(config: McpServerConfig): string {
  const normalized = JSON.stringify(config);
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Load per-server hashes from mcp-hashes.json.
 *
 * @param projectPath - Absolute path to the project directory
 * @returns Map of server names to their configuration hashes
 * @internal
 */
function loadHashes(projectPath: string): Record<string, string> {
  const hashPath = getHashFilePath(projectPath);
  if (!fs.existsSync(hashPath)) return {};

  try {
    return JSON.parse(fs.readFileSync(hashPath, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Save per-server hashes to mcp-hashes.json.
 *
 * @param projectPath - Absolute path to the project directory
 * @param hashes - Map of server names to their configuration hashes
 * @internal
 */
function saveHashes(projectPath: string, hashes: Record<string, string>): void {
  const hashPath = getHashFilePath(projectPath);
  fs.mkdirSync(path.dirname(hashPath), { recursive: true });
  fs.writeFileSync(hashPath, JSON.stringify(hashes, null, 2), 'utf-8');
}

/**
 * Get list of servers that need to be synced.
 *
 * Compares current server configurations against saved hashes.
 * Returns server names whose config has changed since last sync.
 *
 * @param projectPath - Absolute path to the project directory
 * @param servers - Current server configurations
 * @returns Array of server names that need syncing
 * @internal
 */
function getChangedServers(
  projectPath: string,
  servers: McpServersConfig
): string[] {
  const savedHashes = loadHashes(projectPath);
  const changed: string[] = [];

  for (const [name, config] of Object.entries(servers)) {
    const currentHash = computeServerHash(config);
    if (savedHashes[name] !== currentHash) {
      changed.push(name);
    }
  }

  return changed;
}

// ============================================================================
// MCP Server Connection
// ============================================================================

/**
 * Connect to an MCP server and fetch its tool definitions.
 *
 * Supports both stdio and HTTP transports. Creates a temporary MCP client,
 * connects to the server, fetches the tool list, and closes the connection.
 *
 * @param serverName - Name of the server (used for logging)
 * @param config - Server configuration (stdio or HTTP)
 * @returns Array of MCP tool definitions
 * @throws Error if connection times out or server is unreachable
 * @internal
 */
async function fetchServerTools(
  serverName: string,
  config: McpServerConfig
): Promise<Tool[]> {
  const client = new Client({
    name: 'cck-sync-mcp',
    version: '1.0.0',
  });

  try {
    if (config.type === 'stdio') {
      const mergedEnv = config.env
        ? { ...(process.env as Record<string, string>), ...config.env }
        : (process.env as Record<string, string>);

      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: mergedEnv,
      });

      await Promise.race([
        client.connect(transport),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), CONNECTION_TIMEOUT)
        ),
      ]);
    } else {
      // HTTP transport
      const { StreamableHTTPClientTransport } = await import(
        '@modelcontextprotocol/sdk/client/streamableHttp.js'
      );
      const transport = new StreamableHTTPClientTransport(new URL(config.url));

      await Promise.race([
        client.connect(transport),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), CONNECTION_TIMEOUT)
        ),
      ]);
    }

    const result = await client.listTools();
    await client.close();

    return result.tools;
  } catch (error) {
    try {
      await client.close();
    } catch {
      // Ignore close errors
    }
    throw error;
  }
}

// ============================================================================
// File Management
// ============================================================================

/**
 * Get the default output directory for generated type files.
 *
 * @param projectPath - Absolute path to the project directory
 * @returns Path to `node_modules/.cache/claude-code-kit/mcp-types` within the project
 * @internal
 */
function getDefaultOutputDir(projectPath: string): string {
  return path.join(projectPath, 'node_modules', '.cache', 'claude-code-kit', 'mcp-types');
}

/**
 * Convert a server name to its corresponding type file name.
 *
 * @param serverName - The MCP server name
 * @returns File name with `.d.ts` extension
 * @internal
 *
 * @example
 * ```typescript
 * serverNameToFileName('next-devtools') // => 'next-devtools.d.ts'
 * ```
 */
function serverNameToFileName(serverName: string): string {
  return `${serverName}.d.ts`;
}

/**
 * Sync a single MCP server's types.
 *
 * Connects to the server, fetches tools, generates types, and writes the file.
 *
 * @param outputDir - Directory to write the type file
 * @param serverName - Name of the MCP server
 * @param config - Server configuration
 * @returns Object with success status and optional error message
 * @internal
 */
async function syncServer(
  outputDir: string,
  serverName: string,
  config: McpServerConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const tools = await fetchServerTools(serverName, config);
    const types = generateServerTypes(serverName, tools);
    const filePath = path.join(outputDir, serverNameToFileName(serverName));

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(filePath, types, 'utf-8');

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Remove type files and hashes for servers that are no longer in the configuration.
 *
 * Scans the output directory for `.d.ts` files and removes any that
 * don't correspond to a currently configured server. Also cleans up
 * orphaned entries from the hash file.
 *
 * @param outputDir - Directory containing generated type files
 * @param projectPath - Absolute path to the project directory
 * @param currentServers - List of currently configured server names
 * @internal
 */
function cleanupRemovedServers(
  outputDir: string,
  projectPath: string,
  currentServers: string[]
): void {
  // Clean up orphaned type files
  if (fs.existsSync(outputDir)) {
    const existingFiles = fs.readdirSync(outputDir).filter((f) => f.endsWith('.d.ts'));
    for (const file of existingFiles) {
      const serverName = file.replace('.d.ts', '');
      if (!currentServers.includes(serverName)) {
        fs.unlinkSync(path.join(outputDir, file));
      }
    }
  }

  // Clean up orphaned hashes
  const hashes = loadHashes(projectPath);
  let hashesChanged = false;
  for (const name of Object.keys(hashes)) {
    if (!currentServers.includes(name)) {
      delete hashes[name];
      hashesChanged = true;
    }
  }
  if (hashesChanged) {
    saveHashes(projectPath, hashes);
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Sync MCP server tools and generate TypeScript types.
 *
 * This function:
 * 1. Reads project-scoped MCP config from ~/.claude.json
 * 2. Connects to each configured MCP server (only those with changed configs)
 * 3. Fetches tool definitions and generates TypeScript types
 * 4. Writes per-server type files to node_modules/.cache/claude-code-kit/mcp-types/
 *
 * @example
 * ```typescript
 * import { syncMcpTypes } from '@constellos/claude-code-kit/mcp';
 *
 * // Sync from current directory
 * const result = await syncMcpTypes();
 *
 * // Sync for specific project
 * const result = await syncMcpTypes({
 *   projectPath: '/path/to/project',
 * });
 *
 * // Force sync even if config unchanged
 * const result = await syncMcpTypes({ force: true });
 * ```
 */
export async function syncMcpTypes(options: SyncOptions = {}): Promise<SyncResult> {
  const projectPath = options.projectPath || process.cwd();
  const outputDir = options.outputDir || getDefaultOutputDir(projectPath);
  const force = options.force ?? false;

  const servers = getProjectMcpServers(projectPath);
  const serverNames = Object.keys(servers);

  // Determine which servers need syncing
  const serversToSync = force
    ? serverNames
    : getChangedServers(projectPath, servers);

  // Skip if nothing to sync
  if (serversToSync.length === 0) {
    return { skipped: true, synced: [], errors: [], outputDir };
  }

  fs.mkdirSync(outputDir, { recursive: true });

  // Clean up files for removed servers
  cleanupRemovedServers(outputDir, projectPath, serverNames);

  // Sync changed servers in parallel
  const results = await Promise.allSettled(
    serversToSync.map((name) => syncServer(outputDir, name, servers[name]))
  );

  const synced: string[] = [];
  const errors: string[] = [];
  const hashes = loadHashes(projectPath);

  results.forEach((result, i) => {
    const serverName = serversToSync[i];
    if (result.status === 'fulfilled' && result.value.success) {
      synced.push(serverName);
      // Update hash for this server
      hashes[serverName] = computeServerHash(servers[serverName]);
    } else {
      const error =
        result.status === 'rejected' ? result.reason : result.value.error;
      errors.push(`${serverName}: ${error}`);
    }
  });

  // Save updated hashes
  saveHashes(projectPath, hashes);

  return { skipped: false, synced, errors, outputDir };
}

/**
 * Read Claude Code's MCP configuration from settings.
 *
 * @deprecated Use getProjectMcpServers() instead for project-scoped config
 * @returns Array of MCP server configs (legacy format)
 */
export function readClaudeCodeMcpConfig(cwd?: string): Array<{
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}> {
  const projectPath = cwd || process.cwd();
  const servers = getProjectMcpServers(projectPath);

  return Object.entries(servers)
    .filter(([, config]) => config.type === 'stdio')
    .map(([name, config]) => ({
      name,
      command: (config as StdioServerConfig).command,
      args: (config as StdioServerConfig).args,
      env: (config as StdioServerConfig).env,
    }));
}
