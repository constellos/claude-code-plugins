---
title: Claude Code Plugins Marketplace
description: A marketplace of Claude Code plugins with shared TypeScript utilities and typed hooks for development workflows
tags: [plugins, hooks, marketplace, typescript, automation]
version: "1.0.0"
type: marketplace
---

# Claude Code Plugins

## What This Is

A marketplace of Claude Code plugins with shared TypeScript utilities. This is NOT an npm package - it's a collection of plugins that extend Claude Code with typed hooks for development workflows.

## Architecture

```
.
├── .claude-plugin/
│   └── marketplace.json        # Marketplace definition
│
├── shared/                     # Shared utilities imported by all plugins
│   ├── lib/
│   │   ├── types.ts           # Hook type definitions
│   │   ├── io.ts              # File operations
│   │   ├── debug.ts           # Debug logging
│   │   ├── transcripts.ts     # Transcript parsing
│   │   ├── subagent-state.ts  # Subagent context management
│   │   ├── package-manager.ts # Package manager detection
│   │   └── index.ts           # Exports all utilities
│   ├── hooks/                  # Shared hook implementations
│   │   ├── log-subagent-start.ts  # SubagentStart hook
│   │   └── log-subagent-stop.ts   # SubagentStop hook
│   └── runner.ts              # TypeScript hook runner
│
└── plugins/                    # Individual marketplace plugins
    ├── github-vercel-supabase-ci/
    │   ├── .claude-plugin/plugin.json
    │   └── hooks/
    │       ├── hooks.json     # Includes shared subagent hooks
    │       ├── pull-latest-main.ts      # SessionStart: auto-merge main
    │       ├── await-pr-checks.ts       # PostToolUse: wait for CI on PR create
    │       └── commit-task.ts           # SubagentStop: auto-commit agent work
    │
    ├── nextjs-supabase-ai-sdk-dev/
    │   ├── .claude-plugin/plugin.json
    │   └── hooks/
    │       ├── hooks.json     # Includes shared subagent hooks
    │       ├── lint-file.ts             # Imports from shared/
    │       ├── typecheck-file.ts        # Imports from shared/
    │       └── vitest-file.ts           # Imports from shared/
    │
    ├── claude-code-config/
    │   ├── .claude-plugin/plugin.json
    │   └── hooks/
    │       └── hooks.json     # Only shared subagent hooks
    │
    └── main-agent-perms/        # Placeholder for main agent permissions
        ├── .claude-plugin/plugin.json
        └── hooks/
            └── hooks.json     # No hooks yet - future permission controls
```

### Shared Folder (`shared/`)

The `shared/` folder contains TypeScript utilities and types that can be imported by any plugin in the marketplace:

**`shared/lib/types.ts`** - Hook type definitions:
```typescript
export interface HookInput {
  event: string;
  cwd: string;
  // ... full typing for all hook events
}

export interface HookOutput {
  success: boolean;
  message?: string;
  // ... typed outputs
}
```

**`shared/lib/`** - Utility modules:
- `io.ts` - File read/write/parse JSON helpers
- `debug.ts` - Debug logging with `DEBUG=*` support
- `transcripts.ts` - Parse Claude transcript JSONL files
- `subagent-state.ts` - Subagent context management (save/load/analyze agent edits)
- `package-manager.ts` - Detect npm/yarn/pnpm/bun
- `index.ts` - Re-exports all utilities

**`shared/hooks/`** - Shared hook implementations:
- `log-subagent-start.ts` - SubagentStart hook that saves agent context
- `log-subagent-stop.ts` - SubagentStop hook that logs agent file operations

**`shared/runner.ts`** - TypeScript hook runner that executes hook files

All plugins import from `shared/` via relative path:
```typescript
import type { HookInput, HookOutput } from '../../../shared/lib/types.ts';
import { readJson, writeJson } from '../../../shared/lib/io.ts';
```

### Shared Hooks

The `shared/hooks/` directory contains hook implementations that are used by all plugins in the marketplace:

**SubagentStart Hook (`log-subagent-start.ts`)**
- Saves agent context when a subagent begins execution
- Stores agent ID, type, prompt, and toolUseId to `.claude/logs/subagent-tasks.json`
- Context is retrieved later by SubagentStop hook

**SubagentStop Hook (`log-subagent-stop.ts`)**
- Analyzes agent transcript when subagent completes
- Logs agent type, prompt, and file operations:
  - Files created (new writes)
  - Files edited (Write/Edit operations)
  - Files deleted (rm commands)
- Cleans up saved context from SubagentStart

All three plugins reference these shared hooks in their `hooks.json`:
```json
{
  "SubagentStart": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "node ${CLAUDE_PROJECT_DIR}/shared/runner.ts ${CLAUDE_PROJECT_DIR}/shared/hooks/log-subagent-start.ts"
        }
      ]
    }
  ],
  "SubagentStop": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "node ${CLAUDE_PROJECT_DIR}/shared/runner.ts ${CLAUDE_PROJECT_DIR}/shared/hooks/log-subagent-stop.ts"
        }
      ]
    }
  ]
}
```

### Plugin Structure

Each plugin in `plugins/` has:
- `.claude-plugin/plugin.json` - Plugin metadata
- `hooks/hooks.json` - Hook definitions mapping events to TypeScript files
- `hooks/*.ts` - Hook implementation files that import from `shared/`

### Marketplace Configuration

`.claude-plugin/marketplace.json` defines the marketplace and references plugins:

```json
{
  "name": "Constellos Claude Code Kit",
  "version": "1.0.0",
  "plugins": [
    {
      "name": "github-vercel-supabase-ci",
      "source": "../plugins/github-vercel-supabase-ci",
      "strict": false
    }
  ]
}
```

## Available Plugins

All plugins include the shared SubagentStart/SubagentStop hooks for tracking agent file operations.

### github-vercel-supabase-ci

CI/CD hooks for GitHub, Vercel, and Supabase projects.

**Plugin-Specific Hooks:**
- **SessionStart** (`pull-latest-main.ts`) - Auto-fetch and merge latest main/master branch
  - Handles merge conflicts gracefully
  - Notifies on conflicts
- **PostToolUse[Bash]** (`await-pr-checks.ts`) - Wait for CI after PR creation
  - Detects `gh pr create` commands
  - Extracts PR URL from output
  - Runs `gh pr checks --watch` to wait for CI (10 min timeout)
  - Returns blocking decision on CI failure
- **SubagentStop** (`commit-task.ts`) - Auto-commit subagent work
  - Creates commit from agent's final message
  - Uses agent_transcript_path (requires Claude Code 2.0.42+)
  - Formats commit message with agent type prefix

**Shared Hooks:**
- **SubagentStart** - Track agent context
- **SubagentStop** - Log agent file operations

### nextjs-supabase-ai-sdk-dev

Development quality checks for Next.js projects.

**Plugin-Specific Hooks:**
- **PostToolUse (Write|Edit)** - Run ESLint on edited files
- **PostToolUse (Write|Edit)** - Run TypeScript type checking
- **PostToolUse (*.test.ts|*.test.tsx)** - Run Vitest on test files

**Shared Hooks:**
- **SubagentStart** - Track agent context
- **SubagentStop** - Log agent file operations

### claude-code-config

Configuration management utilities (placeholder).

**Shared Hooks:**
- **SubagentStart** - Track agent context
- **SubagentStop** - Log agent file operations

### main-agent-perms

Placeholder plugin for enforcing subagent-style metadata and permissions on the main agent.

**Current Status:** No hooks implemented yet.

**Planned Features:**
- Permission boundaries for file access (read/write restrictions)
- Tool allowlists and denylists
- Session audit logging
- Rate limiting for sensitive operations
- Branch protection rules
- Secret detection and blocking

## Complete Hook Reference

This section documents all hooks available across all plugins with detailed behavior descriptions.

### Shared Hooks (All Plugins)

These hooks are available in all plugins that include them in their `hooks.json`.

#### SubagentStart - Track Agent Context

**Event**: `SubagentStart`
**File**: `shared/hooks/log-subagent-start.ts`
**Matcher**: None (runs when any subagent starts via Task tool)
**Plugins**: github-vercel-supabase-ci, nextjs-supabase-ai-sdk-dev, claude-code-config

**What it does**:
- Saves agent context when a subagent begins execution
- Stores agent ID, type, prompt, and toolUseId to `.claude/logs/subagent-tasks.json`
- Context is retrieved later by SubagentStop hooks

**Behavior**:
- Saves to `.claude/logs/subagent-tasks.json` in project root
- Non-blocking on errors (errors logged to console if DEBUG enabled)
- Creates `.claude/logs/` directory if it doesn't exist

**Output**: Empty hookSpecificOutput (no additional context to Claude)

**Debug**: Enable with `DEBUG=subagent` or `DEBUG=*`

---

#### SubagentStop - Log Agent File Operations

**Event**: `SubagentStop`
**File**: `shared/hooks/log-subagent-stop.ts`
**Matcher**: None (runs when any subagent completes)
**Plugins**: github-vercel-supabase-ci, nextjs-supabase-ai-sdk-dev, claude-code-config

**What it does**:
- Analyzes agent transcript when subagent completes
- Logs agent type, prompt, and file operations to console (if DEBUG enabled)
- Reports files created (new writes), edited (Write/Edit), and deleted (rm commands)
- Cleans up saved context from SubagentStart

**Behavior**:
- Parses agent transcript JSONL file from `agent_transcript_path`
- Extracts Write/Edit/Bash tool calls
- Categorizes file operations
- Outputs detailed log with DEBUG=* or DEBUG=subagent
- Non-blocking on errors

**Output**: Empty (logging only, no additional context to Claude)

**Debug Output Example** (with DEBUG=subagent):
```
[SubagentStop] ─────────────────────────────────────────
[SubagentStop] Agent Analysis Complete
[SubagentStop] ─────────────────────────────────────────
[SubagentStop] Agent Type: general-purpose
[SubagentStop] Agent Prompt: Fix the authentication bug...
[SubagentStop] Files Created: 1
[SubagentStop]   + src/auth/new-helper.ts
[SubagentStop] Files Edited: 2
[SubagentStop]   ~ src/auth/login.ts
[SubagentStop]   ~ src/auth/utils.ts
[SubagentStop] Files Deleted: 0
[SubagentStop] ─────────────────────────────────────────
```

**Debug**: Enable with `DEBUG=subagent` or `DEBUG=*`

---

### github-vercel-supabase-ci Hooks

Plugin-specific hooks for CI/CD automation.

#### SessionStart - Auto-sync with Main Branch

**Event**: `SessionStart`
**File**: `plugins/github-vercel-supabase-ci/hooks/pull-latest-main.ts`
**Matcher**: None (runs on every session start)

**What it does**:
- Automatically fetches latest changes from origin at session start
- Merges origin/main (or origin/master as fallback) into current branch
- Handles merge conflicts gracefully by aborting the merge
- Provides context about sync status to Claude

**Behavior**:
- Skips if not in a git repository
- Skips if no main/master branch exists on origin
- Detects current branch name
- Runs `git fetch origin`
- Runs `git merge origin/main --no-edit` (or origin/master)
- On conflict: runs `git merge --abort` and returns blocking context
- Reports "Already up to date" if no new commits
- Non-blocking (provides additional context only)

**Output**: Additional context message describing sync result

**Success Examples**:
- `"Branch "feature/auth" is already up to date with origin/main."`
- `"Successfully merged origin/main into "feature/auth"."`

**Conflict Example**:
- `"Git merge conflict detected when merging origin/main into feature/auth. Merge was aborted. Please resolve manually."`

**Debug**: Enable with `DEBUG=pull-latest-main` or `DEBUG=*`

---

#### PostToolUse[Bash] - Await PR CI Checks

**Event**: `PostToolUse`
**File**: `plugins/github-vercel-supabase-ci/hooks/await-pr-checks.ts`
**Matcher**: `Bash` (only runs after Bash tool use)

**What it does**:
- Detects when `gh pr create` or `hub pull-request` commands are run
- Extracts PR URL from command output
- Waits for CI checks to complete using `gh pr checks --watch`
- Reports results and blocks on failure

**Behavior**:
- Only triggers on PR creation commands (pattern match on command text)
- Extracts PR URL from stdout using regex
- Runs `gh pr checks <pr-number> --watch` with 10-minute timeout
- Checks output for failure indicators: "fail", "X ", "cancelled"
- **Blocks** (returns `decision: 'block'`) on:
  - CI check failures
  - PR URL not found in output
  - Timeout (10 minutes)
  - Command execution errors
- Provides manual check commands in error output

**Output**:
- Success: Additional context with PR URL and success message
- Failure: **Blocking decision** with error details and manual check commands

**Success Example**:
```
CI checks passed for PR https://github.com/user/repo/pull/123

To view the PR: https://github.com/user/repo/pull/123
To view run details: gh run view
```

**Failure Example** (blocking):
```
decision: 'block'
reason: 'CI checks failed'
additionalContext: CI checks failed for PR https://github.com/user/repo/pull/123

To view details, run:
  gh pr checks 123
  gh run view

Check output:
[... CI output ...]
```

**Debug**: Enable with `DEBUG=await-pr-checks` or `DEBUG=*`

---

#### SubagentStop - Auto-commit Agent Work

**Event**: `SubagentStop`
**File**: `plugins/github-vercel-supabase-ci/hooks/commit-task.ts`
**Matcher**: None (runs when any subagent completes)

**What it does**:
- Automatically creates a git commit when a subagent completes work
- Reads agent's transcript to extract final message
- Formats commit message with agent type prefix
- Stages all changes and commits them

**Behavior**:
- Skips if not in a git repository
- Skips if no changes to commit (`git status --porcelain` is empty)
- Parses agent transcript from `agent_transcript_path`
- Extracts agent type from transcript (tries to get from slug, falls back to "agent")
- Finds last assistant text message in transcript
- Formats commit: `[agent-type] Commit title` (removes "I've", "Done", etc.)
- Includes multi-line body if agent message is long (truncates body at 500 chars)
- Runs `git add -A` to stage all changes
- Runs `git commit -m '<message>'`
- Non-blocking on errors (logs but doesn't stop execution)

**Requirements**: Claude Code 2.0.42+ (for `agent_transcript_path` field)

**Output**: Empty (no additional context, non-blocking)

**Commit Message Examples**:
- `[general-purpose] Fix authentication bug in login.ts`
- `[Explore] Add new API endpoint for user profile`
- `[agent-a1b2c3d4] Implement dark mode toggle component`

**Debug**: Enable with `DEBUG=commit-task` or `DEBUG=*`

---

### nextjs-supabase-ai-sdk-dev Hooks

Plugin-specific hooks for development quality checks.

#### PostToolUse[Write|Edit] - ESLint Linting

**Event**: `PostToolUse`
**File**: `plugins/nextjs-supabase-ai-sdk-dev/hooks/lint-file.ts`
**Matcher**: `Write|Edit` (runs after Write or Edit tool use)

**What it does**:
- Runs ESLint on the project after any file write or edit
- Detects package manager (npm/yarn/pnpm/bun) automatically
- Executes `<package-manager> run lint` command
- Provides lint errors as additional context to Claude

**Behavior**:
- Only triggers on Write and Edit operations
- Detects package manager from lockfiles in cwd
- Runs lint command with 30-second timeout
- Returns empty output on success (no lint errors)
- Returns additional context with lint errors on failure
- Returns system message on execution failure (timeout, ESLint not found)

**Output**:
- Success: Empty (no output)
- Lint errors: Additional context with ESLint output and instruction to fix
- Execution failure: System message with error details

**Lint Error Example**:
```
hookSpecificOutput: {
  hookEventName: 'PostToolUse',
  additionalContext: ESLint found errors:

/path/to/file.ts
  12:5  error  'foo' is assigned a value but never used  @typescript-eslint/no-unused-vars

Please fix these linting issues.
}
```

**Requirements**:
- ESLint configured in project
- `lint` script in package.json
- Supported package managers: npm, yarn, pnpm, or bun

**Debug**: Enable with `DEBUG=lint-file` or `DEBUG=*`

---

#### PostToolUse[Write|Edit] - TypeScript Type Checking

**Event**: `PostToolUse`
**File**: `plugins/nextjs-supabase-ai-sdk-dev/hooks/typecheck-file.ts`
**Matcher**: `Write|Edit` (runs after Write or Edit tool use)

**What it does**:
- Runs `tsc --noEmit` to check TypeScript types after file edits
- Provides type errors as additional context to Claude
- Allows Claude to fix type errors immediately

**Behavior**:
- Only triggers on Write and Edit operations
- Runs `tsc --noEmit` with 30-second timeout
- Returns empty output on success (no type errors)
- Returns additional context with type errors on failure
- Returns system message on execution failure (timeout, tsc not found)

**Output**:
- Success: Empty (no output)
- Type errors: Additional context with TypeScript output and instruction to fix
- Execution failure: System message with error details

**Type Error Example**:
```
hookSpecificOutput: {
  hookEventName: 'PostToolUse',
  additionalContext: TypeScript type checking found errors:

src/auth/login.ts:12:5 - error TS2322: Type 'string' is not assignable to type 'number'.

12     const age: number = "twenty";
       ~~~

Please fix these type errors.
}
```

**Requirements**:
- TypeScript configured in project
- `tsc` available (usually from node_modules/.bin/)

**Debug**: Enable with `DEBUG=typecheck-file` or `DEBUG=*`

---

#### PostToolUse[*.test.ts|*.test.tsx] - Vitest Test Runner

**Event**: `PostToolUse`
**File**: `plugins/nextjs-supabase-ai-sdk-dev/hooks/vitest-file.ts`
**Matcher**: `Write(**.test.ts)|Write(**.test.tsx)|Edit(**.test.ts)|Edit(**.test.tsx)`

**What it does**:
- Runs Vitest test suite after editing test files
- Detects package manager (npm/yarn/pnpm/bun) automatically
- Executes `<package-manager> run test` command
- Provides test failures as additional context to Claude

**Behavior**:
- Only triggers on Write/Edit of `.test.ts` or `.test.tsx` files
- Detects package manager from lockfiles in cwd
- Runs test command with 60-second timeout
- Returns empty output on success (all tests pass)
- Returns additional context with test failures on failure
- Returns system message on execution failure (timeout, Vitest not found)

**Output**:
- Success: Empty (no output)
- Test failures: Additional context with Vitest output and instruction to fix
- Execution failure: System message with error details

**Test Failure Example**:
```
hookSpecificOutput: {
  hookEventName: 'PostToolUse',
  additionalContext: Vitest found test failures:

 FAIL  src/auth/login.test.ts
  ✓ should login with valid credentials (5ms)
  ✕ should reject invalid password (12ms)

  ● should reject invalid password

    expect(received).toBe(expected)

    Expected: false
    Received: true

Please fix these test failures.
}
```

**Requirements**:
- Vitest configured in project
- `test` script in package.json
- Supported package managers: npm, yarn, pnpm, or bun

**Debug**: Enable with `DEBUG=vitest-file` or `DEBUG=*`

---

## Per-Plugin Documentation

Each plugin has its own CLAUDE.md file with detailed hook documentation:

- `plugins/github-vercel-supabase-ci/CLAUDE.md` - CI/CD hooks reference
- `plugins/nextjs-supabase-ai-sdk-dev/CLAUDE.md` - Quality check hooks reference
- `plugins/claude-code-config/CLAUDE.md` - Config plugin reference
- `plugins/main-agent-perms/CLAUDE.md` - Permissions plugin (placeholder)

## Local Development

### Using Plugins in This Repo

This repo uses its own plugins for dogfooding. Configuration in `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "claude-code-kit-local": {
      "source": {
        "source": "file",
        "path": "./.claude-plugin/marketplace.json"
      }
    }
  },
  "enabledPlugins": {
    "github-vercel-supabase-ci@claude-code-kit-local": true,
    "nextjs-supabase-ai-sdk-dev@claude-code-kit-local": true
  }
}
```

### Installing Plugins

After configuring the marketplace, install plugins:

```
/plugin install github-vercel-supabase-ci@claude-code-kit-local
/plugin install nextjs-supabase-ai-sdk-dev@claude-code-kit-local
```

### Testing Changes

1. Edit plugin files in `plugins/` or shared utilities in `shared/`
2. Exit Claude Code session
3. Start new session
4. Changes are automatically loaded

## Creating New Plugins

1. Create plugin directory in `plugins/`:
   ```bash
   mkdir -p plugins/my-plugin/.claude-plugin
   mkdir -p plugins/my-plugin/hooks
   ```

2. Create `plugin.json`:
   ```json
   {
     "name": "my-plugin",
     "version": "0.1.0",
     "description": "My custom plugin",
     "author": { "name": "your-name" }
   }
   ```

3. Create `hooks/hooks.json`:
   ```json
   {
     "SessionStart": [
       {
         "hooks": [
           {
             "type": "command",
             "command": "node ${CLAUDE_PROJECT_DIR}/shared/runner.ts ${CLAUDE_PLUGIN_ROOT}/hooks/my-hook.ts"
           }
         ]
       }
     ]
   }
   ```

4. Create hook file `hooks/my-hook.ts` importing from `shared/`:
   ```typescript
   import type { HookInput, HookOutput } from '../../../shared/lib/types.ts';
   import { debug } from '../../../shared/lib/debug.ts';

   const log = debug('my-plugin');

   export default async function (input: HookInput): Promise<HookOutput> {
     log('My hook is running!');
     return { success: true };
   }
   ```

5. Add to marketplace.json:
   ```json
   {
     "plugins": [
       {
         "name": "my-plugin",
         "source": "../plugins/my-plugin",
         "strict": false
       }
     ]
   }
   ```

## Shared Hook Runner

All hooks use `shared/runner.ts` to execute TypeScript files:
- Reads JSON input from stdin
- Passes to hook's default export function
- Writes JSON output to stdout
- Supports `--log` flag for debug output

The runner command pattern in `hooks.json`:
```bash
node ${CLAUDE_PROJECT_DIR}/shared/runner.ts ${CLAUDE_PLUGIN_ROOT}/hooks/hook-file.ts
```

Variables provided by Claude Code:
- `${CLAUDE_PROJECT_DIR}` - Root of the Claude Code project (this repo)
- `${CLAUDE_PLUGIN_ROOT}` - Root of the specific plugin being executed

This allows all plugins to share the same runner and utilities from `shared/`.

## Importing Shared Utilities

All plugins can import from `shared/lib/`:

```typescript
// Import types
import type { HookInput, HookOutput } from '../../../shared/lib/types.ts';

// Import utilities (named imports)
import { readJson, writeJson } from '../../../shared/lib/io.ts';
import { debug } from '../../../shared/lib/debug.ts';
import { detectPackageManager } from '../../../shared/lib/package-manager.ts';

// Or import everything
import * as shared from '../../../shared/lib/index.ts';
```

The relative path `../../../shared/lib/` works from any hook file in `plugins/*/hooks/*.ts`.

## Testing

Run tests for shared utilities:

```bash
bun test              # Run all tests
bun test --watch      # Watch mode
```

Enable debug logging for hooks:
```bash
DEBUG=* claude        # All debug output
DEBUG=plugin-name claude  # Specific plugin
```

## CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`):
- Runs on push/PR to main
- Steps: lint → typecheck → test
- No publishing - this is a plugin marketplace, not an npm package

## Key Architecture Decisions

### Shared Utilities Pattern

All plugins import from `shared/lib/` rather than duplicating code. This provides:
- Consistent typing across all hooks
- Shared file I/O and debug utilities
- Single runner implementation
- Easy updates to all plugins

### TypeScript Hook Runner

The `shared/runner.ts` provides a common execution environment:
- Loads TypeScript files with Node's native loaders
- Handles stdin/stdout JSON communication
- Provides error handling and logging
- Eliminates need for build step in plugins

### Hook Type Safety

The `shared/lib/types.ts` provides full TypeScript typing for all hook events:

```typescript
import type { HookInput, HookOutput } from '../../../shared/lib/types.ts';

export default async function (input: HookInput): Promise<HookOutput> {
  // TypeScript knows the shape of input based on input.event
  // TypeScript validates the output structure
}
```

## Documentation

Comprehensive Claude Code documentation in `.claude/skills/`:

- `claude-plugins/SKILL.md` - Plugin development guide
- `claude-hooks/SKILL.md` - Hook types and patterns
- `claude-skills/SKILL.md` - Agent Skills
- `claude-commands/SKILL.md` - Slash commands
- `claude-agents/SKILL.md` - Subagent configuration
- `turborepo-vercel/SKILL.md` - Turborepo monorepos with Vercel deployment
