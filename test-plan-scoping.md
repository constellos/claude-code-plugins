---
paths:
  main-agent:
    allowedPaths: ["plugins/**", "shared/**", "*.md", ".claude/**", "test-*.md"]
    forbiddenPaths: ["node_modules/**", "dist/**", ".git/**"]
  subagents:
    allowedPaths: ["**/*.ts", "**/*.tsx", "**/*.test.ts", "**/*.md"]
    forbiddenPaths: ["plugins/github-vercel-supabase-ci/**", "plugins/github-context-sync/**"]
---

# Test Plan: Plan-Based Path Scoping

## Intent

Test the plan-based path scoping feature in the enhanced-context plugin.

## Scope Definition

### Main Agent Scope

**Allowed paths:**
- `plugins/**` - All plugin directories
- `shared/**` - Shared utilities
- `*.md` - Markdown files in root
- `.claude/**` - Claude configuration
- `test-*.md` - Test plan files

**Forbidden paths:**
- `node_modules/**` - Dependencies
- `dist/**` - Build output
- `.git/**` - Git internals

### Subagent Scope

**Allowed paths:**
- `**/*.ts` - TypeScript files anywhere
- `**/*.tsx` - TypeScript React files
- `**/*.test.ts` - Test files
- `**/*.md` - Markdown files anywhere

**Forbidden paths:**
- `plugins/github-vercel-supabase-ci/**` - Complex CI plugin (context-expensive)
- `plugins/github-context-sync/**` - GitHub sync plugin (context-expensive)

## Test Scenarios

### Main Agent Tests

1. ✅ **Should allow**: Write to `plugins/enhanced-context/hooks/test.ts`
2. ✅ **Should allow**: Edit `shared/hooks/utils/test.ts`
3. ✅ **Should allow**: Create `test-example.md` in root
4. ❌ **Should deny**: Write to `node_modules/package/index.js`
5. ❌ **Should deny**: Write to `dist/bundle.js`

### Subagent Tests

1. ✅ **Should allow**: Read `plugins/enhanced-context/hooks/create-plan-symlink.ts`
2. ✅ **Should allow**: Edit `plugins/enhanced-context/shared/hooks/enforce-plan-scoping.ts`
3. ✅ **Should allow**: Create `plugins/enhanced-context/hooks/test.test.ts`
4. ❌ **Should deny**: Write to `plugins/github-vercel-supabase-ci/hooks/setup.ts`
5. ❌ **Should deny**: Edit `plugins/github-context-sync/hooks/sync-plan.ts`

### Read Tests (Non-Blocking Warnings)

1. ⚠️ **Main agent read outside scope**: Should warn when reading forbidden paths
2. ⚠️ **Subagent read outside scope**: Should warn when reading context-expensive areas

## Expected Hook Behavior

### PLAN.md Symlink

When this plan is written to `.claude/plans/test-plan.md`:
- Hook `create-plan-symlink.ts` should create/update `PLAN.md` → `.claude/plans/test-plan.md`
- Symlink should be in project root

### Path Validation

When write/edit/read operations occur:
- Hook `enforce-plan-scoping.ts` should:
  1. Read `PLAN.md` symlink
  2. Parse `paths` frontmatter
  3. Detect agent context (main vs subagent)
  4. Validate path against appropriate scope
  5. Deny writes/edits outside scope
  6. Warn on reads outside scope

## Purpose

This test plan demonstrates:
- Main agent can work in plugins, shared, and docs
- Subagents can access TypeScript files but are blocked from complex plugins
- Context-expensive areas (CI and sync plugins) are isolated to focused work
- Plan agent has control over workspace boundaries
