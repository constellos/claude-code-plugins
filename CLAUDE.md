---
title: Claude Code Plugins Marketplace
description: A marketplace of Claude Code plugins with shared TypeScript utilities and typed hooks for development workflows
folder:
  subfolders:
    allowed: [.claude, .claude-plugin, .github, docs, plugins, shared]
    required: [.claude-plugin, plugins, shared]
  files:
    allowed: [CLAUDE.md, LICENSE, package.json, package-lock.json, tsconfig.json, vitest.config.ts, eslint.config.mjs, .gitignore, .attw.json, README.md]
    required: [CLAUDE.md, package.json]
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
│   ├── types/
│   │   └── types.ts           # Hook type definitions
│   ├── hooks/
│   │   ├── utils/             # Hook utilities
│   │   │   ├── io.ts          # stdin/stdout + runHook wrapper
│   │   │   ├── debug.ts       # Debug logging
│   │   │   ├── transcripts.ts # Transcript parsing
│   │   │   ├── subagent-state.ts # Subagent context management
│   │   │   ├── package-manager.ts # Package manager detection
│   │   │   ├── toml.ts        # TOML parser
│   │   │   └── index.ts       # Exports all utilities
│   │   ├── log-subagent-start.ts  # SubagentStart hook
│   │   ├── log-subagent-stop.ts   # SubagentStop hook
│   │   ├── enforce-structured-markdown.ts  # PreToolUse hook for markdown validation
│   │   ├── enforce-output-style-tools.ts   # PreToolUse hook for tool enforcement
│   │   └── run-rule-checks.ts              # PostToolUse hook for rule checks
│   └── rules/                  # Claude rules documentation (*.md files)
│       └── CLAUDE.md          # Rules folder documentation
│
└── plugins/                    # Individual marketplace plugins
    ├── github-vercel-supabase-ci/
    │   ├── .claude-plugin/plugin.json
    │   └── hooks/
    │       ├── hooks.json
    │       ├── setup-environment.ts     # SessionStart: install CI tools
    │       ├── install-workflows.ts     # SessionStart: GitHub workflows
    │       └── await-pr-checks.ts       # PostToolUse: wait for CI on PR create
    │
    ├── github-review-sync/
    │   ├── .claude-plugin/plugin.json
    │   └── hooks/
    │       ├── hooks.json
    │       ├── check-branch-status.ts   # SessionStop: check conflicts & sync
    │       └── commit-task.ts           # SubagentStop: auto-commit agent work
    │
    ├── nextjs-supabase-ai-sdk-dev/
    │   ├── .claude-plugin/plugin.json
    │   └── hooks/
    │       ├── hooks.json
    │       ├── lint-file.ts             # PostToolUse: ESLint on file
    │       ├── lint-all.ts              # SessionStop: ESLint on all
    │       ├── typecheck-file.ts        # PostToolUse: TypeScript on file
    │       ├── typecheck-all.ts         # SessionStop: TypeScript on all
    │       ├── vitest-file.ts           # PostToolUse: Vitest on file
    │       └── vitest-all.ts            # SessionStop: Vitest on all
    │
    ├── code-context/
    │   ├── .claude-plugin/plugin.json
    │   └── hooks/
    │       ├── hooks.json               # Includes subagent logging hooks
    │       └── add-folder-context.ts    # PostToolUse: CLAUDE.md discovery
    │
    └── structured-context-rules/
        ├── .claude-plugin/plugin.json
        └── hooks/
            └── hooks.json               # Comprehensive markdown validation
```

## Self-Executable Hooks with tsx

All hooks are self-executable TypeScript files that can be run directly with `npx tsx`. Each hook:
1. Imports the `runHook` wrapper from `shared/hooks/utils/io.ts`
2. Defines a `handler` function with typed input/output
3. Calls `runHook(handler)` at the end of the file

### Hook Pattern

```typescript
import type { SessionStartInput, SessionStartHookOutput } from '../../../shared/types/types.js';
import { runHook } from '../../../shared/hooks/utils/io.js';

async function handler(input: SessionStartInput): Promise<SessionStartHookOutput> {
  // Hook implementation
  return {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: 'Hook executed successfully',
    },
  };
}

// Export handler for testing
export { handler };

// Make this file self-executable with tsx
runHook(handler);
```

### hooks.json Configuration

Hooks are executed directly with `npx tsx`:

```json
{
  "SessionStart": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "npx tsx ${CLAUDE_PLUGIN_ROOT}/hooks/my-hook.ts"
        }
      ]
    }
  ]
}
```

Variables provided by Claude Code:
- `${CLAUDE_PROJECT_DIR}` - Root of the Claude Code project
- `${CLAUDE_PLUGIN_ROOT}` - Root of the specific plugin being executed

## Shared Folder (`shared/`)

### Types (`shared/types/types.ts`)

Full TypeScript typing for all Claude Code hook events:

```typescript
import type {
  SessionStartInput,
  SessionStartHookOutput,
  PostToolUseInput,
  PostToolUseHookOutput,
  // ... all hook types
} from '../../../shared/types/types.js';
```

### Hook Utilities (`shared/hooks/utils/`)

- **io.ts** - stdin/stdout JSON handling and `runHook` wrapper
- **debug.ts** - Debug logging with JSONL output to `.claude/logs/hook-events.json`
- **transcripts.ts** - Parse Claude transcript JSONL files
- **subagent-state.ts** - Save/load/analyze subagent context and edits
- **package-manager.ts** - Detect npm/yarn/pnpm from lockfiles
- **toml.ts** - Simple TOML parser for config files
- **index.ts** - Re-exports all utilities

### Shared Hooks (`shared/hooks/`)

- **log-subagent-start.ts** - SubagentStart hook that saves agent context
- **log-subagent-stop.ts** - SubagentStop hook that logs agent file operations

### Rule Hooks (`shared/hooks/`)

- **enforce-structured-markdown.ts** - PreToolUse hook for comprehensive markdown validation (agents, skills, rules, CLAUDE.md)
- **enforce-output-style-tools.ts** - PreToolUse hook for output style tool enforcement
- **run-rule-checks.ts** - PostToolUse hook for running custom checks

## Available Plugins

### github-vercel-supabase-ci

CI/CD hooks for GitHub, Vercel, and Supabase projects.

**Hooks:**
- **SessionStart** (`setup-environment.ts`) - Install and configure CI tools (Vercel, Supabase, Docker)
- **SessionStart** (`install-workflows.ts`) - Install GitHub Actions workflows
- **PostToolUse[Bash]** (`await-pr-checks.ts`) - Wait for CI after PR creation

### github-review-sync

GitHub review and sync hooks for branch validation, auto-commit, and status checking.

**Hooks:**
- **SessionStop** (`check-branch-status.ts`) - Check for merge conflicts and branch sync status (blocking)
- **SubagentStop** (`commit-task.ts`) - Auto-commit agent work with task context

### nextjs-supabase-ai-sdk-dev

Development quality checks for Next.js projects.

**Hooks:**
- **PostToolUse[Write|Edit]** (`lint-file.ts`) - Run ESLint on edited files
- **PostToolUse[Write|Edit]** (`typecheck-file.ts`) - Run TypeScript type checking on edited files
- **PostToolUse[*.test.ts|*.test.tsx]** (`vitest-file.ts`) - Run Vitest on edited test files
- **SessionStop** (`lint-all.ts`) - Run ESLint on entire project (blocking)
- **SessionStop** (`typecheck-all.ts`) - Run TypeScript type checking on entire project (blocking)
- **SessionStop** (`vitest-all.ts`) - Run full test suite with Vitest (blocking)

### code-context

Code structure mapping and navigation.

**Hooks:**
- **SubagentStart** - Track agent context (uses shared `log-subagent-start.ts`)
- **SubagentStop** - Log agent file operations (uses shared `log-subagent-stop.ts`)
- **PreToolUse[Write|Edit]** - Enforce markdown structure validation (uses shared `enforce-structured-markdown.ts`)
- **PostToolUse[Read]** (`add-folder-context.ts`) - Discover related CLAUDE.md files
- **PostToolUse[Write|Edit]** - Run custom rule checks (uses shared `run-rule-checks.ts`)

### structured-context-rules

Comprehensive markdown structure validation and tool enforcement for agents, skills, rules, and CLAUDE.md files.

**Hooks:**
- **PreToolUse[Write|Edit]** - Validate agent, skill, rule, and CLAUDE.md structure (uses shared `enforce-structured-markdown.ts`)
- **PreToolUse** - Enforce output style tool restrictions (uses shared `enforce-output-style-tools.ts`)
- **PostToolUse[Write|Edit]** - Execute custom checks from rule frontmatter (uses shared `run-rule-checks.ts`)

**Validation Rules:**
- **Agents** (`.claude/agents/*.md`): Require `## Objective`, `## Principles`, `## Agent-scoped project context` headings
- **Skills** (`.claude/skills/*/*.md`): Require `## Purpose`, `## Skill-scoped context` headings and `name`, `description` metadata (excludes SKILL.md/SKILL.template.md)
- **Rules** (`.claude/rules/*.md`): Require `## Rules` heading and `Required Skills` metadata
- **CLAUDE.md** (any directory): Require `name`, `description` metadata; optional `folder`, `files` metadata

## Creating New Plugins

1. Create plugin directory:
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
             "command": "npx tsx ${CLAUDE_PLUGIN_ROOT}/hooks/my-hook.ts"
           }
         ]
       }
     ]
   }
   ```

4. Create hook file `hooks/my-hook.ts`:
   ```typescript
   import type { SessionStartInput, SessionStartHookOutput } from '../../../shared/types/types.js';
   import { runHook } from '../../../shared/hooks/utils/io.js';

   async function handler(input: SessionStartInput): Promise<SessionStartHookOutput> {
     return {
       hookSpecificOutput: {
         hookEventName: 'SessionStart',
         additionalContext: 'My hook executed!',
       },
     };
   }

   export { handler };
   runHook(handler);
   ```

5. Add to marketplace.json:
   ```json
   {
     "plugins": [
       {
         "name": "my-plugin",
         "source": "./plugins/my-plugin"
       }
     ]
   }
   ```

## Local Development

### Using Plugins in This Repo

Configuration in `.claude/settings.json`:

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
    "github-review-sync@claude-code-kit-local": true,
    "nextjs-supabase-ai-sdk-dev@claude-code-kit-local": true
  }
}
```

### Installing Plugins

```
/plugin install github-vercel-supabase-ci@claude-code-kit-local
/plugin install github-review-sync@claude-code-kit-local
/plugin install nextjs-supabase-ai-sdk-dev@claude-code-kit-local
```

### Testing Changes

1. Edit plugin files in `plugins/` or shared utilities in `shared/`
2. Exit Claude Code session
3. Start new session
4. Changes are automatically loaded

## Testing

Run tests and checks:

```bash
npm run typecheck     # TypeScript type checking
npm run lint          # ESLint
npm run test          # Vitest
npm run test:watch    # Vitest watch mode
```

Enable debug logging for hooks:
```bash
DEBUG=* claude              # All debug output
DEBUG=plugin-name claude    # Specific plugin
```

## Key Architecture Decisions

### Self-Executable Hooks

Each hook is a standalone TypeScript file that:
- Uses the `runHook` wrapper for stdin/stdout handling
- Can be executed directly with `npx tsx`
- Exports a named `handler` function for testing
- No separate runner script needed

### Shared Utilities Pattern

All plugins import from `shared/` rather than duplicating code:
- Consistent typing across all hooks
- Shared I/O, debug, and transcript utilities
- Easy updates to all plugins

### Type Safety

Full TypeScript typing for all hook events in `shared/types/types.ts`:
- Input types for each hook event
- Output types with proper constraints
- Handler function type helpers

## Documentation

Comprehensive Claude Code documentation in `.claude/skills/`:

- `claude-plugins/SKILL.md` - Plugin development guide
- `claude-hooks/SKILL.md` - Hook types and patterns
- `claude-skills/SKILL.md` - Agent Skills
- `claude-commands/SKILL.md` - Slash commands
- `claude-agents/SKILL.md` - Subagent configuration
- `turborepo-vercel/SKILL.md` - Turborepo monorepos with Vercel deployment
