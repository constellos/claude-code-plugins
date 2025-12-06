/**
 * Schema validation tests
 */

import { describe, it, expect } from 'bun:test';
import {
  UsageSchema,
  TodoStatusSchema,
  TodoItemSchema,
  ThinkingMetadataSchema,
  BaseMessageSchema,
  PreToolUseInputSchema,
  PostToolUseInputSchema,
  SessionStartInputSchema,
  HookEventNameSchema,
  PermissionModeSchema,
  DecisionTypeSchema,
  TranscriptLineSchema,
  SummaryLineSchema,
  FileHistorySnapshotSchema,
} from '../schemas/index.js';

// ============================================================================
// Base Schemas
// ============================================================================

describe('UsageSchema', () => {
  it('should validate minimal usage data', () => {
    const data = { input_tokens: 100, output_tokens: 50 };
    const result = UsageSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.input_tokens).toBe(100);
      expect(result.data.output_tokens).toBe(50);
    }
  });

  it('should validate usage with optional cache fields', () => {
    const data = {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 25,
      cache_read_input_tokens: 10,
    };
    const result = UsageSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cache_creation_input_tokens).toBe(25);
      expect(result.data.cache_read_input_tokens).toBe(10);
    }
  });

  it('should validate usage with nested cache_creation object', () => {
    const data = {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation: {
        ephemeral_5m_input_tokens: 5,
        ephemeral_1h_input_tokens: 10,
      },
    };
    const result = UsageSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cache_creation?.ephemeral_5m_input_tokens).toBe(5);
    }
  });

  it('should validate usage with service_tier', () => {
    const data = {
      input_tokens: 100,
      output_tokens: 50,
      service_tier: 'standard',
    };
    const result = UsageSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should reject missing required fields', () => {
    const data = { input_tokens: 100 };
    const result = UsageSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject invalid token values', () => {
    const data = { input_tokens: 'not a number', output_tokens: 50 };
    const result = UsageSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe('TodoStatusSchema', () => {
  it('should validate pending status', () => {
    expect(TodoStatusSchema.safeParse('pending').success).toBe(true);
  });

  it('should validate in_progress status', () => {
    expect(TodoStatusSchema.safeParse('in_progress').success).toBe(true);
  });

  it('should validate completed status', () => {
    expect(TodoStatusSchema.safeParse('completed').success).toBe(true);
  });

  it('should reject invalid status', () => {
    expect(TodoStatusSchema.safeParse('unknown').success).toBe(false);
  });
});

describe('TodoItemSchema', () => {
  it('should validate valid todo item', () => {
    const data = {
      content: 'Fix the bug',
      status: 'pending',
      activeForm: 'review',
    };
    const result = TodoItemSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should reject missing fields', () => {
    const data = { content: 'Fix the bug' };
    const result = TodoItemSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe('ThinkingMetadataSchema', () => {
  it('should validate thinking metadata', () => {
    const data = {
      level: 'high',
      disabled: false,
      triggers: ['user_request'],
    };
    const result = ThinkingMetadataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should validate with empty triggers', () => {
    const data = {
      level: 'none',
      disabled: true,
      triggers: [],
    };
    const result = ThinkingMetadataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Message Schemas
// ============================================================================

describe('BaseMessageSchema', () => {
  const validBaseMessage = {
    uuid: 'msg-123',
    parentUuid: 'msg-122',
    timestamp: '2024-01-15T10:30:00Z',
    sessionId: 'session-abc',
    isSidechain: false,
    cwd: '/home/user/project',
    version: '1.0.0',
  };

  it('should validate base message fields', () => {
    const result = BaseMessageSchema.safeParse(validBaseMessage);
    expect(result.success).toBe(true);
  });

  it('should allow null parentUuid', () => {
    const data = { ...validBaseMessage, parentUuid: null };
    const result = BaseMessageSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should allow optional gitBranch', () => {
    const data = { ...validBaseMessage, gitBranch: 'main' };
    const result = BaseMessageSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should allow optional slug', () => {
    const data = { ...validBaseMessage, slug: 'my-session' };
    const result = BaseMessageSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should allow optional agentId', () => {
    const data = { ...validBaseMessage, agentId: 'agent-xyz' };
    const result = BaseMessageSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Hook Schemas
// ============================================================================

describe('HookEventNameSchema', () => {
  const validEvents = [
    'PreToolUse',
    'PostToolUse',
    'Notification',
    'UserPromptSubmit',
    'Stop',
    'SubagentStart',
    'SubagentStop',
    'PreCompact',
    'SessionStart',
    'SessionEnd',
    'PermissionRequest',
  ];

  it.each(validEvents)('should validate %s event', (event) => {
    expect(HookEventNameSchema.safeParse(event).success).toBe(true);
  });

  it('should reject invalid event names', () => {
    expect(HookEventNameSchema.safeParse('InvalidEvent').success).toBe(false);
  });
});

describe('PermissionModeSchema', () => {
  const validModes = ['default', 'plan', 'acceptEdits', 'bypassPermissions'];

  it.each(validModes)('should validate %s mode', (mode) => {
    expect(PermissionModeSchema.safeParse(mode).success).toBe(true);
  });

  it('should reject invalid modes', () => {
    expect(PermissionModeSchema.safeParse('invalidMode').success).toBe(false);
  });
});

describe('DecisionTypeSchema', () => {
  it('should validate allow decision', () => {
    expect(DecisionTypeSchema.safeParse('allow').success).toBe(true);
  });

  it('should validate deny decision', () => {
    expect(DecisionTypeSchema.safeParse('deny').success).toBe(true);
  });

  it('should validate ask decision', () => {
    expect(DecisionTypeSchema.safeParse('ask').success).toBe(true);
  });

  it('should reject invalid decisions', () => {
    expect(DecisionTypeSchema.safeParse('maybe').success).toBe(false);
  });
});

describe('PreToolUseInputSchema', () => {
  const validInput = {
    session_id: 'session-123',
    transcript_path: '/path/to/transcript.jsonl',
    cwd: '/home/user/project',
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: 'Read',
    tool_input: { file_path: '/some/file.ts' },
    tool_use_id: 'toolu_123abc',
  };

  it('should validate valid PreToolUse input', () => {
    const result = PreToolUseInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should require tool_name', () => {
    const data = {
      session_id: validInput.session_id,
      transcript_path: validInput.transcript_path,
      cwd: validInput.cwd,
      permission_mode: validInput.permission_mode,
      hook_event_name: validInput.hook_event_name,
      tool_input: validInput.tool_input,
      tool_use_id: validInput.tool_use_id,
    };
    const result = PreToolUseInputSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should require tool_input to be an object', () => {
    const data = { ...validInput, tool_input: 'not an object' };
    const result = PreToolUseInputSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe('PostToolUseInputSchema', () => {
  const validInput = {
    session_id: 'session-123',
    transcript_path: '/path/to/transcript.jsonl',
    cwd: '/home/user/project',
    permission_mode: 'default',
    hook_event_name: 'PostToolUse',
    tool_name: 'Read',
    tool_input: { file_path: '/some/file.ts' },
    tool_response: { content: 'file contents here' },
    tool_use_id: 'toolu_123abc',
  };

  it('should validate valid PostToolUse input', () => {
    const result = PostToolUseInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should allow tool_response to be any type', () => {
    const data1 = { ...validInput, tool_response: 'string response' };
    expect(PostToolUseInputSchema.safeParse(data1).success).toBe(true);

    const data2 = { ...validInput, tool_response: null };
    expect(PostToolUseInputSchema.safeParse(data2).success).toBe(true);

    const data3 = { ...validInput, tool_response: [1, 2, 3] };
    expect(PostToolUseInputSchema.safeParse(data3).success).toBe(true);
  });
});

describe('SessionStartInputSchema', () => {
  const validInput = {
    session_id: 'session-123',
    transcript_path: '/path/to/transcript.jsonl',
    cwd: '/home/user/project',
    permission_mode: 'default',
    hook_event_name: 'SessionStart',
    source: 'startup',
  };

  it('should validate valid SessionStart input', () => {
    const result = SessionStartInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it.each(['startup', 'resume', 'clear', 'compact'])('should accept source: %s', (source) => {
    const data = { ...validInput, source };
    expect(SessionStartInputSchema.safeParse(data).success).toBe(true);
  });

  it('should reject invalid source', () => {
    const data = { ...validInput, source: 'invalid' };
    expect(SessionStartInputSchema.safeParse(data).success).toBe(false);
  });
});

// ============================================================================
// Transcript Schemas
// ============================================================================

describe('SummaryLineSchema', () => {
  it('should validate summary line', () => {
    const data = {
      type: 'summary',
      summary: 'Fixed the authentication bug',
    };
    const result = SummaryLineSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should allow optional leafUuid', () => {
    const data = {
      type: 'summary',
      summary: 'Fixed the authentication bug',
      leafUuid: 'uuid-123',
    };
    const result = SummaryLineSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

describe('FileHistorySnapshotSchema', () => {
  it('should validate file history snapshot', () => {
    const data = {
      type: 'file-history-snapshot',
      messageId: 'msg-123',
      snapshot: { '/path/file.ts': { hash: 'abc123' } },
    };
    const result = FileHistorySnapshotSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should allow optional isSnapshotUpdate', () => {
    const data = {
      type: 'file-history-snapshot',
      messageId: 'msg-123',
      snapshot: {},
      isSnapshotUpdate: true,
    };
    const result = FileHistorySnapshotSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

describe('TranscriptLineSchema', () => {
  it('should validate summary type', () => {
    const data = { type: 'summary', summary: 'Test' };
    const result = TranscriptLineSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should validate file-history-snapshot type', () => {
    const data = {
      type: 'file-history-snapshot',
      messageId: 'msg-123',
      snapshot: {},
    };
    const result = TranscriptLineSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should reject unknown type', () => {
    const data = { type: 'unknown', data: 'test' };
    const result = TranscriptLineSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
