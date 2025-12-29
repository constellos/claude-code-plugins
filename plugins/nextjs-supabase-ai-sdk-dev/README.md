![Version](https://img.shields.io/badge/version-0.1.1-blue?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=for-the-badge&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?style=for-the-badge&logo=typescript)
![Next.js](https://img.shields.io/badge/Next.js-15+-black?style=for-the-badge&logo=next.js)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel)
![AI SDK](https://img.shields.io/badge/AI%20SDK-Vercel-blue?style=for-the-badge)
![ESLint](https://img.shields.io/badge/ESLint-4B32C3?style=for-the-badge&logo=eslint)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest)

# 🔌 Next.js Supabase AI SDK Dev Plugin

> Development quality enforcement for Next.js, Supabase, and AI SDK projects with automated checks and systematic UI development

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Installation](#-installation)
- [Hooks](#-hooks)
- [Configuration](#-configuration)
- [Use Cases](#-use-cases)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [See Also](#-see-also)
- [License](#-license)

---

## 🎯 Overview

The Next.js Supabase AI SDK Dev plugin provides comprehensive development quality enforcement through automated checks at both file and project levels. It combines per-file quality checks (ESLint, TypeScript, TSDoc, Vitest) with a systematic UI development system featuring 5 progressive skills.

Perfect for Next.js projects using TypeScript, Supabase, and Vercel AI SDK with strict quality standards.

---

## ✨ Features

### Automated Quality Checks
- **Per-File Linting**: ESLint runs after every file edit (informational, non-blocking)
- **Type Checking**: TypeScript validation on all file edits (informational, non-blocking)
- **TSDoc Validation**: Enforces TSDoc 2025 standards with comprehensive documentation guidance
- **Test Execution**: Vitest runs automatically when test files are modified

### UI Development System
- **Progressive Skills**: 5-step workflow (wireframe → design → interaction → integration → AI)
- **Mobile-First**: ASCII wireframes with mobile-first notation
- **Contract-First**: TypeScript interfaces before implementation
- **Compound Components**: Card.Root, Card.Header, Card.Content patterns
- **Server Components**: Defaults to Server Components, pushes 'use client' deep

### MCP Integration
- **ai-elements**: AI Elements component library via HTTP transport
- **shadcn**: Component installation and management via local commands
- **next-devtools**: Live preview and debugging for local development (no Playwright needed)

### Technology Stack
- **UI Components**: Shadcn (default), AI Elements, Radix, HTML
- **Styling**: Tailwind CSS with mobile-first approach
- **State Management**: Server Components (default), client components when needed
- **Validation**: Zod schemas (client + server)
- **Backend**: Supabase with defense-in-depth (RLS + explicit auth checks)
- **AI Integration**: Vercel AI SDK with streaming UI

---

## 📦 Installation

```bash
claude plugin install nextjs-supabase-ai-sdk-dev@constellos
```

---

## 🪝 Hooks

### PostToolUse[Write|Edit] - lint-file.ts

**File:** `hooks/lint-file.ts`
**Blocking:** No (informational)

Runs ESLint on the project after any file write or edit. Detects package manager (npm/yarn/pnpm/bun) automatically and executes `npm run lint` (or equivalent). Provides lint errors as additional context to Claude for immediate fixing.

**Behavior:**
- 30-second timeout for lint execution
- Returns empty output on success (no lint errors)
- Returns additional context with lint errors on failure
- System message on execution failure (timeout, ESLint not found)

<details>
<summary>📝 Example Output</summary>

```
ESLint found errors:

/path/to/file.ts
  5:1  error  'useState' is not defined  no-undef
  12:3  error  Missing semicolon  semi

Please fix these linting issues.
```
</details>

---

### PostToolUse[Write|Edit] - typecheck-file.ts

**File:** `hooks/typecheck-file.ts`
**Blocking:** No (informational)

Runs `tsc --noEmit` to check TypeScript types after file edits. Provides type errors as additional context to Claude, allowing immediate type error fixes during development.

**Behavior:**
- 30-second timeout for type check
- Returns empty output on success (no type errors)
- Returns additional context with type errors on failure
- System message on execution failure (timeout, tsc not found)

<details>
<summary>📝 Example Output</summary>

```
TypeScript type checking found errors:

src/components/Button.tsx:15:5 - error TS2322: Type 'string' is not assignable to type 'number'.

15     count = "invalid";
       ~~~~~

Please fix these type errors.
```
</details>

---

### PostToolUse[Write|Edit] - tsdoc-validate.ts

**File:** `hooks/tsdoc-validate.ts`
**Blocking:** No (informational)

Validates TSDoc documentation using ESLint with eslint-plugin-jsdoc. Checks for missing documentation on exported functions/classes, ensures @param, @returns, @example tags are present, and provides guidance on TSDoc 2025 best practices from CLAUDE.md.

**Behavior:**
- Only triggers on `.ts` files (skips `.test.ts` and `.d.ts`)
- 30-second timeout
- Non-blocking warnings via additionalContext
- Silent skip if ESLint TSDoc config not found
- Categorizes violations (missing JSDoc, params, returns, examples, formatting)

**TSDoc Standards Enforced:**
- @module tag at file top (for context)
- Multi-line format for all public exports
- @param tags with descriptions for all parameters
- @returns tags with descriptions
- @example blocks showing usage (recommended/warning level)
- Proper formatting and alignment

<details>
<summary>📝 Example Output</summary>

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
</details>

---

### PostToolUse[Write|Edit] - vitest-file.ts

**File:** `hooks/vitest-file.ts`
**Blocking:** No (informational)
**Matcher:** `Write(**.test.ts)|Write(**.test.tsx)|Edit(**.test.ts)|Edit(**.test.tsx)`

Runs Vitest test suite after editing test files. Detects package manager automatically and executes `npm run test` (or equivalent). Provides test failures as additional context for immediate fixing.

**Behavior:**
- Only triggers on Write/Edit of `.test.ts` or `.test.tsx` files
- 60-second timeout for test execution
- Returns empty output on success (all tests pass)
- Returns additional context with test failures on failure
- System message on execution failure (timeout, Vitest not found)

<details>
<summary>📝 Example Output</summary>

```
Vitest test failures:

❌ src/components/Button.test.tsx
  ✓ renders correctly (2ms)
  ✗ handles click events (5ms)
    Expected: "clicked"
    Received: undefined

Please fix these test failures.
```
</details>

---

## ⚙️ Configuration

Add to `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "nextjs-supabase-ai-sdk-dev@constellos": true
  }
}
```

**Required package.json scripts:**

```json
{
  "scripts": {
    "lint": "eslint .",
    "test": "vitest"
  }
}
```

**MCP Servers:**

The plugin includes bundled MCP server configuration in `.claude-plugin/.mcp.json`:

```json
{
  "mcpServers": {
    "next-devtools": {
      "command": "npx",
      "args": ["-y", "next-devtools-mcp@latest"]
    }
  }
}
```

---

## 💡 Use Cases

| Use Case | Description | Benefit |
|----------|-------------|---------|
| Next.js development | Automated quality checks on every file edit | Catch errors immediately during development |
| TypeScript projects | Strict type checking after edits | Maintain type safety throughout development |
| Test-driven development | Auto-run tests when test files change | Instant feedback on test failures |
| Documentation enforcement | TSDoc validation with 2025 standards | Comprehensive, maintainable codebase documentation |
| UI development | Systematic 5-skill workflow | Consistent, high-quality UI implementation |

---

## 🐛 Troubleshooting

<details>
<summary>Lint hook not running</summary>

1. Verify ESLint is configured:
   ```bash
   npm run lint
   ```
2. Check `package.json` has `lint` script
3. Ensure project has `.eslintrc` or `eslint.config.js`
4. Enable debug logging:
   ```bash
   DEBUG=lint-file claude
   ```
</details>

<details>
<summary>Type checking errors</summary>

1. Verify TypeScript is installed:
   ```bash
   npx tsc --version
   ```
2. Check `tsconfig.json` exists
3. Run type check manually:
   ```bash
   npx tsc --noEmit
   ```
4. Enable debug logging:
   ```bash
   DEBUG=typecheck-file claude
   ```
</details>

<details>
<summary>Tests not running</summary>

1. Verify Vitest is configured:
   ```bash
   npm run test
   ```
2. Check `package.json` has `test` script
3. Ensure test file matches `.test.ts` or `.test.tsx` pattern
4. Enable debug logging:
   ```bash
   DEBUG=vitest-file claude
   ```
</details>

<details>
<summary>Hooks slow down development</summary>

1. Consider disabling in large codebases
2. Increase timeouts in hook configuration
3. Run checks only on specific file patterns
4. Use `.eslintignore` to exclude files
</details>

<details>
<summary>Hooks not reflecting latest changes</summary>

**Problem:** Plugin cache is stale (e.g., old Stop hooks still running despite being removed in PR #71)

**Cause:** Plugins are cached at `~/.claude/plugins/cache/` and not automatically updated when source code changes

**Solution:**

1. **Using worktrees (recommended):** `claude-worktree.sh` auto-refreshes cache
   ```bash
   bash claude-worktree.sh
   ```

2. **Manual refresh:**
   ```bash
   claude plugin uninstall --scope project nextjs-supabase-ai-sdk-dev@constellos
   claude plugin install --scope project nextjs-supabase-ai-sdk-dev@constellos
   ```

3. **Verify cache:**
   ```bash
   # Verify NO Stop hooks (removed in PR #71)
   cat ~/.claude/plugins/cache/constellos/nextjs-supabase-ai-sdk-dev/hooks/hooks.json | grep -i "stop"

   # Compare cached vs source
   diff ~/.claude/plugins/cache/constellos/nextjs-supabase-ai-sdk-dev/hooks/hooks.json \
        ./plugins/nextjs-supabase-ai-sdk-dev/hooks/hooks.json
   ```

**Cache location:** `~/.claude/plugins/cache/constellos/nextjs-supabase-ai-sdk-dev/`
</details>

---

## 🤝 Contributing

When modifying hooks:

1. Update hook implementation in `hooks/`
2. Run type checking: `npm run typecheck`
3. Run linting: `npm run lint`
4. Test hooks manually with `DEBUG=* claude`
5. Update this README
6. Update [CLAUDE.md](./CLAUDE.md) quick reference
7. Reinstall plugin to refresh cache

---

## 📚 See Also

- [CLAUDE.md](./CLAUDE.md) - Quick reference for AI context
- [Marketplace](../../CLAUDE.md) - All available plugins and architecture
- [UI Skills](../../shared/skills/) - UI development skill documentation
- [Shared Utilities](./shared/CLAUDE.md) - Shared hook utilities library

---

## 📄 License

MIT © constellos
