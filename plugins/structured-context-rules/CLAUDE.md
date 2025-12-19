---
name: Structured Markdown Config Plugin
description: Comprehensive markdown structure validation and tool enforcement for agents, skills, rules, and CLAUDE.md files
folder:
  subfolders:
    allowed: [.claude-plugin, hooks]
    required: [.claude-plugin, hooks]
  files:
    allowed: [CLAUDE.md, README.md, .gitignore]
    required: [CLAUDE.md]
---

# structured-markdown-config Plugin

Comprehensive markdown structure validation and tool enforcement for Claude Code configuration files.

## Overview

This plugin merges the functionality of `enhanced-rules` and `output-styles-permission-modes` into a single comprehensive plugin that:

1. **Validates agent structure** - Ensures agents have proper headings (Objective, Principles, Agent-scoped project context)
2. **Validates skill structure** - Ensures skills have proper headings (Purpose, Skill-scoped context) and metadata (name, description)
3. **Validates rules structure** - Ensures rules have Required Skills metadata and ## Rules heading
4. **Validates CLAUDE.md files** - Ensures all CLAUDE.md files have name and description metadata
5. **Enforces tool restrictions** - Blocks tools not allowed by active output style
6. **Runs custom checks** - Executes custom validation commands from rule frontmatter

## Current Status

**3 hooks implemented:**
- PreToolUse: Structured markdown validation (agents, skills, rules, CLAUDE.md)
- PreToolUse: Output style tool enforcement
- PostToolUse: Custom rule checks execution

## Hooks

### 1. PreToolUse[Write|Edit] - Enforce Structured Markdown

**File**: `shared/hooks/enforce-structured-markdown.ts`
**Event**: `PreToolUse`
**Matcher**: `Write|Edit` (only for .md files)

**What it does**:
- Validates markdown structure for different file types
- Checks required headings are present
- Checks required metadata fields are present
- Returns **deny** decision if validation fails

**File Type Detection**:

#### Agent Files (`.claude/agents/*.md`)

**Required Headings**:
- `## Objective`
- `## Principles`
- `## Agent-scoped project context`

**Notes**:
- Title can use `*` wildcard but should use the agent name
- Agent-scoped project context should contain functional area notes relevant for planning

#### Skill Files (`.claude/skills/*/*.md`)

**Excluded Files**: `SKILL.md`, `SKILL.template.md` (these follow different rules)

**Required Headings**:
- `## Purpose`
- `## Skill-scoped context`

**Required Metadata**:
- `name`
- `description`

**Notes**:
- Skill-scoped context should contain task/workflow scoped saved notes for the project

#### Rules Files (`.claude/rules/*.md`)

**Required Headings**:
- `## Rules`

**Required Metadata**:
- `Required Skills`

#### CLAUDE.md Files (any directory)

**Required Metadata**:
- `name`
- `description`

**Optional Metadata**:
- `folder` (subfolder and file structure specifications)
- `files` (allowed/required file patterns)

**Example Frontmatter**:
```yaml
---
name: "My Module"
description: "Description of this module"
folder:
  subfolders:
    allowed: [src, tests, docs]
    required: [src]
  files:
    allowed: ["*.ts", "*.md", "package.json"]
    required: ["package.json"]
---
```

**Behavior**:
- Only runs for Write and Edit operations on .md files
- Detects file type by path pattern
- Validates required headings and metadata
- Returns **deny** decision with detailed error message if validation fails
- Returns **allow** decision if validation passes

**Output**:
- Success: `permissionDecision: "allow"`
- Failure: `permissionDecision: "deny"` with error details

**Example Error**:
```
Agent validation failed for my-agent.md:

Required heading missing: "## Objective"
Required heading missing: "## Principles"

Please ensure all required headings and metadata fields are present.
```

---

### 2. PreToolUse - Enforce Output Style Tools

**File**: `shared/hooks/enforce-output-style-tools.ts`
**Event**: `PreToolUse`
**Matcher**: All tools

**What it does**:
- Reads current output style from `.claude/settings.json`
- Loads output style frontmatter from `.claude/output-styles/{style}.md`
- Checks if tool is in the `tools` whitelist
- Returns **deny** decision if tool not allowed
- **Only enforces for main agent** - subagents can use any tools

**Frontmatter Format**:
```yaml
---
name: "Architect Mode"
description: "Focus on planning and delegation"
tools:
  - Task
  - Read
  - Glob
  - Grep
  - AskUserQuestion
  - TodoWrite
---
```

**Behavior**:
- Skips enforcement for subagents
- Allows all tools if no output style is configured
- Allows all tools if output style has no `tools` array
- Returns **deny** decision if tool not in whitelist

**Output**:
- Success: `permissionDecision: "allow"`
- Failure: `permissionDecision: "deny"` with allowed tools list

**Example Error**:
```
The "Write" tool is not allowed by the current output style "architect-mode".
Allowed tools: Task, Read, Glob, Grep, AskUserQuestion, TodoWrite
```

---

### 3. PostToolUse[Write|Edit] - Run Rule Checks

**File**: `shared/hooks/run-rule-checks.ts`
**Event**: `PostToolUse`
**Matcher**: `Write|Edit`

**What it does**:
- Finds rules that match the edited file path
- Extracts `checks:` array from rule frontmatter
- Executes each check command
- Returns **block** decision if any check fails

**Frontmatter Format**:
```yaml
---
checks:
  - "npm run lint"
  - "npm run typecheck"
  - "npm test"
---
```

**Behavior**:
- Only runs for Write and Edit operations
- Matches file paths against rule patterns (substring matching)
- Executes checks with 60-second timeout
- Returns **block** decision if any check fails
- Returns empty output if all checks pass

**Output**:
- Success: Empty (no output)
- Failure: **Blocking decision** with check output

**Example Failure**:
```
decision: 'block'
reason: 'Rule checks failed'
additionalContext: Rule checks failed for /path/to/file.ts:

Check "npm run lint" failed:
/path/to/file.ts
  12:5  error  'foo' is assigned a value but never used

Please fix these issues.
```

---

## Configuration

This plugin is referenced in `.claude-plugin/marketplace.json`:

```json
{
  "name": "structured-markdown-config",
  "source": "./plugins/structured-markdown-config",
  "strict": false
}
```

Install with:
```bash
/plugin install structured-markdown-config@constellos
```

## Use Cases

### Agent Structure Validation
- Ensure agents have Objective, Principles, and Agent-scoped project context
- Maintain consistent agent file structure
- Guide agent development with clear sections

### Skill Structure Validation
- Ensure skills have Purpose and Skill-scoped context
- Require name and description metadata
- Exclude SKILL.md and SKILL.template.md from validation

### Rules Structure Validation
- Ensure rules specify Required Skills
- Require ## Rules heading
- Support custom checks execution

### CLAUDE.md Validation
- Ensure all CLAUDE.md files have name and description
- Support folder and file structure specifications
- Enable metadata-driven folder validation

### Tool Enforcement
- Restrict main agent to specific tools based on output style
- Enable "architect mode" that encourages delegation
- Create safe exploration modes with read-only tools

### Custom Checks
- Run linting on specific file patterns
- Execute type checking for critical files
- Run tests after test file modifications
- Validate security requirements

## Debug Logging

Enable debug output for hooks:

```bash
DEBUG=* claude                                    # All debug output
DEBUG=enforce-structured-markdown claude          # Structure validation only
DEBUG=enforce-output-style-tools claude           # Tool enforcement only
DEBUG=run-rule-checks claude                      # Check execution only
```

## Validation Rules Summary

| File Type | Required Headings | Required Metadata | Notes |
|-----------|------------------|-------------------|-------|
| **Agent** (`.claude/agents/*.md`) | `## Objective`<br>`## Principles`<br>`## Agent-scoped project context` | - | Title can be `*` but should use agent name |
| **Skill** (`.claude/skills/*/*.md`) | `## Purpose`<br>`## Skill-scoped context` | `name`<br>`description` | Excludes `SKILL.md` and `SKILL.template.md` |
| **Rule** (`.claude/rules/*.md`) | `## Rules` | `Required Skills` | - |
| **CLAUDE.md** (any directory) | - | `name`<br>`description` | Optional: `folder`, `files` |

## Example Files

### Example Agent File

```markdown
---
title: TypeScript Code Generator
description: Generates TypeScript code with best practices
---

# TypeScript Code Generator

## Objective

Generate high-quality TypeScript code following project conventions and best practices.

## Principles

1. Always use strict type checking
2. Follow functional programming patterns where appropriate
3. Write self-documenting code with clear naming
4. Minimize dependencies on external libraries

## Agent-scoped project context

- Project uses TypeScript 5.0+ with strict mode enabled
- ESLint and Prettier are configured for code quality
- All code must pass type checking before commit
- Prefer composition over inheritance
```

### Example Skill File

```markdown
---
name: Database Migration
description: Create and manage database migrations
---

# Database Migration Skill

## Purpose

Create, test, and apply database migrations safely with proper rollback support.

## Skill-scoped context

- Project uses Supabase for database
- Migration files are stored in `supabase/migrations/`
- Always test migrations locally before applying to production
- Each migration should include both up and down scripts
- Document schema changes in migration comments
```

### Example Rule File

```markdown
---
Required Skills: [TypeScript Development, Testing]
checks:
  - "npm run lint"
  - "npm run typecheck"
---

# TypeScript Development Rules

## Rules

1. All TypeScript files must pass ESLint validation
2. All TypeScript files must pass type checking
3. Use strict mode for all TypeScript files
4. Avoid using `any` type - use `unknown` or proper types
5. Write unit tests for all new functions
```

### Example CLAUDE.md File

```markdown
---
name: API Routes Module
description: API route handlers and middleware for the application
folder:
  subfolders:
    allowed: [handlers, middleware, utils]
    required: [handlers]
  files:
    allowed: ["*.ts", "*.test.ts", "CLAUDE.md"]
    required: ["CLAUDE.md"]
---

# API Routes Module

This module contains all API route handlers and supporting middleware.

## Structure

- `handlers/` - Route handler implementations
- `middleware/` - Express middleware functions
- `utils/` - Utility functions for API operations

## Conventions

- All handlers should be async functions
- Use middleware for authentication and validation
- Return consistent error responses
```

## Requirements

- Node.js (for TypeScript hook runner)
- gray-matter (for YAML frontmatter parsing)
- tsx (for TypeScript execution)

## Migration from Previous Plugins

If you were using `enhanced-rules` or `output-styles-permission-modes`:

1. Disable the old plugins:
   ```json
   {
     "enabledPlugins": {
       "enhanced-rules@constellos": false,
       "output-styles-permission-modes@constellos": false
     }
   }
   ```

2. Enable the new plugin:
   ```bash
   /plugin install structured-markdown-config@constellos
   ```

3. Update any references in your documentation

The new plugin includes all functionality from both previous plugins plus additional validation rules.

## Future Enhancements

Planned improvements:
- Glob pattern support in frontmatter for rule matching
- Custom error messages in frontmatter
- Rule severity levels (error vs warning)
- AST analysis for code validation
- Integration with ESLint/Prettier configurations
- Rule inheritance and composition
- User-level output styles support
- Wildcard/pattern matching for tool names
