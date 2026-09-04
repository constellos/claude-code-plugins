---
title: Constellos Plugin
description: Constellos harness for Claude Code sessions - threads, objective context, doc reminders
version: 0.1.0
folder:
  subfolders:
    allowed: [.claude-plugin, hooks, shared]
    required: [.claude-plugin, hooks, shared]
  files:
    allowed: [CLAUDE.md, README.md, .gitignore]
    required: [README.md]
---

# Constellos Plugin

## Quick Reference

**Purpose**: Hooks Claude Code sessions into Constellos as a harness (spec: `constellos/constellos` `docs/specs/2026-09-03-agent-harness-and-eval-unification.md`, D5/§7). Records the session's turns to a Constellos thread and injects the addressed objective's residual into every prompt. Transport is the `constellos` CLI against the **bare** server origin (never `…/mcp` — the CLI keys its token directory on a hash of the bare URL).

**When to use**:
- Enable in any repo whose sessions should be recorded and guided by Constellos
- All network hooks are best-effort: no CLI, no token, or no network means a stderr note and a normal session, never a blocked turn

## Hook Summary

| Hook | Event | Blocking | Purpose |
|------|-------|----------|---------|
| session-start | SessionStart[startup\|resume] | No | Mint (`--thread ""`) or resume the session thread; persist `CONSTELLOS_THREAD`/`CONSTELLOS_SPACE` via `$CLAUDE_ENV_FILE` + `~/.constellos/harness/sessions/<session_id>.json` |
| user-prompt-submit | UserPromptSubmit | No | Record the prompt as a user turn (no `--role`; server default is user); inject objective residual/matchExpression (≤40 lines) |
| stop | Stop | No | Record `last_assistant_message` with `--role assistant`; exit clean on `stop_hook_active`; on unknown-argument rejection cache `roleSupported:false` and skip (recording without role would mislabel the turn — spec D4's defect) |
| post-tool-use | PostToolUse[Write\|Edit] | No | Local-only: remind when `services/mcp/internal/**` or `apps/web/src/**` is edited with no change under `docs/specs/**`, `.constellos/docs/**`, or a sibling `*.md` |

## Key Features

### Transport and degradation

CLI resolution: `CONSTELLOS_CLI` env → `constellos` on PATH → `<project>/packages/constellos/dist/index.js`. Calls run with `CONSTELLOS_SERVER_URL` set to the bare origin and the CLI's global `--space` flag (from `CONSTELLOS_SPACE` or `.mcp.json`'s `?space=`). Each CLI call is two HTTP round trips (the CLI does tools/list before tools/call), so hook timeouts are ≥10s. Arguments are always discrete argv entries with explicit values — a flag as the last argv would serialize to `undefined` and be dropped.

### Spec dependencies (auto-detected)

Sequenced after two constellos-repo changes that had not landed when this shipped: **PR-B** (server `role` on thread turns — until then assistant turns are skipped, not mislabeled) and **PR-T3** (CLI `CONSTELLOS_TOKEN` + published `dist` — until then auth needs an existing `constellos auth` token and a locally built CLI). Both light up without a plugin change.

### State files

- `~/.constellos/harness/sessions/<session_id>.json` — `{thread, space, roleSupported, objective}`
- `$CLAUDE_ENV_FILE` — `CONSTELLOS_THREAD=…`/`CONSTELLOS_SPACE=…` lines for later hooks

## Installation

```bash
claude plugin install constellos@constellos
```

Optional env: `CONSTELLOS_SERVER_URL`, `CONSTELLOS_SPACE`, `CONSTELLOS_CLI`, `CONSTELLOS_ROOT_OBJECTIVE`.

## Debug Logging

Hook I/O is appended to `.claude/logs/hook-events.json` (JSONL) by the shared `runHook` wrapper. Degradations are single stderr lines prefixed `constellos harness:`.

## See Also

- [README.md](README.md) — user-facing overview
- `constellos/constellos` `docs/specs/2026-09-03-agent-harness-and-eval-unification.md` — the harness spec (D4–D6, §7)
- `packages/constellos` in `constellos/constellos` — the CLI this plugin drives
