![Version](https://img.shields.io/badge/version-0.1.2-blue?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)
![GitHub](https://img.shields.io/badge/GitHub-CLI-black?style=for-the-badge&logo=github)

# GitHub Orchestration Plugin

> GitHub workflow orchestration with branch context, commit enhancement, and CI management

## Purpose

Provides comprehensive GitHub integration for Claude Code sessions. Automatically discovers linked issues for the current branch, enhances commits with task context, syncs plans to GitHub issues, and manages CI status at session end with progressive blocking to encourage PR creation.

## Contents

### Hooks

| Hook | Event | Purpose |
|------|-------|---------|
| install-github | SessionStart | Installs GitHub CLI on remote environments |
| add-github-context | SessionStart | Displays linked issue, branch sync status, outstanding issues |
| create-issue-on-prompt | UserPromptSubmit | Creates GitHub issue on first user prompt |
| sync-plan-to-issue | PostToolUse[Write\|Edit] | Creates/updates GitHub issues from plan files |
| sync-task-to-subissue | PostToolUse[Task] | Creates GitHub subissues from Task prompts (excludes Plan/Explore) |
| enhance-commit-context | PostToolUse[Bash] | Enriches git commits with task context |
| await-pr-status | PostToolUse[Bash] | Waits for CI after `gh pr create` |
| commit-task-await-ci-status | SubagentStop | Auto-commits subagent work, waits for CI |
| commit-session-await-ci-status | Stop | Auto-commits session, reports CI status (blocking) |

## Installation

```bash
claude plugin install github-orchestration@constellos
```

## License

MIT © constellos
