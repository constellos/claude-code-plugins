# Claude Code Kit - Internal Notes

## Project Overview

TypeScript toolkit for Claude Code development - types, schemas, transcript parsing, and hook utilities.

## Project Architecture: Plugin Development & Distribution

**This project serves dual purposes:**

### 1. Shared Utilities (`shared/`)

Shared code at project root used by all plugins:

```
shared/
├── lib/
│   ├── types.ts           # Hook type definitions
│   ├── io.ts              # File system utilities
│   ├── debug.ts           # Debug logging
│   ├── subagent-state.ts  # Agent context management
│   ├── transcripts.ts     # Transcript parsing
│   ├── package-manager.ts # Package manager detection
│   └── index.ts           # Exports all utilities
└── runner.ts              # TypeScript hook runner
```

### 2. Plugin Development (`plugins/`)

Claude Code plugins are developed at the project root in `plugins/`:

```
plugins/
├── github-vercel-supabase-ci/  # CI/CD automation
│   ├── .claude-plugin/plugin.json
│   └── hooks/
│       ├── hooks.json
│       └── pull-latest-main.ts   # SessionStart hook
│
├── nextjs-supabase-ai-sdk-dev/  # Next.js dev tools
│   ├── .claude-plugin/plugin.json
│   └── hooks/
│       ├── hooks.json
│       ├── lint-file.ts
│       ├── typecheck-file.ts
│       └── vitest-file.ts
│
└── claude-code-config/          # Config management (placeholder)
    └── .claude-plugin/plugin.json
```

**Plugin Structure:**
- Each plugin has `.claude-plugin/plugin.json` inside it
- All plugins import from `../../../shared/lib/` (relative path)
- No base plugin - shared utilities are not distributed as a plugin

### 3. Plugin Distribution (`.claude-plugin/marketplace.json`)

The marketplace definition at `.claude-plugin/marketplace.json` references plugins for distribution:

```json
{
  "name": "Constellos Claude Code Kit",
  "metadata": {
    "pluginRoot": "../plugins"
  },
  "plugins": [
    { "name": "github-vercel-supabase-ci", "source": "../plugins/github-vercel-supabase-ci", "strict": false },
    { "name": "nextjs-supabase-ai-sdk-dev", "source": "../plugins/nextjs-supabase-ai-sdk-dev", "strict": false },
    { "name": "claude-code-config", "source": "../plugins/claude-code-config", "strict": false }
  ]
}
```

### 4. Local Usage (`.claude/settings.json`)

This project uses its own plugins via `extraKnownMarketplaces`:

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
    "nextjs-supabase-ai-sdk-dev@claude-code-kit-local": true,
    "claude-code-config@claude-code-kit-local": true
  }
}
```

### Installation & Testing Workflow

**To use plugins in this project:**

1. **First time setup** (already done):
   - Marketplace defined at `.claude-plugin/marketplace.json`
   - Plugins enabled in `.claude/settings.json`
   - User must install plugins via `/plugin install` commands

2. **Installing plugins** (must be done manually):
   ```
   /plugin install github-vercel-supabase-ci@claude-code-kit-local
   /plugin install nextjs-supabase-ai-sdk-dev@claude-code-kit-local
   /plugin install claude-code-config@claude-code-kit-local
   ```

3. **Testing plugin changes**:
   - Edit plugin files in `plugins/`
   - Exit Claude Code session
   - Start new session - plugins reload automatically
   - Hooks and features will reflect changes

### Active Hooks in This Project

**github-vercel-supabase-ci plugin:**
- **SessionStart** → `plugins/github-vercel-supabase-ci/hooks/pull-latest-main.ts`
  - Auto-fetches origin and merges main/master branch
  - Handles merge conflicts gracefully (aborts and notifies)

**nextjs-supabase-ai-sdk-dev plugin:**
- **PostToolUse (Write|Edit)** → `plugins/nextjs-supabase-ai-sdk-dev/hooks/lint-file.ts`
  - Runs ESLint after file edits
- **PostToolUse (Write|Edit)** → `plugins/nextjs-supabase-ai-sdk-dev/hooks/typecheck-file.ts`
  - Runs `tsc --noEmit` after file edits
- **PostToolUse (*.test.ts|*.test.tsx)** → `plugins/nextjs-supabase-ai-sdk-dev/hooks/vitest-file.ts`
  - Runs Vitest when test files are edited

All hooks have debug logging enabled and import utilities from `shared/lib/`.

## Versioning Policy

**IMPORTANT**: Only update the patch version (last number) unless explicitly requested otherwise.

- `0.2.5` → `0.2.6` ✓ (patch bump - default)
- `0.2.5` → `0.3.0` ✗ (minor bump - only if requested)
- `0.2.5` → `1.0.0` ✗ (major bump - only if requested)

## Key Architecture Decisions

### Transcript Parsing (`src/transcripts/`)

- **parser.ts**: Parses JSONL transcript files from `~/.claude/projects/`
- **queries.ts**: Query utilities for extracting data from transcripts
- **types.ts**: Internal types for transcript structures

### Agent Context Flow (SubagentStart → SubagentStop)

The `tool_result` for a Task call is NOT available at SubagentStop time (it hasn't been written yet). To work around this:

1. **SubagentStart hook** calls `saveAgentStartContext()` which:
   - Parses parent transcript to find the pending Task tool_use
   - Saves context (prompt, toolUseId, agentType) to `.claude/state/active-subagents.json`

2. **SubagentStop hook** calls `getAgentEdits()` which uses `findTaskCallForAgent()` with 3 matching strategies:
   - **Strategy 1**: Direct toolUseId lookup (from saved context) - most reliable
   - **Strategy 2**: Match via tool_result.agentId (for historical/completed transcripts)
   - **Strategy 3**: Fuzzy match by subagentType + timestamp within 10s window

3. Context is auto-cleaned up after `getAgentEdits()` processes an agent

### Build System

Using `bun build` for JS bundling + separate `tsc` for declaration files:
- `build.ts`: Bun build script for multiple entry points
- `tsconfig.build.json`: Separate config for generating `.d.ts` files
- Build command: `bun run build.ts && tsc -p tsconfig.build.json`

## CLI Commands

The `cck` CLI provides commands for hook management and initialization.

### `cck init`

Initialize project with hooks and MCP types. Creates `.claude/settings.json` with:
- `SubagentStart` hook → `bun cck add-subagent-state`
- `SubagentStop` hook → `bun cck clear-subagent-state`
- `SessionStart` hook → `bun cck gen-mcp-types`

Warns that settings only apply to new Claude Code sessions.

### `cck add-subagent-state`

Save agent context at SubagentStart. Use in hooks config:
```json
{ "type": "command", "command": "bun cck add-subagent-state" }
```

### `cck clear-subagent-state`

Process agent at SubagentStop and cleanup saved state. Use in hooks config:
```json
{ "type": "command", "command": "bun cck clear-subagent-state" }
```

### `cck gen-mcp-types`

Generate MCP type definitions from configured servers. Options:
- `--project <path>` - Project directory (default: cwd)
- `--output <path>` - Output directory
- `--force` - Regenerate even if up to date
- `--timeout <ms>` - Server connection timeout (default: 15000)

### `cck hook <file.ts>`

Run a TypeScript hook file. Reads JSON from stdin, executes hook, writes JSON to stdout.
- `--log` - Enable debug logging

## Key Functions

### `getAgentEdits(agentTranscriptPath, options?)`

Main function for analyzing agent transcripts. Returns:
- `sessionId`, `agentSessionId`: Session identifiers
- `subagentType`: e.g., "Explore", "Plan", custom agent name
- `agentPrompt`: The prompt passed to the Task tool
- `agentFile`: Path to `.claude/agents/{type}.md` if exists
- `agentPreloadedSkillsFiles`: Skills from agent frontmatter
- `agentNewFiles`: Files created (first Write to path)
- `agentDeletedFiles`: Files deleted via `rm` commands
- `agentEditedFiles`: All files with Write/Edit operations

### `saveAgentStartContext(input, outputPath?)`

Called from SubagentStart hook. Saves context for later retrieval.

### `loadAgentStartContext(agentId, cwd, contextPath?)`

Load saved context. Returns undefined if not found.

### `removeAgentStartContext(agentId, cwd, contextPath?)`

Clean up context after processing.

### `findTaskCallForAgent(transcript, targetAgentId, options?)`

Find the Task tool_use that spawned an agent using multiple matching strategies.

### `getNewFiles(transcript)` / `getDeletedFiles(transcript)` / `getEditedFiles(transcript)`

Extract file operations from a transcript.

## Testing

```bash
bun test              # Run all tests
bun test --watch      # Watch mode
RUN_INTEGRATION_TESTS=1 bun test  # Include integration tests (requires real transcripts)
```

Integration tests use real transcript files from `~/.claude/projects/` and are skipped by default.

## CI/CD

GitHub Actions workflow in `.github/workflows/ci.yml`:
- Runs on push/PR to main: lint → typecheck → test → build → check:exports → check:types
- **TODO**: Alpha publishing is commented out pending NPM account setup. Once resolved:
  1. Create NPM automation token at npmjs.com
  2. Add as GitHub secret `NPM_TOKEN`
  3. Uncomment `publish-alpha` job in workflow

## Local Development with Yalc

Use `@jimsheen/yalc` (modern fork with 5x performance) for local package development:

```bash
# In this project - publish to local yalc store
yalc publish

# In consumer project (e.g., lazyjobs) - add the package
yalc add @constellos/claude-code-kit

# Push updates to all linked projects automatically
yalc push
```

The lazyjobs project is set up to consume this package via yalc.

## Publishing to NPM

```bash
bun run build
npm publish
```

## Related Projects

- **lazyjobs**: Example project using this kit with SubagentStart/SubagentStop hooks
  - `.claude/hooks/SubagentStart/save-agent-context.ts`
  - `.claude/hooks/SubagentStop/log-agent-edits.ts`

## Documentation Skills

For comprehensive information about Claude Code's plugin system and development workflows:

- **`.claude/skills/claude-plugins/SKILL.md`** - Complete guide to plugin development, marketplace configuration, and best practices
- **`.claude/skills/claude-hooks/SKILL.md`** - Hook types, development patterns, and event handling
- **`.claude/skills/claude-skills/SKILL.md`** - Agent Skills creation and organization
- **`.claude/skills/claude-commands/SKILL.md`** - Custom slash command development
- **`.claude/skills/claude-agents/SKILL.md`** - Subagent configuration and specialized assistants
