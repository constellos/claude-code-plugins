/**
 * Transcript parser tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseTranscriptLine,
  isMessageLine,
  getTranscriptInfo,
} from '../transcripts/parser.js';

describe('parseTranscriptLine', () => {
  it('should parse valid user message JSONL', () => {
    const line = JSON.stringify({
      type: 'user',
      uuid: 'msg-123',
      parentUuid: null,
      timestamp: '2024-01-15T10:30:00Z',
      sessionId: 'session-abc',
      isSidechain: false,
      cwd: '/home/user/project',
      version: '1.0.0',
      userType: 'external',
      message: {
        role: 'user',
        content: 'Hello, Claude!',
      },
    });

    const result = parseTranscriptLine(line);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('user');
  });

  it('should parse valid summary line', () => {
    const line = JSON.stringify({
      type: 'summary',
      summary: 'Fixed authentication bug',
    });

    const result = parseTranscriptLine(line);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('summary');
  });

  it('should parse file-history-snapshot line', () => {
    const line = JSON.stringify({
      type: 'file-history-snapshot',
      messageId: 'msg-123',
      snapshot: { '/path/file.ts': { hash: 'abc' } },
    });

    const result = parseTranscriptLine(line);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('file-history-snapshot');
  });

  it('should return null for invalid JSON', () => {
    const result = parseTranscriptLine('not valid json');
    expect(result).toBeNull();
  });

  it('should return null for empty string', () => {
    const result = parseTranscriptLine('');
    expect(result).toBeNull();
  });

  it('should return null for invalid schema', () => {
    const line = JSON.stringify({
      type: 'unknown_type',
      data: 'something',
    });

    const result = parseTranscriptLine(line);
    expect(result).toBeNull();
  });

  it('should return null for missing required fields', () => {
    const line = JSON.stringify({
      type: 'user',
      // missing all required fields
    });

    const result = parseTranscriptLine(line);
    expect(result).toBeNull();
  });
});

describe('isMessageLine', () => {
  it('should return true for user message', () => {
    const line = {
      type: 'user' as const,
      uuid: 'msg-123',
      parentUuid: null,
      timestamp: '2024-01-15T10:30:00Z',
      sessionId: 'session-abc',
      isSidechain: false,
      cwd: '/home/user/project',
      version: '1.0.0',
      userType: 'external' as const,
      message: {
        role: 'user' as const,
        content: 'Hello',
      },
    };

    expect(isMessageLine(line)).toBe(true);
  });

  it('should return true for system message', () => {
    const line = {
      type: 'system' as const,
      uuid: 'msg-123',
      parentUuid: null,
      timestamp: '2024-01-15T10:30:00Z',
      sessionId: 'session-abc',
      isSidechain: false,
      cwd: '/home/user/project',
      version: '1.0.0',
      subtype: 'info',
      content: 'System message',
      isMeta: false,
      level: 'info' as const,
    };

    expect(isMessageLine(line)).toBe(true);
  });

  it('should return false for summary line', () => {
    const line = {
      type: 'summary' as const,
      summary: 'Session summary',
    };

    expect(isMessageLine(line)).toBe(false);
  });

  it('should return false for file-history-snapshot', () => {
    const line = {
      type: 'file-history-snapshot' as const,
      messageId: 'msg-123',
      snapshot: {},
    };

    expect(isMessageLine(line)).toBe(false);
  });
});

describe('getTranscriptInfo', () => {
  it('should extract info from main transcript path', () => {
    const info = getTranscriptInfo('/path/to/transcripts/abc123.jsonl');

    expect(info.sourcePath).toBe('/path/to/transcripts/abc123.jsonl');
    expect(info.isSidechain).toBe(false);
    expect(info.agentId).toBeUndefined();
  });

  it('should identify subagent transcripts', () => {
    const info = getTranscriptInfo('/path/to/transcripts/agent-xyz789.jsonl');

    expect(info.sourcePath).toBe('/path/to/transcripts/agent-xyz789.jsonl');
    expect(info.isSidechain).toBe(true);
    expect(info.agentId).toBe('xyz789');
  });

  it('should extract agent ID from subagent transcript', () => {
    const info = getTranscriptInfo('/path/agent-abcdef123.jsonl');

    expect(info.agentId).toBe('abcdef123');
    expect(info.isSidechain).toBe(true);
  });

  it('should handle Windows-style paths', () => {
    // Note: path.basename on non-Windows doesn't parse Windows paths correctly
    // This is expected behavior - the function relies on Node's path module
    const info = getTranscriptInfo('C:\\Users\\name\\transcripts\\agent-test123.jsonl');

    // On Unix, the entire string is treated as the filename
    // so it won't be detected as an agent file
    expect(info.sourcePath).toBe('C:\\Users\\name\\transcripts\\agent-test123.jsonl');
  });

  it('should handle relative paths', () => {
    const info = getTranscriptInfo('./transcripts/session123.jsonl');

    expect(info.isSidechain).toBe(false);
  });

  it('should not match partial agent prefix', () => {
    const info = getTranscriptInfo('/path/myagent-123.jsonl');

    expect(info.isSidechain).toBe(false);
    expect(info.agentId).toBeUndefined();
  });
});
