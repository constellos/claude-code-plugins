# GitHub Review Sync Plugin

Git workflow automation and quality checks for Claude Code.

## Overview

This plugin provides automated workflows for:
- Plan-to-issue synchronization
- Requirements checking on every user prompt
- Auto-commit for subagent work
- Documentation update recommendations
- Code review triggers on commits
- Branch status validation on session end

## Hooks

### UserPromptSubmit

**`guide-requirements-check.ts`**
- Adds guidance to Claude on every user prompt to list requirements precisely and consider plan updates
- Ensures thorough requirement analysis before implementation

### PostToolUse[Write|Edit]

**`sync-plan-to-issue.ts`**
- Automatically creates/updates GitHub issues from plan files
- Detects plan file edits and syncs content to GitHub
- Tracks state to prevent duplicates

### PostToolUse[Bash]

**`review-commit.ts`**
- Triggers code review guidance after git commits
- Detects subagent vs manual commits
- Provides context-aware review recommendations

### SessionEnd

**`check-branch-status.ts`**
- Validates branch status for conflicts and sync issues
- Checks for uncommitted changes, untracked files, and unpushed commits
- Blocks session end if issues detected

### SubagentStop

**`commit-task.ts`**
- Auto-commits agent work with task context
- Creates commits with only files edited by the specific agent
- Includes task prompt and metadata as git trailers

**`check-documentation.ts`**
- Analyzes agent file operations and suggests documentation updates
- Provides non-blocking recommendations for CLAUDE.md files, agents, and skills that may need updates

## Installation

```bash
claude plugin install github-review-sync@constellos
```

## Requirements

- Git repository
- GitHub CLI (`gh`) for plan-to-issue sync
- Node.js for hook execution

## Configuration

Enable in `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "github-review-sync@constellos": true
  }
}
```
