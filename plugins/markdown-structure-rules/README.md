# Markdown Structure Rules Plugin

Validates markdown structure for rules files in `.claude/rules/`.

## Overview

This plugin ensures that all rules files in `.claude/rules/` follow a consistent structure with:
- Required `Required Skills` frontmatter field
- Required `## Rules` heading

## Validation Rules

### Required Frontmatter

All rules files must include:

```yaml
---
Required Skills: skill-name, another-skill
---
```

Or, if no skills are required:

```yaml
---
Required Skills: None
---
```

### Required Headings

All rules files must include:
- `## Rules` - Contains the actual rules for this file pattern

## Hook Details

### PreToolUse[Write|Edit]

**`validate-rules-structure.ts`**
- Runs before Write/Edit operations on `.claude/rules/*.md` files
- Validates frontmatter and heading structure
- Returns **deny** decision if validation fails
- Provides detailed error messages

**Validation Checks:**
1. File must have valid YAML frontmatter
2. Frontmatter must include `Required Skills` field
3. Content must include `## Rules` heading

**Example Error:**
```
Rules file validation failed for my-rule.md:

- Missing "Required Skills" field in frontmatter
- Missing required heading: "## Rules"

Please ensure all required fields and headings are present.
```

## Example Rules File

```markdown
---
Required Skills: typescript-development, testing
---

# TypeScript Development Rules

## Rules

1. All TypeScript files must pass ESLint validation
2. All TypeScript files must pass type checking
3. Use strict mode for all TypeScript files
4. Avoid using `any` type - use `unknown` or proper types
5. Write unit tests for all new functions
```

## Installation

```bash
claude plugin install markdown-structure-rules@constellos
```

## Requirements

- Node.js for hook execution
- gray-matter for YAML frontmatter parsing

## Configuration

Enable in `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "markdown-structure-rules@constellos": true
  }
}
```

## Why This Plugin?

Rules files define file-specific guidelines and requirements. Consistent structure ensures:
- Clear specification of which skills must be invoked
- Predictable format for automated tools
- Easy-to-read rules for developers

## Related Plugins

- **code-context** - Folder structure validation for `.claude` directories
- **github-review-sync** - Git workflow automation and quality checks
