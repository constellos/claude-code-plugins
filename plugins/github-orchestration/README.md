# GitHub Orchestration Plugin

Unified GitHub integration plugin that consolidates branch context, commit enhancement, issue synchronization, and review workflows.

## Overview

The GitHub Orchestration plugin combines functionality from the previous `github-context-sync` and `github-claude-review-actions` plugins into a single, cohesive system for managing GitHub workflows in Claude Code projects.

## Features

### Branch Context & Issue Discovery
- **SessionStart Hook**: Displays linked GitHub issue for current branch with full content
- **Branch Sync Status**: Shows sync status with remote tracking branch and origin/main
- **Outstanding Issues**: Lists unlinked issues available for work
- **Cascading Discovery**: Finds issue links via state file, GitHub search, or issue body markers

### Commit Enhancement
- **Subagent Commits**: Automatically appends task prompt to commit message
- **Main Agent Commits**: Links commits to GitHub issues/plans
- **CI Review Integration**: (Future) Triggers automated commit review workflows

### Issue Orchestration
- **Plan-to-Issue Sync**: Automatically creates GitHub issues from plan files
- **State Tracking**: Maintains issue-branch associations in `.claude/logs/plan-issues.json`
- **Auto-linking**: Associates issues with current branch

### PR Readiness
- **Conflict Detection**: Checks for merge conflicts before session end
- **Sync Validation**: Ensures branch is up-to-date with remote
- **Blocking Checks**: Prevents session end if critical issues exist

### Development Workflow
- **Auto-commit**: Commits subagent work with rich metadata and git trailers
- **Requirement Analysis**: Adds systematic requirement checking to user prompts

## Hooks

### SessionStart

#### add-branch-context.ts
**Event**: SessionStart
**Blocking**: No
**What it does**: Displays branch context at session start

Shows:
- Current branch name
- Branch sync status (remote and origin/main)
- Linked GitHub issue (full content with comments)
- Outstanding unlinked issues

**Issue Discovery Strategy**:
1. `.claude/logs/plan-issues.json` state file (primary)
2. GitHub search by branch name (fallback)
3. Issue body `**Branch:** \`name\`` markers (last resort)

#### install-review-workflows.ts
**Event**: SessionStart
**Blocking**: No
**What it does**: Copies GitHub Actions workflows to `.github/workflows/`

Currently installs:
- `review-commit.yml` - Commit review workflow (placeholder)

### UserPromptSubmit

#### guide-requirements-check.ts
**Event**: UserPromptSubmit
**Blocking**: No
**What it does**: Adds requirement analysis guidance

Instructs Claude to:
- List all explicit and implicit requirements
- Consider plan updates
- Note success criteria

### PostToolUse

#### sync-plan-to-issue.ts
**Event**: PostToolUse[Write|Edit]
**Blocking**: No
**What it does**: Creates GitHub issues from plan files

When a plan file is created or modified:
- Creates corresponding GitHub issue
- Adds issue link to plan file
- Associates issue with current branch
- Stores state in `.claude/logs/plan-issues.json`

Prevents duplicate issues via state tracking.

#### enhance-commit-message.ts
**Event**: PostToolUse[Bash]
**Blocking**: No (future: can be blocking)
**What it does**: Enhances git commits with context

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

### SubagentStop

#### commit-task.ts
**Event**: SubagentStop
**Blocking**: No
**What it does**: Auto-commits agent work

Creates commits with:
- Commit message describing changes
- Task prompt in commit body
- Git trailers: Agent-Type, Agent-ID, Files-Edited, Files-New, Files-Deleted

Only stages files modified by the specific agent.

### Stop

#### check-pr-readiness.ts
**Event**: SessionEnd/Stop
**Blocking**: Yes (for critical issues)
**What it does**: Validates branch status before session end

**Blocking checks:**
- Merge conflicts exist
- Branch is behind remote (unpushed changes could be lost)

**Non-blocking suggestions:**
- Create PR when unpushed commits exist
- Silent when no changes or PR already exists

## Installation

```bash
claude plugin install github-orchestration@constellos
```

## Configuration

Add to `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "github-orchestration@constellos": true
  }
}
```

## State Files

### .claude/logs/plan-issues.json

Tracks plan-to-issue associations:

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

### .claude/logs/task-calls.json

Stores task prompts for SubagentStop hooks:

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

## GitHub Actions Workflows

### review-commit.yml

**Trigger**: `repository_dispatch` (from enhance-commit-message hook)

**Inputs**:
- `commit_sha` - Commit to review
- `agent_type` - main | subagent
- `context_type` - issue | plan | prompt
- `context_id` - Issue number or context identifier

**Status**: Placeholder (future implementation)

**Planned functionality:**
- Extract commit metadata
- Load context (issue, plan, or prompt)
- Invoke CI review agent
- Parse decision (BLOCK | APPROVE)
- Post structured comment to commit

## Debug Logging

All hooks support debug logging:

```bash
DEBUG=* claude                           # All hooks
DEBUG=add-branch-context claude          # Specific hook
DEBUG=enhance-commit-message claude      # Commit enhancement
```

Logs are written to `.claude/logs/hook-events.json` in JSONL format.

## Migration from Previous Plugins

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
   claude plugin install github-orchestration@constellos
   ```

3. Update `.claude/settings.json`:
   ```json
   {
     "enabledPlugins": {
       "github-orchestration@constellos": true
     }
   }
   ```

4. Restart Claude Code session

## Troubleshooting

### Hooks not firing

1. Check plugin cache: `~/.claude/plugins/cache/constellos/github-orchestration/`
2. Verify hooks.json format
3. Reinstall plugin to refresh cache
4. Restart Claude Code session

### Branch context not showing

1. Verify you're in a git repository: `git rev-parse --is-inside-work-tree`
2. Check GitHub CLI authentication: `gh auth status`
3. Ensure issue is linked via state file or issue body marker

### Commits not enhanced

1. Check that enhance-commit-message hook is registered
2. Verify task-calls.json exists for subagent commits
3. Enable debug logging: `DEBUG=enhance-commit-message claude`

## Contributing

When modifying hooks:
1. Update hook implementation in `hooks/`
2. Run type checking: `npm run typecheck`
3. Run linting: `npm run lint`
4. Test hooks manually
5. Update this README
6. Reinstall plugin to refresh cache

## See Also

- [CLAUDE.md](../../CLAUDE.md) - Marketplace overview
- [Shared Utilities](./shared/CLAUDE.md) - Shared hook utilities
- [GitHub Actions Workflows](./.github-workflows/) - Workflow definitions
