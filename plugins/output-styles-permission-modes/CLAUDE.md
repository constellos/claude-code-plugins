# Output Styles Permission Modes Plugin

## Overview

This plugin enforces tool restrictions defined in output style frontmatter, allowing you to limit which tools the main Claude agent can use based on the active output style.

## Purpose

Output styles can define a `tools` array in their YAML frontmatter to whitelist specific tools. This plugin reads that configuration and blocks any tool usage not in the whitelist, but **only for the main agent** - subagents remain unrestricted.

## Use Cases

1. **Architect Mode**: Restrict main agent to planning tools (Task, Read, Glob, Grep) to encourage delegation
2. **Read-Only Mode**: Allow only observation tools, preventing any edits
3. **Safe Mode**: Limit to approved tools for sensitive environments
4. **Testing**: Validate that workflows use specific tool patterns

## How It Works

### Hook Flow

1. **PreToolUse Hook Triggered**: Before any tool executes
2. **Agent Detection**: Checks if it's the main agent or a subagent
3. **Skip Subagents**: If subagent, immediately allows the tool
4. **Read Settings**: Loads `.claude/settings.json` to get current output style name
5. **Load Style File**: Reads `.claude/output-styles/{style-name}.md`
6. **Parse Frontmatter**: Extracts the `tools` array from YAML frontmatter
7. **Enforce Whitelist**: Allows tool if in whitelist, denies otherwise

### Main Agent Only

This is critical: **subagents can use any tools they need**. Tool restrictions only apply to the main agent to prevent circumventing the restrictions by spawning agents.

## Configuration

### Output Style with Tools Whitelist

Create an output style with a `tools` frontmatter field:

```markdown
---
name: "Architect Delegator"
description: "Focus on delegation and planning"
tools:
  - Task
  - Read
  - Glob
  - Grep
  - AskUserQuestion
  - TodoWrite
---

# Architect Delegator Style

You are a software architect who focuses on delegation...
```

### Activate the Style

In `.claude/settings.json`:

```json
{
  "outputStyle": "architect-delegator",
  "enabledPlugins": {
    "output-styles-permission-modes@constellos": true
  }
}
```

### Tool Names

Use exact tool names as they appear in Claude Code:
- `Task` - Spawn subagents
- `Read` - Read files
- `Write` - Create/overwrite files
- `Edit` - Edit existing files
- `Bash` - Execute shell commands
- `Glob` - Pattern-based file search
- `Grep` - Content search
- `TodoWrite` - Manage todo lists
- `AskUserQuestion` - Ask user for clarification
- `WebSearch` - Search the web
- `WebFetch` - Fetch web pages

See the full list in Claude Code documentation.

## Example Output Styles

### Read-Only Mode

```markdown
---
name: "Read Only"
description: "Can only read and analyze, cannot make changes"
tools:
  - Read
  - Glob
  - Grep
  - Task
  - AskUserQuestion
---

# Read-Only Mode

You can read and analyze code but cannot make any changes.
Use the Task tool to spawn agents if implementation is needed.
```

### Delegation-Focused

```markdown
---
name: "Pure Architect"
description: "Must delegate all implementation work"
tools:
  - Task
  - Read
  - Glob
  - Grep
  - AskUserQuestion
  - TodoWrite
---

# Pure Architect

You MUST delegate all implementation to specialized agents via the Task tool.
Your role is to plan, coordinate, and validate - not to implement directly.
```

### Safe Exploration

```markdown
---
name: "Safe Explorer"
description: "Can explore codebase safely without modifications"
tools:
  - Read
  - Glob
  - Grep
  - WebSearch
  - WebFetch
  - AskUserQuestion
---

# Safe Explorer

Explore and understand the codebase without making any modifications.
Focus on gathering information and answering questions.
```

## Debugging

Enable debug logging:

```bash
DEBUG=output-styles-permission-modes claude
```

Output includes:
- Tool name being checked
- Whether it's main agent or subagent
- Current output style name
- Allowed tools list
- Allow/deny decision

## Implementation Details

### Files

- **Plugin**: `plugins/output-styles-permission-modes/`
- **Hook**: `hooks/enforce-output-style-tools.ts`
- **Utility**: `shared/hooks/utils/was-tool-event-main-agent.ts`

### Dependencies

- `gray-matter` - YAML frontmatter parsing
- `shared/hooks/utils/wasToolEventMainAgent` - Agent detection
- `shared/hooks/utils/runHook` - Hook runner

### Settings Lookup Order

1. `.claude/settings.local.json` (highest priority)
2. `.claude/settings.json`

### Style File Lookup Order

1. `.claude/output-styles/{name}.md` (project-level)
2. `~/.claude/output-styles/{name}.md` (user-level) - not currently checked by hook

## Limitations

### User-Level Styles

The hook currently only checks project-level output styles (`.claude/output-styles/`). User-level styles in `~/.claude/output-styles/` are not supported because determining the user's home directory reliably across platforms is complex.

**Workaround**: Copy user-level styles to project-level if you need tool restrictions.

### No Partial Wildcards

Tool names must match exactly. You cannot use wildcards like `Bash(git:*)` - you must specify `Bash` to allow/deny all Bash commands.

### Subagent Bypass

Since subagents are unrestricted, a malicious or confused main agent could potentially spawn a subagent to perform blocked operations. This is intentional - subagents need tool access to do their work.

### Tool Input Validation

This plugin only checks tool **names**, not tool **inputs**. It cannot block specific commands like "Bash with rm" while allowing "Bash with git".

## Testing

### Manual Test

1. Create a restrictive output style:
   ```yaml
   ---
   tools:
     - Read
   ---
   ```

2. Activate it in settings.json

3. Try to use Write tool - should be blocked

4. Spawn a Task agent - the agent should be able to Write

### Automated Test

```typescript
import { handler } from './enforce-output-style-tools.ts';

const input = {
  hook_event_name: 'PreToolUse',
  session_id: 'test',
  transcript_path: '/path/to/transcript.jsonl',
  cwd: '/project',
  permission_mode: 'default',
  tool_use_id: 'test-123',
  tool_name: 'Write',
  tool_input: {},
};

const result = await handler(input);
console.log(result.hookSpecificOutput?.permission); // 'deny'
```

## Troubleshooting

### Tools Not Being Blocked

1. Check that plugin is enabled in settings.json
2. Verify output style has `tools` array in frontmatter
3. Ensure tool names match exactly (case-sensitive)
4. Check debug logs to see what's being evaluated

### All Tools Blocked

1. Verify frontmatter YAML syntax is valid
2. Check that output style file exists in `.claude/output-styles/`
3. Ensure `tools` array is not empty

### Subagents Also Blocked

This should never happen - file a bug report if you see this. The hook explicitly skips subagents.

## Future Enhancements

- User-level output styles support
- Wildcard/pattern matching for tool names
- Tool input validation (e.g., allow only specific Bash commands)
- Multiple tool whitelists per style (e.g., different lists for different permission modes)
- Integration with IAM policies

## See Also

- **Skill**: `.claude/skills/claude-output-styles/SKILL.md` - Output styles documentation
- **Utility**: `shared/hooks/utils/was-tool-event-main-agent.ts` - Agent detection
- **Plugin**: `code-context` - Uses similar frontmatter pattern
