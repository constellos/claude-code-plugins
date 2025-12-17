# claude-code-config Plugin

Configuration management utilities for Claude Code projects.

## Overview

This is a placeholder plugin for future configuration management features. Currently, it has no hooks implemented.

**Note**: Subagent logging hooks have been moved to the dedicated **logging** plugin. Install that plugin separately if you need subagent tracking.

## Current Status

**No hooks implemented.**

The `hooks/hooks.json` file contains only comments describing planned features.

## Subagent Logging

For subagent execution tracking and file operation logging, install the **logging** plugin:

```bash
/plugin install logging@claude-code-kit-local
```

The logging plugin provides:
- SubagentStart hook - Tracks agent context when subagents begin
- SubagentStop hook - Logs file operations when subagents complete

See `plugins/logging/CLAUDE.md` for details.

## Planned Features

Future features to consider:
- Configuration validation hooks
- Project setup automation
- Environment variable management
- Custom workflow automation

## Use Cases

When implemented, this plugin will enable:
- Automated project configuration validation
- Setup scripts for new developers
- Environment-specific configuration management
- Custom workflow automation

## Configuration

This plugin is referenced in `.claude-plugin/marketplace.json`:

```json
{
  "name": "claude-code-config",
  "source": "../plugins/claude-code-config",
  "strict": false
}
```

Install with:
```bash
/plugin install claude-code-config@claude-code-kit-local
```

## Future Plans

This plugin may be extended with:
- Configuration validation hooks
- Project setup automation
- Environment variable management
- Custom workflow automation
