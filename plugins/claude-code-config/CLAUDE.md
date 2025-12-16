# claude-code-config Plugin

Configuration management utilities for Claude Code projects.

## Overview

This is a minimal plugin that provides only the shared subagent tracking hooks. It serves as a lightweight option for projects that want subagent logging without additional CI/CD or quality check automation.

## Hooks

### 1. SubagentStart - Track Agent Context (Shared)

**File**: `shared/hooks/log-subagent-start.ts`
**Event**: `SubagentStart`
**Matcher**: None (runs when any subagent starts)

**What it does**:
- Saves agent context when subagent begins execution
- Stores agent ID, type, prompt, and toolUseId to `.claude/logs/subagent-tasks.json`
- Context is retrieved later by SubagentStop hooks

**Behavior**:
- Saves to `.claude/logs/subagent-tasks.json` in project root
- Non-blocking on errors

**Output**: Empty hookSpecificOutput

---

### 2. SubagentStop - Log Agent File Operations (Shared)

**File**: `shared/hooks/log-subagent-stop.ts`
**Event**: `SubagentStop`
**Matcher**: None (runs when any subagent completes)

**What it does**:
- Analyzes agent transcript when subagent completes
- Logs agent type, prompt, and file operations to console (if DEBUG enabled)
- Reports files created, edited, and deleted
- Cleans up saved context from SubagentStart

**Behavior**:
- Parses agent transcript JSONL file
- Extracts Write/Edit/Bash tool calls
- Categorizes file operations
- Outputs detailed log with DEBUG=* or DEBUG=subagent
- Non-blocking on errors

**Output**: Empty (logging only, no additional context)

**Example output** (with DEBUG=subagent):
```
[SubagentStop] ─────────────────────────────────────────
[SubagentStop] Agent Analysis Complete
[SubagentStop] ─────────────────────────────────────────
[SubagentStop] Agent Type: general-purpose
[SubagentStop] Agent Prompt: Fix the authentication bug in login.ts
[SubagentStop] Files Created: 0
[SubagentStop] Files Edited: 2
[SubagentStop]   ~ src/auth/login.ts
[SubagentStop]   ~ src/auth/utils.ts
[SubagentStop] Files Deleted: 0
[SubagentStop] ─────────────────────────────────────────
```

---

## Debug Logging

Enable debug output for hooks:

```bash
DEBUG=* claude           # All debug output
DEBUG=subagent claude    # Subagent hooks only
```

## Requirements

- Node.js (for TypeScript hook runner)

## Use Cases

This plugin is ideal for:
- Projects that want to track subagent file operations
- Debugging subagent behavior
- Understanding what files agents modify
- Lightweight monitoring without CI/CD automation

## Configuration

This plugin is referenced in `.claude-plugin/marketplace.json`:

```json
{
  "name": "claude-code-config",
  "source": "../plugins/claude-code-config",
  "strict": false
}
```

Install with:
```bash
/plugin install claude-code-config@claude-code-kit-local
```

## Future Plans

This plugin may be extended with:
- Configuration validation hooks
- Project setup automation
- Environment variable management
- Custom workflow automation
