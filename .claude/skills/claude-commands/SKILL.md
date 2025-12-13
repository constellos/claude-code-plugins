---
description: Guide to creating custom slash commands for Claude Code
capabilities:
  - Creating slash commands
  - Markdown format and frontmatter
  - Command organization
  - SlashCommand tool usage
---

# Claude Code Slash Commands

Custom slash commands extend Claude Code with reusable prompts and workflows that users can invoke with `/command-name`.

## Overview

Slash commands are **user-invoked** - users explicitly call them by typing `/command-name` in Claude Code. This differs from skills (model-invoked) and hooks (event-triggered).

## Command Structure

### File Format

Commands are Markdown files with YAML frontmatter:

```markdown
---
description: Brief description shown in /help
---

# Command Name

Detailed instructions for Claude on how to handle this command.

## Context

Additional context, examples, or guidelines for the command.
```

### Location

**Project Commands**: `.claude/commands/`
**User Commands**: `~/.claude/commands/`
**Plugin Commands**: `plugins/*/commands/`

## Creating Commands

### Basic Command

```markdown
---
description: Greet the user warmly
---

# Greet

Greet the user with a friendly, personalized message. Ask how you can help them today.
```

Usage: `/greet`

### Parameterized Command

```markdown
---
description: Deploy to specified environment
---

# Deploy

Deploy the application to the environment specified by the user.

## Steps

1. Confirm the target environment with the user
2. Run pre-deployment checks
3. Execute deployment script
4. Verify deployment success
5. Provide status update

## Environments

- staging: Deploy to staging servers
- production: Deploy to production (requires extra confirmation)
```

Usage: `/deploy staging` or `/deploy production`

### Complex Workflow

```markdown
---
description: Create a new React component with tests
---

# New Component

Create a new React component following project conventions.

## Steps

1. Ask for component name and description
2. Create component file in src/components/
3. Create test file in src/components/__tests__/
4. Create Storybook story if applicable
5. Export from src/components/index.ts

## Template

Use TypeScript with functional components and hooks.
Include prop types with TypeScript interfaces.
Follow existing component patterns in the project.

## Testing

Include basic smoke test and prop validation tests.
```

Usage: `/new-component`

## Frontmatter Fields

**Required**:
- `description`: Brief description shown in `/help` and command browser

**Optional**:
- `tags`: Array of keywords for searchability
- `category`: Command category for organization
- `hidden`: Hide from `/help` (for internal commands)

## Command Organization

### Directory Structure

```
.claude/commands/
├── git/
│   ├── commit.md
│   ├── pr.md
│   └── status.md
├── testing/
│   ├── unit.md
│   └── e2e.md
└── deploy.md
```

Commands can be in subdirectories for organization. They're invoked by filename:
- `git/commit.md` → `/commit`
- `testing/unit.md` → `/unit`

### Naming Conventions

- Use kebab-case for filenames
- Be specific and descriptive
- Avoid verb-only names (prefer `create-component` over just `create`)

## Plugin Commands

Plugins can provide commands in their `commands/` directory:

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json
└── commands/
    ├── deploy.md
    └── status.md
```

Plugin commands are automatically available when the plugin is installed.

## SlashCommand Tool

Claude can invoke slash commands programmatically using the SlashCommand tool:

```typescript
// Claude internally uses:
SlashCommand({
  command: "/deploy",
  args: "staging"
})
```

This allows commands to call other commands, creating composable workflows.

## Best Practices

### Writing Effective Commands

- **Clear instructions**: Tell Claude exactly what to do
- **Step-by-step**: Break complex workflows into numbered steps
- **Context-aware**: Reference project conventions and patterns
- **Flexible**: Allow for user customization and variations

### Command Scope

- **Project commands**: Specific to current project's workflow
- **User commands**: Personal shortcuts across all projects
- **Plugin commands**: Reusable team/community workflows

### Command vs Skill

**Use Commands When**:
- User explicitly triggers the workflow
- Specific sequence of steps required
- User input needed during execution

**Use Skills When**:
- Claude should auto-apply knowledge
- Context-based invocation preferred
- No specific trigger point

## Testing Commands

1. Create command file in `.claude/commands/`
2. Run `/help` to verify it appears
3. Invoke with `/command-name`
4. Verify Claude follows instructions
5. Iterate on wording for clarity

## Official Documentation

For complete specifications:
- **Slash Commands**: https://code.claude.com/docs/en/slash-commands.md

## See Also

- `.claude/skills/claude-plugins/SKILL.md` - Plugin system overview
- `.claude/skills/claude-skills/SKILL.md` - Agent Skills (model-invoked)
- `.claude/skills/claude-agents/SKILL.md` - Custom subagents
