---
name: "Claude Hooks"
description: "Create and manage Claude Code lifecycle hooks for validation, automation, and workflow control"
---

# Claude Hooks

## Context

- **Hook**: Script that executes at Claude Code lifecycle events (PreToolUse, PostToolUse, UserPromptSubmit, Stop, SubagentStop, SessionStart, SessionEnd, PreCompact, Notification, PermissionRequest)
- **Command Hook**: Bash/TypeScript hooks with `"type": "command"` - deterministic execution
- **Prompt Hook**: LLM-based hooks with `"type": "prompt"` - Claude Haiku evaluates context (Stop, SubagentStop only)
- **Hook Classification**: `.rule.ts` (blocking enforcement), `.warn.ts` (bad practice warning), `.note.ts` (good practice guidance)
- **Format Hook**: Special `*.format.ts` files that validate markdown structure via `MarkdownFormat` export
- **Hook Runner**: `bun cck hook <path>` executes hooks via the CLI
- **Type Definitions**: `.claude/hooks/utils/tool-hooks.types.ts` (PreToolUse/PostToolUse), `non-tool-hooks.types.ts` (SessionStart, Stop, etc.), `format-hooks.types.ts` (format validation)
- **Other Utils**: `hook-test-utils.ts` (Vitest helpers), `ast-analysis.ts`, `was-tool-event-main-agent.ts`
- **Official Docs**: [hooks.md](/.claude/docs/code.claude.com/hooks.md), [hooks-guide.md](/.claude/docs/code.claude.com/hooks-guide.md)

## Main Taskflow

### Phase 1: Planning

1. Identify behavior to enforce/guide and lifecycle event to use
2. Determine classification:
   - `.rule.ts` - must/must not (PreToolUse with deny/ask/allow)
   - `.warn.ts` - should not (PostToolUse warning)
   - `.note.ts` - should (PostToolUse guidance)
3. Review existing hooks in `.claude/hooks/[PreToolUse|PostToolUse|SessionStart]/`
4. For format hooks (markdown validation), see [format-hooks/format-hooks-guide.md](format-hooks/format-hooks-guide.md)
5. For prompt hooks (LLM evaluation at Stop/SubagentStop), see [prompt-hooks/prompt-hooks-guide.md](prompt-hooks/prompt-hooks-guide.md)

### Phase 2: Implementation

1. Create hook file: `.claude/hooks/[EventName]/[hook-name].[rule|warn|note].ts`
2. Import types from `.claude/hooks/utils/tool-hooks.types.ts` or `non-tool-hooks.types.ts`
3. Implement handler function with proper input/output types
4. Make executable: `chmod +x [hook-file]`
5. (Optional) For complex logic, add colocated Vitest test `[hook-name].test.ts`

### Phase 3: Registration and Manual Testing

1. **If editing existing hook** (already in settings at session start):
   - Edit the hook file
   - Manually trigger by performing the action it monitors
   - Verify behavior matches expectations

2. **If creating new hook** (not in settings at session start):
   - Register in `.claude/settings.json` under appropriate event
   - Create `[hook-name].test.md` from [hook.test.template.md](hook.test.template.md)
   - Document exact actions to trigger the hook
   - Test in a NEW Claude Code session (hooks snapshot at startup)

### Phase 4: Cleanup and Verification

1. Verify hook triggers correctly and provides clear feedback
2. Check for false positives/negatives
3. Update or delete `.test.md` if keeping permanently

## RULES - IMPORTANT

- **manual-tests**: CRITICAL - Hook tests MUST be manual by performing actual tool actions. NEVER test hooks with `bash echo` or piped JSON. Manual testing verifies real Claude Code integration.

- **hook-classification**: Files MUST use classification suffix: `.rule.ts` (PreToolUse deny/ask/allow), `.warn.ts` (PostToolUse warning), `.note.ts` (PostToolUse guidance).

- **hook-typescript**: New hooks MUST be TypeScript for type safety. Import types from `.claude/hooks/utils/`.

- **hook-new-session**: New hooks added to settings.json MUST be tested in a NEW Claude Code session. Hooks are snapshotted at startup.

- **hook-test-md**: For new hooks not registered in settings at session start, create `[hook-name].test.md` in the same directory as the hook. The test file MUST:
  1. State that the hook must be registered in settings.json first
  2. Provide exact actions to trigger the hook (e.g., "Edit a file in src/", "Run Bash with npm command")
  3. EXPLICITLY state: "Test by performing the actual action, NOT by running bash echo with piped JSON"
  4. Include expected outcomes for pass/fail cases

- **hook-executable**: All hook files MUST be executable (`chmod +x`).

- **format-hooks-subfolder**: Format hooks (`*.format.ts`) have specific patterns - see [format-hooks/format-hooks-guide.md](format-hooks/format-hooks-guide.md).
