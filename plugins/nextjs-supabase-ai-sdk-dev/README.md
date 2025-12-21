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

This plugin provides:
- **Automated quality checks** - Linting, type checking, and test execution after file edits
- **UI development system** - Progressive skills and UI developer agent for systematic UI development
- **MCP integration** - Local development tools (ai-elements, shadcn, next-devtools)

Perfect for Next.js projects using TypeScript, Supabase, and Vercel AI SDK.

## UI Development Features

### UI Developer Agent

**Location**: `agents/ui-developer.md`

Systematic UI development agent with 5 progressive skills:

1. **ui-wireframing** - Mobile-first ASCII wireframes in `WIREFRAME.md` files
2. **ui-design** - Contract-first static UI with compound components (Shadcn/AI Elements/Radix)
3. **ui-interaction** - Client-side events, local state, validation with Zod
4. **ui-integration** - Server actions, Supabase queries, backend integration
5. **ai-sdk-ui** - AI-powered features with Vercel AI SDK

**Workflow**:
```
Wireframe → Design → Interaction → Integration → AI
```

**Principles**:
- Mobile-first design
- Contract-first development (TypeScript interfaces before implementation)
- Compound components pattern (Card.Root, Card.Header, Card.Content)
- Server Component defaults (push 'use client' deep)
- Defense-in-depth (explicit auth checks + RLS)

**MCP Tools Available**:
- `mcp__ai_elements__*` - AI Elements component library
- `mcp__shadcn__*` - Shadcn component installation and management
- `mcp__next_devtools__*` - Live preview and debugging for local development

### MCP Server Configuration

**Location**: `.claude-plugin/.mcp.json`

Bundled MCP servers:
- **ai-elements**: HTTP transport to AI SDK registry
- **shadcn**: Local command execution for component installation
- **next-devtools**: Local development server integration

These servers are automatically available when using the ui-developer agent in projects with this plugin enabled.

### UI Skills Documentation

All skills are located in `../../shared/skills/`:

- **ui-wireframing/SKILL.md** - ASCII wireframes with mobile-first notation
- **ui-design/SKILL.md** - Component hierarchy and composition patterns
- **ui-interaction/SKILL.md** - useTransition, useOptimistic, client-side validation
- **ui-integration/SKILL.md** - Server actions, Supabase, revalidation strategies
- **ai-sdk-ui/SKILL.md** - useChat, useCompletion, streaming UI, tool calling

### Technology Stack

- **UI Components**: Shadcn (default), AI Elements, Radix, HTML
- **Styling**: Tailwind CSS with mobile-first approach
- **State Management**: Server Components (default), client components when needed
- **Validation**: Zod schemas (client + server)
- **Backend**: Supabase with defense-in-depth (RLS + explicit auth checks)
- **AI Integration**: Vercel AI SDK with streaming UI

### Local Development

When developing UI locally:
1. Use **next-devtools MCP** for live preview (no Playwright needed)
2. Invoke ui-developer agent for systematic feature development
3. Follow progressive skill workflow (wireframe → design → interaction → integration → AI)
4. Test with moderate Vitest tests (only for custom logic/complexity)

## Quality Check Hooks

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

### 4. PostToolUse[Write|Edit] - TSDoc Validation

**File**: `hooks/tsdoc-validate.ts`
**Event**: `PostToolUse`
**Matcher**: `Write|Edit` (runs on .ts files only)
**Non-blocking**: Yes

**What it does**:
- Validates TSDoc documentation using ESLint with eslint-plugin-jsdoc
- Checks for missing documentation on exported functions/classes
- Ensures @param, @returns, @example tags are present
- Provides guidance on TSDoc 2025 best practices from CLAUDE.md
- Encourages comprehensive documentation without blocking development

**Behavior**:
- Only triggers on `.ts` files (skips `.test.ts` and `.d.ts`)
- 30-second timeout
- Non-blocking warnings via additionalContext
- Silent skip if ESLint TSDoc config not found
- Categorizes violations (missing JSDoc, params, returns, examples, formatting)

**Output**:
- Success: Empty (no violations found)
- Documentation issues: Contextual guidance with categorized violations
- Execution failure: System message

**TSDoc Standards Enforced**:
- @module tag at file top (for context)
- Multi-line format for all public exports
- @param tags with descriptions for all parameters
- @returns tags with descriptions
- @example blocks showing usage (recommended/warning level)
- Proper formatting and alignment

**Example Output**:
```
TSDoc documentation issues found in src/utils/helper.ts:

📝 Missing JSDoc on exported functions/classes
📋 Missing @param tags or descriptions
↩️  Missing @returns tags or descriptions
💡 Missing @example blocks (recommended)

ESLint Output:
src/utils/helper.ts
  5:1  error  Missing JSDoc comment  jsdoc/require-jsdoc

TSDoc 2025 Requirements (from CLAUDE.md):
- @module tag at top of file
- Multi-line format for all public exports
- @param tags for all parameters with descriptions
- @returns tags describing return values
- @example blocks showing realistic usage
```

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
DEBUG=tsdoc-validate claude       # TSDoc validation hook only
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
