---
title: Project Context Plugin
description: Context discovery, structure validation, and plan scoping for Claude Code projects
version: 0.1.1
tags: [context, claude, documentation, folder, structure, rules, plan, markdown, validation]
folder:
  subfolders:
    allowed: [.claude-plugin, hooks, shared]
    required: [.claude-plugin, hooks]
  files:
    allowed: [CLAUDE.md, README.md, .gitignore]
    required: [README.md]
---

# Project Context Plugin

## Quick Reference

**Purpose**: Automatically discovers and links CLAUDE.md documentation, validates .claude directory structure, and provides intelligent URL redirection to prefer markdown documentation.

**When to use**:
- Large codebases requiring organized documentation structure
- Projects with .claude directory structures (agents, skills, rules, hooks)
- Documentation-heavy projects with markdown-friendly docs
- Teams enforcing consistent project organization standards

## Hook Summary

| Hook | Event | Blocking | Purpose |
|------|-------|----------|---------|
| encourage-context-review | UserPromptSubmit | No | Encourages updating plans, agents, skills, CLAUDE.md based on prompts |
| log-task-call | PreToolUse[Task] | No | Logs Task tool calls and saves context for SubagentStop hooks |
| validate-folder-structure-write | PreToolUse[Write\|Edit] | Yes | Validates .claude directory structure when creating files |
| validate-rules-file | PreToolUse[Write\|Edit] | Yes | Validates rule file structure and Required Skills frontmatter |
| validate-folder-structure-mkdir | PreToolUse[Bash] | Yes | Validates mkdir commands for .claude directories |
| try-markdown-page | PreToolUse[WebFetch] | No | Redirects WebFetch to markdown versions of documentation |
| log-task-result | PostToolUse[Task] | No | Logs Task tool results after agent completion |
| create-plan-symlink | PostToolUse[Write\|Edit] | No | Creates PLAN.md symlink when plan files are written |
| run-rule-checks | PostToolUse[Write\|Edit] | Yes | Runs checks from rule frontmatter (lint, typecheck, vitest) on matching files |
| add-folder-context | PostToolUse[Read] | No | Discovers and adds CLAUDE.md context when reading files |

## Skills

| Skill | Description | When to Use |
|-------|-------------|-------------|
| feature-sliced-design | Feature-Sliced Design architecture for Next.js apps with custom 'views' layer naming | Implementing FSD methodology, organizing project structure, Turborepo monorepos |

## Key Features

### Feature-Sliced Design Skill
Comprehensive skill for implementing Feature-Sliced Design (FSD) architecture in Next.js applications. Uses custom 'views' layer naming to avoid conflicts with Next.js App Router. Covers all 7 FSD layers, import rules, Turborepo integration, and migration strategies.

### Context Discovery
Automatically finds and links related CLAUDE.md documentation files when reading project files. Search strategy: project root, parent directories (walking up), and child directories (one level deep).

### Markdown Preference
Redirects WebFetch to markdown versions of documentation when available. Prefers `.md` file URLs over HTML for better AI parsing and offline access.

### Structure Validation
Validates .claude directory structure ensuring proper organization for agents, skills, rules, and hooks. Blocks operations that would create invalid folder hierarchies.

### Rules Validation
Ensures rule files have proper structure with "Required Skills:" heading and valid frontmatter. Integrates with existing validation hooks.

### Rule-Based Checks
Runs checks (lint, typecheck, vitest) defined in `.claude/rules/*.md` frontmatter on files matching the rule's glob patterns. Blocking on failure with 500 char truncated output to prevent context bloat.

## Installation

```bash
claude plugin install project-context@constellos
```

Add to `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "project-context@constellos": true
  }
}
```

## Debug Logging

```bash
DEBUG=* claude                           # All hooks
DEBUG=encourage-context-review claude    # Context encouragement
DEBUG=add-folder-context claude          # Context discovery
DEBUG=validate-folder-structure claude   # Structure validation
DEBUG=try-markdown-page claude           # Markdown preference
```

Logs written to `.claude/logs/hook-events.json` (JSONL format).

## See Also

- [Full Documentation](./README.md) - Comprehensive plugin guide with hook details
- [Marketplace](../../CLAUDE.md) - All available plugins and architecture
- [Shared Utilities](./shared/CLAUDE.md) - Shared validation hooks
