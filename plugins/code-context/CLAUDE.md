---
title: Code Context Plugin
description: Discovers CLAUDE.md files and provides folder navigation for code structure mapping
folder:
  subfolders:
    allowed: [.claude-plugin, hooks]
    required: [.claude-plugin, hooks]
  files:
    allowed: [CLAUDE.md, README.md, .gitignore]
    required: [CLAUDE.md]
---

# codemap Plugin

Generate and maintain code structure maps and navigation aids for large codebases.

## Overview

This is a **placeholder plugin** with no hooks currently implemented. It's reserved for future development of code mapping and navigation features.

## Current Status

**No hooks implemented.**

The `hooks/hooks.json` file contains only comments describing planned features.

## Planned Features

Future hooks to consider:
- **SessionStart**: Generate code structure map at session start
  - Scan codebase for key files and patterns
  - Create navigation index
  - Identify entry points and main modules

- **PostToolUse[Write|Edit]**: Update code maps when files change
  - Incrementally update structure maps
  - Track new dependencies
  - Regenerate affected navigation sections

- **Stop**: Export code map and architecture diagrams
  - Generate Mermaid diagrams
  - Export dependency graphs
  - Create markdown navigation docs

Planned capabilities:
- Automatic code structure discovery
- Dependency graph generation
- Architecture diagram exports
- Navigation index generation
- Module relationship mapping
- Entry point identification

## Use Cases

When implemented, this plugin will enable:
- Quick navigation in large codebases
- Understanding project architecture
- Onboarding new developers
- Documenting code structure
- Identifying code hotspots and dependencies
- Generating architecture diagrams

## Configuration

This plugin is referenced in `.claude-plugin/marketplace.json`:

```json
{
  "name": "codemap",
  "source": "./plugins/codemap",
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

## Implementation Ideas

Potential approaches for code mapping:
1. **Static Analysis**: Parse source files to build structure
2. **Pattern Matching**: Identify common patterns (routes, components, services)
3. **Import Graphs**: Build dependency trees from import statements
4. **AST Parsing**: Deep code analysis using TypeScript/Babel parsers
5. **Caching**: Store maps in `.claude/codemap/` for fast access
