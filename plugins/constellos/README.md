# Constellos Plugin

> Constellos harness for Claude Code sessions: threads, objective context, and doc reminders

## Purpose

Hooks Claude Code sessions into Constellos as a harness (spec: `constellos/constellos` `docs/specs/2026-09-03-agent-harness-and-eval-unification.md`, D5/§7). Every session gets a Constellos thread: prompts are recorded as user turns, replies as assistant turns, and the addressed objective's residual is injected back into every prompt — the same guidance the web agent gets from its system prompt. Transport is the `constellos` CLI against the bare server origin; every network hook is best-effort and never blocks a turn.

**Key capabilities:**
- Thread mint/resume at session start, persisted via `$CLAUDE_ENV_FILE` and a per-session cache
- Turn recording (user + assistant) through the `message` tool's thread mode
- Objective residual/matchExpression injection on every prompt (≤40 lines)
- Docs-as-artifacts reminder when watched source trees change without a doc/spec change

## Contents

### Hooks

| Hook | Event | Purpose |
|------|-------|---------|
| session-start | SessionStart[startup\|resume] | Mints or resumes the session's thread; persists `CONSTELLOS_THREAD`/`CONSTELLOS_SPACE`; emits a context note with the standing objective instruction |
| user-prompt-submit | UserPromptSubmit | Records the prompt as a user turn; injects the addressed objective's residual and matchExpression as context |
| stop | Stop | Records `last_assistant_message` as an assistant turn (`--role assistant`); loop-guarded by `stop_hook_active`; skips while the server lacks role support |
| post-tool-use | PostToolUse[Write\|Edit] | Emits a reminder when `services/mcp/internal/**` or `apps/web/src/**` changes without a doc/spec change in the working tree |

## Installation

```bash
claude plugin install constellos@constellos
```

Configuration (all optional): `CONSTELLOS_SERVER_URL` (default `https://mcp.constellos.ai`, always reduced to the bare origin), `CONSTELLOS_SPACE` (else read from `.mcp.json`'s `?space=`), `CONSTELLOS_CLI` (path to a constellos CLI build; else `constellos` on PATH or `packages/constellos/dist/index.js` in the project), `CONSTELLOS_ROOT_OBJECTIVE` (objective path to inject context from). Authentication comes from the CLI's own `constellos auth` tokens.

## License

MIT
