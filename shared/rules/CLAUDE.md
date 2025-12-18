# Claude Rules

This folder is for Claude Code rule documentation files (`.md` files).

## What Are Claude Rules?

Claude rules are markdown files placed in `.claude/rules/` that provide context, constraints, and guidelines for Claude Code. They help shape Claude's behavior for specific files, patterns, or project areas.

## Rule File Structure

Rules can include YAML frontmatter to define:

```yaml
---
# Heading validation (enforced by enforce-markdown-rules hook)
headings:
  required:
    - "## Overview"
    - "## Implementation"
  optional:
    - "## Examples"
  repeating:
    - pattern: "### Step *"
      min: 1
      max: 10

# Custom checks (executed by run-rule-checks hook)
checks:
  - "npm run lint"
  - "npm run typecheck"
---

# Rule Title

Rule content here...
```

## Related Hooks

The following hooks in `shared/hooks/` process rule files:

- **enforce-markdown-rules.ts** - PreToolUse hook that validates markdown heading structure (supports Write and Edit)
- **run-rule-checks.ts** - PostToolUse hook that runs custom checks from frontmatter

## Creating Rules

1. Create a `.md` file in `.claude/rules/`
2. Add frontmatter with constraints (optional)
3. Write rule content as markdown

## Pattern Matching

Rule filenames (without `.md`) are used as patterns to match edited files. For example:
- `typescript.md` matches files containing "typescript" in the path
- `components.md` matches files in component directories

## Hooks Location

The TypeScript hooks that process rules are located in `shared/hooks/rules/`:
- These are self-executable with `npx tsx`
- They import utilities from `shared/hooks/utils/`
