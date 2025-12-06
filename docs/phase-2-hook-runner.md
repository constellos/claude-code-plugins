# Phase 2: cck-hook Runner

## Overview

Create a `cck-hook` CLI command that executes TypeScript hook files without requiring users to add shebangs or chmod permissions.

## Problem

Currently, to run a TypeScript hook file directly, users must:
1. Add `#!/usr/bin/env tsx` shebang to each hook file
2. Run `chmod +x` on each hook file
3. Remember to do both for every new hook

This is error-prone and leads to confusing "permission denied" or "command not found" errors.

## Solution

A `cck-hook` runner that:
- Handles TypeScript execution via tsx
- Reads hook input from stdin
- Writes hook output to stdout
- Provides consistent error handling
- Optionally sources `$CLAUDE_ENV_FILE` for env var access

## Usage

In `.claude/settings.json`:
```json
{
  "hooks": {
    "SubagentStop": [{
      "hooks": [{
        "type": "command",
        "command": "bun cck-hook .claude/hooks/SubagentStop/log-agent-edits.ts"
      }]
    }]
  }
}
```

Hook file (no shebang needed):
```typescript
// .claude/hooks/SubagentStop/log-agent-edits.ts
import type { SubagentStopHandler } from '@constellos/claude-code-kit/types/hooks';

const handler: SubagentStopHandler = async (input) => {
  console.error(`Agent ${input.agent_id} completed`);
  return {};
};

export default handler;
```

## Implementation

### File: `bin/cck-hook.ts`

```typescript
#!/usr/bin/env node

import { register } from 'tsx/esm/api';
import { pathToFileURL } from 'url';
import { readFileSync } from 'fs';
import { resolve } from 'path';

async function main() {
  const hookPath = process.argv[2];

  if (!hookPath) {
    console.error('Usage: cck-hook <hook-file.ts>');
    process.exit(1);
  }

  // Register tsx for TypeScript support
  const unregister = register();

  try {
    // Read hook input from stdin
    const inputData = readFileSync(0, 'utf-8'); // fd 0 = stdin
    const input = JSON.parse(inputData);

    // Resolve and import the hook module
    const absolutePath = resolve(process.cwd(), hookPath);
    const hookModule = await import(pathToFileURL(absolutePath).href);

    // Get the default export (handler function)
    const handler = hookModule.default;

    if (typeof handler !== 'function') {
      throw new Error(`Hook file must export a default function: ${hookPath}`);
    }

    // Execute the hook
    const result = await handler(input);

    // Write result to stdout
    if (result !== undefined) {
      console.log(JSON.stringify(result));
    }
  } catch (error) {
    console.error(`Hook error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  } finally {
    unregister();
  }
}

main();
```

### File: `bin/cck-hook.js` (compiled entry point)

```javascript
#!/usr/bin/env node
import './cck-hook.ts';
```

### Package.json updates

```json
{
  "bin": {
    "cck-hook": "./bin/cck-hook.js",
    "cck-run-hook": "./bin/cck-run-hook.js",
    "cck-sync-mcp": "./bin/cck-sync-mcp.js"
  },
  "dependencies": {
    "tsx": "^4.0.0"
  }
}
```

## Features to Add

### 1. Hook Logging

Log all hook invocations to `.claude/state/hook-log.jsonl`:

```typescript
interface HookLogEntry {
  timestamp: string;
  hookType: string;        // "SubagentStart", "SubagentStop", etc.
  hookFile: string;        // Path to hook file
  durationMs: number;      // Execution time
  success: boolean;
  error?: string;
  input: object;           // Sanitized input (no secrets)
  output?: object;
}
```

This enables the Phase 3 DevTools dashboard to show hook activity.

### 2. Error Recovery

- Catch and log errors without crashing
- Return appropriate exit codes
- Write errors to stderr (visible in Claude's output)

### 3. Validation

- Validate hook file exists before importing
- Validate default export is a function
- Validate return value matches expected schema

### 4. Performance

- Consider caching compiled hooks
- Measure and log execution time
- Warn if hooks are slow (>1s)

## Testing

```bash
# Test with mock input
echo '{"agent_id": "test", "cwd": "/tmp"}' | bun cck-hook .claude/hooks/SubagentStop/log-agent-edits.ts

# Test error handling
echo 'invalid json' | bun cck-hook .claude/hooks/SubagentStop/log-agent-edits.ts
```

## Migration Path

1. Implement `cck-hook` command
2. Update documentation to recommend `bun cck-hook` pattern
3. Provide migration script to update existing `settings.json` files
4. Eventually deprecate direct shebang approach

## Dependencies

- `tsx` - TypeScript execution without compilation
- Node.js built-ins only for core functionality

## Open Questions

1. Should we bundle tsx or require it as a peer dependency?
2. Should hook logging be opt-in or opt-out?
3. How to handle hooks that spawn long-running processes?
4. Should we support CommonJS hooks or ESM only?
