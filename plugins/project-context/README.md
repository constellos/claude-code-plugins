![Version](https://img.shields.io/badge/version-0.1.1-blue?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)
![Markdown](https://img.shields.io/badge/Markdown-000000?style=for-the-badge&logo=markdown)

# Project Context Plugin

> Context discovery, structure validation, and rule-based checks for Claude Code projects

## Purpose

Provides automatic context discovery and project structure validation. Discovers CLAUDE.md documentation when reading files, validates .claude directory structure, enforces plan scoping, redirects to markdown documentation URLs, and runs rule-based checks (lint, typecheck, vitest) on file edits.

## Contents

### Hooks

| Hook | Event | Purpose |
|------|-------|---------|
| encourage-context-review | UserPromptSubmit | Encourages updating CLAUDE.md files |
| log-task-call | PreToolUse[Task] | Saves task context for SubagentStop |
| validate-folder-structure-write | PreToolUse[Write\|Edit] | Validates .claude directory structure |
| validate-rules-file | PreToolUse[Write\|Edit] | Validates rule frontmatter |
| validate-folder-structure-mkdir | PreToolUse[Bash] | Validates mkdir for .claude dirs |
| try-markdown-page | PreToolUse[WebFetch] | Redirects to .md versions of docs |
| log-task-result | PostToolUse[Task] | Logs task results |
| run-rule-checks | PostToolUse[Write\|Edit] | Runs checks from rule frontmatter |
| add-folder-context | PostToolUse[Read] | Discovers CLAUDE.md context |

### Skills

| Skill | Purpose |
|-------|---------|
| feature-sliced-design | FSD architecture for Next.js apps with custom 'views' layer |

## Installation

```bash
claude plugin install project-context@constellos
```

## License

MIT © constellos
