/**
 * Transcript parsing tests
 */

import { describe, it, expect } from 'vitest';
import { parseTranscriptLine, getTranscriptInfo } from '../lib/transcripts.js';

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

  it('should parse valid assistant message', () => {
    const line = JSON.stringify({
      type: 'assistant',
      uuid: 'msg-456',
      parentUuid: 'msg-123',
      timestamp: '2024-01-15T10:30:01Z',
      sessionId: 'session-abc',
      isSidechain: false,
      cwd: '/home/user/project',
      version: '1.0.0',
      requestId: 'req-789',
      message: {
        id: 'msg-456',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-opus',
        content: [{ type: 'text', text: 'Hello!' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    });

    const result = parseTranscriptLine(line);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('assistant');
  });

  it('should parse valid system message', () => {
    const line = JSON.stringify({
      type: 'system',
      uuid: 'msg-789',
      parentUuid: null,
      timestamp: '2024-01-15T10:30:00Z',
      sessionId: 'session-abc',
      isSidechain: false,
      cwd: '/home/user/project',
      version: '1.0.0',
      subtype: 'info',
      content: 'System initialized',
      isMeta: false,
      level: 'info',
    });

    const result = parseTranscriptLine(line);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('system');
  });

  it('should return null for invalid JSON', () => {
    const result = parseTranscriptLine('not valid json');
    expect(result).toBeNull();
  });

  it('should return null for empty string', () => {
    const result = parseTranscriptLine('');
    expect(result).toBeNull();
  });

  it('should return null for non-message types', () => {
    const line = JSON.stringify({
      type: 'summary',
      summary: 'Session summary',
    });

    const result = parseTranscriptLine(line);
    expect(result).toBeNull();
  });

  it('should return null for missing required fields', () => {
    const line = JSON.stringify({
      type: 'user',
      // missing uuid, timestamp, sessionId
    });

    const result = parseTranscriptLine(line);
    expect(result).toBeNull();
  });
});

describe('getTranscriptInfo', () => {
  it('should identify main transcript', () => {
    const info = getTranscriptInfo('/path/to/transcripts/abc123.jsonl');

    expect(info.isSidechain).toBe(false);
    expect(info.agentId).toBeUndefined();
  });

  it('should identify subagent transcripts', () => {
    const info = getTranscriptInfo('/path/to/transcripts/agent-xyz789.jsonl');

    expect(info.isSidechain).toBe(true);
    expect(info.agentId).toBe('xyz789');
  });

  it('should extract agent ID from subagent transcript', () => {
    const info = getTranscriptInfo('/path/agent-abcdef123.jsonl');

    expect(info.agentId).toBe('abcdef123');
    expect(info.isSidechain).toBe(true);
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
