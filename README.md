# Claude Code Plugins

A curated marketplace of plugins that extend Claude Code with typed hooks for development workflows. This repository provides both ready-to-use plugins and shared TypeScript utilities for creating your own.

## Quick Start

### Installation

1. Add this marketplace to your `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "constellos": {
      "source": {
        "source": "file",
        "path": "./.claude-plugin/marketplace.json"
      }
    }
  }
}
```

2. Install plugins using the CLI:

```bash
/plugin install github-vercel-supabase-ci@constellos
/plugin install github-review-sync@constellos
/plugin install nextjs-supabase-ai-sdk-dev@constellos
/plugin install code-context@constellos
/plugin install structured-context-rules@constellos
```

Or enable them in your settings:

```json
{
  "enabledPlugins": {
    "github-vercel-supabase-ci@constellos": true,
    "github-review-sync@constellos": true,
    "nextjs-supabase-ai-sdk-dev@constellos": true,
    "code-context@constellos": true,
    "structured-context-rules@constellos": true
  }
}
```

## Claude Worktree Setup

The `claude-worktree.sh` script creates isolated git worktrees for each Claude Code session. This enables:
- Independent branches for each session
- No interference with your main working directory
- Easy cleanup and experimentation

### Installation

Add to your `.bashrc` or `.zshrc`:

```bash
# Claude Code worktree launcher
claude-worktree() {
  bash /path/to/claude-code-plugins/claude-worktree.sh "$@"
}
```

Or create a global alias:

```bash
alias claude-worktree='bash /path/to/claude-code-plugins/claude-worktree.sh'
```

### Usage

Launch Claude Code in a new worktree:

```bash
claude-worktree              # Basic usage
claude-worktree --verbose    # With CLI flags
claude-worktree --no-context # Pass any claude CLI flag
```

**What it does:**
1. Detects if you're in a worktree and navigates to parent repo
2. Fetches latest from `origin/main` (or `origin/master`)
3. Creates a new worktree with unique branch name (e.g., `claude-serene-marmot-n6cukzn7`)
4. Launches `claude` in the worktree directory

**With Vercel:**

If you have the `github-vercel-supabase-ci` plugin installed, environment variables are automatically synced from Vercel at session start via the `vercel-env-setup` hook.

### Cleanup

Worktrees are stored in `.worktrees/` and can be removed with:

```bash
git worktree remove .worktrees/claude-branch-name
```

## Available Plugins

### github-vercel-supabase-ci

CI/CD automation for GitHub, Vercel, and Supabase projects.

**Features:**
- Auto-install and configure CI tools (Vercel CLI, Supabase CLI, Docker)
- Install GitHub Actions workflows
- Sync Vercel environment variables to worktrees
- Wait for CI checks after PR creation

**Hooks:**
- `SessionStart` - Setup environment, install workflows, sync Vercel env vars
- `PostToolUse[Bash]` - Monitor PR checks

### github-review-sync

GitHub integration for branch validation and automated commits.

**Features:**
- Check for merge conflicts before session ends
- Verify branch sync status
- Auto-commit subagent work with task context

**Hooks:**
- `SessionStop` - Check branch status (blocking)
- `SubagentStop` - Auto-commit agent changes

### nextjs-supabase-ai-sdk-dev

Development quality gates for Next.js projects.

**Features:**
- Run ESLint on file edits and at session end
- Run TypeScript type checking on edits and at session end
- Run Vitest tests automatically

**Hooks:**
- `PostToolUse[Write|Edit]` - Lint and typecheck edited files
- `PostToolUse[*.test.ts|*.test.tsx]` - Run tests
- `SessionStop` - Full lint, typecheck, and test suite (blocking)

### code-context

Intelligent code structure mapping and navigation.

**Features:**
- Track subagent context and file operations
- Discover related CLAUDE.md files automatically
- Validate markdown structure for configuration files
- Run custom rule checks on file edits

**Hooks:**
- `SubagentStart` / `SubagentStop` - Context tracking
- `PreToolUse[Write|Edit]` - Markdown validation
- `PostToolUse[Read]` - Context discovery
- `PostToolUse[Write|Edit]` - Rule checks

### structured-context-rules

Comprehensive validation for all Claude Code configuration files.

**Features:**
- Validate agent structure (Objective, Principles, context)
- Validate skill structure (Purpose, context, metadata)
- Validate rule structure (Required Skills, headings)
- Validate CLAUDE.md files (name, description metadata)
- Validate plan files (Intent, Plan, Success Criteria)
- Enforce output style tool restrictions

**Hooks:**
- `PreToolUse[Write|Edit]` - Markdown structure validation
- `PreToolUse` - Output style enforcement

## Architecture

```
.
├── .claude-plugin/
│   └── marketplace.json        # Marketplace definition
│
├── shared/                     # Shared utilities for all plugins
│   ├── types/
│   │   └── types.ts           # Hook type definitions
│   ├── hooks/
│   │   ├── utils/             # Hook utilities (I/O, debug, etc.)
│   │   ├── log-subagent-*.ts  # Subagent tracking hooks
│   │   ├── enforce-*.ts       # Validation hooks
│   │   └── run-rule-checks.ts # Custom check execution
│   └── rules/                  # Rule documentation
│
└── plugins/                    # Individual marketplace plugins
    ├── github-vercel-supabase-ci/
    ├── github-review-sync/
    ├── nextjs-supabase-ai-sdk-dev/
    ├── code-context/
    └── structured-context-rules/
```

## Creating Your Own Plugin

1. Create plugin directory structure:

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

## Shared Utilities

All plugins can import from the `shared/` folder:

### Types (`shared/types/types.ts`)

Full TypeScript typing for all Claude Code hook events.

### Hook Utilities (`shared/hooks/utils/`)

- **io.ts** - stdin/stdout JSON handling and `runHook` wrapper
- **debug.ts** - Debug logging with JSONL output
- **transcripts.ts** - Parse Claude transcript JSONL files
- **subagent-state.ts** - Subagent context management
- **package-manager.ts** - Detect npm/yarn/pnpm
- **toml.ts** - Simple TOML parser

## Development

### Testing

```bash
npm run typecheck     # TypeScript type checking
npm run lint          # ESLint
npm run test          # Vitest
npm run test:watch    # Vitest watch mode
```

### Debug Logging

Enable debug output:

```bash
DEBUG=* claude              # All debug output
DEBUG=plugin-name claude    # Specific plugin
```

Debug logs are written to `.claude/logs/hook-events.json` in JSONL format.

### Local Testing

After editing plugin files:
1. Exit Claude Code session
2. Start new session
3. Changes are automatically loaded

## Documentation

Comprehensive documentation in `.claude/skills/`:

- **claude-plugins** - Plugin development guide
- **claude-hooks** - Hook types and patterns
- **claude-skills** - Agent Skills
- **claude-commands** - Slash commands
- **claude-agents** - Subagent configuration

See [CLAUDE.md](./CLAUDE.md) for detailed technical documentation.

## Requirements

- Node.js 18+
- Claude Code CLI
- TypeScript (via tsx)

## License

MIT

## Contributing

Contributions welcome! Please ensure:
- All hooks are self-executable TypeScript files
- Proper typing using `shared/types/types.ts`
- Tests pass (`npm test`)
- Type checking passes (`npm run typecheck`)
- ESLint passes (`npm run lint`)
