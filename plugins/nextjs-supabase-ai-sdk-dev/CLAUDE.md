---
title: Next.js Supabase AI SDK Dev Plugin
description: Development tooling for Next.js, Supabase, and AI SDK projects
version: 0.1.1
folder:
  subfolders:
    allowed: [.claude-plugin, hooks, agents, skills, shared, output-styles, templates]
    required: [.claude-plugin, hooks]
  files:
    allowed: [CLAUDE.md, README.md, .gitignore]
    required: [README.md]
---

# Next.js Supabase AI SDK Dev Plugin

CLI installation for Vercel/Supabase and systematic UI development with 5 progressive skills and 4 specialized agents.

## Hook Summary

| Hook | Event | Blocking | Purpose |
|------|-------|----------|---------|
| install-vercel | SessionStart | No | Installs Vercel CLI |
| install-supabase | SessionStart | No | Installs Supabase CLI |
| log-task-call | PreToolUse[Task] | No | Saves task context |
| log-task-result | PostToolUse[Task] | No | Logs task results |

## Agents

| Agent | Purpose |
|-------|---------|
| ui-developer | Full UI implementation (all 5 skills) |
| ui-reviewer | Visual quality review |
| ui-tester | Mobile/desktop viewport testing |
| ui-researcher | Design research and screenshots |

## Skills

| Skill | Purpose |
|-------|---------|
| ui-wireframing | ASCII wireframes (mobile-first) |
| ui-design | Static UI, compound components |
| ui-interaction | Client state, Zod validation |
| ui-integration | Server actions, Supabase |
| ai-sdk-ui | AI SDK streaming UI |

## Installation

```bash
claude plugin install nextjs-supabase-ai-sdk-dev@constellos
```

## See Also

- [README.md](./README.md)
- [Marketplace](../../CLAUDE.md)
