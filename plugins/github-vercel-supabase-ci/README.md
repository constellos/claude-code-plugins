---
title: GitHub Vercel Supabase CI Plugin
description: CI/CD automation plugin for GitHub, Vercel, and Supabase projects
folder:
  subfolders:
    allowed: [.claude-plugin, hooks]
    required: [.claude-plugin, hooks]
  files:
    allowed: [CLAUDE.md, README.md, .gitignore]
    required: [CLAUDE.md]
---

# github-vercel-supabase-ci Plugin

CI/CD automation plugin for GitHub, Vercel, and Supabase projects.

## Overview

This plugin provides automated CI/CD workflow hooks for projects using GitHub, Vercel, and Supabase. It automates common development tasks like syncing with main branch, waiting for CI checks, and creating commits from agent work.

## Hooks

### 1. SessionStart - Setup Development Environment

**File**: `hooks/setup-environment.ts`
**Event**: `SessionStart`
**Matcher**: None (runs on every session start, before other hooks)

**What it does**:
- Detects whether running in remote (cloud) or local environment
- In remote: Installs required CLI tools (gh, vercel, docker, supabase)
- In local: Verifies tools are installed and reports status
- Starts Docker daemon if not running (both environments)
- Starts Supabase local development if configured (both environments)
- Detects package manager (npm/yarn/pnpm/bun) and installs dependencies

**Behavior**:
- **Remote environment** (CLAUDE_CODE_REMOTE=true):
  - Installs Vercel CLI via npm
  - Installs Supabase CLI via APT repository
  - Attempts to install GitHub CLI (may fail due to network restrictions)
  - Attempts to install Docker (may fail in containerized environments)
  - Gracefully handles installation failures

- **Local environment**:
  - Verifies tools are installed
  - Reports missing tools without attempting installation
  - Continues with available tools

- **Both environments**:
  - Starts Docker daemon if available but not running
  - Starts Supabase if configured (checks for supabase/config.toml)
  - Detects package manager from lockfiles
  - Installs project dependencies if node_modules missing

**Output**: Detailed report of tool installation, service startup, and dependency installation status.

---

### 2. SessionStart - Auto-sync with Main Branch

**File**: `hooks/pull-latest-main.ts`
**Event**: `SessionStart`
**Matcher**: None (runs on every session start)

**What it does**:
- Automatically fetches latest changes from origin
- Merges origin/main (or origin/master as fallback) into current branch
- Handles merge conflicts gracefully by aborting the merge
- Provides context about sync status to Claude

**Behavior**:
- Skips if not in a git repository
- Skips if no main/master branch exists on origin
- Aborts merge and notifies on conflicts
- Reports success with merge status

**Output**: Additional context message describing the sync result.

---

### 3. PostToolUse[Bash] - Await PR CI Checks

**File**: `hooks/await-pr-checks.ts`
**Event**: `PostToolUse`
**Matcher**: `Bash` (only runs after Bash tool use)

**What it does**:
- Detects when `gh pr create` or `hub pull-request` commands are run
- Extracts PR URL from command output
- Waits for CI checks to complete using `gh pr checks --watch`
- Reports results and blocks on failure

**Behavior**:
- Only triggers on PR creation commands
- 10-minute timeout for CI checks
- Blocks with detailed error context if CI fails
- Blocks if PR URL cannot be extracted
- Provides instructions for manual check viewing

**Output**:
- Success: Additional context with PR URL and success message
- Failure: Blocking decision with error details and manual check commands

---

### 4. SubagentStop - Auto-commit Agent Work

**File**: `hooks/commit-task.ts`
**Event**: `SubagentStop`
**Matcher**: None (runs when any subagent completes)

**What it does**:
- Automatically creates a git commit when a subagent completes work
- Reads agent's transcript to extract final message
- Formats commit message with agent type prefix
- Stages all changes and commits them

**Behavior**:
- Skips if not in a git repository
- Skips if no changes to commit
- Extracts agent type from transcript (falls back to "agent")
- Formats commit message: `[agent-type] Commit title`
- Includes multi-line body if agent message is long
- Non-blocking (errors are logged but don't stop execution)

**Requirements**: Claude Code 2.0.42+ (for `agent_transcript_path` field)

**Output**: Empty (no additional context, non-blocking)

---

## Subagent Logging

For subagent execution tracking and file operation logging, install the **logging** plugin:

```bash
/plugin install logging@claude-code-kit-local
```

The logging plugin provides:
- SubagentStart hook - Tracks agent context when subagents begin
- SubagentStop hook - Logs file operations when subagents complete

See `plugins/logging/CLAUDE.md` for details.

---

## Debug Logging

Enable debug output for hooks:

```bash
DEBUG=* claude                          # All debug output
DEBUG=setup-environment claude          # Environment setup hook
DEBUG=pull-latest-main claude           # Sync main branch hook
DEBUG=await-pr-checks claude            # PR checks hook
DEBUG=commit-task claude                # Commit task hook
DEBUG=subagent claude                   # Shared subagent hooks
```

## Requirements

- Node.js (for TypeScript hook runner and package installations)
- Git repository (for pull-latest-main and commit-task hooks)

**Optional tools** (auto-installed in remote environments):
- GitHub CLI (`gh`) for PR hooks
- Vercel CLI for deployment workflows
- Docker for Supabase local development
- Supabase CLI for local database development

**Version requirements**:
- Claude Code 2.0.42+ for commit-task hook (requires `agent_transcript_path`)

## Configuration

This plugin is referenced in `.claude-plugin/marketplace.json`:

```json
{
  "name": "github-vercel-supabase-ci",
  "source": "../plugins/github-vercel-supabase-ci",
  "strict": false
}
```

Install with:
```bash
/plugin install github-vercel-supabase-ci@claude-code-kit-local
```
