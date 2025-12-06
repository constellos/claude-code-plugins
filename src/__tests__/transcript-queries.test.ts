/**
 * Transcript query tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import {
  getEditedFiles,
  getNewFiles,
  getDeletedFiles,
  getAgentEdits,
  loadAgentStartContext,
  removeAgentStartContext,
  findTaskCallForAgent,
} from '../transcripts/queries.js';
import type { Transcript } from '../schemas/index.js';

// Helper to create a minimal transcript for testing
function createTestTranscript(
  messages: Transcript['messages'] = [],
  overrides: Partial<Transcript> = {}
): Transcript {
  return {
    sourcePath: '/test/path.jsonl',
    sessionId: 'test-session',
    isSidechain: false,
    messages,
    ...overrides,
  };
}

describe('getEditedFiles', () => {
  it('should return empty array for transcript with no edits', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
        },
      },
    ]);

    const result = getEditedFiles(transcript);
    expect(result).toEqual([]);
  });

  it('should extract file paths from Write tool uses', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Write',
              input: { file_path: '/project/src/file1.ts', content: 'code' },
            },
          ],
        },
      },
    ]);

    const result = getEditedFiles(transcript);
    expect(result).toEqual(['/project/src/file1.ts']);
  });

  it('should extract file paths from Edit tool uses', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Edit',
              input: { file_path: '/project/src/file2.ts', old_string: 'a', new_string: 'b' },
            },
          ],
        },
      },
    ]);

    const result = getEditedFiles(transcript);
    expect(result).toEqual(['/project/src/file2.ts']);
  });

  it('should deduplicate file paths', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Write',
              input: { file_path: '/project/file.ts', content: 'v1' },
            },
            {
              type: 'tool_use',
              id: 'tool-2',
              name: 'Edit',
              input: { file_path: '/project/file.ts', old_string: 'a', new_string: 'b' },
            },
            {
              type: 'tool_use',
              id: 'tool-3',
              name: 'Edit',
              input: { file_path: '/project/file.ts', old_string: 'b', new_string: 'c' },
            },
          ],
        },
      },
    ]);

    const result = getEditedFiles(transcript);
    expect(result).toEqual(['/project/file.ts']);
  });

  it('should handle multiple files across multiple messages', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Write',
              input: { file_path: '/project/file1.ts', content: 'code' },
            },
          ],
        },
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        parentUuid: 'msg-1',
        timestamp: '2024-01-15T10:31:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-2',
              name: 'Edit',
              input: { file_path: '/project/file2.ts', old_string: 'a', new_string: 'b' },
            },
          ],
        },
      },
    ]);

    const result = getEditedFiles(transcript);
    expect(result).toContain('/project/file1.ts');
    expect(result).toContain('/project/file2.ts');
    expect(result).toHaveLength(2);
  });

  it('should ignore other tool types', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Read',
              input: { file_path: '/project/file.ts' },
            },
            {
              type: 'tool_use',
              id: 'tool-2',
              name: 'Bash',
              input: { command: 'ls' },
            },
          ],
        },
      },
    ]);

    const result = getEditedFiles(transcript);
    expect(result).toEqual([]);
  });
});

describe('getAgentEdits', () => {
  it('should throw error for non-agent transcript path', async () => {
    await expect(getAgentEdits('/path/to/session-123.jsonl')).rejects.toThrow(
      'Path must be an agent transcript'
    );
  });

  it('should throw error for non-existent file', async () => {
    await expect(
      getAgentEdits('/nonexistent/path/agent-abc123.jsonl')
    ).rejects.toThrow();
  });

  // Integration test with real lazyjobs transcripts (skipped in CI)
  it.skipIf(!process.env.RUN_INTEGRATION_TESTS)(
    'should analyze real agent transcript',
    async () => {
      const projectsDir = path.join(os.homedir(), '.claude', 'projects', '-home-ben-projects-lazyjobs');
      const agentPath = path.join(projectsDir, 'agent-eb1cb4e4.jsonl');

      // Check if file exists
      try {
        await fs.access(agentPath);
      } catch {
        console.log('Skipping: test transcript not found');
        return;
      }

      const result = await getAgentEdits(agentPath);

      expect(result.sessionId).toBeTruthy();
      expect(result.agentSessionId).toBe('eb1cb4e4');
      expect(result.subagentType).toBe('ui');
      expect(result.agentFile).toContain('.claude/agents/ui.md');
      expect(result.agentPreloadedSkillsFiles.length).toBeGreaterThan(0);
      expect(result.agentEditedFiles.length).toBeGreaterThan(0);
    }
  );
});

// ============================================================================
// getNewFiles tests
// ============================================================================

describe('getNewFiles', () => {
  it('should return empty array for transcript with no writes', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
        },
      },
    ]);

    const result = getNewFiles(transcript);
    expect(result).toEqual([]);
  });

  it('should return file path from first Write call', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Write',
              input: { file_path: '/project/newfile.ts', content: 'code' },
            },
          ],
        },
      },
    ]);

    const result = getNewFiles(transcript);
    expect(result).toEqual(['/project/newfile.ts']);
  });

  it('should only include first Write to each path (deduplicated)', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Write',
              input: { file_path: '/project/file.ts', content: 'v1' },
            },
            {
              type: 'tool_use',
              id: 'tool-2',
              name: 'Write',
              input: { file_path: '/project/file.ts', content: 'v2' },
            },
          ],
        },
      },
    ]);

    const result = getNewFiles(transcript);
    expect(result).toEqual(['/project/file.ts']);
    expect(result).toHaveLength(1);
  });

  it('should NOT include files that only have Edit calls', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Edit',
              input: { file_path: '/project/existing.ts', old_string: 'a', new_string: 'b' },
            },
          ],
        },
      },
    ]);

    const result = getNewFiles(transcript);
    expect(result).toEqual([]);
  });

  it('should return multiple new files in order', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Write',
              input: { file_path: '/project/first.ts', content: 'code' },
            },
            {
              type: 'tool_use',
              id: 'tool-2',
              name: 'Write',
              input: { file_path: '/project/second.ts', content: 'code' },
            },
          ],
        },
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        parentUuid: 'msg-1',
        timestamp: '2024-01-15T10:31:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-3',
              name: 'Write',
              input: { file_path: '/project/third.ts', content: 'code' },
            },
          ],
        },
      },
    ]);

    const result = getNewFiles(transcript);
    expect(result).toEqual(['/project/first.ts', '/project/second.ts', '/project/third.ts']);
  });
});

// ============================================================================
// getDeletedFiles tests
// ============================================================================

describe('getDeletedFiles', () => {
  it('should return empty array for transcript with no rm commands', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'ls -la' },
            },
          ],
        },
      },
    ]);

    const result = getDeletedFiles(transcript);
    expect(result).toEqual([]);
  });

  it('should detect simple rm command', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'rm /path/to/file.txt' },
            },
          ],
        },
      },
    ]);

    const result = getDeletedFiles(transcript);
    expect(result).toEqual(['/path/to/file.txt']);
  });

  it('should detect rm with -f flag', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'rm -f /path/to/file.txt' },
            },
          ],
        },
      },
    ]);

    const result = getDeletedFiles(transcript);
    expect(result).toEqual(['/path/to/file.txt']);
  });

  it('should detect rm -rf for directories', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'rm -rf /path/to/dir' },
            },
          ],
        },
      },
    ]);

    const result = getDeletedFiles(transcript);
    expect(result).toEqual(['/path/to/dir']);
  });

  it('should detect multiple files in one rm command', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'rm file1.txt file2.txt file3.txt' },
            },
          ],
        },
      },
    ]);

    const result = getDeletedFiles(transcript);
    expect(result).toContain('file1.txt');
    expect(result).toContain('file2.txt');
    expect(result).toContain('file3.txt');
  });

  it('should detect rm in chained commands with &&', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'cd /project && rm old.ts && npm install' },
            },
          ],
        },
      },
    ]);

    const result = getDeletedFiles(transcript);
    expect(result).toEqual(['old.ts']);
  });

  it('should detect rm in chained commands with ;', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'echo "deleting"; rm temp.log; echo "done"' },
            },
          ],
        },
      },
    ]);

    const result = getDeletedFiles(transcript);
    expect(result).toEqual(['temp.log']);
  });

  it('should handle quoted paths', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'rm "/path/with spaces/file.txt"' },
            },
          ],
        },
      },
    ]);

    const result = getDeletedFiles(transcript);
    expect(result).toEqual(['/path/with spaces/file.txt']);
  });

  it('should deduplicate deleted files', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'rm file.txt' },
            },
            {
              type: 'tool_use',
              id: 'tool-2',
              name: 'Bash',
              input: { command: 'rm -f file.txt' },
            },
          ],
        },
      },
    ]);

    const result = getDeletedFiles(transcript);
    expect(result).toEqual(['file.txt']);
  });
});

// ============================================================================
// Context functions tests (save/load/remove)
// ============================================================================

describe('AgentStartContext functions', () => {
  const testDir = path.join(os.tmpdir(), `claude-code-kit-test-${Date.now()}`);
  const contextPath = path.join(testDir, '.claude', 'state', 'active-subagents.json');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('loadAgentStartContext should return undefined for non-existent file', async () => {
    const result = await loadAgentStartContext('test-agent', testDir);
    expect(result).toBeUndefined();
  });

  it('loadAgentStartContext should return undefined for non-existent agent', async () => {
    // Create context file with different agent
    await fs.mkdir(path.dirname(contextPath), { recursive: true });
    await fs.writeFile(
      contextPath,
      JSON.stringify({
        'other-agent': {
          agentId: 'other-agent',
          agentType: 'Explore',
          sessionId: 'session-123',
          timestamp: '2024-01-15T10:30:00Z',
          prompt: 'test prompt',
          toolUseId: 'tool-123',
        },
      }),
      'utf-8'
    );

    const result = await loadAgentStartContext('test-agent', testDir);
    expect(result).toBeUndefined();
  });

  it('loadAgentStartContext should return context for existing agent', async () => {
    const context = {
      agentId: 'test-agent',
      agentType: 'Explore',
      sessionId: 'session-123',
      timestamp: '2024-01-15T10:30:00Z',
      prompt: 'Find all TypeScript files',
      toolUseId: 'tool-456',
    };

    await fs.mkdir(path.dirname(contextPath), { recursive: true });
    await fs.writeFile(contextPath, JSON.stringify({ 'test-agent': context }), 'utf-8');

    const result = await loadAgentStartContext('test-agent', testDir);
    expect(result).toEqual(context);
  });

  it('removeAgentStartContext should remove agent from context file', async () => {
    const context1 = {
      agentId: 'agent-1',
      agentType: 'Explore',
      sessionId: 'session-123',
      timestamp: '2024-01-15T10:30:00Z',
      prompt: 'prompt 1',
      toolUseId: 'tool-1',
    };
    const context2 = {
      agentId: 'agent-2',
      agentType: 'Plan',
      sessionId: 'session-123',
      timestamp: '2024-01-15T10:31:00Z',
      prompt: 'prompt 2',
      toolUseId: 'tool-2',
    };

    await fs.mkdir(path.dirname(contextPath), { recursive: true });
    await fs.writeFile(
      contextPath,
      JSON.stringify({ 'agent-1': context1, 'agent-2': context2 }),
      'utf-8'
    );

    await removeAgentStartContext('agent-1', testDir);

    const result1 = await loadAgentStartContext('agent-1', testDir);
    const result2 = await loadAgentStartContext('agent-2', testDir);

    expect(result1).toBeUndefined();
    expect(result2).toEqual(context2);
  });

  it('removeAgentStartContext should handle non-existent file gracefully', async () => {
    // Should not throw - just verify it completes
    await removeAgentStartContext('test-agent', testDir);
    // If we get here without an error, the test passes
  });

  it('loadAgentStartContext should use custom contextPath when provided', async () => {
    const customPath = path.join(testDir, 'custom-context.json');
    const context = {
      agentId: 'test-agent',
      agentType: 'Explore',
      sessionId: 'session-123',
      timestamp: '2024-01-15T10:30:00Z',
      prompt: 'custom path test',
      toolUseId: 'tool-789',
    };

    await fs.writeFile(customPath, JSON.stringify({ 'test-agent': context }), 'utf-8');

    const result = await loadAgentStartContext('test-agent', testDir, customPath);
    expect(result).toEqual(context);
  });
});

// ============================================================================
// findTaskCallForAgent tests
// ============================================================================

describe('findTaskCallForAgent', () => {
  it('should return undefined for transcript with no Task calls', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
        },
      },
    ]);

    const result = findTaskCallForAgent(transcript, 'agent-123');
    expect(result).toBeUndefined();
  });

  it('should match by toolUseId (Strategy 1 - saved context)', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'task-tool-123',
              name: 'Task',
              input: {
                subagent_type: 'Explore',
                prompt: 'Find all config files',
                description: 'search for configs',
              },
            },
          ],
        },
      },
    ]);

    const result = findTaskCallForAgent(transcript, 'agent-abc', {
      toolUseId: 'task-tool-123',
    });

    expect(result).toEqual({
      subagentType: 'Explore',
      prompt: 'Find all config files',
      toolUseId: 'task-tool-123',
    });
  });

  it('should match by tool_result.agentId (Strategy 2 - historical)', () => {
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'task-tool-456',
              name: 'Task',
              input: {
                subagent_type: 'Plan',
                prompt: 'Plan the refactoring',
              },
            },
          ],
        },
      },
      {
        type: 'user',
        uuid: 'msg-2',
        parentUuid: 'msg-1',
        timestamp: '2024-01-15T10:31:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'task-tool-456',
              content: 'Agent completed',
            },
          ],
        },
        toolUseResult: {
          agentId: 'agent-xyz',
          status: 'completed',
        },
      },
    ]);

    const result = findTaskCallForAgent(transcript, 'agent-xyz');

    expect(result).toEqual({
      subagentType: 'Plan',
      prompt: 'Plan the refactoring',
      toolUseId: 'task-tool-456',
    });
  });

  it('should match by fuzzy timestamp (Strategy 3)', () => {
    const taskTimestamp = '2024-01-15T10:30:00.000Z';
    const agentStartTimestamp = '2024-01-15T10:30:05.000Z'; // 5 seconds later

    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: taskTimestamp,
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'task-tool-789',
              name: 'Task',
              input: {
                subagent_type: 'Explore',
                prompt: 'Fuzzy match test',
              },
            },
          ],
        },
      },
    ]);

    const result = findTaskCallForAgent(transcript, 'agent-unknown', {
      subagentType: 'Explore',
      agentStartTimestamp,
    });

    expect(result).toEqual({
      subagentType: 'Explore',
      prompt: 'Fuzzy match test',
      toolUseId: 'task-tool-789',
    });
  });

  it('should NOT match by fuzzy timestamp if outside time window', () => {
    const taskTimestamp = '2024-01-15T10:30:00.000Z';
    const agentStartTimestamp = '2024-01-15T10:30:15.000Z'; // 15 seconds later (outside 10s default)

    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: taskTimestamp,
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'task-tool-789',
              name: 'Task',
              input: {
                subagent_type: 'Explore',
                prompt: 'Should not match',
              },
            },
          ],
        },
      },
    ]);

    const result = findTaskCallForAgent(transcript, 'agent-unknown', {
      subagentType: 'Explore',
      agentStartTimestamp,
    });

    expect(result).toBeUndefined();
  });

  it('should respect custom maxTimeDeltaMs for fuzzy matching', () => {
    const taskTimestamp = '2024-01-15T10:30:00.000Z';
    const agentStartTimestamp = '2024-01-15T10:30:25.000Z'; // 25 seconds later

    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: taskTimestamp,
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'task-tool-custom',
              name: 'Task',
              input: {
                subagent_type: 'Explore',
                prompt: 'Custom delta match',
              },
            },
          ],
        },
      },
    ]);

    const result = findTaskCallForAgent(transcript, 'agent-unknown', {
      subagentType: 'Explore',
      agentStartTimestamp,
      maxTimeDeltaMs: 30000, // 30 seconds
    });

    expect(result).toEqual({
      subagentType: 'Explore',
      prompt: 'Custom delta match',
      toolUseId: 'task-tool-custom',
    });
  });

  it('should NOT fuzzy match if subagentType does not match', () => {
    const taskTimestamp = '2024-01-15T10:30:00.000Z';
    const agentStartTimestamp = '2024-01-15T10:30:05.000Z';

    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: taskTimestamp,
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'task-tool-wrong-type',
              name: 'Task',
              input: {
                subagent_type: 'Plan',
                prompt: 'Wrong type',
              },
            },
          ],
        },
      },
    ]);

    const result = findTaskCallForAgent(transcript, 'agent-unknown', {
      subagentType: 'Explore', // Looking for Explore, but only Plan exists
      agentStartTimestamp,
    });

    expect(result).toBeUndefined();
  });

  it('should prefer toolUseId match over tool_result match', () => {
    // This tests priority: Strategy 1 > Strategy 2
    const transcript = createTestTranscript([
      {
        type: 'assistant',
        uuid: 'msg-1',
        parentUuid: null,
        timestamp: '2024-01-15T10:30:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'correct-tool-id',
              name: 'Task',
              input: {
                subagent_type: 'Explore',
                prompt: 'Correct prompt from toolUseId',
              },
            },
            {
              type: 'tool_use',
              id: 'other-tool-id',
              name: 'Task',
              input: {
                subagent_type: 'Explore',
                prompt: 'Wrong prompt from tool_result',
              },
            },
          ],
        },
      },
      {
        type: 'user',
        uuid: 'msg-2',
        parentUuid: 'msg-1',
        timestamp: '2024-01-15T10:31:00Z',
        sessionId: 'test',
        isSidechain: false,
        cwd: '/test',
        version: '1.0.0',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'other-tool-id',
              content: 'completed',
            },
          ],
        },
        toolUseResult: {
          agentId: 'target-agent',
          status: 'completed',
        },
      },
    ]);

    // When we have a toolUseId, it should use that even if tool_result matches
    const result = findTaskCallForAgent(transcript, 'target-agent', {
      toolUseId: 'correct-tool-id',
    });

    expect(result?.prompt).toBe('Correct prompt from toolUseId');
  });
});
