---
name: Subissue Orchestration
description: Use this skill when the user wants to "create subissue", "break down issue", "split into tasks", "track subtasks", or manage hierarchical GitHub issues. Creates subissues with parent linking using GitHub's native sub-issues API (with markdown fallback).
version: 0.2.0
---

# Subissue Orchestration

Hierarchical issue management using GitHub's native sub-issues API with automatic PR-subissue coordination.

## Purpose

Subissue Orchestration enables breaking down large epics or features into smaller, trackable tasks. Uses GitHub's native sub-issues API (GA 2025) for proper parent-child relationships that appear in GitHub's UI and Projects, with markdown checklist fallback for compatibility.

## Native Sub-Issues (Primary)

GitHub's native sub-issues provide:
- Proper parent-child relationships visible in GitHub UI
- Integration with GitHub Projects (filtering, grouping by parent)
- Up to 100 sub-issues per parent, 8 levels of nesting
- Cross-repository support

The `sync-task-to-subissue` hook automatically links created subissues using the native API.

## When to Use

- Breaking down epics into implementation tasks
- Creating subtasks from a task list
- Tracking progress with automated checklists
- Managing complex feature development with multiple developers

## Core Capabilities

### Native Sub-Issues API

**Utilities from `native-subissues.ts`:**
- `addNativeSubissue(cwd, parentIssue, subissueNumber)` - Link as native sub-issue
- `listNativeSubissues(cwd, parentIssue)` - List native sub-issues
- `removeNativeSubissue(cwd, parentIssue, subissueNumber)` - Unlink sub-issue
- `getParentIssue(cwd, subissueNumber)` - Get parent of a sub-issue
- `isNativeSubissuesAvailable(cwd)` - Check if API is available

### Subissue Creation

Create child issues with native linking:

```bash
PARENT=42
TITLE="Implement OAuth integration"

# Create subissue
SUBISSUE=$(gh issue create \
  --title "$TITLE" \
  --label "task" \
  --body "**Parent Issue:** #$PARENT

Implementation details for OAuth integration..." \
  --json number -q .number)

# Link as native sub-issue (preferred)
SUBISSUE_ID=$(gh api repos/{owner}/{repo}/issues/$SUBISSUE --jq '.id')
gh api repos/{owner}/{repo}/issues/$PARENT/sub_issues -X POST -f sub_issue_id=$SUBISSUE_ID
```

### Checklist Management (Fallback)

For repos without native sub-issues, markdown checklists are still supported.

**Utilities from `subissue-checklist.ts`:**
- `hasNativeSubissues(cwd, parentIssue)` - Check if native sub-issues exist
- `generateChecklistMarkdown(subissues)` - Create checklist from array
- `updateParentIssueChecklist(cwd, parentIssue, subissues)` - Sync checklist
- `addSubissueToChecklist(cwd, parentIssue, subissue)` - Add single item
- `markSubissueComplete(cwd, parentIssue, subissueNumber)` - Check off item
- `syncSubissueStates(cwd, parentIssue, subissueNumbers)` - Sync all states

### Bulk Creation

```bash
# Create multiple subissues from list
PARENT=42
TASKS=("OAuth integration" "Email auth" "Password reset" "2FA support")

for task in "${TASKS[@]}"; do
  gh issue create \
    --title "$task" \
    --label "task" \
    --body "**Parent Issue:** #$PARENT" \
    --json number -q .number
done

# Generate and update parent checklist
syncSubissueStates "$PWD" $PARENT
```

## Examples

### Create Epic with Subtasks

```bash
# Create parent epic
PARENT=$(gh issue create \
  --title "Authentication System" \
  --label "epic" \
  --body "## Subtasks

- [ ] Implement OAuth
- [ ] Implement email auth
- [ ] Add password reset
- [ ] Add 2FA support" \
  --json number -q .number)

# Create subissues
for task in "Implement OAuth" "Implement email auth" "Add password reset" "Add 2FA support"; do
  gh issue create --title "$task" --label "task" --body "**Parent Issue:** #$PARENT"
done
```

### Auto-Sync Checklist

```bash
# Mark subissue as complete
gh issue close 43

# Update parent checklist
markSubissueComplete "$PWD" 42 43
# Changes "- [ ] #43 OAuth integration" to "- [x] #43 OAuth integration"
```

## PR-Subissue Coordination

When using stacked PRs with subagents, PRs automatically include `Closes #X` to close the associated subissue when merged.

**Workflow:**
1. Task tool spawns subagent → `sync-task-to-subissue` creates subissue
2. Subagent makes changes → `stacked-pr-subagent-stop` creates PR
3. PR body includes `Closes #subissueNumber` (looked up from `task-subissues.json`)
4. PR merges → GitHub auto-closes the linked subissue

This provides end-to-end tracking from task → subissue → PR → merge.

## Best Practices

1. Native sub-issues are preferred when available
2. Link subissues with "**Parent Issue:** #N" in body for compatibility
3. Use consistent labeling (epic → task hierarchy)
4. Keep subissues focused and atomic
5. Let stacked PR workflow handle PR-subissue linking automatically
