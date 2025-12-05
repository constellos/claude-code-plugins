# Claude Code Kit - Internal Notes

## Project Overview

TypeScript toolkit for Claude Code development - types, schemas, transcript parsing, and hook utilities.

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

Using `tsup` for JS bundling + separate `tsc` for declaration files:
- `tsup.config.ts`: `dts: false` (tsup's dts generation had issues with complex types)
- `tsconfig.build.json`: Separate config for generating `.d.ts` files
- Build command: `tsup && tsc -p tsconfig.build.json`

### tsx Subpath Exports Bug Workaround

When running hooks with `tsx`, subpath exports like `@constellos/claude-code-kit/transcripts` fail to resolve. Workaround in hooks:

```typescript
import { createRequire } from 'module';
import { dirname, join } from 'path';

async function loadTranscriptUtils() {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve('@constellos/claude-code-kit/package.json');
  const pkgDir = dirname(pkgPath);
  const transcriptsPath = join(pkgDir, 'dist', 'transcripts', 'index.js');
  return import(transcriptsPath);
}
```

## CLI Commands

The `cck` CLI provides commands for hook management and initialization. **Important:** When using with `pnpm`, always use `--silent` to prevent output corruption.

### `cck init`

Initialize project with hooks and MCP types. Creates `.claude/settings.json` with:
- `SubagentStart` hook → `pnpm --silent cck add-subagent-state`
- `SubagentStop` hook → `pnpm --silent cck clear-subagent-state`
- `SessionStart` hook → `pnpm --silent cck gen-mcp-types`

Warns that settings only apply to new Claude Code sessions.

### `cck add-subagent-state`

Save agent context at SubagentStart. Use in hooks config:
```json
{ "type": "command", "command": "pnpm --silent cck add-subagent-state" }
```

### `cck clear-subagent-state`

Process agent at SubagentStop and cleanup saved state. Use in hooks config:
```json
{ "type": "command", "command": "pnpm --silent cck clear-subagent-state" }
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
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
RUN_INTEGRATION_TESTS=1 pnpm test  # Include integration tests (requires real transcripts)
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
pnpm build
pnpm publish
```

## Related Projects

- **lazyjobs**: Example project using this kit with SubagentStart/SubagentStop hooks
  - `.claude/hooks/SubagentStart/save-agent-context.ts`
  - `.claude/hooks/SubagentStop/log-agent-edits.ts`
