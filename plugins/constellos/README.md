# Constellos Plugin

> Constellos harness for Claude Code sessions: threads, objective context, and doc reminders

## Purpose

Hooks Claude Code sessions into Constellos as a harness (spec: `constellos/constellos` `docs/specs/2026-09-03-agent-harness-and-eval-unification.md`, D5/§7). Every session gets a Constellos thread: prompts are recorded as user turns, replies as assistant turns, and the addressed objective's residual is injected back into every prompt — the same guidance the web agent gets from its system prompt. Transport is the `constellos` CLI against the bare server origin; every network hook is best-effort and never blocks a turn.

**Key capabilities:**
- Thread mint/resume at session start, cached per session under `~/.constellos/harness/sessions/`
- Turn recording (user + assistant) through the `message` tool's thread mode
- Objective discovery + residual/matchExpression injection on every prompt (≤40 lines)
- Docs-as-artifacts reminder when watched source trees change without a doc/spec change

## Contents

### Hooks

| Hook | Event | Purpose |
|------|-------|---------|
| session-start | SessionStart[startup\|resume] | Mints or resumes the session's thread and caches its slug + first-turn path; emits a context note with the standing objective instruction |
| user-prompt-submit | UserPromptSubmit | Records the prompt as a user turn; resolves the objective addressing this thread and injects its residual and matchExpression as context |
| stop | Stop | Records `last_assistant_message` as an assistant turn (`--role assistant`); loop-guarded by `stop_hook_active`; skips while the server lacks role support |
| post-tool-use | PostToolUse[Write\|Edit] | Emits a reminder when `services/mcp/internal/**` or `apps/web/src/**` changes without a doc/spec change in the working tree |

## Installation

```bash
claude plugin install constellos@constellos
```

Configuration (all optional): `CONSTELLOS_SERVER_URL` (default `https://mcp.constellos.ai`, always reduced to the bare origin), `CONSTELLOS_SPACE` (else read from `.mcp.json`'s `?space=`), `CONSTELLOS_CLI` (path to a constellos CLI build; else `constellos` on PATH or `packages/constellos/dist/index.js` in the project), `CONSTELLOS_ROOT_OBJECTIVE` (pin the injected objective instead of discovering it from the thread).

Authentication is the CLI's: `constellos auth` tokens under `~/.constellos/auth/`, or `CONSTELLOS_TOKEN` in the environment, which wins over the token file and is how a container with no `~/.constellos` authenticates.

## Where the objective comes from

The model mints an objective whose `spec.addresses` names this thread's message paths - the same move the web chat's system prompt asks for, which `session-start` repeats into the session's context. From the next prompt on, `user-prompt-submit` reads that edge back (`get` on the thread's first turn, incoming relations) and injects the objective's `residual` and `matchExpression`. The discovered path is cached per session, so the extra round trip happens once. `CONSTELLOS_ROOT_OBJECTIVE` short-circuits the whole thing.

## Testing

`npx vitest run plugins/constellos` from the repo root. `hooks/hooks.e2e.test.ts` spawns each hook script the way Claude Code does - event JSON on stdin, response JSON on stdout - using payload shapes measured from a real session (Claude Code 2.1.258, `claude --debug`), and pins the degradation contract: every failure path exits 0 and blocks nothing.

## License

MIT
