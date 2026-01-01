---
markdown:
  headings:
    allowed: ["#*", "##*", "###*", "####*"]
    required: [
      "# *",
      "## Quick Reference",
      "## Hook Summary",
      "## Key Features",
      "## Installation",
      "## Debug Logging",
      "## See Also"
    ]
  frontmatter:
    required: ["title", "description", "version", "folder"]
paths:
  - "plugins/*/CLAUDE.md"
---

# Plugin CLAUDE.md Structure

This rule enforces lightweight structure for AI-optimized plugin CLAUDE.md documentation.

## Required Skills: None

## Overview

Plugin CLAUDE.md files provide AI-optimized quick reference documentation. They are intentionally lightweight and focused on:
- Quick context for Claude AI agent
- Hook summaries in table format
- State file schemas
- Essential installation and debugging info
- Links to comprehensive README.md

CLAUDE.md files complement README.md files but serve a different purpose:
- **README.md**: User-facing, comprehensive, visual
- **CLAUDE.md**: AI-optimized, quick reference, technical

## Required Frontmatter

All plugin CLAUDE.md files must include YAML frontmatter with:

```yaml
---
title: Plugin Name
description: One-line description
version: 0.1.x
folder:
  subfolders:
    allowed: [.claude-plugin, hooks, ...]
    required: [.claude-plugin, hooks]
  files:
    allowed: [CLAUDE.md, README.md, .gitignore]
    required: [README.md]
---
```

**Required fields:**
- `title` - Human-readable plugin name
- `description` - One-line purpose description
- `version` - Semantic version (matches plugin.json)
- `folder` - Folder structure validation (subfolders and files)

**Folder validation schema:**
- `subfolders.allowed` - Array of allowed subdirectory names
- `subfolders.required` - Array of required subdirectory names
- `files.allowed` - Array of allowed file names at plugin root
- `files.required` - Array of required file names at plugin root

## Required Sections

### 1. Title (H1)
Plugin name without emoji prefix (unlike README.md).

**Example:**
```markdown
# GitHub Context Plugin
```

### 2. Quick Reference
Brief 2-3 sentence technical overview of plugin purpose.

**Must include:**
- "When to use" list with 2-4 bullet points
- Concise use cases

**Example:**
```markdown
## Quick Reference

**Purpose**: GitHub integration with branch context, commit enhancement, and issue synchronization.

**When to use**:
- GitHub-integrated development workflows
- Issue-driven development with branch linking
- Automated task documentation through commits
- PR readiness checks before ending sessions
```

### 3. Hook Summary
Table format listing all hooks with key metadata.

**Required columns:**
- Hook (file name without .ts extension)
- Event (hook event type)
- Blocking (Yes/No)
- Purpose (brief one-line description)

**Example:**
```markdown
## Hook Summary

| Hook | Event | Blocking | Purpose |
|------|-------|----------|---------|
| install-github | SessionStart | No | Installs GitHub CLI on remote environments |
| add-branch-context | SessionStart | No | Displays linked issue and branch sync status |
| sync-plan-to-issue | PostToolUse[Write\|Edit] | No | Creates/updates GitHub issues from plan files |
```

### 4. Key Features
Brief technical descriptions of major capabilities. Use H3 subsections for each feature.

Keep descriptions concise (1-3 sentences per feature).

**Example:**
```markdown
## Key Features

### Branch Context Discovery
Shows full GitHub issue content linked to current branch via state file, GitHub search, or issue body markers.

### Commit Enhancement
Enriches git commits with task context and issue references for both main agent and subagents.
```

### 5. State Files (Optional but Recommended)
Document any state files the plugin creates or uses.

**For each state file:**
- H3 heading with file name
- **Location**: Full path
- **Purpose**: What it stores
- JSON schema example

**Example:**
```markdown
## State Files

### plan-issues.json

**Location**: `.claude/logs/plan-issues.json`
**Purpose**: Tracks GitHub issue associations with plan files

```json
{
  "plan-file-path.md": {
    "issueNumber": 123,
    "issueUrl": "https://github.com/owner/repo/issues/123",
    "createdAt": "2025-01-15T10:30:00Z"
  }
}
```
```

### 6. Installation
Installation command only (no elaboration - that's in README.md).

**Example:**
```markdown
## Installation

```bash
claude plugin install plugin-name@constellos
```
```

### 7. Debug Logging
Environment variable for debug mode (if applicable).

**Example:**
```markdown
## Debug Logging

```bash
DEBUG=hook-name claude
# Or for all hooks
DEBUG=* claude
```

Logs written to `.claude/logs/hook-events.json`.
```

### 8. See Also
Links to related documentation (3-5 links maximum).

**Must include:**
- Link to plugin README.md
- Link to root marketplace CLAUDE.md
- Optional: Related plugins, official docs

**Example:**
```markdown
## See Also

- [Full Documentation](./README.md) - Comprehensive plugin guide
- [Marketplace](../../CLAUDE.md) - All available plugins
- [Official Claude Code Docs](https://github.com/anthropics/claude-code)
```

## Optional Sections

### MCP Configuration (if applicable)
If plugin uses MCP servers, document configuration.

### Requirements (if applicable)
If plugin has special requirements (external CLIs, services), document them.

## Formatting Guidelines

**Conciseness:**
- Keep descriptions brief and technical
- Use bullet points over paragraphs where possible
- Focus on what Claude AI needs to understand the plugin

**Code blocks:**
- Always specify language (bash, json, yaml, typescript)
- Use proper syntax highlighting

**Tables:**
- Use tables for structured data (hook summaries, state files)
- Keep table cells concise

**Linking:**
- Use relative paths for internal links
- Use full URLs for external documentation

## Implementation

This rule is enforced by the `enforce-structured-markdown.ts` PreToolUse[Write|Edit] hook in the project-context plugin.

The hook validates:
1. YAML frontmatter presence and required fields
2. Required heading structure
3. H1 title format (no emoji prefix)
4. Section organization

## Example Structure

**Good CLAUDE.md:**
```markdown
---
title: Example Plugin
description: Brief description
version: 0.1.0
folder:
  subfolders:
    allowed: [.claude-plugin, hooks]
    required: [.claude-plugin, hooks]
  files:
    allowed: [CLAUDE.md, README.md]
    required: [README.md]
---

# Example Plugin

## Quick Reference

**Purpose**: What the plugin does in 2-3 sentences.

**When to use**:
- Use case 1
- Use case 2

## Hook Summary

| Hook | Event | Blocking | Purpose |
|------|-------|----------|---------|
| my-hook | SessionStart | No | Does something |

## Key Features

### Feature Name
Brief description.

## Installation

```bash
claude plugin install example@constellos
```

## Debug Logging

```bash
DEBUG=example claude
```

## See Also

- [Full Documentation](./README.md)
- [Marketplace](../../CLAUDE.md)
```

**Bad CLAUDE.md:**
```markdown
# Example Plugin

Missing frontmatter, missing required sections, overly verbose content.
```

## Relationship to README.md

CLAUDE.md should NOT duplicate README.md content. Instead:

**CLAUDE.md contains:**
- Quick technical reference
- Hook summary table
- State file schemas
- Brief feature descriptions

**README.md contains:**
- Comprehensive documentation
- Visual badges and styled headers
- Detailed hook descriptions with examples
- Installation walkthroughs
- Use case explanations
- Troubleshooting guides

**Shared content:**
- Core hook names and purposes (can sync via HTML comments if needed)

## References

- [README Structure Rule](./plugin-readme.md)
- [Official Claude Code Plugins](https://github.com/anthropics/claude-code/tree/main/plugins)
- [CLAUDE.md Template](../../templates/CLAUDE.template.md)
