# @constellos/claude-code-kit

[![npm version](https://img.shields.io/npm/v/@constellos/claude-code-kit.svg)](https://www.npmjs.com/package/@constellos/claude-code-kit)
[![GitHub](https://img.shields.io/github/license/constellos/claude-code-kit)](https://github.com/constellos/claude-code-kit)

> TypeScript toolkit for Claude Code development — types, schemas, runners, and utilities.
>
> **Community project. Not affiliated with Anthropic.**

---

## Overview

`claude-code-kit` provides TypeScript-first tooling for building Claude Code extensions:

- **Hook Types** — Fully typed hook functions for all events (PreToolUse, PostToolUse, SessionStart, Stop, etc.)
- **Builtin Tool Types** — Type definitions for Claude Code's builtin tools (Read, Write, Bash, Glob, etc.)
- **MCP Hook Types** — Type-safe hook functions for MCP tools with `PreToolUseMcpHook` and `PostToolUseMcpHook`
- **MCP Type Generation** — CLI to introspect MCP servers and generate typed tool I/O
- **Transcript Schemas** — Zod schemas for parsing Claude Code JSONL transcripts
- **Hook Runner** — CLI runner with logging, stdin/stdout handling, and TypeScript execution

---

## Installation

```bash
npm install @constellos/claude-code-kit
# or
pnpm add @constellos/claude-code-kit
```

For MCP type generation, you'll also need the MCP SDK as a peer dependency:

```bash
npm install @modelcontextprotocol/sdk
```

---

## CLI

The package provides a unified CLI available as `cck` or `claude-code-kit`:

```bash
cck init                 # Initialize project with hooks and MCP types
cck hook <file.ts>       # Run a TypeScript hook file
cck gen-mcp-types        # Generate MCP type definitions
cck add-subagent-state   # Save agent context (SubagentStart hook)
cck clear-subagent-state # Process agent and cleanup (SubagentStop hook)
cck --help               # Show help
cck --version            # Show version
```

### Important: Use `--silent` with pnpm

When running hooks via `pnpm`, you **must** use the `--silent` flag to prevent pnpm from adding extra output that corrupts the JSON response:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "pnpm --silent cck hook .claude/hooks/my-hook.ts"
      }]
    }]
  }
}
```

Without `--silent`, pnpm may output progress information that breaks Claude Code's JSON parsing.

---

## Quick Start

### 1. Initialize Your Project

```bash
cck init
```

This creates `.claude/settings.json` with agent tracking hooks, MCP type generation, and generates MCP types:

```json
{
  "hooks": {
    "SubagentStart": [{ "hooks": [{ "type": "command", "command": "pnpm --silent cck add-subagent-state" }] }],
    "SubagentStop": [{ "hooks": [{ "type": "command", "command": "pnpm --silent cck clear-subagent-state" }] }],
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "pnpm --silent cck gen-mcp-types" }] }]
  }
}
```

**Note:** Settings changes only apply to NEW Claude Code sessions. Restart Claude Code to activate the hooks.

### 2. Generate MCP Types (Optional)

```bash
# Regenerate MCP types manually
cck gen-mcp-types

# Or with npx
npx cck-sync-mcp
```

This reads your MCP server configuration from `~/.claude.json` and generates typed interfaces.

### 3. Create a Type-Safe Hook

```typescript
// .claude/hooks/PreToolUse/my-hook.ts
import type { PreToolUseMcpHook } from '@constellos/claude-code-kit/types/hooks';
import type { MyServerToolRequest } from '../utils/mcp-tools/my-server.types';

const hook: PreToolUseMcpHook<MyServerToolRequest> = (input) => {
  // Full type safety for tool_name and tool_input
  return {
    systemMessage: `Processing ${input.tool_name}`,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  };
};

export default hook;
```

### 4. Register in Settings

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "mcp__my-server__*",
      "hooks": [{
        "type": "command",
        "command": "pnpm --silent cck hook .claude/hooks/PreToolUse/my-hook.ts"
      }]
    }]
  }
}
```

---

## Agent Context Tracking

The `cck init` command sets up automatic agent context tracking. This enables:

- **`getAgentEdits()`** - Analyze what files an agent created, edited, or deleted
- **`saveAgentStartContext()`** / **`loadAgentStartContext()`** - Access agent prompts and metadata

### How It Works

1. **SubagentStart**: `cck add-subagent-state` saves the agent's context (prompt, type, toolUseId) to `.claude/state/active-subagents.json`

2. **SubagentStop**: `cck clear-subagent-state` processes the agent's transcript and cleans up

3. **In your code**: Use `getAgentEdits()` to analyze agent work:

```typescript
import { getAgentEdits } from '@constellos/claude-code-kit/transcripts';

const edits = await getAgentEdits(agentTranscriptPath, { cwd: projectPath });

console.log(edits.subagentType);      // "Explore", "Plan", etc.
console.log(edits.agentPrompt);       // The prompt passed to the Task tool
console.log(edits.agentNewFiles);     // Files created by the agent
console.log(edits.agentEditedFiles);  // Files modified by the agent
console.log(edits.agentDeletedFiles); // Files deleted by the agent
```

---

## Hook Types

### System Tool Hooks

For Claude Code's builtin tools (Read, Write, Bash, etc.):

```typescript
import type { PreToolUseHook, PostToolUseHook } from '@constellos/claude-code-kit/types/hooks';

const preHook: PreToolUseHook = (input) => {
  // Discriminated union - narrows based on tool_name
  if (input.tool_name === 'Write') {
    // input.tool_input is typed as FileWriteInput
    const { file_path, content } = input.tool_input;

    if (file_path.includes('secret')) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: 'Cannot write to secret files',
        },
      };
    }
  }

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  };
};

export default preHook;
```

### MCP Tool Hooks

For MCP tools, use the generic `PreToolUseMcpHook` and `PostToolUseMcpHook` types:

```typescript
import type { PreToolUseMcpHook } from '@constellos/claude-code-kit/types/hooks';
import type { NextDevtoolsToolRequest } from '../utils/mcp-tools/next-devtools.types';

// Type parameter provides full type safety
const hook: PreToolUseMcpHook<NextDevtoolsToolRequest> = (input) => {
  // input.tool_name is typed as union of all tool names
  // input.tool_input is typed based on the specific tool

  if (input.tool_name === 'mcp__next-devtools__nextjs_docs') {
    const { action, query } = input.tool_input;
    // action is typed as "search" | "get" | "force-search" | undefined
    // query is typed as string | undefined
  }

  return {
    systemMessage: `MCP tool: ${input.tool_name}`,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  };
};

export default hook;
```

### Available Hook Events

| Event | Description | Output Fields |
|-------|-------------|---------------|
| `PreToolUse` | Before tool execution | `permissionDecision`, `updatedInput` |
| `PostToolUse` | After tool execution | `decision`, `additionalContext` |
| `SessionStart` | Session begins | `additionalContext` |
| `SessionEnd` | Session ends | (base fields only) |
| `SubagentStart` | Subagent spawned | (base fields only) |
| `SubagentStop` | Subagent finished | `decision` |
| `Notification` | System notification | (base fields only) |
| `UserPromptSubmit` | User sends message | `decision`, `additionalContext` |
| `Stop` | Execution stopping | `decision` |
| `PreCompact` | Before context compaction | (base fields only) |

### Format Hooks (Markdown Validation)

Format hooks validate markdown structure during Write/Edit operations. Export a `PreToolUseMdFormatHook` object instead of a function:

```typescript
// .claude/hooks/PreToolUse/claude-md-format.ts
import type { PreToolUseMdFormatHook } from '@constellos/claude-code-kit/format';

const format: PreToolUseMdFormatHook = {
  files: ['CLAUDE.md'],  // Gitignore-style patterns
  headings: [
    { matcher: 'Project', required: true },
    { matcher: 'Overview', required: true },
    {
      matcher: 'Features',
      required: true,
      subheadings: [
        { matcher: '*', required: false }  // Allow any subheadings
      ]
    },
  ],
  // Optional: validate frontmatter with Zod
  // frontmatter: { schema: z.object({ title: z.string() }) },
};

export default format;
```

Register like any other hook:
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "pnpm --silent cck hook .claude/hooks/PreToolUse/claude-md-format.ts"
      }]
    }]
  }
}
```

The hook runner automatically detects `MarkdownFormat` exports and runs validation.

### Base Output Fields

All hook outputs support these base fields:

```typescript
interface BaseHookOutput {
  /** Stop execution and require user input (default: true) */
  continue?: boolean;
  /** Message shown when continue is false */
  stopReason?: string;
  /** Hide output from transcript */
  suppressOutput?: boolean;
  /** Message shown to user (appears in Claude's context) */
  systemMessage?: string;
}
```

---

## MCP Type Generation

### CLI Usage

```bash
# Sync types for current project
cck gen-mcp-types

# Sync for specific project path
cck gen-mcp-types --project /path/to/project

# Force sync (ignore change detection)
cck gen-mcp-types --force

# Custom output directory
cck gen-mcp-types --output ./types/mcp

# Set connection timeout (ms)
cck gen-mcp-types --timeout 30000
```

Legacy command (still works):
```bash
npx cck-sync-mcp
```

### Configuration

MCP servers are configured in `~/.claude.json` under `projects.<project-path>.mcpServers`:

```json
{
  "projects": {
    "/home/user/my-project": {
      "mcpServers": {
        "filesystem": {
          "command": "npx",
          "args": ["-y", "@anthropic/mcp-server-filesystem"]
        },
        "my-http-server": {
          "url": "https://mcp.example.com/api"
        }
      }
    }
  }
}
```

### Generated Types

For each MCP server, a type file is generated at `.claude/hooks/utils/mcp-tools/[server-name].types.ts`:

```typescript
// Auto-generated - DO NOT EDIT
import type { CallToolRequestParams, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Request interface for each tool
export interface FilesystemReadRequest extends CallToolRequestParams {
  name: 'mcp__filesystem__read';
  arguments: {
    path: string;
  };
}

export interface FilesystemReadResult extends CallToolResult {
  // Result content in CallToolResult.content array
}

// Union of all request types
export type FilesystemToolRequest =
  | FilesystemReadRequest
  | FilesystemWriteRequest
  | FilesystemListRequest;

// Union of all result types
export type FilesystemToolResult =
  | FilesystemReadResult
  | FilesystemWriteResult
  | FilesystemListResult;

// Type-safe mapping
export interface FilesystemToolMap {
  'mcp__filesystem__read': { request: FilesystemReadRequest; result: FilesystemReadResult };
  'mcp__filesystem__write': { request: FilesystemWriteRequest; result: FilesystemWriteResult };
  // ...
}

// Tool name literal union
export type FilesystemToolName = 'mcp__filesystem__read' | 'mcp__filesystem__write' | ...;
```

### Programmatic API

```typescript
import { syncMcpTypes, getProjectMcpServers } from '@constellos/claude-code-kit/mcp';

// Get configured servers
const servers = getProjectMcpServers('/path/to/project');
console.log(servers);
// { 'filesystem': { type: 'stdio', command: 'npx', args: [...] }, ... }

// Sync types
const result = await syncMcpTypes({
  projectPath: '/path/to/project',
  force: true,
});

console.log(result);
// { skipped: false, synced: ['filesystem'], errors: [], outputDir: '...' }
```

---

## Hook Runner

### CLI Usage

```bash
# Run a hook with stdin/stdout handling
pnpm --silent cck hook ./hooks/my-hook.ts

# Enable logging to file
pnpm --silent cck hook ./hooks/my-hook.ts --log
```

Legacy command (still works):
```bash
npx cck-hook ./hooks/my-hook.ts
```

**Note:** Always use `--silent` with pnpm to prevent output corruption.

### Programmatic API

```typescript
import { runHook } from '@constellos/claude-code-kit/runners';

await runHook({
  hookPath: './hooks/my-hook.ts',
  enableLogging: true,
  logPath: './.claude/hooks/utils/log.md',
});
```

### I/O Utilities

```typescript
import { readStdinJson, writeStdoutJson } from '@constellos/claude-code-kit/runners';

// Read JSON input from Claude Code
const input = await readStdinJson<PreToolUseInput>();

// Write JSON output back
writeStdoutJson({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'allow',
  },
});
```

---

## Builtin Tool Types

```typescript
import type {
  // Tool input types
  FileReadInput,
  FileWriteInput,
  FileEditInput,
  BashInput,
  GlobInput,
  GrepInput,
  TaskInput,
  WebFetchInput,
  WebSearchInput,

  // Tool names
  KnownToolName,

  // Discriminated unions
  SystemToolInput,
  SystemToolWithResponse,
} from '@constellos/claude-code-kit/types';
```

---

## Transcript Parsing

```typescript
import { parseTranscript } from '@constellos/claude-code-kit/transcripts';

const transcript = await parseTranscript('./path/to/session.jsonl');

// Main agent messages
for (const msg of transcript.mainMessages) {
  console.log(msg.type, msg.message);
}

// Subagent conversations
for (const [id, subagent] of Object.entries(transcript.subagents)) {
  console.log(`Subagent ${subagent.agentId}: ${subagent.messages.length} messages`);
}
```

---

## Exports

| Path | Contents |
|------|----------|
| `@constellos/claude-code-kit` | Everything (convenience re-export) |
| `@constellos/claude-code-kit/types` | Static types (hooks, builtin tools) |
| `@constellos/claude-code-kit/types/hooks` | Hook function types including MCP hooks |
| `@constellos/claude-code-kit/schemas` | Zod schemas + inferred types |
| `@constellos/claude-code-kit/transcripts` | Transcript parser, queries, agent context |
| `@constellos/claude-code-kit/runners` | Hook runner utilities |
| `@constellos/claude-code-kit/mcp` | MCP sync utilities and type generator |
| `@constellos/claude-code-kit/format` | Markdown format validation utilities |

---

## MCP Utility Functions

```typescript
import {
  isMcpTool,
  extractMcpServerName,
  extractMcpToolName,
  formatMcpToolName,
  parseMcpToolName,
} from '@constellos/claude-code-kit/mcp';

// Check if tool is MCP
isMcpTool('mcp__filesystem__read'); // true
isMcpTool('Read'); // false

// Extract parts
extractMcpServerName('mcp__next-devtools__browser_eval'); // 'next-devtools'
extractMcpToolName('mcp__next-devtools__browser_eval'); // 'browser_eval'

// Format tool name
formatMcpToolName('filesystem', 'read'); // 'mcp__filesystem__read'

// Parse full name
parseMcpToolName('mcp__filesystem__read');
// { server: 'filesystem', tool: 'read' }
```

---

## Claude Code Compatibility

This package tracks Claude Code versions. Types are updated when CC releases include tool changes.

```json
{
  "claudeCodeCompat": {
    "min": "1.0.30",
    "tested": "1.0.35"
  }
}
```

---

## Project Structure

```
src/
├── types/
│   ├── hooks/
│   │   ├── base.ts          # BaseHookInput, BaseHookOutput
│   │   ├── events.ts        # All hook event types
│   │   ├── mcp.ts           # PreToolUseMcpHook, PostToolUseMcpHook
│   │   └── index.ts
│   ├── tools/
│   │   ├── system.ts        # Read, Write, Bash, Glob, etc.
│   │   └── index.ts
│   └── index.ts
│
├── format/
│   ├── types.ts             # MarkdownFormat, PreToolUseMdFormatHook
│   ├── utils.ts             # isMarkdownFile, matchesFilePatterns
│   ├── validator.ts         # validateMarkdownFormat
│   ├── hook-factory.ts      # createFormatHookFunction
│   └── index.ts
│
├── mcp/
│   ├── sync.ts              # syncMcpTypes, getProjectMcpServers
│   ├── type-generator.ts    # generateServerTypes
│   ├── utils.ts             # isMcpTool, parseMcpToolName, etc.
│   └── index.ts
│
├── schemas/
│   └── transcripts.ts       # Zod schemas for JSONL transcripts
│
├── transcripts/
│   ├── parser.ts            # parseTranscript
│   └── queries.ts           # getAgentEdits, saveAgentStartContext
│
├── runners/
│   ├── hook-runner.ts       # runHook (supports functions + format hooks)
│   ├── loader.ts            # loadHook, isMarkdownFormat
│   ├── io.ts                # readStdinJson, writeStdoutJson
│   └── index.ts
│
└── index.ts

bin/
├── cck.js                   # Unified CLI (init, hook, gen-mcp-types, save-agent-*)
├── cck-hook.js              # Legacy hook runner CLI
└── cck-sync-mcp.js          # Legacy MCP type sync CLI
```

---

## Related

- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code)
- [Claude Code Hooks](https://docs.anthropic.com/en/docs/claude-code/hooks)
- [MCP Protocol](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

---

## Contributing

Contributions welcome! Please open an issue or PR on [GitHub](https://github.com/constellos/claude-code-kit).

---

## License

MIT

---

## Disclaimer

This is an unofficial community project. "Claude" and "Claude Code" are trademarks of Anthropic. This project is not endorsed by or affiliated with Anthropic.
