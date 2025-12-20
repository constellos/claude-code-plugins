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
│   │   │   ├── task-state.ts  # Task state management
│   │   │   ├── package-manager.ts # Package manager detection
│   │   │   ├── toml.ts        # TOML parser
│   │   │   ├── was-tool-event-main-agent.ts # Agent detection
│   │   │   └── index.ts       # Exports all utilities
│   │   ├── log-subagent-start.ts  # SubagentStart hook
│   │   ├── log-subagent-stop.ts   # SubagentStop hook
│   │   ├── log-task-call.ts       # PreToolUse[Task] hook
│   │   ├── log-task-result.ts     # PostToolUse[Task] hook
│   │   ├── enforce-structured-markdown.ts  # PreToolUse hook for markdown validation
│   │   ├── enforce-output-style-tools.ts   # PreToolUse hook for tool enforcement
│   │   ├── validate-folder-structure-write.ts  # PreToolUse[Write|Edit] hook
│   │   ├── validate-folder-structure-mkdir.ts  # PreToolUse[Bash] hook
│   │   ├── validate-rules-file.ts          # PreToolUse[Write|Edit] hook
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
    │       ├── check-branch-status.ts       # SessionEnd: check conflicts & sync
    │       ├── check-documentation.ts       # PreToolUse: ensure docs present
    │       ├── commit-task.ts               # SubagentStop: auto-commit agent work
    │       ├── guide-requirements-check.ts  # PreToolUse: guide compliance
    │       ├── review-commit.ts             # PreToolUse[Bash]: commit review
    │       └── sync-plan-to-issue.ts        # PostToolUse: sync plan changes
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
    │       ├── hooks.json
    │       ├── add-folder-context.ts    # PostToolUse[Read]: CLAUDE.md discovery
    │       └── (uses shared hooks for validation and logging)
    │
    └── markdown-structure-rules/
        ├── .claude-plugin/plugin.json
        └── hooks/
            ├── hooks.json               # Rules file validation
            └── validate-rules-structure.ts  # PreToolUse: validate rules structure
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

**IMPORTANT**: The official Claude Code repository and its plugins should serve as the canonical example:
- Repository: https://github.com/anthropics/claude-code
- Marketplace: https://raw.githubusercontent.com/anthropics/claude-code/main/.claude-plugin/marketplace.json
- Example plugins: https://github.com/anthropics/claude-code/tree/main/plugins

Hooks must be wrapped in a `"hooks"` object:

```json
{
  "description": "My plugin description",
  "hooks": {
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
- **task-state.ts** - Task state management for PreToolUse[Task] → SubagentStop flow
- **package-manager.ts** - Detect npm/yarn/pnpm/bun from lockfiles
- **toml.ts** - Simple TOML parser for config files
- **was-tool-event-main-agent.ts** - Detect if tool event is from main agent or subagent
- **index.ts** - Re-exports all utilities

### Shared Hooks (`shared/hooks/`)

**Logging and State Management:**
- **log-subagent-start.ts** - SubagentStart hook that saves agent context
- **log-subagent-stop.ts** - SubagentStop hook that logs agent file operations
- **log-task-call.ts** - PreToolUse[Task] hook that saves task call metadata
- **log-task-result.ts** - PostToolUse[Task] hook that logs task results

**Validation and Enforcement:**
- **enforce-structured-markdown.ts** - PreToolUse[Write|Edit] hook for comprehensive markdown validation (agents, skills, rules, CLAUDE.md)
- **enforce-output-style-tools.ts** - PreToolUse hook for output style tool enforcement
- **validate-folder-structure-write.ts** - PreToolUse[Write|Edit] hook for .claude directory structure validation
- **validate-folder-structure-mkdir.ts** - PreToolUse[Bash] hook for mkdir command validation
- **validate-rules-file.ts** - PreToolUse[Write|Edit] hook for rule file structure validation

**Custom Checks:**
- **run-rule-checks.ts** - PostToolUse[Write|Edit] hook for running custom checks from rule frontmatter

## Available Plugins

### github-vercel-supabase-ci

CI/CD hooks for GitHub, Vercel, and Supabase projects.

**Hooks:**
- **SessionStart** (`setup-environment.ts`) - Install and configure CI tools (Vercel, Supabase, Docker)
- **SessionStart** (`install-workflows.ts`) - Install GitHub Actions workflows
- **PostToolUse[Bash]** (`await-pr-checks.ts`) - Wait for CI after PR creation

### github-review-sync

GitHub review and sync hooks for branch validation, auto-commit, plan synchronization, and quality enforcement.

**Hooks:**
- **SessionEnd** (`check-branch-status.ts`) - Check for merge conflicts and branch sync status (blocking)
- **PreToolUse** (`check-documentation.ts`) - Ensure README and documentation are present
- **SubagentStop** (`commit-task.ts`) - Auto-commit agent work with task context
- **PreToolUse** (`guide-requirements-check.ts`) - Enforce guide and documentation requirements
- **PreToolUse[Bash]** (`review-commit.ts`) - Review git commit messages for quality
- **PostToolUse** (`sync-plan-to-issue.ts`) - Sync plan file changes to GitHub issues

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

Automatic context discovery and project structure validation for Claude Code projects.

**Hooks:**
- **PostToolUse[Read]** (`add-folder-context.ts`) - Automatically discover and link related CLAUDE.md documentation
- **PreToolUse[Task]** (shared `log-task-call.ts`) - Save task call metadata for SubagentStop hooks
- **PostToolUse[Task]** (shared `log-task-result.ts`) - Log task completion results
- **PreToolUse[Write|Edit]** (shared `validate-folder-structure-write.ts`) - Validate .claude directory structure
- **PreToolUse[Write|Edit]** (shared `validate-rules-file.ts`) - Validate rule file structure and frontmatter
- **PreToolUse[Bash]** (shared `validate-folder-structure-mkdir.ts`) - Validate mkdir commands in .claude directories

### markdown-structure-rules

Validates markdown structure for rules files in `.claude/rules/`.

**Hooks:**
- **PreToolUse[Write|Edit]** (`validate-rules-structure.ts`) - Validate rules file structure

**Validation Rules:**
- **Rules** (`.claude/rules/*.md`): Require `Required Skills` frontmatter field and `## Rules` heading

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
     "description": "My plugin hooks",
     "hooks": {
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
   }
   ```

4. Create hook file `hooks/my-hook.ts` with proper TSDoc:
   ```typescript
   /**
    * Brief description of what this hook does
    *
    * Detailed explanation of the hook's purpose, when it triggers,
    * and what it accomplishes.
    *
    * @module my-hook
    */

   import type { SessionStartInput, SessionStartHookOutput } from '../../../shared/types/types.js';
   import { runHook } from '../../../shared/hooks/utils/io.js';

   /**
    * SessionStart hook handler
    *
    * Executes at session start to perform [specific action].
    *
    * @param input - SessionStart hook input from Claude Code
    * @returns Hook output with additional context
    *
    * @example
    * ```typescript
    * // This hook is automatically called by Claude Code
    * // when a new session starts
    * ```
    */
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

6. Create `README.md` documenting your plugin:
   ```markdown
   # My Plugin

   Brief description of what the plugin does.

   ## Overview

   Detailed explanation of the plugin's purpose and capabilities.

   ## Hooks

   ### SessionStart - Hook Name

   **File:** `hooks/my-hook.ts`
   **Event:** SessionStart
   **What it does:** Detailed description of hook behavior
   **Non-blocking:** Yes/No

   ## Installation

   \```bash
   claude plugin install my-plugin@constellos
   \```

   ## Configuration

   Description of any configuration options.

   ## Debug Logging

   \```bash
   DEBUG=my-hook claude
   \```
   ```

## Local Development

### Using Plugins in This Repo

Configuration in `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "github-vercel-supabase-ci@constellos": true,
    "github-review-sync@constellos": true,
    "nextjs-supabase-ai-sdk-dev@constellos": true,
    "code-context@constellos": true,
    "markdown-structure-rules@constellos": true
  }
}
```

Note: The marketplace is automatically registered when you run `claude plugin marketplace add ./` from the project root.

### Installing Plugins

First, add the marketplace:
```bash
claude plugin marketplace add ./
```

Then install the plugins:
```bash
claude plugin install github-vercel-supabase-ci@constellos
claude plugin install github-review-sync@constellos
claude plugin install nextjs-supabase-ai-sdk-dev@constellos
claude plugin install code-context@constellos
claude plugin install markdown-structure-rules@constellos
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

## Troubleshooting

### Hooks Not Firing

If hooks aren't executing:

1. **Check plugin cache**: Plugins are cached in `~/.claude/plugins/cache/`. Verify the cached `hooks.json` has the correct format with the `"hooks"` wrapper.

2. **Verify hooks.json format**: Use the claude-code-guide agent to confirm the correct format:
   ```bash
   # In Claude Code session
   /help hooks.json format
   ```

   Or research with the claude-code-guide agent:
   - What is the correct format for hooks.json?
   - Should hooks be wrapped in a "hooks" object?

3. **Reinstall plugins**: If you changed the hooks.json format, reinstall to refresh cache:
   ```bash
   claude plugin uninstall --scope project my-plugin@constellos
   claude plugin install --scope project my-plugin@constellos
   ```

4. **Restart Claude Code**: Hooks only load when Claude Code starts. After any plugin changes:
   - Exit current session
   - Start new session
   - Verify hooks fire by checking `.claude/logs/hook-events.json`

5. **Validate plugins**: Check for configuration issues:
   ```bash
   claude plugin validate plugins/my-plugin
   claude plugin marketplace list
   ```

6. **Check marketplace configuration**: In `.claude/settings.json`:
   ```json
   {
     "extraKnownMarketplaces": {
       "constellos": {
         "source": {
           "source": "directory",
           "path": "./.claude-plugin"
         }
       }
     },
     "enabledPlugins": {
       "my-plugin@constellos": true
     }
   }
   ```

7. **Use claude-code-guide for research**: When troubleshooting, always use the claude-code-guide agent for accurate documentation:
   - Hook event types and lifecycle
   - Plugin installation and configuration
   - Debugging techniques

### When to Restart Sessions vs Reinstall Plugins

Understanding when changes require a session restart vs plugin reinstall helps maintain an efficient development workflow.

**Requires NEW session** (exit and restart Claude Code):
- Changes to `.claude/settings.json`:
  - Modifying `enabledPlugins`
  - Adding/removing `extraKnownMarketplaces`
  - Changing marketplace paths or configuration
- Adding new plugins to marketplace
- Removing plugins from marketplace
- Changes to `.claude-plugin/marketplace.json`

**Requires plugin REINSTALL** (no session restart needed):
- Changes to `hooks/hooks.json` (hook configuration)
- Changes to `.claude-plugin/plugin.json` (plugin metadata)
- Changes to hook implementation files (`.ts` files)
- Changes to shared utilities in `shared/` folder
- Bug fixes or improvements to existing hooks

**Reinstall command:**
```bash
claude plugin uninstall --scope project my-plugin@constellos
claude plugin install --scope project my-plugin@constellos
```

**Or use the quick reinstall pattern:**
```bash
claude plugin uninstall --scope project my-plugin@constellos 2>/dev/null || true && \
claude plugin install --scope project my-plugin@constellos
```

**No restart or reinstall needed:**
- Documentation changes (README.md, CLAUDE.md)
- Comment updates in code
- Test file changes
- Non-hook TypeScript files

**Why this matters:**
- Plugin files are copied to `~/.claude/plugins/cache/` during installation
- Claude Code loads plugin configuration only at session start
- Reinstalling updates the cache without requiring a full session restart
- This allows rapid iteration during plugin development

**Development workflow:**
1. Make changes to hook implementation
2. Reinstall the plugin to update cache
3. Test the changes in current session
4. Repeat until working correctly

**Only restart session when:**
- You've made changes to `.claude/settings.json`
- You've added/removed plugins from the marketplace
- Reinstalling doesn't seem to apply your changes

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

### Automatic Hook Logging

**All hooks automatically log to `.claude/logs/hook-events.json`** via the `runHook` wrapper in `shared/hooks/utils/io.ts`. Hook developers don't need to write ANY logging code.

**How it works:**
1. `runHook(handler)` wraps your hook handler function
2. Reads input from stdin and creates a debug logger
3. **Automatically logs input** before executing handler (if debug enabled)
4. Executes your handler function
5. **Automatically logs output** after handler completes (if debug enabled)
6. **Automatically logs errors** if handler throws (if debug enabled)
7. Writes output to stdout for Claude Code

**What gets logged:**
- **Input logs**: Complete hook input including tool names, parameters, session context
- **Output logs**: Hook return values, additional context, permission decisions
- **Error logs**: Exception details, stack traces, error messages

**When logging is enabled:**
- Debug mode is controlled by `input.debug === true` passed from Claude Code
- Logging is always active when Claude Code runs hooks
- No environment variables or configuration needed

**Log file format:**
- Location: `.claude/logs/hook-events.json`
- Format: JSONL (one JSON object per line)
- Structure: `{ timestamp, event, type, data }`

**Pattern all hooks follow:**
```typescript
import type { SessionStartInput, SessionStartHookOutput } from '../../../shared/types/types.js';
import { runHook } from '../../../shared/hooks/utils/io.js';

async function handler(input: SessionStartInput): Promise<SessionStartHookOutput> {
  // Business logic only - NO manual logging needed!
  return {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: 'Hook executed successfully',
    },
  };
}

// Export for testing
export { handler };

// This provides automatic logging!
runHook(handler);
```

**Key principle:** Hook handlers should contain ONLY business logic. The `runHook` wrapper handles all logging, error handling, and stdin/stdout communication automatically.

### TSDoc Documentation Standards

All TypeScript files in this project follow TSDoc 2025 best practices:

**Required elements:**
- **@module** tag at the top of each file describing its purpose
- **Multi-line format** for all public exports
- **@param** tags for all parameters with descriptions
- **@returns** tags describing return values
- **@throws** tags documenting error conditions
- **@example** blocks showing realistic usage

**Pattern:**
```typescript
/**
 * Brief description of what the function does
 *
 * More detailed explanation of behavior, use cases, and important notes.
 *
 * @param paramName - Description of parameter purpose
 * @returns Description of return value and what it represents
 * @throws Error description - when and why it throws
 *
 * @example
 * ```typescript
 * import { functionName } from './module.js';
 * const result = await functionName('example-input');
 * ```
 */
```

**References:**
- TSDoc standard: https://tsdoc.org/
- TypeScript documentation: https://www.typescriptlang.org/docs/

All hooks and utilities in this project have comprehensive TSDoc documentation for:
- Clear understanding of purpose and behavior
- Type-safe usage with IDE support
- Maintainability and onboarding
- Automated documentation generation

## Documentation Best Practices

When developing agents, skills, commands, and rules for this project, follow these documentation standards:

### Link to Official Documentation

**Always link to official documentation and best practices** when creating or modifying:
- Agents
- Skills
- Commands
- Rules

### Prefer Markdown Versions of Documentation

When linking to documentation, **prefer `.md` file URLs** over HTML pages whenever available:

**Examples of markdown-friendly documentation:**

- **Claude Code**: https://github.com/anthropics/claude-code/tree/main/docs
- **Next.js**: https://github.com/vercel/next.js/tree/canary/docs
- **Vercel**: https://vercel.com/docs (provides markdown-friendly content)
- **Supabase**: https://github.com/supabase/supabase/tree/master/apps/docs

**Why markdown versions?**
- More AI-friendly to read and parse
- Better for offline access
- Easier to diff and track changes
- Direct access to source content

### Research Before Implementation

Before implementing or modifying agents, skills, commands, or rules:

1. **Search for official documentation** - Find the authoritative source
2. **Search for best practices** - Look for recommended patterns and approaches
3. **Link explicitly in markdown files** - Include references to official docs in:
   - Agent `## Agent-scoped project context` sections
   - Skill `## Skill-scoped context` sections
   - Rule files under appropriate headings
   - Command documentation

**Example (Agent):**

```markdown
## Agent-scoped project context

- Uses Next.js App Router (https://raw.githubusercontent.com/vercel/next.js/canary/docs/app/building-your-application/routing.md)
- Follows Vercel deployment best practices (https://vercel.com/docs/deployments)
- TypeScript strict mode enabled (https://www.typescriptlang.org/tsconfig#strict)
```

**Example (Skill):**

```markdown
## Skill-scoped context

- Supabase database migrations (https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/content/guides/database/migrations.mdx)
- Migration best practices: always test locally before production
- Use meaningful migration names with timestamps
```

**Example (Rule):**

```markdown
## Rules

1. Follow TypeScript strict mode guidelines (https://www.typescriptlang.org/tsconfig#strict)
2. Use Next.js App Router patterns (https://github.com/vercel/next.js/tree/canary/docs/app)
3. Follow React Server Components best practices (https://github.com/reactwg/server-components/discussions)
```

### Informing vs. Linking

- **Link to official docs** - These are the authoritative references for tools and frameworks
- **Use best practices to inform** - Best practices guide how you structure agents, skills, commands, and rules
- **Keep docs fresh** - Update links when major version changes occur

## Documentation

Comprehensive Claude Code documentation in `.claude/skills/`:

- `claude-plugins/SKILL.md` - Plugin development guide
- `claude-hooks/SKILL.md` - Hook types and patterns
- `claude-skills/SKILL.md` - Agent Skills
- `claude-commands/SKILL.md` - Slash commands
- `claude-agents/SKILL.md` - Subagent configuration
- `turborepo-vercel/SKILL.md` - Turborepo monorepos with Vercel deployment
