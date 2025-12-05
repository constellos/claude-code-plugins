---
name: "Prompt Hooks Guide"
description: "Creating LLM-based hooks for context-aware decision-making"
type: "how-to guide"
---

# Prompt Hooks Guide

Prompt hooks are LLM-driven hooks that use Claude Haiku for context-aware decisions during Claude Code sessions. Unlike command hooks that execute bash scripts deterministically, prompt hooks leverage AI evaluation.

## When to Use Prompt Hooks

| Use Prompt Hooks | Use Command Hooks |
|------------------|-------------------|
| Complex, context-dependent decisions | Simple, deterministic rules |
| Nuanced evaluation needed | Pattern matching sufficient |
| Stop/SubagentStop events | PreToolUse/PostToolUse events |

## Supported Events

Prompt hooks only support:
- **`Stop`** - When main agent finishes responding
- **`SubagentStop`** - When a subagent (Task tool) finishes

For PreToolUse/PostToolUse, use command hooks instead.

## Configuration Format

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Your evaluation prompt here describing what to check and when to block vs allow.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

**Properties:**
- `type`: Must be `"prompt"` for LLM-based hooks
- `prompt`: Instructions sent to Claude Haiku
- `timeout`: Seconds (default: 30, max: 60)
- `matcher`: Pattern to match (optional, `*` for all)

## Response Format

The LLM returns JSON controlling behavior:

```json
{
  "decision": "block",
  "reason": "Explanation shown to user"
}
```

**Decision values:**
- `"allow"` - Continue normally
- `"block"` - Stop and show reason

## Example: Response Quality Check

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Review the agent's response. Did it fully address the user's request? Allow if complete, block with reason if incomplete.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

## Configuration Locations

Settings files in order of precedence:
1. `~/.claude/settings.json` - User level (personal)
2. `.claude/settings.json` - Project level (team-shared)
3. `.claude/settings.local.json` - Local override (personal project)

## Testing

1. Add configuration to appropriate settings file
2. Start a NEW Claude Code session (hooks snapshot at startup)
3. Trigger the event (complete a response for Stop, finish a Task for SubagentStop)
4. Verify the prompt evaluation behaves correctly

## Limitations

- Only `Stop` and `SubagentStop` events supported
- Fixed to Claude Haiku model (not configurable)
- Adds latency vs command hooks (LLM inference time)
- Cannot access tool input/output like PreToolUse/PostToolUse hooks

## Rules

- **no-json-instructions**: Do NOT instruct the agent to return JSON in your prompt. The agent already returns JSON automatically with `decision` and `reason` fields. Explicit JSON instructions can cause parsing errors.
