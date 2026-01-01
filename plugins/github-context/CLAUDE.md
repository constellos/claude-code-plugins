---
title: GitHub Context Plugin
description: GitHub integration with branch context, commit enhancement, issue synchronization, and PR orchestration
version: 0.1.2
tags: [github, git, commit, branch, issue, pr, pull-request, ci, workflow, actions]
folder:
  subfolders:
    allowed: [.claude-plugin, hooks, shared, .github-workflows]
    required: [.claude-plugin, hooks]
  files:
    allowed: [CLAUDE.md, README.md, .gitignore]
    required: [README.md]
---

# GitHub Context Plugin

## Quick Reference

**Purpose**: Unified GitHub integration that provides branch context discovery, automatic commit enhancement with task metadata, plan-to-issue synchronization, and PR readiness checks with progressive blocking.

**When to use**:
- GitHub-integrated development workflows
- Issue-driven development with automatic branch linking
- Automated task documentation through enhanced commits
- PR readiness validation before ending sessions
- Multi-agent workflows with automatic commit creation

## Hook Summary

| Hook | Event | Blocking | Purpose |
|------|-------|----------|---------|
| add-branch-context | SessionStart | No | Displays linked GitHub issue, branch sync status, and outstanding issues |
| install-review-workflows | SessionStart | No | Copies GitHub Actions workflows to `.github/workflows/` |
| guide-requirements-check | UserPromptSubmit | No | Adds requirement analysis guidance to user prompts |
| sync-plan-to-issue | PostToolUse[Write\|Edit] | No | Creates GitHub issues from plan files automatically |
| enhance-commit-message | PostToolUse[Bash] | No | Enhances git commits with task context and issue references |
| commit-task | SubagentStop | No | Auto-commits subagent work with rich metadata and git trailers |
| commit-session-check-for-pr | Stop | Yes | Auto-commits changes, validates branch status, progressive PR blocking |

## Key Features

### Branch Context Discovery
Shows full GitHub issue content linked to current branch via cascading discovery: state file (`.claude/logs/plan-issues.json`), GitHub search, or issue body markers.

### Commit Enhancement
Enriches git commits with context for both main agent (issue links) and subagents (task prompts). Supports future CI review integration via GitHub Actions.

### Issue Orchestration
Automatically creates GitHub issues from plan files, maintains issue-branch associations, and prevents duplicates via state tracking.

### PR Readiness & Progressive Blocking
Validates branch status (conflicts, sync), auto-commits uncommitted changes, and implements progressive blocking (3 attempts) to encourage PR creation or progress documentation via GitHub comments.

### Auto-commit Workflow
Commits subagent work automatically with git trailers: Agent-Type, Agent-ID, Files-Edited, Files-New, Files-Deleted. Only stages files modified by the specific agent.

## State Files

### session-stops.json

**Location**: `.claude/logs/session-stops.json`
**Purpose**: Tracks Stop hook state for progressive blocking (0-3 attempts)

```json
{
  "session-id-1": {
    "sessionId": "session-id-1",
    "blockCount": 1,
    "commentPosted": false,
    "lastBlockTimestamp": "2025-01-01T00:00:00Z",
    "issueNumber": 42,
    "prCreated": false
  }
}
```

**Lifecycle**: Increments `blockCount` on each auto-commit, resets when PR is created or GitHub comment posted.

### plan-issues.json

**Location**: `.claude/logs/plan-issues.json`
**Purpose**: Tracks plan-to-issue associations for automatic linking

```json
{
  "session-id-1": {
    "planPath": "/path/to/plan.md",
    "issueNumber": 42,
    "issueUrl": "https://github.com/owner/repo/issues/42",
    "branch": "feature-branch",
    "createdAt": "2025-01-01T00:00:00Z",
    "lastUpdated": "2025-01-01T00:00:00Z"
  }
}
```

### task-calls.json

**Location**: `.claude/logs/task-calls.json`
**Purpose**: Stores task prompts for SubagentStop hooks to enhance commit messages

```json
{
  "tool-use-id-1": {
    "toolUseId": "toolu_123",
    "agentType": "Plan",
    "sessionId": "session-id-1",
    "timestamp": "2025-01-01T00:00:00Z",
    "prompt": "Design the authentication flow"
  }
}
```

## Installation

```bash
claude plugin install github-context@constellos
```

Add to `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "github-context@constellos": true
  }
}
```

## Debug Logging

```bash
DEBUG=* claude                           # All hooks
DEBUG=add-branch-context claude          # Branch context hook
DEBUG=enhance-commit-message claude      # Commit enhancement hook
DEBUG=commit-session-check-for-pr claude # Stop hook
```

Logs written to `.claude/logs/hook-events.json` (JSONL format).

## See Also

- [Full Documentation](./README.md) - Comprehensive plugin guide with examples
- [Marketplace](../../CLAUDE.md) - All available plugins and architecture
- [Shared Utilities](./shared/CLAUDE.md) - Shared hook utilities library
