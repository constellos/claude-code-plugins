---
name: Claude Code Kit Hook Development
description: Help develop and debug Claude Code hooks using the claude-code-kit plugin
---

# Claude Code Kit Hook Development

This skill helps you develop hooks for Claude Code using the claude-code-kit plugin.

## Plugin Structure

The claude-code-kit plugin provides:

- **`$CLAUDE_PLUGIN_ROOT/runner.ts`** - Hook runner that handles stdin/stdout JSON and debug mode
- **`$CLAUDE_PLUGIN_ROOT/lib/types.ts`** - Pure TypeScript types for all hook events
- **`$CLAUDE_PLUGIN_ROOT/lib/io.ts`** - stdin/stdout utilities
- **`$CLAUDE_PLUGIN_ROOT/lib/transcripts.ts`** - Transcript parsing without Zod
- **`$CLAUDE_PLUGIN_ROOT/lib/subagent-state.ts`** - Subagent context management
- **`$CLAUDE_PLUGIN_ROOT/lib/debug.ts`** - Debug logging utilities

## Creating a Hook

1. Create a TypeScript file that exports a default async function:

```typescript
import type { PreToolUseInput, PreToolUseHookOutput } from '$CLAUDE_PLUGIN_ROOT/lib/types.ts';

const handler = async (input: PreToolUseInput): Promise<PreToolUseHookOutput> => {
  // Your hook logic here
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  };
};

export default handler;
```

2. Configure the hook in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node $CLAUDE_PLUGIN_ROOT/runner.ts /path/to/your/hook.ts"
          }
        ]
      }
    ]
  }
}
```

## Debug Mode

Add `debug: true` to hook input to enable:
- Logging all hook calls to `.claude/logs/hooks/`
- Blocking error responses on failures instead of silent pass-through

## Available Hook Types

- `PreToolUseHook` - Before tool execution (can allow/deny/ask, modify input)
- `PostToolUseHook` - After tool execution (can block, add context)
- `SessionStartHook` - Session starts (add context)
- `SessionEndHook` - Session ends
- `SubagentStartHook` - Subagent spawned
- `SubagentStopHook` - Subagent finished (can block)
- `NotificationHook` - System notification
- `UserPromptSubmitHook` - User submits prompt (can block)
- `StopHook` - Execution stopping (can block)
- `PreCompactHook` - Before context compaction

## Subagent State Management

The plugin automatically tracks subagent state:

- **SubagentStart**: Saves context to `.claude/state/active-subagents.json`
- **SubagentStop**: Analyzes agent edits and cleans up context

Use `getAgentEdits(transcriptPath)` to get:
- `subagentType` - Type of agent
- `agentPrompt` - The prompt passed to Task
- `agentNewFiles` - Files created
- `agentEditedFiles` - Files modified
- `agentDeletedFiles` - Files deleted
