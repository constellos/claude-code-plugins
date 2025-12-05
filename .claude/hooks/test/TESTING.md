# Hook Runner Test Instructions

These instructions are for testing the `cck hook` runner in a **new Claude Code session**.

## Prerequisites

1. Start a new Claude Code session in this project directory
2. Ensure `pnpm install && pnpm build` has been run

## Usage Patterns

**For projects that install @constellos/claude-code-kit as a dependency:**
```json
"command": "pnpm --silent cck hook ./my-hook.ts"
```

**For testing within the claude-code-kit package itself:**
```json
"command": "node \"$CLAUDE_PROJECT_DIR/bin/cck.js\" hook ./my-hook.ts"
```

## Test Procedure

Perform each action below. After each action, you should see `[TEST]` log output in stderr confirming the hook fired.

### Test 1: PreToolUse on Edit

**Action**: Use the Edit tool to add a comment to any file.

**Expected output**: `[TEST] PreToolUse: Edit`

Example:
```
Edit the file src/index.ts to add a comment "// test" at the top, then immediately revert it.
```

### Test 2: PreToolUse on Write

**Action**: Use the Write tool to create a temporary file, then delete it.

**Expected output**: `[TEST] PreToolUse: Write`

Example:
```
Create a file called /tmp/cck-test.txt with content "test", then delete it with rm.
```

### Test 3: PreToolUse on MCP Tool

**Action**: Use any MCP tool (if available, e.g., `mcp__next-devtools`).

**Expected output**: `[TEST] PreToolUse MCP: mcp__<server>__<tool>`

Example:
```
Use the mcp__next-devtools tool to check something.
```

*Skip this test if no MCP servers are configured.*

### Test 4: PostToolUse on Skill

**Action**: Invoke the test skill.

**Expected output**: `[TEST] PostToolUse Skill: test-skill`

Example:
```
/test-skill
```

### Test 5: SubagentStart and SubagentStop

**Action**: Spawn a subagent using the Task tool with a simple task.

**Expected output**:
- `[TEST] SubagentStart: <agent_type> (<agent_id>)`
- `[TEST] SubagentStop: agent_id=<agent_id>`

Example:
```
Use the Task tool with subagent_type="Explore" to find any TypeScript file in the src directory. Just find one file and report its name.
```

## Success Criteria

All 5 tests should produce their expected `[TEST]` log output. If any test fails:

1. Check that `cck` is available: `node bin/cck.js --help`
2. Check that the hook file exists and has valid TypeScript
3. Check stderr for error messages from the hook runner

## Cleanup

These test hooks are non-blocking and safe to leave enabled. To disable:

1. Remove the hook configurations from `.claude/settings.json`
2. Delete `.claude/hooks/test/` directory
3. Delete `.claude/skills/test-skill/` directory
