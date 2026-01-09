---
name: Subissue Orchestration
description: Use this skill when the user wants to "create subissue", "break down issue", "split into tasks", "track subtasks", or manage hierarchical GitHub issues. Creates subissues with parent linking and auto-updates checklist in parent issue body.
version: 0.1.0
---

# Subissue Orchestration

Hierarchical issue management with parent-child linking and automated checklist synchronization.

## Purpose

Subissue Orchestration enables breaking down large epics or features into smaller, trackable tasks. Automatically maintains a checklist in the parent issue body that syncs with subissue states.

## When to Use

- Breaking down epics into implementation tasks
- Creating subtasks from a task list
- Tracking progress with automated checklists
- Managing complex feature development with multiple developers

## Core Capabilities

### Subissue Creation

Create child issues with parent references:

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

# Add to parent checklist
gh issue view $PARENT --json body -q .body | \
  sed "s|## Subtasks|## Subtasks\n\n- [ ] #$SUBISSUE $TITLE|" | \
  gh issue edit $PARENT --body-file -
```

### Checklist Management

**Utilities:**
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

## Best Practices

1. Use "## Subtasks" heading for checklists
2. Link subissues with "**Parent Issue:** #N" in body
3. Sync checklist when subissues close
4. Use consistent labeling (epic → task hierarchy)
5. Keep subissues focused and atomic
