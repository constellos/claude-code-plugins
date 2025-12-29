# nodes-md-integration Plugin

Integration plugin for nodes-md with interactive plugin debugging capabilities.

## Overview

This plugin provides tools and commands to help with nodes-md integration and Claude Code plugin debugging.

## Commands

### /debug-plugins

Interactive guide for systematically debugging Claude Code plugin issues.

**Usage:**
```bash
/debug-plugins
```

**What it does:**
- Provides a systematic debugging workflow for common plugin issues
- Guides through diagnostic commands and information gathering
- Offers solutions for:
  - Plugin not loading / not appearing
  - Hooks not firing
  - Plugin validation errors
  - Cache issues
  - Marketplace configuration problems
  - Settings.json configuration issues

**Features:**
- Step-by-step troubleshooting guide
- Diagnostic command examples
- Common solutions quick reference
- Links to additional resources

## Installation

```bash
claude plugin install nodes-md-integration@constellos
```

Or enable in your `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "nodes-md-integration@constellos": true
  }
}
```

## Use Cases

- Debugging plugin installation issues
- Troubleshooting hook configuration
- Resolving marketplace configuration problems
- Understanding plugin cache behavior
- Learning Claude Code plugin development best practices

## Requirements

- Claude Code CLI
- Access to constellos marketplace

## License

MIT
