---
title: GitHub Context Plugin
description: GitHub integration with branch context, commit enhancement, and CI orchestration
version: 0.1.2
folder:
  subfolders:
    allowed: [.claude-plugin, hooks, shared]
    required: [.claude-plugin, hooks]
  files:
    allowed: [CLAUDE.md, README.md, .gitignore]
    required: [README.md]
---

# GitHub Orchestration Plugin

GitHub workflow orchestration for Claude Code sessions with branch context discovery, commit enhancement, and CI status management.

## Hook Summary

| Hook | Event | Blocking | Purpose |
|------|-------|----------|---------|
| install-github | SessionStart | No | Installs GitHub CLI on remote |
| add-github-context | SessionStart | No | Shows linked issue, sync status |
| create-issue-on-prompt | UserPromptSubmit | No | Creates issue on first prompt |
| sync-plan-to-issue | PostToolUse[Write\|Edit] | No | Syncs plans to issues with version comments |
| sync-issue-to-plan | PostToolUse[Bash] | No | Syncs gh issue edit back to plan file |
| sync-task-to-subissue | PostToolUse[Task] | No | Creates subissues from Task prompts |
| enhance-commit-context | PostToolUse[Bash] | No | Enriches commits with context |
| await-pr-status | PostToolUse[Bash] | No | Waits for CI after PR create |
| post-explore-findings | SubagentStop | No | Posts Explore agent findings as comments |
| commit-task-await-ci-status | SubagentStop | No | Auto-commits agent work |
| commit-session-await-ci-status | Stop | Yes | Auto-commits, waits for CI |

## Installation

```bash
claude plugin install github-orchestration@constellos
```

## See Also

- [README.md](./README.md)
- [Marketplace](../../CLAUDE.md)
