# Manual Test: [Hook Name]

## Hook Details

- **File**: `.claude/hooks/[EventName]/[hook-name].[type].ts`
- **Event**: [PreToolUse|PostToolUse|etc.]
- **Matcher**: [tool pattern or *]
- **Purpose**: [One sentence description]

## Prerequisites

- Hook registered in `.claude/settings.json`
- Testing in a NEW Claude Code session (not the session that created/modified the hook)

## Test Scenarios

### Scenario 1: [Should Trigger]

**Action**: [Exact action to perform, e.g., "Edit a file in src/ directory"]
**Expected**: [What should happen, e.g., "Hook blocks with message about..."]

### Scenario 2: [Should NOT Trigger]

**Action**: [Exact action that should NOT trigger hook]
**Expected**: [Action completes normally without hook interference]

## Results

- [ ] Scenario 1: Pass/Fail
- [ ] Scenario 2: Pass/Fail

## Notes

[Any observations or issues discovered during testing]

---

**IMPORTANT**: Do NOT test by running `echo '{"tool_name":...}' | bun cck hook ...`.
Manual testing means performing the actual actions that would trigger the hook.
