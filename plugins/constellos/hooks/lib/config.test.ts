/**
 * Tests for harness configuration resolution
 */

import { describe, it, expect } from 'vitest';
import { bareOrigin, parseSpaceFromMcpJson, DEFAULT_SERVER_URL } from './config.js';

describe('bareOrigin', () => {
  it('strips the path suffix (the token-dir trap)', () => {
    expect(bareOrigin('https://mcp.constellos.ai/mcp')).toBe('https://mcp.constellos.ai');
  });

  it('strips query parameters', () => {
    expect(bareOrigin('https://mcp.constellos.ai/mcp?space=constellos')).toBe(
      'https://mcp.constellos.ai'
    );
  });

  it('leaves a bare origin unchanged', () => {
    expect(bareOrigin(DEFAULT_SERVER_URL)).toBe(DEFAULT_SERVER_URL);
  });

  it('returns non-URLs unchanged', () => {
    expect(bareOrigin('not a url')).toBe('not a url');
  });
});

describe('parseSpaceFromMcpJson', () => {
  it('finds the space on a constellos server entry', () => {
    const json = JSON.stringify({
      mcpServers: {
        constellos: { type: 'http', url: 'https://mcp.constellos.ai/mcp?space=constellos' },
      },
    });
    expect(parseSpaceFromMcpJson(json)).toBe('constellos');
  });

  it('ignores non-constellos servers with a space param', () => {
    const json = JSON.stringify({
      mcpServers: { other: { type: 'http', url: 'https://example.com/mcp?space=nope' } },
    });
    expect(parseSpaceFromMcpJson(json)).toBeNull();
  });

  it('returns null without a space param', () => {
    const json = JSON.stringify({
      mcpServers: { constellos: { type: 'http', url: 'https://mcp.constellos.ai/mcp' } },
    });
    expect(parseSpaceFromMcpJson(json)).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(parseSpaceFromMcpJson('{nope')).toBeNull();
  });
});
