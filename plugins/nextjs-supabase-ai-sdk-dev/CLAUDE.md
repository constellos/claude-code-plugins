---
title: Next.js Supabase AI SDK Dev Plugin
description: Development quality checks plugin for Next.js, Supabase, and AI SDK projects
version: 0.1.1
folder:
  subfolders:
    allowed: [.claude-plugin, hooks, agents, skills, shared]
    required: [.claude-plugin, hooks]
  files:
    allowed: [CLAUDE.md, README.md, .gitignore]
    required: [README.md]
---

# Next.js Supabase AI SDK Dev Plugin

## Quick Reference

**Purpose**: Ensures code quality through automated checks at both file and project levels. Runs per-file quality checks on edits (ESLint, TypeScript, TSDoc, Vitest) and provides UI development system with 5 progressive skills.

**When to use**:
- Next.js application development with TypeScript
- Projects requiring strict type safety and code quality
- UI development with systematic wireframe → design → interaction → integration → AI workflow
- Supabase backend integration with defense-in-depth security
- Vercel AI SDK streaming UI features

## Hook Summary

| Hook | Event | Blocking | Purpose |
|------|-------|----------|---------|
| lint-file | PostToolUse[Write\|Edit] | No | Runs ESLint on project after file edits (informational) |
| typecheck-file | PostToolUse[Write\|Edit] | No | Runs TypeScript type checking after file edits (informational) |
| tsdoc-validate | PostToolUse[Write\|Edit] | No | Validates TSDoc documentation on .ts files (informational) |
| vitest-file | PostToolUse[Write\|Edit] | No | Runs Vitest on test files after edits (informational) |

**Note**: All hooks are non-blocking during development. File-level checks provide immediate feedback but don't prevent edits.

## Key Features

### Automated Quality Checks
Runs ESLint, TypeScript type checking, and Vitest automatically after file edits. Provides immediate feedback without blocking development. All checks have timeouts (30s lint/typecheck, 60s tests).

### UI Development System
Five progressive skills for systematic UI development: ui-wireframing (ASCII wireframes), ui-design (compound components), ui-interaction (client state), ui-integration (server actions + Supabase), ai-sdk-ui (streaming UI). Follows mobile-first, contract-first approach.

### MCP Integration
Bundled MCP servers for local development: ai-elements (component library), shadcn (component installation), next-devtools (live preview without Playwright).

### TSDoc Validation
Enforces TSDoc 2025 standards: @module tags, multi-line format, @param/@returns descriptions, @example blocks. Non-blocking guidance encourages comprehensive documentation.

### Technology Stack
Shadcn/AI Elements/Radix components, Tailwind CSS, Server Components (default), Zod validation, Supabase with RLS, Vercel AI SDK streaming.

## Installation

```bash
claude plugin install nextjs-supabase-ai-sdk-dev@constellos
```

Add to `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "nextjs-supabase-ai-sdk-dev@constellos": true
  }
}
```

## Requirements

**Package.json scripts:**

```json
{
  "scripts": {
    "lint": "eslint .",
    "test": "vitest"
  }
}
```

**Dependencies:**
- Node.js ≥18.0.0
- TypeScript configured (`tsc` available)
- ESLint configured with `lint` script
- Vitest configured with `test` script
- Supported package managers: npm, yarn, pnpm, bun

## Debug Logging

```bash
DEBUG=* claude                    # All hooks
DEBUG=lint-file claude            # ESLint hook only
DEBUG=typecheck-file claude       # TypeScript hook only
DEBUG=tsdoc-validate claude       # TSDoc validation hook only
DEBUG=vitest-file claude          # Vitest hook only
```

Logs written to `.claude/logs/hook-events.json` (JSONL format).

## See Also

- [Full Documentation](./README.md) - Comprehensive plugin guide with hook details
- [Marketplace](../../CLAUDE.md) - All available plugins and architecture
- [UI Skills](../../shared/skills/) - UI development skill documentation
