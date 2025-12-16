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
