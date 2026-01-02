![Version](https://img.shields.io/badge/version-0.1.1-blue?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-15+-black?style=for-the-badge&logo=next.js)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel)

# Next.js Supabase AI SDK Dev Plugin

> Development tooling for Next.js, Supabase, and Vercel AI SDK projects

## Purpose

Provides CLI installation for Vercel and Supabase on remote environments, task context tracking for subagent workflows, and a systematic UI development system with 5 progressive skills. Includes 4 specialized agents for UI development, review, testing, and research.

## Contents

### Hooks

| Hook | Event | Purpose |
|------|-------|---------|
| install-vercel | SessionStart | Installs Vercel CLI on remote |
| install-supabase | SessionStart | Installs Supabase CLI on remote |
| log-task-call | PreToolUse[Task] | Saves task context |
| log-task-result | PostToolUse[Task] | Logs task results |

### Agents

| Agent | Purpose |
|-------|---------|
| ui-developer | Full UI implementation with all 5 skills |
| ui-reviewer | Visual inspection and quality review |
| ui-tester | Mobile (375px) and desktop (1440px) testing |
| ui-researcher | Screenshot capture and design research |

### Skills

| Skill | Purpose |
|-------|---------|
| ui-wireframing | Mobile-first ASCII wireframes |
| ui-design | Contract-first static UI, compound components |
| ui-interaction | Client events, local state, Zod validation |
| ui-integration | Server actions, Supabase, backend |
| ai-sdk-ui | Vercel AI SDK streaming UI |

### Output Styles

| Style | Purpose |
|-------|---------|
| nextjs-lead-dev | Lead developer delegation patterns |

## Installation

```bash
claude plugin install nextjs-supabase-ai-sdk-dev@constellos
```

## License

MIT © constellos
