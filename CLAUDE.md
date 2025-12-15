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
