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

## Hook Testing Best Practices

### Development Testing vs Integration Testing

There are TWO distinct types of hook testing:

#### 1. Development Testing (During Implementation)

**Purpose**: Verify hook logic, type correctness, and error handling during development

**Method**: Use `bash echo` with properly typed JSON input piped to `npx tsx [hook-file].ts`

**When**: While developing or modifying hooks in the `shared/hooks/` directory

**Example**:
```bash
echo '{
  "hook_event_name": "PreToolUse",
  "session_id": "test-123",
  "transcript_path": "/tmp/test.jsonl",
  "cwd": "/home/user/project",
  "permission_mode": "default",
  "tool_use_id": "tool_1",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "test.ts",
    "content": "test"
  }
}' | npx tsx shared/hooks/my-hook.ts
```

**Benefits**:
- Fast iteration during development
- Tests hook logic in isolation
- Verifies TypeScript types are correct
- Can test edge cases easily
- No need to restart Claude Code session

**Requirements**:
- Input JSON MUST match the types from `shared/types/types.ts`
- Test script should cover: allowed cases, denied cases, edge cases, error handling

**Best Practice**: Create a `test-[hook-name].sh` script with multiple test cases alongside your hook file

#### 2. Integration Testing (Real Usage Validation)

**Purpose**: Verify hook integrates correctly with Claude Code in real usage

**Method**: Perform actual tool actions in a Claude Code session

**When**: After implementing a hook and registering it in hooks.json

**Example**:
- For PreToolUse[Write] hook: Actually use Write tool to create a file
- For PreToolUse[Bash] hook: Actually run a Bash command
- For PostToolUse[Read] hook: Actually use Read tool

**Benefits**:
- Tests real Claude Code integration
- Verifies hook registration in hooks.json
- Tests with actual tool parameters Claude generates
- Validates user-facing error messages

**Requirements**:
- Hook MUST be registered in `.claude/hooks/hooks.json` or plugin `hooks/hooks.json`
- MUST start a NEW Claude Code session (hooks snapshot at startup)
- Test by performing actual actions, NOT with bash echo

### Recommended Testing Workflow

For new or edited hooks in `shared/hooks/`:

1. **Development Phase**:
   - Write the hook implementation
   - Create `test-[hook-name].sh` with typed JSON test cases
   - Run development tests: `bash shared/hooks/test-[hook-name].sh`
   - Iterate until all test cases pass
   - Run `npm run typecheck` to verify types

2. **Integration Phase**:
   - Register hook in appropriate `hooks/hooks.json`
   - Create `[hook-name].test.md` documenting manual test steps
   - Start NEW Claude Code session
   - Perform actual tool actions to trigger the hook
   - Verify hook behavior matches expectations

3. **Maintenance**:
   - Keep `test-[hook-name].sh` for future development
   - Update tests when modifying hook logic
   - Re-run both development and integration tests after changes

### Example: Testing a Folder Validation Hook

**Development Test** (`shared/hooks/test-folder-hooks.sh`):
```bash
#!/bin/bash
# Test validate-folder-structure-write.ts

echo "Test 1: Allowed file (should allow)"
echo '{
  "hook_event_name": "PreToolUse",
  "tool_name": "Write",
  "tool_input": { "file_path": "shared/types/new.ts" },
  ...
}' | npx tsx shared/hooks/validate-folder-structure-write.ts

echo "Test 2: Forbidden file (should deny)"
echo '{
  "hook_event_name": "PreToolUse",
  "tool_name": "Write",
  "tool_input": { "file_path": "shared/forbidden.exe" },
  ...
}' | npx tsx shared/hooks/validate-folder-structure-write.ts
```

**Integration Test** (`[hook-name].test.md`):
```markdown
# Validate Folder Structure Hook - Integration Test

1. Ensure hook is registered in .claude/settings.json
2. Start NEW Claude Code session
3. Test: Ask Claude to create a file in an allowed folder
   - Expected: File is created successfully
4. Test: Ask Claude to create a file with forbidden extension
   - Expected: Hook denies with clear error message
5. DO NOT test with bash echo - perform actual Write operations
```
