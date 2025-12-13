---
description: Comprehensive guide to Claude Code's plugin system, marketplace configuration, and plugin development
capabilities:
  - Understanding plugin architecture and components
  - Creating and configuring plugins
  - Setting up plugin marketplaces
  - Developing custom commands, agents, hooks, skills, and MCP servers
  - Testing and debugging plugins
  - Publishing and distributing plugins
---

# Claude Code Plugins

Complete reference for developing, distributing, and using Claude Code plugins.

## Overview

Claude Code's plugin system lets you extend functionality with custom commands, agents, hooks, skills, and MCP servers. Plugins can be distributed through marketplaces for easy installation and sharing across teams.

## Plugin Components

Plugins can provide five types of components:

### 1. Commands
Custom slash commands that integrate with Claude Code's command system.
- **Location**: `commands/` directory
- **Format**: Markdown files with frontmatter
- **Usage**: Users invoke with `/command-name`

### 2. Agents
Specialized subagents for specific tasks that Claude invokes automatically.
- **Location**: `agents/` directory
- **Format**: Markdown files describing agent capabilities
- **Usage**: Claude invokes automatically based on task context

### 3. Skills
Agent Skills that extend Claude's capabilities (model-invoked).
- **Location**: `skills/` directory containing subdirectories with `SKILL.md` files
- **Format**: Directories with `SKILL.md` and optional supporting files
- **Usage**: Claude autonomously decides when to use based on task context

### 4. Hooks
Event handlers that respond to Claude Code events automatically.
- **Location**: `hooks/hooks.json` in plugin root
- **Format**: JSON configuration with event matchers and actions
- **Events**: PreToolUse, PostToolUse, SubagentStart, SubagentStop, SessionStart, SessionEnd, UserPromptSubmit, Notification, Stop, PreCompact

### 5. MCP Servers
Model Context Protocol servers to connect Claude Code with external tools.
- **Location**: `.mcp.json` in plugin root
- **Format**: Standard MCP server configuration
- **Usage**: Automatically starts when plugin is enabled

## Plugin Structure

### Standard Directory Layout

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json          # Required: plugin manifest
├── commands/                 # Slash commands (optional)
│   ├── status.md
│   └── logs.md
├── agents/                   # Subagent definitions (optional)
│   ├── reviewer.md
│   └── tester.md
├── skills/                   # Agent Skills (optional)
│   ├── code-reviewer/
│   │   └── SKILL.md
│   └── pdf-processor/
│       ├── SKILL.md
│       └── scripts/
├── hooks/                    # Hook configurations (optional)
│   ├── hooks.json
│   └── scripts/
├── .mcp.json                # MCP server definitions (optional)
└── README.md                # Documentation
```

### plugin.json Manifest

The `.claude-plugin/plugin.json` file defines your plugin's metadata:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Brief plugin description",
  "author": {
    "name": "Author Name",
    "email": "author@example.com"
  },
  "repository": "https://github.com/author/plugin",
  "license": "MIT",
  "keywords": ["keyword1", "keyword2"],
  "hooks": "./hooks/hooks.json",
  "skills": "./skills/"
}
```

## Plugin Marketplaces

Marketplaces are catalogs of available plugins that make it easy to discover, install, and manage extensions.

### Marketplace Structure

Create `.claude-plugin/marketplace.json` in your repository:

```json
{
  "$schema": "https://code.claude.com/schemas/marketplace-schema.json",
  "name": "My Plugin Marketplace",
  "version": "1.0.0",
  "owner": {
    "name": "Organization Name"
  },
  "metadata": {
    "description": "Description of your marketplace",
    "pluginRoot": "./packages"
  },
  "plugins": [
    {
      "name": "my-plugin",
      "description": "Plugin description",
      "version": "1.0.0",
      "author": "author-name",
      "source": "./packages/my-plugin",
      "strict": true
    }
  ]
}
```

### Plugin Marketplace Fields

- **strict: true** (default): Plugin must include complete `plugin.json` manifest
- **strict: false**: Marketplace entry serves as the manifest (minimal plugins)
- **hooks**: Path to hooks configuration or inline hooks object
- **commands**: Additional command files/directories
- **agents**: Additional agent files
- **mcpServers**: MCP configuration path or inline config

### Shared Resources Pattern

Use `strict: false` to create plugins that share resources:

```json
{
  "plugins": [
    {
      "name": "base-utilities",
      "source": "./packages/base",
      "strict": true
    },
    {
      "name": "minimal-plugin",
      "source": "./packages/minimal",
      "strict": false,
      "hooks": "./hooks/hooks.json"
    }
  ]
}
```

This enables plugin "dependencies" - minimal plugins can reference base plugin utilities.

## Environment Variables

**`${CLAUDE_PLUGIN_ROOT}`**: Absolute path to your plugin directory. Use this in hooks, MCP servers, and scripts:

```json
{
  "hooks": {
    "PostToolUse": [{
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/scripts/process.sh"
      }]
    }]
  }
}
```

## Development Workflow

### 1. Local Testing with Marketplace

Create a local marketplace for iterative development:

```bash
# Create marketplace structure
mkdir dev-marketplace
cd dev-marketplace
mkdir my-plugin

# Create marketplace manifest
cat > .claude-plugin/marketplace.json << 'EOF'
{
  "name": "dev-marketplace",
  "owner": { "name": "Developer" },
  "plugins": [{
    "name": "my-plugin",
    "source": "./my-plugin"
  }]
}
EOF

# Add marketplace in Claude Code
claude
/plugin marketplace add ./dev-marketplace
/plugin install my-plugin@dev-marketplace
```

### 2. Iteration Cycle

After making changes:
1. Uninstall: `/plugin uninstall my-plugin@dev-marketplace`
2. Reinstall: `/plugin install my-plugin@dev-marketplace`
3. Test functionality

### 3. Debugging

Use `claude --debug` to see:
- Plugin loading details
- Command, agent, hook registration
- MCP server initialization
- Error messages

## Distribution

### GitHub Distribution (Recommended)

1. Create GitHub repository with marketplace structure
2. Team members add with: `/plugin marketplace add owner/repo`
3. Install plugins: `/plugin install plugin-name@marketplace-name`

### Git Repository Distribution

Any git hosting service works:
```
/plugin marketplace add https://gitlab.com/company/plugins.git
```

### Team Configuration

Configure in `.claude/settings.json` for automatic installation:

```json
{
  "extraKnownMarketplaces": {
    "team-tools": {
      "source": {
        "source": "github",
        "repo": "your-org/claude-plugins"
      }
    }
  },
  "enabledPlugins": {
    "plugin-name@team-tools": true
  }
}
```

When team members trust the repository, Claude Code automatically installs marketplaces and plugins.

## Best Practices

### Plugin Design
- Keep plugins focused on specific use cases
- Use meaningful names (kebab-case, no spaces)
- Include comprehensive documentation
- Follow semantic versioning

### Component Organization
- Group related commands in subdirectories
- Use clear, descriptive file names
- Provide examples in documentation
- Test all components before distribution

### Security
- Validate inputs in hooks
- Use environment variables for secrets
- Don't include credentials in plugin code
- Document required permissions

### Performance
- Keep hooks fast (< 1 second preferred)
- Use appropriate timeouts
- Cache when possible
- Provide feedback for long operations

## Common Patterns

### TypeScript Hook Runner

Use a shared runner for TypeScript hooks:

```typescript
// packages/base/runner.ts
import { readStdinJson, writeStdoutJson } from './lib/io.js';

const hookPath = process.argv[2];
const hookModule = await import(hookPath);
const input = await readStdinJson();
const output = await hookModule.default(input);
await writeStdoutJson(output);
```

Reference in hooks.json:
```json
{
  "PostToolUse": [{
    "hooks": [{
      "type": "command",
      "command": "node ${CLAUDE_PLUGIN_ROOT}/runner.ts ${CLAUDE_PLUGIN_ROOT}/hooks/my-hook.ts"
    }]
  }]
}
```

### Shared Types Pattern

Create a base plugin with types that other plugins can import:

```typescript
// packages/base/lib/types.ts
export type PreToolUseInput = { /* ... */ };
export type PostToolUseInput = { /* ... */ };

// packages/other-plugin/hooks/my-hook.ts
import type { PostToolUseInput } from 'base';
```

## Official Documentation Links

For complete technical specifications and additional information:

- **Plugins Guide**: https://code.claude.com/docs/en/plugins.md
- **Plugins Reference**: https://code.claude.com/docs/en/plugins-reference.md
- **Plugin Marketplaces**: https://code.claude.com/docs/en/plugin-marketplaces.md
- **Settings Configuration**: https://code.claude.com/docs/en/settings.md

## Troubleshooting

### Plugin Not Loading
- Verify `plugin.json` syntax with JSON validator
- Check directory structure (components at plugin root, not in `.claude-plugin/`)
- Ensure marketplace source URLs are accessible
- Use `claude --debug` to see loading errors

### Commands Not Appearing
- Verify `commands/` directory is at plugin root
- Check markdown frontmatter syntax
- Ensure plugin is enabled in settings
- Restart Claude Code session

### Hooks Not Firing
- Check hooks.json syntax
- Verify script executability (`chmod +x script.sh`)
- Test hook matcher patterns
- Check debug logs for hook execution

### MCP Server Failures
- Verify server command is correct
- Check `${CLAUDE_PLUGIN_ROOT}` variable usage
- Test server startup independently
- Review server logs for errors

## Example Plugins

### Minimal Plugin (strict: false)

```
minimal-plugin/
└── hooks/
    ├── hooks.json
    └── my-hook.sh
```

Marketplace entry:
```json
{
  "name": "minimal",
  "source": "./minimal-plugin",
  "strict": false,
  "hooks": "./hooks/hooks.json"
}
```

### Full-Featured Plugin (strict: true)

```
full-plugin/
├── .claude-plugin/
│   └── plugin.json
├── commands/
├── agents/
├── skills/
├── hooks/
└── .mcp.json
```

## When to Use Plugins

**Use plugins for:**
- Reusable functionality across projects
- Team-shared tools and workflows
- Integration with external services
- Custom development workflows
- Standardized processes

**Don't use plugins for:**
- Project-specific one-off tasks
- Frequently changing configurations
- Sensitive credentials (use environment variables)
- Testing purposes (use local hooks instead)

## See Also

- `.claude/skills/claude-hooks/SKILL.md` - Comprehensive hook development guide
- `.claude/skills/claude-commands/SKILL.md` - Slash command development
- `.claude/skills/claude-agents/SKILL.md` - Custom agent configuration
- `.claude/skills/claude-skills/SKILL.md` - Agent Skills development
