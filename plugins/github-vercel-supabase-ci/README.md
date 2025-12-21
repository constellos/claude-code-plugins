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

### 4. SubagentStop - Check UI Review Status

**File**: `hooks/check-ui-review-status.ts`
**Event**: `SubagentStop`
**Matcher**: None (runs when any subagent completes)

**What it does**:
- Checks if the subagent created a git commit (via Agent-ID trailer)
- Looks up the UI Review GitHub Actions workflow status for that commit
- Blocks subagent completion if critical UI issues are found
- Prevents merging code with failing UI reviews

**Behavior**:
- Searches recent git log for commits with the agent's ID
- Queries GitHub workflow runs for the UI Review workflow
- If workflow hasn't run yet: Non-blocking warning
- If workflow is pending: Non-blocking warning with status check command
- If workflow passed: Success message
- If workflow failed: **BLOCKING** with error details and artifact download commands

**Output**:
- No commit: Empty (agent didn't create a commit)
- Pending: Additional context with workflow status
- Success: Additional context with success message
- Failure: **Blocking decision** with critical issues message and fix instructions

**Workflow Integration**:
- Works with `.github-workflows/ui-review.yml` GitHub Actions workflow
- Ensures UI quality is maintained across all agent-generated changes

---

### 5. PostToolUse[Bash] - Await PR CI Checks

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

## UI Review Workflow

### Overview

The UI Review workflow (`ui-review.yml`) provides automated UI quality checks using Playwright and Claude's vision capabilities.

**Location**: `.github-workflows/ui-review.yml`

**Triggers**:
- All commit pushes (with Agent-ID in commit message)
- All pull requests

### Workflow Steps

1. **Wait for Vercel Preview Deployments**
   - Polls GitHub PR comments for Vercel bot URLs (10 minute timeout)
   - Detects preview URLs for all deployed Turborepo apps
   - Supports multiple apps: web, admin, docs

2. **Run Playwright E2E Tests**
   - Installs Playwright browsers in CI
   - Runs tests tagged with `@app` or `@web` only (isolated tests)
   - Screenshots are automatically captured during test execution at key moments
   - Screenshots saved to `.claude/screenshots/` with naming: `{app}-{test}-{screenshot}.png`

3. **Review UI with Claude**
   - Groups screenshots by app and test
   - For each test, calls Claude API with vision (claude-sonnet-4-5)
   - Loads ui-reviewer agent instructions from `shared/agents/ui-reviewer.md`
   - Reviews all screenshots for that test in a single API call
   - Returns structured JSON: `{critical, major, minor, summary}`
   - Aggregates results across all tests

4. **Post Review to PR**
   - Generates markdown review report
   - Posts as PR comment with issue counts and summaries
   - Uploads screenshots as artifacts (7-day retention)
   - Uploads review report as artifact

5. **Block on Critical Issues**
   - If any critical issues found: **Workflow fails** (exit 1)
   - SubagentStop hook detects failure and blocks agent completion
   - Developer must fix issues before proceeding

### Screenshot Storage

Screenshots are organized by app and test:
```
.claude/screenshots/
├── app-auth-login-mobile.png
├── app-auth-login-desktop.png
├── web-dashboard-home-mobile.png
└── web-dashboard-home-desktop.png
```

Naming format: `{app}-{test}-{screenshot}.png`

### Review Criteria

Claude reviews screenshots for:
- **Critical**: Visual bugs, broken layouts, accessibility violations
- **Major**: Inconsistent design, poor responsive behavior
- **Minor**: Styling improvements, polish opportunities

### Integration with SubagentStop Hook

The `check-ui-review-status.ts` hook:
1. Detects agent commits via Agent-ID trailer
2. Queries GitHub workflow status for UI Review
3. **Blocks agent completion** if critical issues found
4. Provides error context and artifact download commands

This ensures agents cannot complete work with critical UI issues.

---

## Debug Logging

Enable debug output for hooks:

```bash
DEBUG=* claude                          # All debug output
DEBUG=setup-environment claude          # Environment setup hook
DEBUG=install-workflows claude          # GitHub Actions workflows hook
DEBUG=vercel-env-setup claude           # Vercel environment sync hook
DEBUG=check-ui-review-status claude     # UI review status check hook
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
