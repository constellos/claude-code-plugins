/**
 * Runner I/O utility tests
 *
 * Note: Testing stdin/stdout directly is complex, so we test the
 * JSON serialization behavior and focus on the writeStdoutJson function.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeStdoutJson } from '../runners/io.js';

describe('writeStdoutJson', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let output: string;

  beforeEach(() => {
    output = '';
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output += chunk;
      return true;
    });
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('should write compact JSON with newline', () => {
    writeStdoutJson({ key: 'value' });

    expect(output).toBe('{"key":"value"}\n');
  });

  it('should write nested objects', () => {
    writeStdoutJson({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    });

    expect(output).toBe('{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}\n');
  });

  it('should write arrays', () => {
    writeStdoutJson({ items: [1, 2, 3] });

    expect(output).toBe('{"items":[1,2,3]}\n');
  });

  it('should handle null values', () => {
    writeStdoutJson({ value: null });

    expect(output).toBe('{"value":null}\n');
  });

  it('should handle boolean values', () => {
    writeStdoutJson({ continue: true, suppressOutput: false });

    expect(output).toBe('{"continue":true,"suppressOutput":false}\n');
  });

  it('should handle string values with special characters', () => {
    writeStdoutJson({ message: 'Line 1\nLine 2' });

    expect(output).toBe('{"message":"Line 1\\nLine 2"}\n');
  });

  it('should handle empty object', () => {
    writeStdoutJson({});

    expect(output).toBe('{}\n');
  });

  it('should handle PreToolUse allow output format', () => {
    writeStdoutJson({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: 'Tool is safe',
      },
    });

    const parsed = JSON.parse(output.trim());
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('should handle PreToolUse deny output format', () => {
    writeStdoutJson({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'Blocked by policy',
      },
    });

    const parsed = JSON.parse(output.trim());
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('should handle PostToolUse output format', () => {
    writeStdoutJson({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: 'Note: file was modified',
      },
    });

    const parsed = JSON.parse(output.trim());
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    expect(parsed.hookSpecificOutput.additionalContext).toBe('Note: file was modified');
  });

  it('should handle SessionStart output format', () => {
    writeStdoutJson({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: 'Session initialized with custom config',
      },
    });

    const parsed = JSON.parse(output.trim());
    expect(parsed.hookSpecificOutput.hookEventName).toBe('SessionStart');
  });
});

describe('JSON output format', () => {
  it('should produce valid JSON that can be parsed', () => {
    const testCases = [
      { simple: 'value' },
      { nested: { deep: { value: 123 } } },
      { array: [1, 'two', { three: 3 }] },
      { unicode: 'Hello \u0000' },
      { empty: '' },
    ];

    for (const testCase of testCases) {
      const json = JSON.stringify(testCase);
      expect(() => JSON.parse(json)).not.toThrow();
      expect(JSON.parse(json)).toEqual(testCase);
    }
  });
});
