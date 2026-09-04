---
title: Constellos Plugin
description: Constellos harness for Claude Code sessions - threads, objective context, doc reminders
version: 0.2.0
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
| session-start | SessionStart[startup\|resume] | No | Mint (`--thread ""`) or resume the session thread; cache `{thread, threadPath, space}` in `~/.constellos/harness/sessions/<session_id>.json` |
| user-prompt-submit | UserPromptSubmit | No | Record the prompt as a user turn (no `--role`; server default is user); resolve the addressing objective off the thread's first turn and inject its residual/matchExpression (≤40 lines) |
| stop | Stop | No | Record `last_assistant_message` with `--role assistant`; exit clean on `stop_hook_active`; on unknown-argument rejection cache `roleSupported:false` and skip (recording without role would mislabel the turn — spec D4's defect) |
| post-tool-use | PostToolUse[Write\|Edit] | No | Local-only: remind when `services/mcp/internal/**` or `apps/web/src/**` is edited with no change under `docs/specs/**`, `.constellos/docs/**`, or a sibling `*.md` |

## Key Features

### Transport and degradation

CLI resolution: `CONSTELLOS_CLI` env → `constellos` on PATH → `<project>/packages/constellos/dist/index.js`. Calls run with `CONSTELLOS_SERVER_URL` set to the bare origin and the CLI's global `--space` flag (from `CONSTELLOS_SPACE` or `.mcp.json`'s `?space=`). Each CLI call is two HTTP round trips (the CLI does tools/list before tools/call), so hook timeouts are ≥10s. Arguments are always discrete argv entries with explicit values — a flag as the last argv would serialize to `undefined` and be dropped.

### Where the objective comes from

Objective minting stays model-initiated: `session-start` prints the same instruction the web chat's system prompt carries — when the conversation converges on a goal, `create` an OBJECTIVE whose `spec.addresses` names this thread's message paths. `user-prompt-submit` then reads that edge back, `get`ting the thread's first turn with `--includeIncomingRelations addresses` and taking the `addressedBy` endpoint under `objectives/`. The resolved path is cached in the session file, so the extra round trip happens once per session. `CONSTELLOS_ROOT_OBJECTIVE` pins the objective and skips discovery entirely.

### Spec dependencies (both landed 2026-09-04)

**PR-B** (#1461, server `role` on thread turns) and **PR-T3** (#1467, CLI `CONSTELLOS_TOKEN`, 401→refresh retry, version 0.5.0) are merged and deployed. The pre-PR-B fallback is kept deliberately, as the degradation path for an older server: an unknown-argument rejection on `--role` caches `roleSupported:false` and SKIPS the turn rather than recording it without the role, which would land it mislabeled as a user turn — spec D4's own defect.

### Hook I/O, as measured

Confirmed against Claude Code 2.1.258 with `claude --debug` (spec §11 open question 6), because the spec's §1.8 field names were marked [inferred]:

- Common input: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, plus optional `permission_mode`, `prompt_id`, `agent_id`. `permission_mode` is ABSENT on SessionStart.
- `SessionStart`: `source` ∈ {startup, resume, clear, compact, fork}.
- `UserPromptSubmit`: `prompt` (required), optional `source` ∈ {user, sdk, system, loop_wakeup, schedule_wakeup, poll_event}.
- `Stop`: `stop_hook_active` (required), `last_assistant_message` (optional).
- `PostToolUse`: `tool_name`, `tool_input`, `tool_response`, `tool_use_id`, optional `duration_ms`.
- Output: `hookSpecificOutput: {hookEventName, additionalContext}` is accepted on all four events.
- **`$CLAUDE_ENV_FILE` does NOT carry variables to later hooks.** The variable is set only in a SessionStart/Setup/CwdChanged/FileChanged hook's own environment, and Claude Code sources the file into the session's **Bash-tool shell**. Measured: a SessionStart hook appending both `K=v` and `export K=v` produced neither in the following `UserPromptSubmit` hook's `process.env`. The per-session cache file is therefore the only channel between these hooks; the env write is kept so that `$CONSTELLOS_THREAD` is in front of the shell the session runs commands in.

### State files

- `~/.constellos/harness/sessions/<session_id>.json` — `{thread, threadPath, space, roleSupported, objective}`; the only state channel between hooks
- `$CLAUDE_ENV_FILE` — `export CONSTELLOS_THREAD=…`/`export CONSTELLOS_SPACE=…`, for the session's Bash-tool shell (see above)

## Installation

```bash
claude plugin install constellos@constellos
```

Optional env: `CONSTELLOS_SERVER_URL`, `CONSTELLOS_SPACE`, `CONSTELLOS_CLI`, `CONSTELLOS_ROOT_OBJECTIVE`, `CONSTELLOS_TOKEN` (headless auth; wins over `tokens.json`).

## Testing

`npx vitest run plugins/constellos` from the repo root. `hooks/hooks.e2e.test.ts` spawns each hook script as a process with the measured event JSON on stdin and asserts both the response and the degradation contract (no CLI / CLI failure / rejected argument ⇒ exit 0, nothing blocked). The `hooks/lib/*.test.ts` files cover the pure halves.

## Debug Logging

Hook I/O is appended to `.claude/logs/hook-events.json` (JSONL) by the shared `runHook` wrapper. Degradations are single stderr lines prefixed `constellos harness:`.

## See Also

- [README.md](README.md) — user-facing overview
- `constellos/constellos` `docs/specs/2026-09-03-agent-harness-and-eval-unification.md` — the harness spec (D4–D6, §7)
- `packages/constellos` in `constellos/constellos` — the CLI this plugin drives
