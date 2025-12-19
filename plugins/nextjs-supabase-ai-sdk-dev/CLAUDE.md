---
title: Next.js Supabase AI SDK Dev Plugin
description: Development quality checks plugin for Next.js, Supabase, and AI SDK projects
folder:
  subfolders:
    allowed: [.claude-plugin, hooks]
    required: [.claude-plugin, hooks]
  files:
    allowed: [CLAUDE.md, README.md, .gitignore]
    required: [CLAUDE.md]
---

# nextjs-supabase-ai-sdk-dev Plugin

Development quality checks plugin for Next.js, Supabase, and AI SDK projects.

## Overview

This plugin provides automated quality checks that run after file edits, ensuring code quality through linting, type checking, and test execution. Perfect for Next.js projects using TypeScript and Vitest.

## Hooks

### 1. PostToolUse[Write|Edit] - ESLint Linting

**File**: `hooks/lint-file.ts`
**Event**: `PostToolUse`
**Matcher**: `Write|Edit` (runs after Write or Edit tool use)

**What it does**:
- Runs ESLint on the project after any file write or edit
- Detects package manager (npm/yarn/pnpm/bun) automatically
- Executes `npm run lint` (or equivalent) command
- Provides lint errors as additional context to Claude

**Behavior**:
- Only triggers on Write and Edit operations
- 30-second timeout for lint execution
- Returns empty output on success (no lint errors)
- Returns additional context with lint errors on failure
- System message on execution failure (timeout, ESLint not found)

**Output**:
- Success: Empty (no output)
- Lint errors: Additional context with ESLint output and instruction to fix
- Execution failure: System message with error details

---

### 2. PostToolUse[Write|Edit] - TypeScript Type Checking

**File**: `hooks/typecheck-file.ts`
**Event**: `PostToolUse`
**Matcher**: `Write|Edit` (runs after Write or Edit tool use)

**What it does**:
- Runs `tsc --noEmit` to check TypeScript types after file edits
- Provides type errors as additional context to Claude
- Allows Claude to fix type errors immediately

**Behavior**:
- Only triggers on Write and Edit operations
- 30-second timeout for type check
- Returns empty output on success (no type errors)
- Returns additional context with type errors on failure
- System message on execution failure (timeout, tsc not found)

**Output**:
- Success: Empty (no output)
- Type errors: Additional context with TypeScript output and instruction to fix
- Execution failure: System message with error details

---

### 3. PostToolUse[*.test.ts|*.test.tsx] - Vitest Test Runner

**File**: `hooks/vitest-file.ts`
**Event**: `PostToolUse`
**Matcher**: `Write(**.test.ts)|Write(**.test.tsx)|Edit(**.test.ts)|Edit(**.test.tsx)`

**What it does**:
- Runs Vitest test suite after editing test files
- Detects package manager (npm/yarn/pnpm/bun) automatically
- Executes `npm run test` (or equivalent) command
- Provides test failures as additional context to Claude

**Behavior**:
- Only triggers on Write/Edit of `.test.ts` or `.test.tsx` files
- 60-second timeout for test execution
- Returns empty output on success (all tests pass)
- Returns additional context with test failures on failure
- System message on execution failure (timeout, Vitest not found)

**Output**:
- Success: Empty (no output)
- Test failures: Additional context with Vitest output and instruction to fix
- Execution failure: System message with error details

---

## Subagent Logging

For subagent execution tracking and file operation logging, install the **logging** plugin:

```bash
/plugin install logging@claude-code-kit-local
```

The logging plugin provides:
- SubagentStart hook - Tracks agent context when subagents begin
- SubagentStop hook - Logs file operations when subagents complete

See `plugins/logging/CLAUDE.md` for details.

---

## Debug Logging

Enable debug output for hooks:

```bash
DEBUG=* claude                    # All debug output
DEBUG=lint-file claude            # Lint hook only
DEBUG=typecheck-file claude       # Type check hook only
DEBUG=vitest-file claude          # Test hook only
DEBUG=subagent claude             # Shared subagent hooks
```

## Requirements

- Node.js (for TypeScript hook runner)
- ESLint configured in project (with `lint` script in package.json)
- TypeScript configured in project (`tsc` available)
- Vitest configured in project (with `test` script in package.json)
- Supported package managers: npm, yarn, pnpm, or bun

## Package.json Scripts

This plugin expects these scripts in your package.json:

```json
{
  "scripts": {
    "lint": "eslint .",
    "test": "vitest"
  }
}
```

## Configuration

This plugin is referenced in `.claude-plugin/marketplace.json`:

```json
{
  "name": "nextjs-supabase-ai-sdk-dev",
  "source": "../plugins/nextjs-supabase-ai-sdk-dev",
  "strict": false
}
```

Install with:
```bash
/plugin install nextjs-supabase-ai-sdk-dev@claude-code-kit-local
```

## Performance Notes

- Lint and typecheck hooks run on **every** Write/Edit operation
- Test hook only runs when editing `.test.ts` or `.test.tsx` files
- All hooks have timeouts (30s for lint/typecheck, 60s for tests)
- Consider disabling in large codebases if hooks slow down development
