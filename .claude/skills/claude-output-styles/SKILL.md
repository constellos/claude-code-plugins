# Claude Output Styles

## Overview

Output styles in Claude Code customize Claude's behavior, tone, and available tools by modifying the system prompt. They are defined as markdown files with optional YAML frontmatter for metadata and tool restrictions.

## How Output Styles Work

### Configuration Loading

Output styles are configured via the `outputStyle` field in settings.json:

```json
{
  "outputStyle": "test-emoji-style"
}
```

### Storage Locations

Output style files are stored as markdown in:
- **User-level** (global): `~/.claude/output-styles/`
- **Project-level**: `.claude/output-styles/`

File naming convention: `{style-name}.md`

### System Prompt Integration

**Critical behavior**: Output styles directly modify Claude Code's system prompt by:
1. Excluding default efficiency instructions when a custom style is selected
2. Adding the markdown content as custom directives to shape assistant behavior

### Hot Reloading

Output styles have **special hot-reload capabilities**:
- **Via `/output-style` command**: Changes take effect immediately in the current session
- **Via manual settings.json edit**: Requires session restart (no hot-reload)

This is unique - most other settings.json changes require full session restart.

## Context Visibility

### What Claude Sees

When an output style is active, Claude receives the style's instructions in the system prompt under a "Tone and style" section. However, the output style name itself may not be explicitly visible - the instructions are merged into the general system prompt.

### Testing Context Loading

To verify an output style is loaded:
1. Create a style with distinctive, contradictory instructions (e.g., "use emojis everywhere")
2. Check if Claude's behavior changes after applying the style
3. Restart the session if using manual settings.json edits

## Output Style File Format

### Basic Format

```markdown
# My Custom Style

Your custom instructions here. These will be injected into Claude's system prompt.

Use markdown formatting for clarity.
```

### With Frontmatter (Advanced)

```markdown
---
name: "Architect Delegator"
description: "Focuses on delegation and high-level architecture"
tools:
  - Task
  - Read
  - Glob
  - Grep
---

# Architect Delegator Style

You are an architect who focuses on delegation...
```

### Frontmatter Fields

- **`name`** (string): Human-readable style name
- **`description`** (string): Brief description of the style
- **`tools`** (array): Whitelist of allowed tool names (for permission enforcement)

## Tool Restrictions

The `tools` frontmatter field enables tool whitelisting when combined with the `output-styles-permission-modes` plugin:

```yaml
---
tools:
  - Task
  - Read
  - Bash
---
```

When active:
- Only listed tools are allowed for the main agent
- Unlisted tools are blocked with a permission denial
- Subagents are unaffected (they use their own tool permissions)

## Settings Hierarchy

Output style settings follow the standard Claude Code settings hierarchy:

1. Managed settings (Enterprise/admin)
2. File-based managed settings
3. Command line arguments
4. Local project settings (`.claude/settings.local.json`)
5. Shared project settings (`.claude/settings.json`)
6. User settings (`~/.claude/settings.json`)

## Using the `/output-style` Command

### Interactive Menu

```bash
/output-style
```

Shows available styles with descriptions and allows selection.

### Direct Switch

```bash
/output-style architect-delegator
```

Switches directly to the specified style. Changes are saved to `.claude/settings.local.json`.

## Known Limitations

### No `/reloadSettings` Command

Manual edits to settings.json require session restart. There is a pending feature request (GitHub Issue #5513) for a `/reloadSettings` command that would enable hot-reloading without context loss.

### Context Not Explicitly Labeled

The output style's instructions appear in Claude's system prompt but may not be explicitly tagged as coming from an "output style" configuration. The content is merged into general instructions.

## Implementation Details

### Session Start Behavior

When a Claude Code session starts:
1. Settings are loaded from the hierarchy
2. The `outputStyle` value is read
3. The corresponding `.md` file is located
4. Frontmatter is parsed (if present)
5. Markdown content is injected into the system prompt
6. Tool restrictions are applied (if configured via hooks)

### Transcript Analysis

Output style configuration is **not** recorded in the session transcript. To determine which style was active during a session, you must:
1. Check the settings.json files that were active at session start
2. Look for style-specific language patterns in Claude's responses

## Example: Test Emoji Style

```markdown
# Test Emoji Style

You MUST use emojis in EVERY response. Start each response with a rocket emoji 🚀 and end with a checkmark ✅.

Always be extremely enthusiastic and use at least 3 emojis per paragraph.

This is a test output style to verify if output styles are loaded into Claude's context.
```

Saved as `.claude/output-styles/test-emoji-style.md`

## Example: Architect Delegator with Tools

```markdown
---
name: "Architect Delegator"
description: "Focus on planning and delegation, minimize direct execution"
tools:
  - Task
  - Read
  - Glob
  - Grep
  - AskUserQuestion
---

# Architect Delegator

You are a software architect who focuses on:

1. **Delegation**: Use the Task tool to spawn specialized agents
2. **Planning**: Read and understand before acting
3. **Minimal Execution**: Avoid direct file editing when possible

## Guidelines

- Prefer Task tool over direct implementation
- Use Read/Glob/Grep to understand the codebase
- Ask questions when requirements are unclear
- Provide architectural guidance rather than code
```

## Related Components

### Plugins

- **output-styles-permission-modes**: Enforces tool restrictions from output style frontmatter

### Utilities

- **shared/hooks/utils/was-tool-event-main-agent.ts**: Determines if a tool event was from main agent vs subagent
- **shared/hooks/utils/toml.ts**: TOML parser (can be adapted for frontmatter)

### Hooks

- **PreToolUse**: Used to enforce tool restrictions before execution

## Best Practices

### Creating Output Styles

1. **Be Specific**: Clear, actionable instructions work best
2. **Use Examples**: Show Claude what you want, not just describe it
3. **Test Thoroughly**: Verify the style produces expected behavior
4. **Document Tools**: If using tool restrictions, document why each tool is included

### Naming Conventions

- Use kebab-case: `my-custom-style.md`
- Be descriptive: `typescript-focused-dev.md` not `ts.md`
- Avoid conflicts with built-in styles

### Version Control

- **Commit project styles**: `.claude/output-styles/` should be in git
- **Don't commit user styles**: `~/.claude/output-styles/` is user-specific
- **Document in README**: Explain which styles your project uses

## Troubleshooting

### Style Not Loading

1. Check file naming matches settings.json exactly
2. Verify file is in correct location (.claude/output-styles/)
3. Restart session if you manually edited settings.json
4. Check for YAML syntax errors in frontmatter

### Tool Restrictions Not Working

1. Ensure output-styles-permission-modes plugin is installed
2. Check that tools array uses exact tool names (case-sensitive)
3. Verify hook is triggering (check .claude/logs/)
4. Confirm you're testing with main agent, not subagent

### Unexpected Behavior

1. Read the style file to verify contents
2. Check for conflicting instructions from multiple sources
3. Test with a minimal style to isolate issues
4. Compare Claude's actual behavior against style instructions

## References

- **Official Docs**: [code.claude.com/docs/en/output-styles.md](https://code.claude.com/docs/en/output-styles.md)
- **Settings Guide**: [code.claude.com/docs/en/settings](https://code.claude.com/docs/en/settings)
- **GitHub Issue**: [#5513 - Add /reloadSettings command](https://github.com/anthropics/claude-code/issues/5513)
