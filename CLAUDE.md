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
    ├── github-context/
    │   ├── .claude-plugin/plugin.json
    │   └── hooks/
    │       ├── hooks.json
    │       ├── install-github.ts           # SessionStart: install GitHub CLI
    │       ├── add-github-context.ts       # SessionStart: branch context & issues
    │       ├── sync-plan-to-issue.ts       # PostToolUse[Write|Edit]: plan sync
    │       ├── enhance-commit-context.ts   # PostToolUse[Bash]: commit enhancement
    │       ├── commit-task.ts              # SubagentStop: auto-commit agent work
    │       └── commit-session-check-pr-status.ts  # Stop: session commit & PR checks
    │
    ├── nextjs-supabase-ai-sdk-dev/
    │   ├── .claude-plugin/plugin.json
    │   └── hooks/
    │       ├── hooks.json
    │       ├── install-vercel.ts           # SessionStart: install Vercel CLI
    │       ├── install-supabase.ts         # SessionStart: install Supabase CLI
    │       ├── check-file-eslint.ts        # PostToolUse[Write|Edit]: ESLint on file
    │       ├── check-file-types.ts         # PostToolUse[Write|Edit]: TypeScript on file
    │       ├── check-file-tsdoc.ts         # PostToolUse[Write|Edit]: TSDoc validation
    │       ├── check-file-vitest-results.ts # PostToolUse[Write|Edit]: Vitest on test files
    │       ├── encourage-ui-review.ts      # PostToolUse[Task]: encourage ui-reviewer
    │       ├── check-global-eslint.ts      # Stop: ESLint on all (blocking)
    │       ├── check-global-types.ts       # Stop: TypeScript on all (blocking)
    │       └── check-global-vitest-results.ts # Stop: Vitest on all (blocking)
    │
    └── project-context/
        ├── .claude-plugin/plugin.json
        └── hooks/
            ├── hooks.json
            ├── encourage-context-review.ts  # UserPromptSubmit: context updates
            ├── add-folder-context.ts        # PostToolUse[Read]: CLAUDE.md discovery
            ├── create-plan-symlink.ts       # PostToolUse[Write|Edit]: PLAN.md symlink
            ├── try-markdown-page.ts         # PreToolUse[WebFetch]: prefer .md URLs
            └── shared/                      # Uses shared validation hooks
                ├── log-task-call.ts         # PreToolUse[Task]: save task context
                ├── log-task-result.ts       # PostToolUse[Task]: log task results
                ├── validate-folder-structure-write.ts   # PreToolUse[Write|Edit]
                ├── validate-folder-structure-mkdir.ts   # PreToolUse[Bash]
                ├── validate-rules-file.ts               # PreToolUse[Write|Edit]
                └── enforce-plan-scoping.ts              # PostToolUse[Write|Edit|Read]
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

### github-context

GitHub integration with branch context, commit enhancement, plan synchronization, and CI orchestration.

**Purpose:**
Provides comprehensive GitHub integration including CLI installation, branch/issue context discovery, automatic commit enhancement with task metadata, plan-to-issue synchronization, and PR status monitoring.

**Hooks:**
- **SessionStart** (`install-github.ts`) - Installs GitHub CLI on remote environments, warns if missing locally (non-blocking)
- **SessionStart** (`add-github-context.ts`) - Displays linked GitHub issue for current branch, branch sync status, and outstanding issues (non-blocking)
- **PostToolUse[Write|Edit]** (`sync-plan-to-issue.ts`) - Automatically creates or updates GitHub issues from plan files (non-blocking)
- **PostToolUse[Bash]** (`enhance-commit-context.ts`) - Enhances git commits with task context and issue references for both main agent and subagents (non-blocking)
- **SubagentStop** (`commit-task.ts`) - Auto-commits subagent work with task context and git trailers (non-blocking)
- **Stop** (`commit-session-check-pr-status.ts`) - Auto-commits session changes, checks PR status, and reports CI/preview URLs with progressive blocking

**Key Features:**
- **Branch Context Discovery:** Shows full GitHub issue content (title, body, comments) linked to current branch
- **Sync Status:** Displays branch status relative to remote tracking branch and origin/main
- **Outstanding Issues:** Lists open issues not linked to any branch, available for work
- **Auto-commit:** Automatically commits subagent work with rich task context
- **Plan Synchronization:** Creates/updates GitHub issues from plan files automatically
- **Commit Enhancement:** Enriches commits with task and issue metadata
- **PR Status Monitoring:** Checks PR status at session end with CI and preview URL reporting

**Use Cases:**
- GitHub-integrated development workflows
- Issue-driven development with branch linking
- Automated task documentation through commits
- PR readiness checks before ending sessions
- Multi-agent workflows with automatic commit documentation

### nextjs-supabase-ai-sdk-dev

Development quality enforcement for Next.js, Supabase, and AI SDK projects with comprehensive linting, type checking, testing, and CLI installation.

**Purpose:**
Ensures code quality through automated checks at both file and project levels. Installs Vercel and Supabase CLIs on remote environments, runs per-file quality checks on edits, and performs comprehensive project-wide validation at session end.

**Hooks:**
- **SessionStart** (`install-vercel.ts`) - Installs Vercel CLI on remote environments, warns if missing locally (non-blocking)
- **SessionStart** (`install-supabase.ts`) - Installs Supabase CLI on remote environments, warns if missing locally (non-blocking)
- **PreToolUse[Task]** (shared `log-task-call.ts`) - Logs Task tool calls and saves context for SubagentStop hooks (non-blocking)
- **PostToolUse[Task]** (shared `log-task-result.ts`) - Logs Task tool results after agent completion (non-blocking)
- **PostToolUse[Task]** (`encourage-ui-review.ts`) - Encourages ui-reviewer agent after ui-developer completes (non-blocking)
- **PostToolUse[Write|Edit]** (`check-file-eslint.ts`) - Runs ESLint on individual files after edits (non-blocking, informational)
- **PostToolUse[Write|Edit]** (`check-file-types.ts`) - Runs TypeScript type checking on individual files after edits (non-blocking, informational)
- **PostToolUse[Write|Edit]** (`check-file-tsdoc.ts`) - Validates TSDoc documentation on TypeScript files after edits (non-blocking, informational)
- **PostToolUse[Write|Edit test files]** (`check-file-vitest-results.ts`) - Runs Vitest on test files after edits (non-blocking, informational)
- **Stop** (`check-global-eslint.ts`) - Runs ESLint on entire project at session end (blocking)
- **Stop** (`check-global-types.ts`) - Runs TypeScript type checking on entire project at session end (blocking)
- **Stop** (`check-global-vitest-results.ts`) - Runs full Vitest test suite at session end (blocking)

**Key Features:**
- **CLI Installation:** Automatic installation of Vercel and Supabase CLIs on remote environments
- **Per-File Checks:** Immediate feedback on ESLint, TypeScript, and TSDoc issues after each file edit
- **Test Execution:** Automatic test running when test files are modified
- **Project-Wide Validation:** Comprehensive checks at session end ensure no issues slip through
- **Blocking Stop Hooks:** Prevents ending session with linting errors, type errors, or failing tests
- **Task Tracking:** Logs all Task tool calls for context in SubagentStop hooks
- **UI Review Encouragement:** Prompts for visual review after UI development work

**Use Cases:**
- Next.js application development
- TypeScript projects requiring strict type safety
- Projects with comprehensive test suites
- Teams enforcing code quality standards
- CI/CD workflows requiring pre-push validation

### project-context

Enhanced context discovery, folder structure validation, and project guidance for Claude Code workflows.

**Purpose:**
Automatically discovers and links CLAUDE.md documentation, validates project structure for .claude directories, enforces plan scoping, and encourages context updates based on user prompts. Provides intelligent URL redirection to prefer markdown documentation.

**Hooks:**
- **UserPromptSubmit** (`encourage-context-review.ts`) - Encourages updating plans, agents, skills, and CLAUDE.md files based on user prompts (non-blocking, informational)
- **PreToolUse[Task]** (shared `log-task-call.ts`) - Logs Task tool calls before execution and saves context (non-blocking)
- **PreToolUse[Write|Edit]** (shared `validate-folder-structure-write.ts`) - Validates folder structure when creating .claude files (blocking on structure violations)
- **PreToolUse[Write|Edit]** (shared `validate-rules-file.ts`) - Validates rule file structure and Required Skills frontmatter (blocking on validation errors)
- **PreToolUse[Bash]** (shared `validate-folder-structure-mkdir.ts`) - Validates mkdir commands for .claude directories (blocking on invalid paths)
- **PreToolUse[WebFetch]** (`try-markdown-page.ts`) - Redirects WebFetch to markdown versions of documentation when available (non-blocking)
- **PostToolUse[Task]** (shared `log-task-result.ts`) - Logs Task tool results after completion (non-blocking)
- **PostToolUse[Write|Edit]** (`create-plan-symlink.ts`) - Creates PLAN.md symlink when plan files are written (non-blocking)
- **PostToolUse[Write|Edit]** (shared `enforce-plan-scoping.ts`) - Enforces plan-based path scoping for write/edit operations (can block on scope violations)
- **PostToolUse[Read]** (`add-folder-context.ts`) - Discovers and adds CLAUDE.md context when reading files (non-blocking)
- **PostToolUse[Read]** (shared `enforce-plan-scoping.ts`) - Warns when reads are outside plan scope (non-blocking, guidance only)

**Key Features:**
- **Automatic Context Discovery:** Finds and links CLAUDE.md files when reading project files
- **Folder Structure Validation:** Ensures .claude directories follow proper organization standards
- **Plan Scoping:** Enforces staying within plan boundaries for file operations
- **Rules Validation:** Ensures rule files have proper structure and Required Skills metadata
- **Context Encouragement:** Prompts to update documentation based on user activity
- **Markdown Preference:** Automatically redirects to .md versions of documentation URLs
- **Plan Symlinks:** Maintains PLAN.md link to active plan file
- **Task Tracking:** Comprehensive logging of agent invocations and results

**Use Cases:**
- Large codebases requiring organized documentation
- Projects with .claude directory structures (agents, skills, rules, hooks)
- Plan-driven development workflows
- Documentation-heavy projects
- Teams enforcing project structure standards
- Research-oriented development (prefers markdown docs)

## Vercel Preview Configuration

This project is configured to deploy all Turborepo apps on every commit and PR:

- **Web App** (`apps/web`) - Main application
- **Admin App** (`apps/admin`) - Administration dashboard
- **Docs App** (`apps/docs`) - Documentation site

**Preview URL Detection:**
- Vercel bot posts preview URLs as PR comments
- UI review workflow polls for these URLs (10 minute timeout)
- Each app gets its own preview URL: `https://[app-name]-[hash].vercel.app`

**E2E Testing:**
- Playwright tests run against preview URLs in CI
- Tests are isolated to `@app` and `@web` tags only
- Screenshots captured during test execution at key moments
- Claude API reviews screenshots per app and per test

## Worktree Operation Restrictions

**IMPORTANT**: When working in git worktrees, follow these best practices:

### Recommended Settings (Local Development)

Add to your local `.claude/settings.json` (NOT committed to repo):

```json
{
  "workingDirectoryRestrictions": {
    "enabled": true,
    "allowedPaths": [
      "/home/user/projects/my-repo/.worktrees/claude-*"
    ]
  }
}
```

### Why Worktree Safety Matters

- **Isolation**: Each worktree is an independent branch checkout
- **Context**: Main repo and worktree can have different files
- **Safety**: Operations outside worktree can affect main repo or other worktrees
- **Best Practice**: Review all file operations to ensure they target the worktree

### Worktree Context

The `github-context-sync` plugin automatically:
- Shows linked GitHub issue for current branch (full content with comments)
- Displays branch sync status (remote tracking branch and origin/main)
- Lists outstanding unlinked issues available for work
- Encourages UI review after ui-developer agent completes

### Manual Verification

Always verify you're in the correct worktree:

```bash
pwd                    # Check current directory
git rev-parse --show-toplevel  # Show worktree root
git branch --show-current      # Show current branch
```

### Automatic Plugin Cache Management

The `claude-worktree.sh` script automatically manages plugin cache to ensure every worktree uses current plugin code:

1. **Detects enabled plugins** from `.claude/settings.json`
2. **Cleans up invalid installations** - Removes cached plugins whose source no longer exists
3. **Refreshes plugin cache** - Uninstalls and reinstalls all plugins from worktree source
4. **Ensures fresh hooks** - Every worktree session uses current plugin code

**Why this matters:**
- Plugins are cached globally at `~/.claude/plugins/cache/`
- Cache is not automatically invalidated when source changes
- Old cached hooks can cause unexpected behavior (missing new hooks, running removed hooks)
- Automatic refresh ensures worktree uses fresh plugin code

**Dependencies:**
- Requires `jq` for parsing JSON: `brew install jq` (macOS) or `apt install jq` (Linux)
- Without `jq`, manual plugin reinstallation required

**Manual cache refresh:**
```bash
# List plugins
claude plugin list

# Uninstall and reinstall
claude plugin uninstall --scope project plugin-name@constellos
claude plugin install --scope project plugin-name@constellos
```

## UI Development Workflow

This project includes a comprehensive UI development system with progressive skills and automated review:

### UI Development Skills (Progressive)

1. **ui-wireframing** - Mobile-first ASCII wireframes in `WIREFRAME.md` files
2. **ui-design** - Contract-first static UI with compound components
3. **ui-interaction** - Client-side events, local state, validation
4. **ui-integration** - Server actions, Supabase queries, backend integration
5. **ai-sdk-ui** - AI-powered features with Vercel AI SDK

### UI Developer Agent

The `ui-developer` agent (in `nextjs-supabase-ai-sdk-dev` plugin) provides:
- All 5 UI skills preloaded
- MCP integration (ai-elements, shadcn, next-devtools)
- Systematic workflow: wireframe → design → interaction → integration → AI
- Mobile-first, contract-first, Server Component defaults

**Local Development:**
- Uses next-devtools MCP for live preview and debugging
- No Playwright installation needed locally
- Real-time UI feedback during development

### UI Review System

**Manual Review:**
- Invoke `ui-reviewer` agent with screenshot paths
- Provides systematic quality review
- Identifies critical, major, and minor issues

**Automated CI Review:**
- GitHub Actions workflow (`ui-review.yml`) runs on commits/PRs
- Playwright e2e tests for `@app` and `@web` tags
- Screenshots captured during test execution
- Claude API reviews each test's screenshots with vision
- Per-test reviews aggregated into final report
- Blocks merge if critical issues found

**Review Criteria:**
- Visual consistency across breakpoints
- Responsive behavior (mobile, tablet, desktop)
- Accessibility (color contrast, semantic HTML)
- Component composition patterns
- User experience quality

### Technology Stack

- **UI Components**: Shadcn (default), AI Elements, Radix, HTML
- **Styling**: Tailwind CSS with mobile-first approach
- **State Management**: Server Components (default), client components when needed
- **Validation**: Zod schemas (client + server)
- **Backend**: Supabase with defense-in-depth (RLS + explicit auth checks)
- **AI Integration**: Vercel AI SDK with streaming UI

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

## Claude Code Documentation Notes

The official Claude Code documentation may be out of date or incomplete. When implementing hooks:

- **Test actual behavior** rather than relying solely on docs
- **Check GitHub issues** for known bugs (e.g., issue #10412 about Stop hooks via plugins)
- **The `reason` field in Stop hooks is shown to Claude** (tells it what to fix)
- **The `systemMessage` field is shown to the user** (status info, not visible to Claude)
- **Use explicit `decision: "approve"`** when allowing stop (not just empty `{}`)
- **Use explicit `decision: "block"` with actionable `reason`** when blocking

### Stop Hook Output Best Practices

```typescript
// When blocking - provide actionable instructions to Claude
return {
  decision: 'block',
  reason: 'ESLint errors detected. You MUST fix these before stopping:\n\n[errors here]\n\nFix each error, then run linter to verify.',
  systemMessage: 'Claude is blocked from stopping due to ESLint errors.',
};

// When approving - be explicit
return { decision: 'approve' };
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

### Plugin Cache Out of Sync

**Symptom:** Hooks behaving differently than expected (old hooks firing, new hooks missing, removed hooks still running)

**Cause:** Plugin cache at `~/.claude/plugins/cache/` contains old versions from before recent changes

**Solution:**

1. **Automatic (recommended):** Use `claude-worktree.sh` which auto-refreshes plugins on every new worktree
   ```bash
   bash claude-worktree.sh
   ```

2. **Manual:** Reinstall plugins to refresh cache:
   ```bash
   # Uninstall all constellos plugins
   claude plugin uninstall --scope project github-context@constellos
   claude plugin uninstall --scope project nextjs-supabase-ai-sdk-dev@constellos
   claude plugin uninstall --scope project project-context@constellos

   # Reinstall from current source
   claude plugin install --scope project github-context@constellos
   claude plugin install --scope project nextjs-supabase-ai-sdk-dev@constellos
   claude plugin install --scope project project-context@constellos
   ```

3. **Nuclear option:** Delete entire cache and reinstall:
   ```bash
   rm -rf ~/.claude/plugins/cache/constellos
   claude plugin install --scope project github-context@constellos
   claude plugin install --scope project nextjs-supabase-ai-sdk-dev@constellos
   claude plugin install --scope project project-context@constellos
   ```

**Verification:**
```bash
# Check if await-pr-checks hook exists (added in PR #71)
ls ~/.claude/plugins/cache/constellos/github-context/hooks/await-pr-checks.ts

# Verify NO Stop hooks in nextjs-supabase-ai-sdk-dev (removed in PR #71)
cat ~/.claude/plugins/cache/constellos/nextjs-supabase-ai-sdk-dev/hooks/hooks.json | grep -i "stop"

# Compare cached vs source to see differences
diff ~/.claude/plugins/cache/constellos/github-context/hooks/hooks.json \
     ./plugins/github-context/hooks/hooks.json
```

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

### Automatic Hook Logging and Error Handling

**All hooks automatically log to `.claude/logs/hook-events.json`** via the `runHook` wrapper in `shared/hooks/utils/io.ts`. Hook developers don't need to write ANY logging code.

**How it works:**
1. `runHook(handler)` wraps your hook handler function
2. Reads input from stdin and creates a debug logger
3. **Automatically logs input** before executing handler (if debug enabled)
4. Executes your handler function
5. **Automatically logs output** after handler completes (if debug enabled)
6. **Automatically logs errors** if handler throws (if debug enabled)
7. **ALWAYS returns blocking error response** if handler throws (regardless of debug mode)
8. Writes output to stdout for Claude Code

**What gets logged:**
- **Input logs**: Complete hook input including tool names, parameters, session context
- **Output logs**: Hook return values, additional context, permission decisions
- **Error logs**: Exception details, stack traces, error messages

**Error Handling Behavior:**
- **ALL hook errors block execution** - No silent failures
- **Module resolution errors** (missing imports) block immediately
- **Runtime errors** (uncaught exceptions) block immediately
- **Type errors** and other exceptions block immediately
- Debug flag controls **logging verbosity only**, NOT blocking behavior

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

// This provides automatic logging AND error handling!
runHook(handler);
```

**Key principle:** Hook handlers should contain ONLY business logic. The `runHook` wrapper handles all logging, error handling, and stdin/stdout communication automatically. All errors are converted to blocking responses to ensure broken hooks cannot fail silently.

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

For Claude Code plugin development documentation, use the `plugin-dev` plugin which provides comprehensive skills for:
- Plugin structure and development
- Hook types and patterns
- Agent, skill, and command creation
- MCP integration
