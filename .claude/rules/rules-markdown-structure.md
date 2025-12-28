---
markdown:
  headings:
    allowed: ["#*", "##*", "###*", "####*"]
    required: ["## Required Skills:*"]
  frontmatter:
    allowed: ["*"]
    required: ["markdown"]
---

# Rules Markdown Structure

This meta-rule defines the required structure for all rule files in `.claude/rules/`.

## Required Skills: None

All rule files MUST include a "Required Skills:" heading that specifies which skills must be invoked (either preloaded via agent metadata or called via the Skill tool) before Write or Edit operations on files matching the rule's path pattern.

### Format

The "Required Skills:" heading must follow this format:

```markdown
## Required Skills: skill1, skill2, skill3
```

Or, if no skills are required:

```markdown
## Required Skills: None
```

### Examples

**Single skill:**
```markdown
## Required Skills: claude-plugins
```

**Multiple skills:**
```markdown
## Required Skills: claude-plugins, turborepo-vercel
```

**No skills required:**
```markdown
## Required Skills: None
```

## Implementation

The `validate-rules-file.ts` PreToolUse hook (from project-context plugin) validates:
1. All rules files have a "Required Skills:" heading
2. The heading format is correct (prefix with colon, comma-separated list or "None")
3. Rule files have the required frontmatter structure

## Frontmatter Requirements

All rule files MUST include frontmatter with:
- `markdown` field defining heading validation rules

Example:
```yaml
---
markdown:
  headings:
    allowed: ["#*", "##*", "###*"]
    required: ["## Overview", "## Implementation", "## Required Skills:*"]
---
```

## Notes

- This meta-rule validates the structure of other rule files
- The "Required Skills:" heading can have any suffix after the colon (validated by pattern `## Required Skills:*`)
- Skills listed must match skill names in `.claude/skills/`
- The project-context plugin enforces this structure on all Write/Edit operations to `.claude/rules/*.md` files
