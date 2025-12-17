# logging Plugin

Subagent execution logging and file operation tracking.

## Overview

The logging plugin provides comprehensive tracking of subagent execution and file operations. It logs agent context, prompts, and all file modifications (creates, edits, deletes) made by subagents during their execution.

This is a foundational plugin that other plugins can depend on for audit trails and debugging.

## Hooks

### 1. SubagentStart - Track Agent Context

**File**: `shared/hooks/log-subagent-start.ts`
**Event**: `SubagentStart`
**Matcher**: None (runs when any subagent starts via Task tool)

**What it does**:
- Saves agent context when a subagent begins execution
- Stores agent ID, type, prompt, and toolUseId to `.claude/logs/subagent-tasks.json`
- Context is retrieved later by SubagentStop hook

**Behavior**:
- Saves to `.claude/logs/subagent-tasks.json` in project root
- Non-blocking on errors (errors logged to console if DEBUG enabled)
- Creates `.claude/logs/` directory if it doesn't exist

**Output**: Empty hookSpecificOutput (no additional context to Claude)

**Storage Format**:
```json
{
  "agent_id": "abc123",
  "agent_type": "general-purpose",
  "session_id": "xyz789",
  "prompt": "Fix the authentication bug...",
  "toolUseId": "tool_xyz",
  "timestamp": "2025-12-17T12:34:56.789Z"
}
```

---

### 2. SubagentStop - Log Agent File Operations

**File**: `shared/hooks/log-subagent-stop.ts`
**Event**: `SubagentStop`
**Matcher**: None (runs when any subagent completes)

**What it does**:
- Analyzes agent transcript when subagent completes
- Logs agent type, prompt, and file operations to console (if DEBUG enabled)
- Reports files created (new writes), edited (Write/Edit), and deleted (rm commands)
- Cleans up saved context from SubagentStart

**Behavior**:
- Parses agent transcript JSONL file from `agent_transcript_path`
- Extracts Write/Edit/Bash tool calls
- Categorizes file operations
- Outputs detailed log with DEBUG=* or DEBUG=subagent
- Non-blocking on errors

**Output**: Empty (logging only, no additional context to Claude)

**Debug Output Example** (with DEBUG=subagent):
```
[SubagentStop] ─────────────────────────────────────────
[SubagentStop] Agent Analysis Complete
[SubagentStop] ─────────────────────────────────────────
[SubagentStop] Agent Type: general-purpose
[SubagentStop] Agent Prompt: Fix the authentication bug in login.ts
[SubagentStop] Files Created: 1
[SubagentStop]   + src/auth/new-helper.ts
[SubagentStop] Files Edited: 2
[SubagentStop]   ~ src/auth/login.ts
[SubagentStop]   ~ src/auth/utils.ts
[SubagentStop] Files Deleted: 0
[SubagentStop] ─────────────────────────────────────────
```

**File Operations Tracked**:
- **Created**: Files written that didn't exist before (tracked via Write tool)
- **Edited**: Files modified via Write or Edit tools
- **Deleted**: Files removed via Bash commands (rm, git rm, etc.)

---

## Debug Logging

Enable debug output for hooks:

```bash
DEBUG=* claude           # All debug output
DEBUG=subagent claude    # Subagent hooks only
```

## Use Cases

This plugin is ideal for:
- **Audit trails**: Track all file modifications made by subagents
- **Debugging**: Understand what agents are doing and what files they modify
- **Security**: Monitor agent behavior and file access patterns
- **Development**: Analyze agent effectiveness and file change patterns
- **Compliance**: Maintain logs of all automated code changes

## Requirements

- Node.js (for TypeScript hook runner)
- No additional dependencies

## Configuration

This plugin is referenced in `.claude-plugin/marketplace.json`:

```json
{
  "name": "logging",
  "source": "../plugins/logging",
  "strict": false
}
```

Install with:
```bash
/plugin install logging@claude-code-kit-local
```

## Log Storage

Agent context is stored in `.claude/logs/subagent-tasks.json` at the project root. This directory is automatically created if it doesn't exist.

**Note**: Add `.claude/logs/` to your `.gitignore` if you don't want to commit agent logs.

## Integration with Other Plugins

Other plugins can leverage the logging plugin by:
1. Installing the logging plugin as a dependency
2. Reading from `.claude/logs/subagent-tasks.json` to access agent context
3. Using the subagent-state utility functions from `shared/lib/subagent-state.ts`

Example:
```typescript
import { getAgentEdits } from '../../../shared/lib/subagent-state.js';

// In your SubagentStop hook
const edits = await getAgentEdits(input.agent_transcript_path);
console.log('Files created:', edits.agentNewFiles);
console.log('Files edited:', edits.agentEditedFiles);
```

## Privacy & Security

- Logs may contain sensitive information (prompts, file paths)
- Store logs securely and add to `.gitignore`
- Consider log rotation for long-running projects
- Review logs before sharing or committing
