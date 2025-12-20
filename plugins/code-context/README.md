---
title: Code Context Plugin
description: Code structure mapping, navigation aids, and context discovery for Claude Code
folder:
  subfolders:
    allowed: [.claude-plugin, hooks, shared]
    required: [.claude-plugin, hooks]
  files:
    allowed: [CLAUDE.md, README.md, .gitignore]
    required: [README.md]
---

# Code Context Plugin

Automatic context discovery and project structure validation for Claude Code projects.

## Overview

The Code Context plugin provides two main capabilities:

1. **Context Discovery** - Automatically finds and links related CLAUDE.md documentation when reading files
2. **Structure Validation** - Validates .claude directory structure and ensures proper project organization

This plugin helps Claude understand project structure and maintain consistent documentation organization.

## Hooks

### PostToolUse[Read] - Context Discovery

**File:** `hooks/add-folder-context.ts`

**Event:** PostToolUse (Read operations)

**What it does:**
When a file is read, this hook automatically discovers related CLAUDE.md documentation files and provides them as clickable links in the additional context.

**Search strategy:**
1. Project root - checks for `/CLAUDE.md`
2. Parent directories - walks up from read file to project root
3. Child directories - scans one level deep in the file's directory

**Output format:**
```
Related context:
[/project/CLAUDE.md](file:///project/CLAUDE.md)
[/project/src/CLAUDE.md](file:///project/src/CLAUDE.md)
[/project/src/api/CLAUDE.md](file:///project/src/api/CLAUDE.md)
```

**Non-blocking:** Yes - failures don't prevent Read operations

---

### PreToolUse[Task] - Task Call Logging

**File:** `shared/hooks/log-task-call.ts`

**Event:** PreToolUse (Task tool calls)

**What it does:**
Saves Task tool call metadata to `.claude/logs/task-calls.json` for later retrieval in SubagentStop hooks. Enables tracking what tasks were requested and correlating with agent execution results.

**Saved context:**
- Tool use ID
- Agent type
- Session ID
- Task prompt
- Timestamp

**Non-blocking:** Yes - always allows Task execution

---

### PostToolUse[Task] - Task Result Logging

**File:** `shared/hooks/log-task-result.ts`

**Event:** PostToolUse (Task tool completions)

**What it does:**
Logs Task tool results after agent completion. Captures agent output and context for analysis.

**Non-blocking:** Yes

---

### PreToolUse[Write|Edit] - Folder Structure Validation (Write)

**File:** `shared/hooks/validate-folder-structure-write.ts`

**Event:** PreToolUse (Write operations)

**What it does:**
Validates folder structure when creating files in `.claude/` directories. Ensures proper organization for:
- `.claude/agents/` - Agent definitions
- `.claude/hooks/` - Hook implementations
- `.claude/skills/` - Skill definitions
- `.claude/rules/` - Rule files

**Blocking:** Yes - denies Write operations that would create invalid structure

---

### PreToolUse[Write|Edit] - Rules File Validation

**File:** `shared/hooks/validate-rules-file.ts`

**Event:** PreToolUse (Write/Edit operations on rule files)

**What it does:**
Validates rule file structure and frontmatter in `.claude/rules/*.md` files. Ensures:
- Valid YAML frontmatter
- Required "Required Skills" metadata field
- Proper file structure

**Blocking:** Yes - denies operations creating invalid rule files

---

### PreToolUse[Bash] - Folder Structure Validation (mkdir)

**File:** `shared/hooks/validate-folder-structure-mkdir.ts`

**Event:** PreToolUse (Bash mkdir commands)

**What it does:**
Validates `mkdir` commands that create directories in `.claude/`. Prevents creation of invalid or non-standard directory structures.

**Blocking:** Yes - denies mkdir commands for invalid directory names

---

## Installation

This plugin is part of the claude-code-plugins marketplace:

```bash
# Add the marketplace
claude plugin marketplace add ./

# Install the plugin
claude plugin install code-context@constellos
```

Or enable in `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "code-context@constellos": true
  }
}
```

## Configuration

No configuration required. The plugin works automatically when installed.

## Debug Logging

Enable debug output for context discovery:

```bash
DEBUG=add-folder-context claude
```

This will log:
- Files being read
- CLAUDE.md files discovered
- Search paths checked
- Context provided to Claude

## Use Cases

**Context Discovery:**
- Automatically discover relevant documentation when exploring code
- Navigate project structure via CLAUDE.md breadcrumbs
- Understand folder purpose and organization
- Find related documentation without explicit searching

**Structure Validation:**
- Prevent creation of invalid .claude directory structures
- Ensure consistent project organization
- Validate rule file structure and metadata
- Maintain documentation standards

## Plugin Structure

```
plugins/code-context/
├── .claude-plugin/
│   └── plugin.json          # Plugin metadata
├── hooks/
│   ├── hooks.json           # Hook configuration
│   └── add-folder-context.ts # Context discovery hook
├── shared/                  # Bundled shared utilities (for distribution)
└── README.md               # This file
```

## Related Documentation

- [Plugin Development Guide](.claude/skills/claude-plugins/SKILL.md)
- [Hook Development Guide](.claude/skills/claude-hooks/SKILL.md)
- [Shared Utilities](../../shared/CLAUDE.md)
