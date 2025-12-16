# main-agent-perms Plugin

Placeholder plugin for enforcing subagent-style metadata and permissions on the main agent.

## Overview

This is a **placeholder plugin** with no hooks currently implemented. It's reserved for future development of permission boundaries and security controls for the main agent session.

## Current Status

**No hooks implemented.**

The `hooks/hooks.json` file contains only comments describing planned features.

## Planned Features

Future hooks to consider:
- **SessionStart**: Initialize permission context for main agent session
- **PreToolUse**: Validate tool permissions against main agent policy
- **PostToolUse**: Audit tool usage and track file modifications
- **UserPromptSubmit**: Validate user prompts against security policies
- **Stop**: Cleanup and generate session audit report

Planned capabilities:
- Permission boundaries for file access (read/write restrictions)
- Tool allowlists and denylists
- Session audit logging
- Rate limiting for sensitive operations
- Branch protection rules
- Secret detection and blocking

## Use Cases

When implemented, this plugin will enable:
- Enterprise security controls for Claude Code sessions
- Audit trails for compliance requirements
- Preventing accidental modifications to sensitive files
- Enforcing branch protection policies
- Rate limiting expensive operations
- Detecting and blocking secrets in code

## Configuration

This plugin is referenced in `.claude-plugin/marketplace.json`:

```json
{
  "name": "main-agent-perms",
  "source": "../plugins/main-agent-perms",
  "strict": false
}
```

Currently, installing this plugin has no effect as no hooks are implemented.

## Contributing

If you're interested in implementing these features, see:
- `.claude/skills/claude-hooks/SKILL.md` for hook development guide
- `shared/lib/types.ts` for hook type definitions
- `shared/runner.ts` for the TypeScript hook runner
- Other plugins in `plugins/` for implementation examples

## Implementation Roadmap

1. **Phase 1**: Basic audit logging (SessionStart, Stop hooks)
2. **Phase 2**: File permission boundaries (PreToolUse validation)
3. **Phase 3**: Secret detection (PostToolUse scanning)
4. **Phase 4**: Advanced controls (rate limiting, branch protection)
