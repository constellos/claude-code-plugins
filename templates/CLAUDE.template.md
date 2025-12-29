---
title: Plugin Name
description: One-line description of what the plugin does
version: 0.1.0
folder:
  subfolders:
    allowed: [.claude-plugin, hooks, shared]
    required: [.claude-plugin, hooks]
  files:
    allowed: [CLAUDE.md, README.md, .gitignore]
    required: [README.md]
---

# Plugin Name

## Quick Reference

**Purpose**: 2-3 sentence technical overview of plugin purpose and what it accomplishes.

**When to use**:
- Use case 1
- Use case 2
- Use case 3
- Use case 4

## Hook Summary

| Hook | Event | Blocking | Purpose |
|------|-------|----------|---------|
| hook-name | HookEvent | Yes/No | One-line description of what hook does |
| another-hook | HookEvent | Yes/No | One-line description |
| third-hook | HookEvent | Yes/No | One-line description |

## Key Features

### Feature Name 1
Brief 1-3 sentence technical description of this feature and how it works.

### Feature Name 2
Brief 1-3 sentence technical description of this feature and how it works.

### Feature Name 3
Brief 1-3 sentence technical description of this feature and how it works.

## State Files (Optional)

### state-file.json

**Location**: `.claude/logs/state-file.json`
**Purpose**: What this state file stores and why

```json
{
  "key": {
    "field1": "value1",
    "field2": "value2",
    "timestamp": "2025-01-01T00:00:00Z"
  }
}
```

**Lifecycle**: How the state file is created, updated, and cleaned up.

## Installation

```bash
claude plugin install plugin-name@constellos
```

Add to `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "plugin-name@constellos": true
  }
}
```

## Debug Logging

```bash
DEBUG=* claude                    # All hooks
DEBUG=hook-name claude            # Specific hook only
DEBUG=another-hook claude         # Another specific hook
```

Logs written to `.claude/logs/hook-events.json` (JSONL format).

## See Also

- [Full Documentation](./README.md) - Comprehensive plugin guide with examples
- [Marketplace](../../CLAUDE.md) - All available plugins and architecture
- [Related Plugin](../related-plugin/CLAUDE.md) - If there's a related plugin
