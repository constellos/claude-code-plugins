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

Comprehensive GitHub workflow orchestration with skills for issues, branches, PRs, subissues, stacked PRs, and CI management.

## Hook Summary

| Hook | Event | Blocking | Purpose |
|------|-------|----------|---------|
| install-github | SessionStart | No | Installs GitHub CLI on remote |
| add-github-context | SessionStart | No | Shows linked issue, sync status |
| create-issue-on-prompt | UserPromptSubmit | No | Creates issue on first prompt |
| sync-plan-to-issue | PostToolUse[Write\|Edit] | No | Syncs plans to GitHub issues |
| sync-task-to-subissue | PostToolUse[Task] | No | Creates subissues from Task prompts |
| enhance-commit-context | PostToolUse[Bash] | No | Enriches commits with context |
| await-pr-status | PostToolUse[Bash] | No | Waits for CI after PR create |
| commit-task-await-ci-status | SubagentStop | No | Auto-commits agent work |
| commit-session-await-ci-status | Stop | Yes | Auto-commits, waits for CI |

## Skills

| Skill | Purpose |
|-------|---------|
| issue-management | Create, update, label, and link issues with templates |
| branch-orchestration | Smart branch naming, lifecycle management |
| subissue-orchestration | Hierarchical issues with auto-updated checklists |
| stacked-pr-management | Dependent PR chains for large features |
| ci-orchestration | CI/CD monitoring with fail-fast patterns |
| pr-workflow | PR lifecycle with auto-generated descriptions |

## Agents

| Agent | Purpose |
|-------|---------|
| github-orchestrator | Coordinates complex multi-step workflows |

## Installation

```bash
claude plugin install github-orchestration@constellos
```

## See Also

- [README.md](./README.md)
- [Marketplace](../../CLAUDE.md)
