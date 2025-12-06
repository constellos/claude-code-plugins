/**
 * MCP utility function tests
 */

import { describe, it, expect } from 'bun:test';
import {
  isMcpTool,
  extractMcpServerName,
  extractMcpToolName,
  formatMcpToolName,
  isKnownTool,
  parseMcpToolName,
} from '../mcp/utils.js';

describe('isMcpTool', () => {
  it('should identify MCP tools by prefix', () => {
    expect(isMcpTool('mcp__server__tool')).toBe(true);
    expect(isMcpTool('mcp__next-devtools__browser_eval')).toBe(true);
    expect(isMcpTool('mcp__my-server__my_tool_name')).toBe(true);
  });

  it('should return false for builtin tools', () => {
    expect(isMcpTool('Read')).toBe(false);
    expect(isMcpTool('Write')).toBe(false);
    expect(isMcpTool('Bash')).toBe(false);
    expect(isMcpTool('Task')).toBe(false);
  });

  it('should return false for partial matches', () => {
    expect(isMcpTool('mcp_single_underscore')).toBe(false);
    expect(isMcpTool('MCP__server__tool')).toBe(false); // case sensitive
    expect(isMcpTool('notmcp__server__tool')).toBe(false);
  });

  it('should return false for empty or invalid strings', () => {
    expect(isMcpTool('')).toBe(false);
    expect(isMcpTool('mcp')).toBe(false);
    // Note: isMcpTool only checks for 'mcp__' prefix, so 'mcp__' returns true
    // even though it's incomplete - other functions handle validation
    expect(isMcpTool('mcp__')).toBe(true);
  });
});

describe('extractMcpServerName', () => {
  it('should extract server name from MCP tool', () => {
    expect(extractMcpServerName('mcp__next-devtools__browser_eval')).toBe('next-devtools');
    expect(extractMcpServerName('mcp__server__tool')).toBe('server');
    expect(extractMcpServerName('mcp__my-custom-server__some_tool')).toBe('my-custom-server');
  });

  it('should handle server names with multiple hyphens', () => {
    expect(extractMcpServerName('mcp__my-very-long-server__tool')).toBe('my-very-long-server');
  });

  it('should return null for non-MCP tools', () => {
    expect(extractMcpServerName('Read')).toBeNull();
    expect(extractMcpServerName('Bash')).toBeNull();
    expect(extractMcpServerName('')).toBeNull();
  });

  it('should return null for malformed MCP tool names', () => {
    expect(extractMcpServerName('mcp__')).toBeNull();
    expect(extractMcpServerName('mcp____tool')).toBeNull();
  });
});

describe('extractMcpToolName', () => {
  it('should extract tool name from MCP tool', () => {
    expect(extractMcpToolName('mcp__next-devtools__browser_eval')).toBe('browser_eval');
    expect(extractMcpToolName('mcp__server__tool')).toBe('tool');
    expect(extractMcpToolName('mcp__server__my_complex_tool_name')).toBe('my_complex_tool_name');
  });

  it('should handle tool names with underscores', () => {
    expect(extractMcpToolName('mcp__server__get_user_profile')).toBe('get_user_profile');
  });

  it('should return null for non-MCP tools', () => {
    expect(extractMcpToolName('Read')).toBeNull();
    expect(extractMcpToolName('Bash')).toBeNull();
    expect(extractMcpToolName('')).toBeNull();
  });

  it('should return null for malformed MCP tool names', () => {
    expect(extractMcpToolName('mcp__server')).toBeNull();
    expect(extractMcpToolName('mcp__server__')).toBeNull();
  });
});

describe('formatMcpToolName', () => {
  it('should format server and tool into MCP tool name', () => {
    expect(formatMcpToolName('next-devtools', 'browser_eval')).toBe('mcp__next-devtools__browser_eval');
    expect(formatMcpToolName('server', 'tool')).toBe('mcp__server__tool');
  });

  it('should preserve hyphens in server name', () => {
    expect(formatMcpToolName('my-custom-server', 'my_tool')).toBe('mcp__my-custom-server__my_tool');
  });

  it('should preserve underscores in tool name', () => {
    expect(formatMcpToolName('server', 'get_user_data')).toBe('mcp__server__get_user_data');
  });
});

describe('isKnownTool', () => {
  it('should recognize builtin tools', () => {
    expect(isKnownTool('Read')).toBe(true);
    expect(isKnownTool('Write')).toBe(true);
    expect(isKnownTool('Edit')).toBe(true);
    expect(isKnownTool('Bash')).toBe(true);
    expect(isKnownTool('Glob')).toBe(true);
    expect(isKnownTool('Grep')).toBe(true);
    expect(isKnownTool('Task')).toBe(true);
    expect(isKnownTool('Skill')).toBe(true);
    expect(isKnownTool('WebFetch')).toBe(true);
    expect(isKnownTool('WebSearch')).toBe(true);
  });

  it('should return false for MCP tools', () => {
    expect(isKnownTool('mcp__server__tool')).toBe(false);
  });

  it('should return false for unknown tools', () => {
    expect(isKnownTool('UnknownTool')).toBe(false);
    expect(isKnownTool('CustomTool')).toBe(false);
    expect(isKnownTool('')).toBe(false);
  });

  it('should be case-sensitive', () => {
    expect(isKnownTool('read')).toBe(false);
    expect(isKnownTool('READ')).toBe(false);
    expect(isKnownTool('bash')).toBe(false);
  });
});

describe('parseMcpToolName', () => {
  it('should parse valid MCP tool names', () => {
    expect(parseMcpToolName('mcp__next-devtools__browser_eval')).toEqual({
      server: 'next-devtools',
      tool: 'browser_eval',
    });

    expect(parseMcpToolName('mcp__server__tool')).toEqual({
      server: 'server',
      tool: 'tool',
    });
  });

  it('should return null for non-MCP tools', () => {
    expect(parseMcpToolName('Read')).toBeNull();
    expect(parseMcpToolName('Bash')).toBeNull();
  });

  it('should return null for malformed MCP tool names', () => {
    expect(parseMcpToolName('mcp__server')).toBeNull();
    expect(parseMcpToolName('mcp__')).toBeNull();
    expect(parseMcpToolName('')).toBeNull();
  });
});

describe('MCP tool name roundtrip', () => {
  it('should roundtrip format -> parse', () => {
    const server = 'my-server';
    const tool = 'my_tool';
    const formatted = formatMcpToolName(server, tool);
    const parsed = parseMcpToolName(formatted);

    expect(parsed).toEqual({ server, tool });
  });

  it('should roundtrip parse -> format', () => {
    const original = 'mcp__test-server__test_tool';
    const parsed = parseMcpToolName(original);

    expect(parsed).not.toBeNull();
    if (parsed) {
      const formatted = formatMcpToolName(parsed.server, parsed.tool);
      expect(formatted).toBe(original);
    }
  });
});
