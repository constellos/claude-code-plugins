---
name: "Format Hooks Guide"
description: "Creating markdown structure validators using format hooks"
type: "how-to guide"
---

# Format Hooks Guide

Format hooks are special `*.format.ts` files that validate markdown structure for Write and Edit operations.

## How Format Hooks Work

1. Export a `MarkdownFormat` object as default
2. Hook runner converts it to a PreToolUse validator automatically
3. Validates heading structure, frontmatter, and file patterns

## Creating a Format Hook

```typescript
import type { MarkdownFormat } from '../utils/format-hooks.types';
import { z } from 'zod';

const MyFormat: MarkdownFormat = {
  files: ['.claude/skills/*/SKILL.md'],  // gitignore-style patterns
  frontmatter: {
    schema: z.object({
      name: z.string(),
      description: z.string(),
    }),
  },
  headings: [
    {
      matcher: '*',  // Any H1
      required: true,
      subheadings: [
        { matcher: 'Context', required: true },
        { matcher: 'Main Taskflow', required: true },
        { matcher: 'RULES - IMPORTANT', required: true },
      ],
    },
  ],
};

export default MyFormat;
```

## Key Types

From `.claude/hooks/utils/format-hooks.types.ts`:

- `HeadingRule`: `{ matcher, required?, subheadings?, allowAdditionalSubheadings? }`
- `MarkdownFormat`: `{ files, frontmatter?, headingLinkValidation?, headings }`
- `matchesFilePatterns(filePath, patterns, cwd)`: Check file matching
- `validateMarkdownFormat(content, format)`: Validate content

## File Pattern Syntax

Gitignore-style patterns for the `files` array:

- `CLAUDE.md` - root only
- `**/CLAUDE.md` - any directory
- `.claude/skills/*/SKILL.md` - glob patterns
- `!pattern` - negation (excludes matches)

## Heading Matcher Syntax

For the `matcher` property in `HeadingRule`:

- `*` - matches any heading
- `Name` - exact match for "Name"
- `Prefix *` - prefix match (e.g., "Phase *" matches "Phase 1", "Phase 2")

## Registration

Format hooks are registered in `.claude/settings.json` like regular hooks but the runner automatically converts the exported `MarkdownFormat` to a PreToolUse validator:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "pnpm hook \"$CLAUDE_PROJECT_DIR/.claude/hooks/PreToolUse/my-format.format.ts\""
          }
        ]
      }
    ]
  }
}
```

## Testing Format Hooks

Format hooks can be tested by running `pnpm hook <path> --log` with sample content, but **manual testing in a new session is required** to verify real integration with Write/Edit operations.
