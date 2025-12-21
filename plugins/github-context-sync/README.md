---
title: GitHub Context Sync Plugin
description: GitHub context synchronization hooks for branch awareness and UI review workflow
folder:
  subfolders:
    allowed: [.claude-plugin, hooks]
    required: [.claude-plugin, hooks]
  files:
    allowed: [CLAUDE.md, README.md, .gitignore]
    required: [CLAUDE.md]
---

# github-context-sync Plugin

GitHub context synchronization hooks for branch awareness and UI review workflow encouragement.

## Overview

This plugin provides GitHub-aware context at session start and encourages proper UI review workflow after UI development agents complete their work.

## Hooks

### SessionStart - Branch Context and Sync Status

**File**: `hooks/fetch-branch-context.ts`
**Event**: `SessionStart`
**Matcher**: None (runs on every session start)

**What it does**:
- Displays full content of linked GitHub issue for current branch
- Shows branch sync status with remote tracking branch (informational)
- Shows branch sync status with origin/main (informational)
- Lists outstanding open issues not linked to any branch
- Non-blocking (errors don't stop session)

**Issue Discovery**:
Cascading search strategy to find linked issues:
1. `.claude/logs/plan-issues.json` state file (primary source)
2. GitHub search by branch name (fallback)
3. Issue body `**Branch:** \`name\`` markers (last resort)

**Branch Sync Status**:
- **Remote sync**: Compares local branch with remote tracking branch
  - `✅ Up to date with remote`
  - `⚠️ X commits behind remote`
  - `ℹ️ X commits ahead of remote (unpushed)`
  - `⚠️ X behind, Y ahead of remote (diverged)`
- **Main sync**: Compares current branch with origin/main
  - `✅ In sync with origin/main`
  - `ℹ️ X commits behind origin/main`
  - `ℹ️ X commits ahead of origin/main`
  - `ℹ️ X behind, Y ahead of origin/main`

**Output Format**:
```markdown
## Current Branch Work

**Branch:** `feature-ui-update`

📊 **Sync Status:**
- Remote: ✅ Up to date with remote
- Main: ℹ️ 2 commits behind, 5 commits ahead of origin/main

**Issue:** #42 - Add user profile page

### Issue Description
[Full issue body content]

### Comments
[All issue comments if any]

---

## Outstanding Issues (Not Linked to Branches)

- #45: Fix navigation bug
- #47: Update documentation
- #48: Improve performance

💡 These issues are available for work. Create a branch to link one.
```

### PostToolUse[Task] - UI Review Encouragement

**File**: `hooks/encourage-ui-review.ts`
**Event**: `PostToolUse[Task]`
**Matcher**: `Task` tool use

**What it does**:
- Detects when ui-developer agent completes
- Encourages main agent to invoke ui-reviewer for visual inspection
- Suggests starting dev server if not running
- Provides validation checklist against agent/skill documentation

**Behavior**:
- **Agent detection**: Parses task result for `"subagent_type": "ui-developer"`
- **Non-blocking**: Uses `systemMessage` (informational only)
- **Only triggers for**: ui-developer agent completions
- **Encouragement message**: Provides actionable next steps

**Output**:
```markdown
🎨 UI Development Complete

The ui-developer agent has finished implementing UI changes.

📋 Recommended Next Steps:

1. **Start dev server** (if not running):
   bun run dev

2. **Invoke ui-reviewer agent** to visually inspect changes:
   "Review the UI changes at http://localhost:3000/[route]"

3. **Validate against**:
   - ui-developer agent principles (mobile-first, compound components, Server Components)
   - Skill documentation (ui-wireframing, ui-design, ui-interaction, ui-integration, ai-sdk-ui)
   - Wireframe files in src/views/*/WIREFRAME.md

4. **Check responsive behavior** at:
   - Mobile (375px)
   - Tablet (768px)
   - Desktop (1920px)

5. **Verify**:
   - Component composition follows compound components pattern
   - Proper use of 'use client' directive (pushed deep)
   - Zod validation on client and server
   - Accessibility (color contrast, semantic HTML)
```

---

## Debug Logging

Enable debug output for hooks:

```bash
DEBUG=* claude                         # All debug output
DEBUG=fetch-branch-context claude      # Branch context hook only
DEBUG=encourage-ui-review claude       # UI review hook only
```

Logs are written to `.claude/logs/hook-events.json` in JSONL format.

---

## Requirements

- Git repository (local or remote)
- GitHub CLI (`gh`) authenticated (`gh auth login`)
- Network access to GitHub API

---

## Configuration

This plugin is referenced in `.claude-plugin/marketplace.json`:

```json
{
  "name": "github-context-sync",
  "version": "0.2.0",
  "description": "GitHub context and state synchronization with branch sync status",
  "source": "./plugins/github-context-sync",
  "strict": false
}
```

Install with:
```bash
claude plugin install github-context-sync@constellos
```

---

## Integration with Other Plugins

This plugin complements:
- **github-vercel-supabase-ci**: CI-based UI review on PRs (automated)
- **github-review-sync**: Plan-to-issue synchronization and commit validation
- **nextjs-supabase-ai-sdk-dev**: Development quality checks

### UI Review Workflow

**Local Development** (this plugin):
1. ui-developer agent completes UI changes
2. encourage-ui-review hook suggests next steps
3. User invokes ui-reviewer agent for visual inspection
4. User validates against wireframes and skill docs

**CI/CD** (github-vercel-supabase-ci plugin):
1. PR created with UI changes
2. Vercel deploys preview URLs
3. ui-review.yml workflow triggers on PR
4. Playwright captures screenshots
5. Claude reviews screenshots via API
6. Blocks PR if critical issues found
