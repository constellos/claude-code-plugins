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

The Code Context plugin provides four main capabilities:

1. **Context Discovery** - Automatically finds and links related CLAUDE.md documentation when reading files
2. **Markdown Preference** - Redirects WebFetch to markdown versions of documentation when available for better AI parsing
3. **Structure Validation** - Validates .claude directory structure and ensures proper project organization
4. **Plan-Based Path Scoping** - Enforces file operation boundaries based on plan frontmatter to manage context and separate concerns

This plugin helps Claude access markdown-friendly documentation, understand project structure, maintain consistent organization, and work within defined scope boundaries.

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

### PreToolUse[WebFetch] - Markdown URL Preference

**File:** `hooks/try-markdown-page.ts`

**Event:** PreToolUse (WebFetch operations)

**What it does:**
Automatically redirects WebFetch requests to markdown versions of documentation pages when available. This provides better AI-friendly content by preferring raw markdown over HTML pages.

**URL transformation strategies:**
1. **GitHub documentation** - Converts `github.com/owner/repo/blob/branch/path` to `raw.githubusercontent.com/owner/repo/branch/path.md`
2. **HTML pages** - Tries changing `.html` extension to `.md`
3. **Documentation sites** - Attempts appending `.md` to paths without extensions

**How it works:**
1. Intercepts WebFetch tool calls before execution
2. Generates candidate markdown URLs based on the original URL
3. Uses `curl` with HEAD requests to check if markdown versions exist (5 second timeout)
4. If found, modifies the WebFetch URL to fetch the markdown version
5. Provides additional context showing the redirect: `📝 Found markdown version: redirecting from [original] to [markdown]`

**Example:**
```
Original URL: https://github.com/vercel/next.js/blob/canary/docs/app/guide.html
Redirected to: https://raw.githubusercontent.com/vercel/next.js/canary/docs/app/guide.md
```

**Non-blocking:** Yes - failures gracefully fall back to original URL

---

### PostToolUse[Write|Edit] - Plan Symlink Creation

**File:** `hooks/create-plan-symlink.ts`

**Event:** PostToolUse (Write/Edit to plan files)

**What it does:**
When a plan file is written to `.claude/plans/*.md`, this hook creates or updates a `PLAN.md` symlink in the project root pointing to the active plan. This allows other hooks to easily access the current plan without maintaining external state.

**Behavior:**
1. Detects writes to `.claude/plans/*.md`
2. Removes existing `PLAN.md` symlink (if present)
3. Creates new symlink: `${cwd}/PLAN.md` → plan file path

**Non-blocking:** Yes - failures don't prevent Write operations

---

### PostToolUse[Write|Edit|Read] - Plan Path Scoping

**File:** `shared/hooks/enforce-plan-scoping.ts`

**Event:** PostToolUse (Write, Edit, or Read operations)

**What it does:**
Enforces file operation boundaries based on plan frontmatter. Separates main agent and subagent scopes to manage context and prevent accidental bloat.

**Plan frontmatter schema:**
```yaml
---
paths:
  main-agent:
    allowedPaths: ["plugins/**", "shared/**", "*.md", ".claude/**"]
    forbiddenPaths: ["node_modules/**", "dist/**"]
  subagents:
    allowedPaths: ["**/*.ts", "**/*.md", "tests/**"]
    forbiddenPaths: ["src/components/**", "src/lib/**"]
---
```

**Behavior:**
1. Reads `PLAN.md` symlink to access active plan
2. Parses `paths` frontmatter for main-agent and subagents scopes
3. Determines agent context using `wasToolEventMainAgent()`
4. Validates file path against appropriate scope:
   - **Forbidden patterns** - Block if path matches any forbidden pattern
   - **Allowed patterns** - If specified, path must match at least one
5. For **Write/Edit**: Denies operations outside allowed scope (blocking)
6. For **Read**: Returns non-blocking warning if outside scope

**Pattern matching:**
- Supports `*` (glob - matches any characters)
- Supports `?` (single character)
- Forbidden patterns take precedence over allowed

**Agent-specific messages:**
- **Main agent denied**: "Write denied. Main agent scope is restricted by plan. Use Plan agent to update scope or delegate to subagents."
- **Subagent denied**: "Write denied. Subagent scope is restricted by plan. Have main agent handle this area or update plan."
- **Read warning**: Non-blocking guidance to stay within plan boundaries

**Blocking:** Yes for Write/Edit, No for Read

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

Enable debug output for specific hooks:

```bash
# Context discovery
DEBUG=add-folder-context claude

# Markdown URL redirection
DEBUG=try-markdown-page claude

# Plan scoping
DEBUG=enforce-plan-scoping,create-plan-symlink claude

# All hooks
DEBUG=* claude
```

Debug output logs:
- Files being read/written
- CLAUDE.md files discovered
- WebFetch URL transformations and redirects
- Markdown URL availability checks
- Plan symlink creation
- Path validation results
- Agent context detection

## Use Cases

**Context Discovery:**
- Automatically discover relevant documentation when exploring code
- Navigate project structure via CLAUDE.md breadcrumbs
- Understand folder purpose and organization
- Find related documentation without explicit searching

**Markdown Preference:**
- Get AI-friendly markdown content instead of HTML pages
- Access GitHub documentation in raw markdown format
- Better parsing and understanding of technical documentation
- Reduced processing overhead for documentation fetching
- Seamless fallback to original URLs when markdown unavailable

**Structure Validation:**
- Prevent creation of invalid .claude directory structures
- Ensure consistent project organization
- Validate rule file structure and metadata
- Maintain documentation standards

**Plan-Based Path Scoping:**
- Manage context by restricting main agent and subagent file operations
- Give Plan agent control over workspace boundaries
- Isolate context-expensive areas to focused subagents
- Prevent accidental context bloat from broad file access
- Guide agents to stay within their designated scope

## Plugin Structure

```
plugins/enhanced-context/
├── .claude-plugin/
│   └── plugin.json                     # Plugin metadata
├── hooks/
│   ├── hooks.json                      # Hook configuration
│   ├── add-folder-context.ts          # Context discovery hook
│   ├── try-markdown-page.ts           # Markdown URL preference hook
│   ├── create-plan-symlink.ts         # Plan symlink creation hook
│   └── encourage-context-review.ts    # Context review guidance hook
├── shared/                             # Bundled shared utilities (for distribution)
│   └── hooks/
│       ├── enforce-plan-scoping.ts    # Plan path scoping hook
│       ├── validate-folder-structure-write.ts
│       ├── validate-rules-file.ts
│       └── ... (other shared hooks)
└── README.md                           # This file
```

## Related Documentation

- [Plugin Development Guide](.claude/skills/claude-plugins/SKILL.md)
- [Hook Development Guide](.claude/skills/claude-hooks/SKILL.md)
- [Shared Utilities](../../shared/CLAUDE.md)
