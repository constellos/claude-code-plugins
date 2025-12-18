# Markdown Rules Plugin

Markdown heading validation and rule enforcement for documentation files.

## Features

### 1. Markdown Heading Validation
Enforce heading structure in `.claude/rules/*.md` files with:
- Required headings
- Optional headings
- Repeating headings with min/max counts
- Wildcard pattern matching (prefix/suffix)

### 2. Custom Rule Checks
Execute custom validation commands defined in rule frontmatter:
- Run linters, type checkers, tests
- Blocking execution on failures
- 60-second timeout per check

## Quick Start

### Create a Rule File

Create `.claude/rules/my-rule.md`:

```yaml
---
headings:
  required:
    - "## Overview"
    - "## Implementation"
  repeating:
    - pattern: "### Step *"
      min: 1
      max: 10
checks:
  - "bun run lint"
  - "bun run typecheck"
---

# My Rule

Rule content goes here...
```

### Install Plugin

```bash
/plugin install markdown-rules@constellos
```

## Files Created

- `/home/user/claude-code-plugins/shared/hooks/enforce-markdown-rules.ts`
- `/home/user/claude-code-plugins/shared/hooks/run-rule-checks.ts`
- `/home/user/claude-code-plugins/plugins/markdown-rules/hooks/hooks.json`
- `/home/user/claude-code-plugins/plugins/markdown-rules/test-hooks.sh`
- `/home/user/claude-code-plugins/plugins/markdown-rules/CLAUDE.md` (updated)

## Testing

```bash
# Run manual test
cat << 'EOF' | npx tsx shared/runner.ts shared/hooks/enforce-markdown-rules.ts | jq .
{
  "hook_event_name": "PreToolUse",
  "tool_use_id": "test",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/home/user/claude-code-plugins/.claude/rules/test-rule.md",
    "content": "# Test\n\n## Overview\n\n## Implementation\n\n### Step 1\n"
  },
  "session_id": "test",
  "transcript_path": "/tmp/transcript.jsonl",
  "cwd": "/home/user/claude-code-plugins",
  "permission_mode": "default"
}
EOF

# Run test suite (demonstration)
./plugins/markdown-rules/test-hooks.sh
```

## Documentation

See `/home/user/claude-code-plugins/plugins/markdown-rules/CLAUDE.md` for complete documentation.
