# github-vercel-supabase-ci Plugin

CI/CD automation plugin for GitHub, Vercel, and Supabase projects.

## Overview

This plugin provides automated CI/CD workflow hooks for projects using GitHub, Vercel, and Supabase. It automates common development tasks like syncing with main branch, waiting for CI checks, and creating commits from agent work.

## Hooks

### 1. SessionStart - Auto-sync with Main Branch

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

### 2. PostToolUse[Bash] - Await PR CI Checks

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

### 3. SubagentStop - Auto-commit Agent Work

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

### 4. SubagentStart - Track Agent Context (Shared)

**File**: `shared/hooks/log-subagent-start.ts`
**Event**: `SubagentStart`
**Matcher**: None (runs when any subagent starts)

**What it does**:
- Saves agent context when subagent begins execution
- Stores agent ID, type, prompt, and toolUseId to `.claude/logs/subagent-tasks.json`
- Context is retrieved later by SubagentStop hooks

**Behavior**:
- Saves to `.claude/logs/subagent-tasks.json` in project root
- Non-blocking on errors

**Output**: Empty hookSpecificOutput

---

### 5. SubagentStop - Log Agent File Operations (Shared)

**File**: `shared/hooks/log-subagent-stop.ts`
**Event**: `SubagentStop`
**Matcher**: None (runs when any subagent completes)

**What it does**:
- Analyzes agent transcript when subagent completes
- Logs agent type, prompt, and file operations to console (if DEBUG enabled)
- Reports files created, edited, and deleted
- Cleans up saved context from SubagentStart

**Behavior**:
- Parses agent transcript JSONL file
- Extracts Write/Edit/Bash tool calls
- Categorizes file operations
- Outputs detailed log with DEBUG=* or DEBUG=subagent
- Non-blocking on errors

**Output**: Empty (logging only, no additional context)

---

## Debug Logging

Enable debug output for hooks:

```bash
DEBUG=* claude                          # All debug output
DEBUG=pull-latest-main claude           # Specific hook
DEBUG=await-pr-checks claude            # Specific hook
DEBUG=commit-task claude                # Specific hook
DEBUG=subagent claude                   # Shared subagent hooks
```

## Requirements

- Node.js (for TypeScript hook runner)
- Git repository
- GitHub CLI (`gh`) for PR hooks
- Claude Code 2.0.42+ for commit-task hook

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
