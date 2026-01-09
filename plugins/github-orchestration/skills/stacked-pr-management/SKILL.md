---
name: Stacked PR Management
description: Use this skill when the user wants to "create stacked PR", "stack PRs", "dependent PR", "rebase stack", "merge stack", or manage PR dependencies. Handles stacked PR workflows for large features split across multiple dependent pull requests.
version: 0.1.0
---

# Stacked PR Management

Manage dependent PR workflows (stacked PRs) for large features requiring multiple review iterations.

## Purpose

Stacked PR Management enables creating chains of dependent PRs where each PR builds on the previous one. Useful for large features that need incremental review or when working on multiple related changes simultaneously.

## When to Use

- Breaking large features into reviewable chunks
- Working on dependent changes in parallel
- Iterating on features while earlier PRs are in review
- Maintaining clean commit history across multiple PRs

## Core Capabilities

### Stack Creation

```bash
# Create PR chain
BASE="main"
BRANCHES=("42-feature/base" "43-feature/middleware" "44-feature/ui")

for i in "${!BRANCHES[@]}"; do
  BRANCH="${BRANCHES[$i]}"
  NEXT_BASE=$([[ $i -eq 0 ]] && echo "$BASE" || echo "${BRANCHES[$i-1]}")

  # Create PR with base as previous branch
  PR_NUM=$(gh pr create \
    --base "$NEXT_BASE" \
    --head "$BRANCH" \
    --title "Feature part $((i+1))" \
    --body "**Stack:** Part $((i+1)) of ${#BRANCHES[@]}

$([ $i -gt 0 ] && echo "**Base PR:** Search previous PR")" \
    --json number -q .number)

  # Save to stack
  addPRToStack "$PWD" "{\"pr\": $PR_NUM, \"branch\": \"$BRANCH\", \"base\": \"$NEXT_BASE\", \"children\": []}"
done
```

### Stack Visualization

```bash
visualizeStack "$(loadPRStack "$PWD")"
# Output:
# main
# └── #42 feat/base
#     └── #43 feat/middleware
#         └── #44 feat/ui
```

### Stack Rebase

```bash
# When base PR merges, rebase stack
BASE_PR=42
DEPENDENTS=$(findDependentPRs "$(loadPRStack "$PWD")" $BASE_PR)

for pr in $DEPENDENTS; do
  BRANCH=$(gh pr view $pr --json headRefName -q .headRefName)
  git checkout "$BRANCH"
  git rebase main
  git push --force-with-lease
done
```

## Utilities

- `savePRStack(cwd, stack)` - Save stack state
- `loadPRStack(cwd)` - Load stack state
- `addPRToStack(cwd, node)` - Add PR to stack
- `removePRFromStack(cwd, prNumber)` - Remove from stack
- `visualizeStack(stack)` - ASCII tree visualization
- `validateStackOrder(stack)` - Check for circular dependencies
- `getMergeOrder(stack)` - Get bottom-up merge order
- `findDependentPRs(stack, prNumber)` - Find all descendants

## Examples

### Create 3-PR Stack

```bash
# Feature split across 3 PRs
git checkout main
git checkout -b 1-feature/database
# ... make changes ...
git push -u origin 1-feature/database

gh pr create --base main --head 1-feature/database --title "Part 1: Database schema"

git checkout -b 2-feature/api 1-feature/database
# ... make changes ...
git push -u origin 2-feature/api

gh pr create --base 1-feature/database --head 2-feature/api --title "Part 2: API endpoints"

git checkout -b 3-feature/ui 2-feature/api
# ... make changes ...
git push -u origin 3-feature/ui

gh pr create --base 2-feature/api --head 3-feature/ui --title "Part 3: UI components"
```

### Merge Stack in Order

```bash
STACK=$(loadPRStack "$PWD")
MERGE_ORDER=$(getMergeOrder "$STACK")

for pr in $MERGE_ORDER; do
  # Wait for CI
  gh pr checks $pr --watch

  # Merge
  gh pr merge $pr --squash --delete-branch

  # Update base of dependent PRs
  DEPENDENTS=$(findDependentPRs "$STACK" $pr)
  for dep in $DEPENDENTS; do
    gh pr edit $dep --base main
  done
done
```

## Best Practices

1. Keep PRs small and focused
2. Update PR descriptions with stack context
3. Merge bottom-up (base PR first)
4. Rebase dependent PRs when base changes
5. Use --force-with-lease, never --force
6. Validate stack with `validateStackOrder()` before merge
