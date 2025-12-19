# Enhanced Rules Plugin - Test Commands

This document contains manual test commands used to validate the enhanced-rules plugin hooks.

## Prerequisites

```bash
cd /home/user/claude-code-plugins
npm install  # Install dependencies including gray-matter
```

## Test 1: Heading Validation - Valid Content (Should Allow)

```bash
cat << 'EOF' | npx tsx shared/runner.ts shared/hooks/enforce-enhanced-rules.ts | jq .
{
  "hook_event_name": "PreToolUse",
  "tool_use_id": "test1",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/home/user/claude-code-plugins/.claude/rules/test-rule.md",
    "content": "# Test Rule\n\n## Overview\nThis is the overview.\n\n## Implementation\nThis is the implementation.\n\n### Step 1\nFirst step.\n"
  },
  "session_id": "test",
  "transcript_path": "/tmp/transcript.jsonl",
  "cwd": "/home/user/claude-code-plugins",
  "permission_mode": "default"
}
EOF
```

**Expected Output:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow"
  }
}
```

## Test 2: Heading Validation - Missing Required Heading (Should Deny)

```bash
cat << 'EOF' | npx tsx shared/runner.ts shared/hooks/enforce-enhanced-rules.ts | jq .
{
  "hook_event_name": "PreToolUse",
  "tool_use_id": "test2",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/home/user/claude-code-plugins/.claude/rules/test-rule.md",
    "content": "# Test Rule\n\n## Overview\nMissing the Implementation section.\n"
  },
  "session_id": "test",
  "transcript_path": "/tmp/transcript.jsonl",
  "cwd": "/home/user/claude-code-plugins",
  "permission_mode": "default"
}
EOF
```

**Expected Output:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Markdown heading validation failed for test-rule.md:\n\nRequired heading missing: \"## Implementation\"\nRepeating heading \"### Step *\" appears 0 time(s), but requires at least 1\n\nPlease ensure all required headings are present and repeating headings meet min/max constraints."
  }
}
```

## Test 3: Heading Validation - Wildcard Prefix Matching (Should Allow)

```bash
cat << 'EOF' | npx tsx shared/runner.ts shared/hooks/enforce-enhanced-rules.ts | jq .
{
  "hook_event_name": "PreToolUse",
  "tool_use_id": "test3",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/home/user/claude-code-plugins/.claude/rules/test-rule.md",
    "content": "# Test Rule\n\n## Overview\n\n## Implementation\n\n### Step 1\nFirst step.\n\n### Step 2\nSecond step.\n\n### Step Three\nThird step.\n"
  },
  "session_id": "test",
  "transcript_path": "/tmp/transcript.jsonl",
  "cwd": "/home/user/claude-code-plugins",
  "permission_mode": "default"
}
EOF
```

**Expected Output:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow"
  }
}
```

## Test 4: Heading Validation - Max Constraint Exceeded (Should Deny)

```bash
cat << 'EOF' | npx tsx shared/runner.ts shared/hooks/enforce-enhanced-rules.ts | jq .
{
  "hook_event_name": "PreToolUse",
  "tool_use_id": "test4",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/home/user/claude-code-plugins/.claude/rules/test-rule.md",
    "content": "# Test Rule\n\n## Overview\n\n## Implementation\n\n### Step 1\n### Step 2\n### Step 3\n### Step 4\n### Step 5\n### Step 6\n### Step 7\n### Step 8\n### Step 9\n### Step 10\n### Step 11\n"
  },
  "session_id": "test",
  "transcript_path": "/tmp/transcript.jsonl",
  "cwd": "/home/user/claude-code-plugins",
  "permission_mode": "default"
}
EOF
```

**Expected Output:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Markdown heading validation failed for test-rule.md:\n\nRepeating heading \"### Step *\" appears 11 time(s), but allows at most 10\n\nPlease ensure all required headings are present and repeating headings meet min/max constraints."
  }
}
```

## Test 5: Run Rule Checks - Passing Checks (Should Allow)

```bash
cat << 'EOF' | npx tsx shared/runner.ts shared/hooks/run-rule-checks.ts | jq .
{
  "hook_event_name": "PostToolUse",
  "tool_use_id": "test5",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/home/user/claude-code-plugins/typescript-rule.ts"
  },
  "tool_response": "ok",
  "session_id": "test",
  "transcript_path": "/tmp/transcript.jsonl",
  "cwd": "/home/user/claude-code-plugins",
  "permission_mode": "default"
}
EOF
```

**Expected Output:**
```json
{}
```

## Test 6: Run Rule Checks - Failing Check (Should Block)

```bash
cat << 'EOF' | npx tsx shared/runner.ts shared/hooks/run-rule-checks.ts | jq .
{
  "hook_event_name": "PostToolUse",
  "tool_use_id": "test6",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/home/user/claude-code-plugins/failing-check-rule.ts"
  },
  "tool_response": "ok",
  "session_id": "test",
  "transcript_path": "/tmp/transcript.jsonl",
  "cwd": "/home/user/claude-code-plugins",
  "permission_mode": "default"
}
EOF
```

**Expected Output:**
```json
{
  "decision": "block",
  "reason": "Rule checks failed",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Rule checks failed for /home/user/claude-code-plugins/failing-check-rule.ts:\n\nCheck \"exit 1\" failed:\nCommand failed: exit 1\n\n\nPlease fix these issues."
  }
}
```

## Test 7: Non-Matching Tool (Should Skip)

```bash
echo '{"hook_event_name":"PostToolUse","tool_use_id":"test7","tool_name":"Read","tool_input":{"file_path":"test.ts"},"tool_response":"ok","session_id":"test","transcript_path":"/tmp/transcript.jsonl","cwd":"/home/user/claude-code-plugins","permission_mode":"default"}' | npx tsx shared/runner.ts shared/hooks/run-rule-checks.ts | jq .
```

**Expected Output:**
```json
{}
```

## Test 8: Non-Rule File (Should Allow)

```bash
echo '{"hook_event_name":"PreToolUse","tool_use_id":"test8","tool_name":"Write","tool_input":{"file_path":"README.md","content":"# Title\n## Section"},"session_id":"test","transcript_path":"/tmp/transcript.jsonl","cwd":"/home/user/claude-code-plugins","permission_mode":"default"}' | npx tsx shared/runner.ts shared/hooks/enforce-enhanced-rules.ts | jq .
```

**Expected Output:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow"
  }
}
```

## Test Suite

Run all tests at once:

```bash
./plugins/enhanced-rules/test-hooks.sh
```

Note: Some tests in the automated script may show false failures due to bash string escaping issues. The manual tests above are the authoritative validation.

## Debug Mode

Run hooks with debug logging:

```bash
DEBUG=enforce-enhanced-rules cat << 'EOF' | npx tsx shared/runner.ts shared/hooks/enforce-enhanced-rules.ts
{
  "hook_event_name": "PreToolUse",
  "tool_use_id": "debug-test",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/home/user/claude-code-plugins/.claude/rules/test-rule.md",
    "content": "# Test\n\n## Overview\n\n## Implementation\n\n### Step 1\n"
  },
  "session_id": "test",
  "transcript_path": "/tmp/transcript.jsonl",
  "cwd": "/home/user/claude-code-plugins",
  "permission_mode": "default",
  "debug": true
}
EOF
```

Check debug logs:

```bash
cat /home/user/claude-code-plugins/.claude/logs/hook-events.json | jq .
```
