# GitHub Review Sync Plugin

Git workflow automation and quality checks for Claude Code.

## Overview

This plugin provides automated workflows for:
- Plan-to-issue synchronization
- Requirements checking on every user prompt
- Auto-commit for subagent work
- Documentation update recommendations
- Code review triggers on commits
- Branch status validation on session end

## Hooks

### UserPromptSubmit

**`guide-requirements-check.ts`**
- Adds guidance to Claude on every user prompt to list requirements precisely and consider plan updates
- Ensures thorough requirement analysis before implementation

### PostToolUse[Write|Edit]

**`sync-plan-to-issue.ts`**
- Automatically creates/updates GitHub issues from plan files
- Detects plan file edits and syncs content to GitHub
- Tracks state to prevent duplicates

### PostToolUse[Bash]

**`review-commit.ts`**
- Triggers code review guidance after git commits
- Detects subagent vs manual commits
- Provides context-aware review recommendations

### SessionEnd - PR Readiness Check

**File:** `hooks/check-pr-readiness.ts`
**Event:** Stop (SessionEnd)
**What it does:** Validates branch status and encourages PR creation when ready
**Type:** Mixed (blocking for critical issues, non-blocking for PR encouragement)

**Checks performed:**
1. **Claude Code health** - Blocks if `claude doctor` reports issues
2. **Hook files** - Blocks if registered hooks point to missing files
3. **Merge conflicts** - Blocks if unresolved conflicts exist
4. **Branch sync** - Blocks if branch is behind remote
5. **PR readiness** - Non-blocking reminder if ready for PR

**Behavior:**
- **BLOCKING** (prevents session end):
  - Claude Code settings issues detected (via `claude doctor`)
  - Missing hook files (broken plugin installations)
  - Merge conflicts detected in working directory
  - Branch is behind remote (needs pull/rebase)
- **NON-BLOCKING REMINDER** (allows session end):
  - Branch has unpushed commits
  - No PR exists for current branch
  - No conflicts and synced with remote
  - Provides `gh pr create` command for convenience
- **SILENT** (no message):
  - No commits to push (all work is pushed)
  - PR already exists for branch
  - On main/master/develop branch
  - GitHub CLI not available or not authenticated

**Example outputs:**

*Blocking (settings issues):*
```
🚨 Claude Code Settings Issues Detected:

⚠️  Invalid plugin configuration in .claude/settings.json
⚠️  Missing required environment variable: ANTHROPIC_API_KEY

Please fix these settings issues before ending the session:
  • Run: claude doctor
  • Review and fix reported issues
  • Check .claude/settings.json for configuration errors
```

*Blocking (missing hooks):*
```
🚨 Missing Hook Files Detected:

⚠️  3 hook file(s) are missing:
  - github-context-sync@constellos: hooks/sync-plan-to-issue.ts
  - nextjs-supabase-ai-sdk-dev@constellos: hooks/lint-file.ts
  - .claude/hooks: custom-validation.ts

Please fix these hook issues before ending the session:
  • Reinstall affected plugins: claude plugin install <plugin-name>
  • Or remove broken plugins from .claude/settings.json
  • Check plugin cache: ~/.claude/plugins/cache/
```

*Blocking (conflicts):*
```
🚨 Merge Conflicts Detected:

⚠️  3 file(s) have unresolved conflicts:
  - src/components/Header.tsx
  - src/utils/api.ts
  - README.md

Please resolve these conflicts before ending the session:
  • Open conflicted files and resolve markers (<<<<<<, ======, >>>>>>)
  • Stage resolved files: git add <file>
  • Or use: git mergetool
```

*Non-blocking (ready for PR):*
```
✓ Branch is ready for pull request!

📋 **Branch:** `feature/add-authentication`
📊 **Status:** 5 commits ahead of origin/main

🚀 **Ready to create PR:**
   gh pr create --fill

Or create PR with custom title and body:
   gh pr create --title "Your PR title" --body "Description"

*This is a reminder, not a requirement. Create a PR when you're ready!*
```

### SubagentStop

**`commit-task.ts`**
- Auto-commits agent work with task context
- Creates commits with only files edited by the specific agent
- Includes task prompt and metadata as git trailers

**`check-documentation.ts`**
- Analyzes agent file operations and suggests documentation updates
- Provides non-blocking recommendations for CLAUDE.md files, agents, and skills that may need updates

## Installation

```bash
claude plugin install github-review-sync@constellos
```

## Requirements

- Git repository
- GitHub CLI (`gh`) for plan-to-issue sync
- Node.js for hook execution

## Configuration

Enable in `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "github-review-sync@constellos": true
  }
}
```
