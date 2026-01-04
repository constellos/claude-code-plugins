# Hook Execution Runtime

This rule defines the required runtime for executing plugin hooks.

## Required Skills: None

## Overview

All plugin hooks MUST use `npx tsx` for execution, NOT `bun`. This ensures compatibility with the Claude Code plugin system.

## Implementation

### hooks.json Commands

Hook commands in `hooks.json` files must use this pattern:

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "npx tsx ${CLAUDE_PLUGIN_ROOT}/hooks/my-hook.ts"
      }]
    }]
  }
}
```

### Why Not Bun?

1. **Plugin system compatibility**: Claude Code's plugin runtime expects `npx tsx`
2. **Consistency**: All existing hooks use this pattern
3. **Node.js ecosystem**: tsx provides seamless TypeScript execution with full Node.js compatibility

### Bun Usage

Bun IS used for development tasks:
- `bun run lint` - Run eslint
- `bun run typecheck` - Run TypeScript checks
- `bun run test` - Run vitest tests
- `bun install` - Install dependencies

Bun is NOT used for:
- Hook execution (use `npx tsx`)
- Plugin runtime commands
