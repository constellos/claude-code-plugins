---
description: Guide to Claude Agent Skills - extending Claude's capabilities with model-invoked skills
capabilities:
  - Understanding Agent Skills
  - Creating SKILL.md files
  - Skill organization and frontmatter
  - Model-invoked vs user-invoked behavior
---

# Claude Agent Skills

Agent Skills extend Claude's capabilities with specialized knowledge and instructions that Claude autonomously uses based on task context.

## Overview

Skills are **model-invoked** - Claude automatically decides when to use them based on matching task context. This differs from commands (user-invoked) and hooks (event-triggered).

## Skill Structure

### Directory Layout

```
skills/
├── my-skill/
│   ├── SKILL.md           # Main skill definition (required)
│   ├── reference.md       # Supporting docs (optional)
│   └── scripts/           # Helper scripts (optional)
└── another-skill/
    └── SKILL.md
```

### SKILL.md Format

```markdown
---
description: What this skill does
tags: [tag1, tag2, tag3]
---

# Skill Name

Detailed description of when and how to use this skill.

## Key Capabilities

- Specific task 1
- Specific task 2
- Specific task 3

## Examples

Provide examples of how to use this skill effectively.

## Context

Additional context that helps Claude decide when to invoke this skill.
```

## Frontmatter Fields

**Required**:
- `description`: Brief summary of skill purpose

**Optional**:
- `tags`: Array of relevant keywords
- `priority`: Skill priority (higher = more likely to be used)
- `contexts`: When this skill should be considered

## Skill Types

### Knowledge Skills
Provide domain-specific knowledge:
```markdown
---
description: Understanding Next.js App Router patterns
tags: [nextjs, react, routing]
---

# Next.js App Router

Guide to Next.js 13+ App Router conventions...
```

### Process Skills
Define workflows and procedures:
```markdown
---
description: Creating and managing GitHub pull requests
tags: [github, git, workflow]
---

# GitHub PR Workflow

Steps for creating high-quality pull requests...
```

### Tool Skills
Integrate external tools:
```markdown
---
description: Using Supabase client for database operations
tags: [supabase, database, postgres]
---

# Supabase Operations

Patterns for querying and mutating data...
```

## Skill Discovery

Claude automatically discovers skills from:
- **User Skills**: `~/.claude/skills/` (available across all projects)
- **Project Skills**: `.claude/skills/` (specific to current project)
- **Plugin Skills**: Installed plugins' `skills/` directories

## Best Practices

### Writing Effective Skills
- **Clear descriptions**: Help Claude understand when to use the skill
- **Specific examples**: Show concrete usage patterns
- **Focused scope**: Keep skills narrow and targeted
- **Rich context**: Provide enough detail for autonomous use

### Skill Organization
- One skill per directory
- Group related skills in subdirectories
- Include supporting files (docs, scripts) alongside SKILL.md
- Use descriptive directory names

### Naming Conventions
- Use kebab-case for directory names
- Be specific and descriptive
- Avoid generic names like "utils" or "helpers"

## Plugin Skills

Plugins can include skills in their `skills/` directory:

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json
└── skills/
    ├── skill-one/
    │   └── SKILL.md
    └── skill-two/
        └── SKILL.md
```

Plugin skills are automatically available when the plugin is installed.

## Model-Invoked Behavior

**How Claude Uses Skills**:
1. Analyzes user request
2. Identifies relevant skills based on description/tags
3. Loads skill content as context
4. Applies skill knowledge to the task
5. No explicit user action required

**This differs from**:
- **Commands**: User explicitly invokes with `/command-name`
- **Hooks**: Automatically run on specific events
- **Agents**: Invoked via Task tool for complex subtasks

## Official Documentation

For complete specifications and examples:
- **Skills Guide**: https://code.claude.com/docs/en/skills.md
- **Agent Skills Overview**: https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview.md

## See Also

- `.claude/skills/claude-plugins/SKILL.md` - Plugin system overview
- `.claude/skills/claude-commands/SKILL.md` - Slash commands (user-invoked)
- `.claude/skills/claude-agents/SKILL.md` - Custom subagents
