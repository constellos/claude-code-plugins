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

### 2. SessionStart - Install GitHub Actions Workflows

**File**: `hooks/install-workflows.ts`
**Event**: `SessionStart`
**Matcher**: None (runs on every session start, after setup-environment)

**What it does**:
- Installs GitHub Actions workflow files for automated CI/CD
- Sets up workflows for testing, deployment, and quality checks
- Ensures consistent CI configuration across team

**Behavior**:
- Copies workflow templates to `.github/workflows/`
- Skips if workflows already exist
- Non-blocking (continues even if installation fails)

**Output**: Additional context message about workflow installation status.

---

### 3. SessionStart - Vercel Environment Setup

**File**: `hooks/vercel-env-setup.ts`
**Event**: `SessionStart`
**Matcher**: None (runs on every session start, after install-workflows)

**What it does**:
- Syncs Vercel environment variables from your project to local `.env.local`
- Ensures worktrees have the same environment configuration as main repo
- Critical for isolated Claude Code worktree sessions

**Behavior**:
- Checks if `.vercel/` directory exists
- If exists, runs `vercel env pull --yes` to download environment variables
- Skips gracefully if Vercel is not configured
- Non-blocking (continues even if env pull fails)

**Output**: Additional context message about environment sync status.

**Requirements**: Vercel CLI installed (auto-installed by setup-environment hook)

---

### 4. PostToolUse[Bash] - Await PR CI Checks

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

## Debug Logging

Enable debug output for hooks:

```bash
DEBUG=* claude                          # All debug output
DEBUG=setup-environment claude          # Environment setup hook
DEBUG=install-workflows claude          # GitHub Actions workflows hook
DEBUG=vercel-env-setup claude           # Vercel environment sync hook
DEBUG=await-pr-checks claude            # PR checks hook
```

## Requirements

- Node.js (for TypeScript hook runner and package installations)
- Git repository (for pull-latest-main and commit-task hooks)

**Optional tools** (auto-installed in remote environments):
- GitHub CLI (`gh`) for PR hooks
- Vercel CLI for deployment workflows and environment sync
- Docker for Supabase local development
- Supabase CLI for local database development

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
claude plugin install github-vercel-supabase-ci@constellos
```

## Usage with claude-worktree

This plugin is designed to work seamlessly with the `claude-worktree.sh` script for isolated worktree sessions:

1. **Worktree creation**: Use `claude-worktree` to create an isolated git worktree
2. **Environment sync**: The `vercel-env-setup` hook automatically syncs Vercel environment variables
3. **CI checks**: The `await-pr-checks` hook watches PR CI when you create pull requests

See the main README for `claude-worktree.sh` setup instructions.
