# Nodecraft Plugin

Task queue and agent workflow orchestration plugin for Claude Code with MCP integration.

## Overview

Nodecraft enables sophisticated agent-based workflows for code review, planning, and implementation through a task queue system backed by Supabase and Model Context Protocol (MCP) servers.

## Features

- **Task Queue System**: Persistent task management with dependencies and workflows
- **Reviewer Agent**: Analyzes code/docs and creates structured review reports
- **Planner Agent**: Generates detailed implementation plans from review tasks
- **MCP Integration**: Connects to constellos-mcp and nodes-md MCP servers
- **Webhook Triggers**: Automatically triggers constellos-actions for execution
- **Memory Persistence**: Stores agent context and decisions across sessions

## Installation

### Prerequisites

1. **Supabase Project**: You need access to the constellos Supabase instance
2. **Environment Variables**:
   ```bash
   export SUPABASE_URL=your-supabase-url
   export SUPABASE_SECRET_KEY=your-service-role-key
   ```

### Install Plugin

```bash
cd ~/.claude/plugins
git clone <this-repo> nodecraft
cd nodecraft
npm install
npm run build
```

### Enable Plugin

Add to `~/.claude/settings.json`:
```json
{
  "enabledPlugins": {
    "nodecraft@constellos": true
  }
}
```

## Usage

### Review Code

The reviewer agent automatically analyzes changed files:

```bash
# Claude Code will invoke the reviewer agent
claude "Review the authentication module"
```

### Create Implementation Plan

The planner agent generates detailed plans:

```bash
# Claude Code will invoke the planner agent
claude "Create a plan to add OAuth support"
```

### Task Queue Operations

Via MCP tools:
- `mcp__constellos-mcp__create_task` - Create new task
- `mcp__constellos-mcp__list_tasks` - Query tasks
- `mcp__constellos-mcp__add_task_memory` - Store context
- `mcp__constellos-mcp__create_workflow` - Start workflow
- `mcp__constellos-mcp__link_constellos_action` - Trigger action

## Architecture

### Agents

**Reviewer Agent** (`agents/reviewer.ts`):
- Reads and analyzes code/documentation
- Creates structured review reports
- Generates actionable tasks for planners
- Stores findings in task memory

**Planner Agent** (`agents/planner.ts`):
- Analyzes review tasks
- Explores codebase for integration points
- Designs implementation approaches
- Creates task dependencies
- Links to constellos-actions

### Hooks

- **SessionStart**: Initialize task queue connection, display pending tasks
- **PostToolUse**: Capture agent results, update task memory
- **Stop**: Complete tasks, save session context

### Rules

- **task-structure.md**: Standard formats for tasks, memory, workflows
- **mcp-sync.md**: Synchronization rules and webhook triggers

## MCP Servers

### constellos-mcp
Task queue operations, workflow management, agent coordination.

### nodes-md
Nodeset operations and integration with nodes.md platform.

## Development

```bash
# Watch mode for development
npm run dev

# Build for production
npm run build
```

## License

MIT
