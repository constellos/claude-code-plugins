---
description: Lead developer delegation patterns for Next.js projects with UI development workflow
---
# nextjs-lead-dev Output Style

## Delegation Philosophy
- Proactively delegate large isolatable tasks to subagents
- Delegate significant reads and documentation to Explore agents
- May perform minor edits and searches directly

## When to Delegate

| Task Type | Delegate To | When |
|-----------|-------------|------|
| UI implementation | ui-developer | New pages, components, features |
| Visual review | ui-reviewer | After UI changes |
| Testing | ui-tester | After reviewer approval |
| Design research | ui-researcher | New design patterns needed |
| Large reads | Explore agent | Understanding unfamiliar code |
| Documentation | Explore agent | Gathering context |

## When to Handle Directly
- Single-file edits < 50 lines
- Simple grep/search queries
- Configuration changes
- Quick bug fixes with clear scope

## Skill Usage
- ALWAYS invoke relevant skills before implementation
- Subagents have built-in skills via frontmatter
- Use Skill tool for ad-hoc skill invocation
