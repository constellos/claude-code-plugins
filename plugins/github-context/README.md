![Version](https://img.shields.io/badge/version-0.1.2-blue?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=for-the-badge&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?style=for-the-badge&logo=typescript)
![GitHub](https://img.shields.io/badge/GitHub-CLI-black?style=for-the-badge&logo=github)
![Git](https://img.shields.io/badge/Git-F05032?style=for-the-badge&logo=git&logoColor=white)

# 🔌 GitHub Context Plugin

> Unified GitHub integration with branch context discovery, commit enhancement, issue synchronization, and PR readiness orchestration

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Installation](#-installation)
- [Hooks](#-hooks)
- [Configuration](#-configuration)
- [Use Cases](#-use-cases)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [See Also](#-see-also)
- [License](#-license)

---

## 🎯 Overview

The GitHub Context plugin consolidates functionality from the previous `github-context-sync` and `github-claude-review-actions` plugins into a single, cohesive system for managing GitHub workflows in Claude Code projects.

This plugin provides comprehensive GitHub integration including CLI installation verification, branch/issue context discovery, automatic commit enhancement with task metadata, plan-to-issue synchronization, and PR status monitoring with progressive blocking to encourage proper workflow completion.

---

## ✨ Features

### Branch Context & Issue Discovery
- **SessionStart Hook**: Displays linked GitHub issue for current branch with full content
- **Branch Sync Status**: Shows sync status with remote tracking branch and origin/main
- **Outstanding Issues**: Lists unlinked issues available for work
- **Cascading Discovery**: Finds issue links via state file, GitHub search, or issue body markers

### Commit Enhancement
- **Subagent Commits**: Automatically appends task prompt to commit message body
- **Main Agent Commits**: Links commits to GitHub issues and plans
- **CI Review Integration**: (Future) Triggers automated commit review workflows

### Issue Orchestration
- **Plan-to-Issue Sync**: Automatically creates GitHub issues from plan files
- **State Tracking**: Maintains issue-branch associations in `.claude/logs/plan-issues.json`
- **Auto-linking**: Associates issues with current branch automatically

### PR Readiness & Progressive Blocking
- **Conflict Detection**: Checks for merge conflicts before session end
- **Sync Validation**: Ensures branch is up-to-date with remote
- **Blocking Checks**: Prevents session end if critical issues exist
- **Progressive Blocking**: Encourages PR creation or progress documentation (3 attempts)

### Development Workflow
- **Auto-commit**: Commits subagent work with rich metadata and git trailers
- **Requirement Analysis**: Adds systematic requirement checking to user prompts

---

## 📦 Installation

```bash
claude plugin install github-context@constellos
```

---

## 🪝 Hooks

### SessionStart - add-branch-context.ts

**File:** `hooks/add-branch-context.ts`
**Blocking:** No

Displays branch context at session start including current branch name, branch sync status (remote and origin/main), linked GitHub issue with full content and comments, and outstanding unlinked issues.

**Issue Discovery Strategy:**
1. `.claude/logs/plan-issues.json` state file (primary)
2. GitHub search by branch name (fallback)
3. Issue body `**Branch:** \`name\`` markers (last resort)

<details>
<summary>📝 Example Output</summary>

```
## Current Branch Work

**Branch:** `feature-add-auth`

📊 **Sync Status:**
- Remote: ✅ Up to date with remote
- Main: ⚠️ 3 commits ahead of origin/main

**Issue:** #42 - Add authentication system

Description from issue...

💡 These issues are available for work. Create a branch to link one.
```
</details>

---

### SessionStart - install-review-workflows.ts

**File:** `hooks/install-review-workflows.ts`
**Blocking:** No

Copies GitHub Actions workflows to `.github/workflows/` directory. Currently installs `review-commit.yml` workflow (placeholder for future CI review integration).

---

### UserPromptSubmit - guide-requirements-check.ts

**File:** `hooks/guide-requirements-check.ts`
**Blocking:** No

Adds requirement analysis guidance to every user prompt, instructing Claude to list all explicit and implicit requirements, consider plan updates, and note success criteria.

---

### PostToolUse[Write|Edit] - sync-plan-to-issue.ts

**File:** `hooks/sync-plan-to-issue.ts`
**Blocking:** No

Creates GitHub issues from plan files automatically. When a plan file is created or modified, this hook creates a corresponding GitHub issue, adds an issue link to the plan file, associates the issue with the current branch, and stores state in `.claude/logs/plan-issues.json`. Prevents duplicate issues via state tracking.

<details>
<summary>📝 State File Schema</summary>

**Location:** `.claude/logs/plan-issues.json`

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
</details>

---

### PostToolUse[Bash] - enhance-commit-message.ts

**File:** `hooks/enhance-commit-message.ts`
**Blocking:** No (future: can be blocking for CI review)

Enhances git commits with context for both main agent and subagent commits.

**For subagent commits:**
- Loads task prompt from `.claude/logs/task-calls.json`
- Appends prompt to commit message body:
  ```
  ---
  ## Prompt
  {original_task_prompt}
  ```

**For main agent commits:**
- Links to GitHub issue from `plan-issues.json`
- Adds issue context for review

**Future CI Review Integration:**
- Triggers GitHub Actions review workflow
- Polls for review comment
- Returns blocking decision if review fails

---

### SubagentStop - commit-task.ts

**File:** `hooks/commit-task.ts`
**Blocking:** No

Auto-commits agent work with comprehensive metadata. Creates commits with a commit message describing changes, task prompt in commit body, and git trailers (Agent-Type, Agent-ID, Files-Edited, Files-New, Files-Deleted). Only stages files modified by the specific agent.

<details>
<summary>📝 Example Commit</summary>

```
Add user authentication endpoints

---
## Prompt
Create REST API endpoints for user authentication including login, logout,
and token refresh functionality.

Agent-Type: code-architect
Agent-ID: a1b2c3d
Files-Edited: src/api/auth.ts, src/middleware/auth.ts
Files-New: tests/auth.test.ts
Files-Deleted: none
```
</details>

---

### Stop - commit-session-check-for-pr.ts

**File:** `hooks/commit-session-check-for-pr.ts`
**Blocking:** Yes (for validation errors and agent communication)

Auto-commits changes, validates branch status, and implements progressive blocking for PR creation.

**Phase 1: Blocking validation checks**
- Merge conflicts detection
- Branch sync status (behind remote)
- Claude settings validation (via `claude doctor`)
- Hook file existence checks

**Phase 2: Auto-commit**
- Automatically commits uncommitted changes
- Adds session metadata to commit message
- Increments block count for progressive blocking

**Phase 3: Agent communication**

Progressive blocking behavior (3 attempts) to encourage PR creation or progress documentation:

1. **First block**: Shows agent instructions to create PR or document progress
2. **Second block**: Shows attempt counter (2/3)
3. **Third block**: Warning that limit has been reached

**Reset conditions:**
- PR is created → state resets, shows PR status
- GitHub comment posted with session ID marker → state resets, allows session end

**Phase 4: PR status reporting**
- Shows PR details, CI status, and Vercel preview URLs
- Detects subagent activity to skip instructions when appropriate

<details>
<summary>📝 Session State Schema</summary>

**Location:** `.claude/logs/session-stops.json`

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

**Lifecycle:**
- Increments `blockCount` on each auto-commit
- Resets when PR is created or comment is posted
- Persists across session restarts
</details>

---

## ⚙️ Configuration

Add to `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "github-context@constellos": true
  }
}
```

**GitHub CLI Authentication:**

Ensure GitHub CLI is authenticated:

```bash
gh auth status
gh auth login  # If not authenticated
```

---

## 💡 Use Cases

| Use Case | Description | Benefit |
|----------|-------------|---------|
| Issue-driven development | Auto-discovers and displays linked GitHub issues | Context awareness without manual lookup |
| Multi-agent workflows | Auto-commits subagent work with task metadata | Complete audit trail of agent contributions |
| PR readiness validation | Validates branch status before session end | Prevents merge conflicts and sync issues |
| Automated documentation | Creates GitHub issues from plan files | Maintains issue tracker without manual entry |
| Progress tracking | Progressive blocking encourages PR creation | Ensures work is properly documented and reviewed |

---

## 🐛 Troubleshooting

<details>
<summary>Hooks not firing</summary>

1. Check plugin cache: `~/.claude/plugins/cache/constellos/github-context/`
2. Verify hooks.json format
3. Reinstall plugin to refresh cache:
   ```bash
   claude plugin uninstall github-context@constellos
   claude plugin install github-context@constellos
   ```
4. Restart Claude Code session
</details>

<details>
<summary>Branch context not showing</summary>

1. Verify you're in a git repository:
   ```bash
   git rev-parse --is-inside-work-tree
   ```
2. Check GitHub CLI authentication:
   ```bash
   gh auth status
   ```
3. Ensure issue is linked via state file or issue body marker:
   - Check `.claude/logs/plan-issues.json`
   - Or add `**Branch:** \`branch-name\`` to issue body
</details>

<details>
<summary>Commits not enhanced</summary>

1. Check that enhance-commit-message hook is registered
2. Verify task-calls.json exists for subagent commits:
   ```bash
   cat .claude/logs/task-calls.json
   ```
3. Enable debug logging:
   ```bash
   DEBUG=enhance-commit-message claude
   ```
</details>

<details>
<summary>Progressive blocking not working</summary>

1. Check session state file:
   ```bash
   cat .claude/logs/session-stops.json
   ```
2. Verify session ID matches current session
3. Try creating a PR or posting a GitHub comment with session ID marker:
   ```markdown
   <!-- claude-session: your-session-id -->
   Progress update...
   ```
</details>

<details>
<summary>Hooks not reflecting latest changes</summary>

**Problem:** Plugin cache is stale (e.g., await-pr-checks hook missing, or old Stop hooks still running)

**Cause:** Plugins are cached at `~/.claude/plugins/cache/` and not automatically updated when source code changes

**Solution:**

1. **Using worktrees (recommended):** `claude-worktree.sh` auto-refreshes cache
   ```bash
   bash claude-worktree.sh
   ```

2. **Manual refresh:**
   ```bash
   claude plugin uninstall --scope project github-context@constellos
   claude plugin install --scope project github-context@constellos
   ```

3. **Verify cache:**
   ```bash
   # Check await-pr-checks hook exists (added in PR #71)
   ls ~/.claude/plugins/cache/constellos/github-context/hooks/await-pr-checks.ts

   # Compare cached vs source
   diff ~/.claude/plugins/cache/constellos/github-context/hooks/hooks.json \
        ./plugins/github-context/hooks/hooks.json
   ```

**Cache location:** `~/.claude/plugins/cache/constellos/github-context/`
</details>

---

## 🤝 Contributing

When modifying hooks:

1. Update hook implementation in `hooks/`
2. Run type checking: `npm run typecheck`
3. Run linting: `npm run lint`
4. Test hooks manually with `DEBUG=* claude`
5. Update this README
6. Update [CLAUDE.md](./CLAUDE.md) quick reference
7. Reinstall plugin to refresh cache

---

## 📚 See Also

- [CLAUDE.md](./CLAUDE.md) - Quick reference for AI context
- [Marketplace](../../CLAUDE.md) - All available plugins and architecture
- [Shared Utilities](./shared/CLAUDE.md) - Shared hook utilities library
- [GitHub Actions Workflows](./.github-workflows/) - Workflow definitions

---

## 📄 License

MIT © constellos

<details>
<summary>📖 Migration from Previous Plugins</summary>

This plugin replaces:
- `github-context-sync` - Branch context and issue sync
- `github-claude-review-actions` - GitHub Actions workflows

### Breaking Changes

1. **Hook renames**:
   - `fetch-branch-context.ts` → `add-branch-context.ts`

2. **Removed hooks**:
   - `check-documentation.ts` - Removed
   - `review-commit.ts` - Removed (replaced by enhance-commit-message.ts)
   - `encourage-ui-review.ts` - Moved to nextjs-supabase-ai-sdk-dev plugin

3. **Removed workflows**:
   - `validate-task.yml` - Removed
   - `review-documentation.yml` - Removed

### Migration Steps

1. Uninstall old plugins:
   ```bash
   claude plugin uninstall github-context-sync@constellos
   claude plugin uninstall github-claude-review-actions@constellos
   ```

2. Install new plugin:
   ```bash
   claude plugin install github-context@constellos
   ```

3. Update `.claude/settings.json`:
   ```json
   {
     "enabledPlugins": {
       "github-context@constellos": true
     }
   }
   ```

4. Restart Claude Code session
</details>
