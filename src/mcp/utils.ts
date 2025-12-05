/**
 * MCP (Model Context Protocol) utility functions
 *
 * Provides helpers for working with MCP tool names which follow
 * the pattern: mcp__[server-name]__[tool-name]
 */

/**
 * Known builtin tool names in Claude Code
 */
const KNOWN_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'Write',
  'Edit',
  'NotebookEdit',
  'Bash',
  'BashOutput',
  'KillShell',
  'TodoWrite',
  'Task',
  'ExitPlanMode',
  'WebFetch',
  'WebSearch',
  'Skill',
  'SlashCommand',
  'ListMcpResourcesTool',
  'ReadMcpResourceTool',
] as const;

/**
 * Type guard to check if a tool name is an MCP tool (starts with mcp__)
 *
 * @example
 * isMcpTool('mcp__next-devtools__browser_eval') // => true
 * isMcpTool('Read') // => false
 */
export function isMcpTool(toolName: string): toolName is `mcp__${string}__${string}` {
  return toolName.startsWith('mcp__');
}

/**
 * Extract server name from MCP tool name
 *
 * @example
 * extractMcpServerName('mcp__next-devtools__browser_eval') // => 'next-devtools'
 * extractMcpServerName('Read') // => null
 */
export function extractMcpServerName(toolName: string): string | null {
  if (!isMcpTool(toolName)) {
    return null;
  }
  // Match: mcp__[server-name]__[tool-name]
  // Server name can contain hyphens but not double underscores
  const match = toolName.match(/^mcp__([^_]+(?:[-][^_]+)*)__/);
  return match ? match[1] : null;
}

/**
 * Extract tool name from MCP tool name
 *
 * @example
 * extractMcpToolName('mcp__next-devtools__browser_eval') // => 'browser_eval'
 * extractMcpToolName('Read') // => null
 */
export function extractMcpToolName(toolName: string): string | null {
  if (!isMcpTool(toolName)) {
    return null;
  }
  // Match everything after the second double underscore
  const match = toolName.match(/^mcp__[^_]+(?:[-][^_]+)*__(.+)$/);
  return match ? match[1] : null;
}

/**
 * Format server and tool names into MCP tool name
 *
 * @example
 * formatMcpToolName('next-devtools', 'browser_eval') // => 'mcp__next-devtools__browser_eval'
 */
export function formatMcpToolName(server: string, tool: string): `mcp__${string}__${string}` {
  return `mcp__${server}__${tool}`;
}

/**
 * Check if a tool name is a known builtin tool
 *
 * @example
 * isKnownTool('Read') // => true
 * isKnownTool('mcp__server__tool') // => false
 * isKnownTool('UnknownTool') // => false
 */
export function isKnownTool(toolName: string): boolean {
  return (KNOWN_TOOLS as readonly string[]).includes(toolName);
}

/**
 * Parse an MCP tool name into its components
 *
 * @example
 * parseMcpToolName('mcp__next-devtools__browser_eval')
 * // => { server: 'next-devtools', tool: 'browser_eval' }
 *
 * parseMcpToolName('Read')
 * // => null
 */
export function parseMcpToolName(
  toolName: string
): { server: string; tool: string } | null {
  const server = extractMcpServerName(toolName);
  const tool = extractMcpToolName(toolName);

  if (server && tool) {
    return { server, tool };
  }
  return null;
}
