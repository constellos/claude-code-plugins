# Claude Code Plugins

A marketplace of Claude Code plugins with shared TypeScript utilities for typed hooks.

## Plugins

| Plugin | Purpose |
|--------|---------|
| [github-context](./plugins/github-context/) | GitHub integration, branch context, commit enhancement, CI orchestration |
| [project-context](./plugins/project-context/) | CLAUDE.md discovery, structure validation, rule-based checks |
| [nextjs-supabase-ai-sdk-dev](./plugins/nextjs-supabase-ai-sdk-dev/) | Vercel/Supabase CLI, UI development system with 5 skills and 4 agents |

## Architecture

```
.
├── .claude-plugin/marketplace.json    # Marketplace definition
├── shared/                            # Shared utilities
│   ├── types/types.ts                # Hook type definitions
│   └── hooks/utils/                  # io, debug, transcripts, etc.
└── plugins/                          # Individual plugins
    ├── github-context/
    ├── project-context/
    └── nextjs-supabase-ai-sdk-dev/
```

## Hook Pattern

All hooks use `runHook` wrapper for stdin/stdout and automatic error handling:

```typescript
import type { SessionStartInput, SessionStartHookOutput } from '../../../shared/types/types.js';
import { runHook } from '../../../shared/hooks/utils/io.js';

async function handler(input: SessionStartInput): Promise<SessionStartHookOutput> {
  return {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: 'Hook executed',
    },
  };
}

export { handler };
runHook(handler);
```

## hooks.json Format

```json
{
  "description": "My plugin",
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "npx tsx ${CLAUDE_PLUGIN_ROOT}/hooks/my-hook.ts" }] }]
  }
}
```

Variables: `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_PLUGIN_ROOT}`

## Creating Plugins

1. Create `plugins/my-plugin/.claude-plugin/plugin.json`
2. Create `plugins/my-plugin/hooks/hooks.json`
3. Create hook files in `plugins/my-plugin/hooks/`
4. Add to `.claude-plugin/marketplace.json`
5. Create `README.md` with Purpose and Contents sections

## Installation

```bash
claude plugin marketplace add ./
claude plugin install plugin-name@constellos
```

## Troubleshooting

**Hooks not firing:**
1. Check `~/.claude/plugins/cache/` for correct hooks.json
2. Reinstall: `claude plugin uninstall/install --scope project plugin@constellos`
3. Restart Claude Code session

**Plugin cache stale:**
```bash
rm -rf ~/.claude/plugins/cache/constellos
claude plugin install --scope project plugin-name@constellos
```

## Debug

```bash
DEBUG=* claude              # All hooks
DEBUG=hook-name claude      # Specific hook
```

Logs: `.claude/logs/hook-events.json`
