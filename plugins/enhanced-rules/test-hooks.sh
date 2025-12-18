#!/bin/bash
# Test script for enhanced-rules plugin hooks
# This script tests both run-rule-checks.ts and enforce-rule-md-headings.ts

set -e

CWD="/home/user/claude-code-plugins"
RUNNER="npx tsx $CWD/shared/runner.ts"
HOOK_DIR="$CWD/plugins/enhanced-rules/hooks"

echo "========================================="
echo "Testing Enhanced Rules Plugin Hooks"
echo "========================================="
echo ""

# ==============================================================================
# Test 1: run-rule-checks.ts - No rules directory
# ==============================================================================
echo "Test 1: run-rule-checks.ts - No rules directory (should allow)"
echo '{"hook_event_name":"PostToolUse","tool_use_id":"test1","tool_name":"Write","tool_input":{"file_path":"/tmp/test.ts"},"tool_response":"ok","session_id":"test","transcript_path":"/tmp/transcript.jsonl","cwd":"/tmp/nonexistent","permission_mode":"default"}' \
  | $RUNNER "$HOOK_DIR/run-rule-checks.ts" \
  | jq -e '.hookSpecificOutput == null' > /dev/null && echo "✓ PASS" || echo "✗ FAIL"
echo ""

# ==============================================================================
# Test 2: run-rule-checks.ts - Write tool with no checks in rule
# ==============================================================================
echo "Test 2: run-rule-checks.ts - Rule exists but no checks defined (should allow)"
# This assumes we have a rule file without checks
echo '{"hook_event_name":"PostToolUse","tool_use_id":"test2","tool_name":"Write","tool_input":{"file_path":"test-file.ts"},"tool_response":"ok","session_id":"test","transcript_path":"/tmp/transcript.jsonl","cwd":"'$CWD'","permission_mode":"default"}' \
  | $RUNNER "$HOOK_DIR/run-rule-checks.ts" \
  | jq -e '.hookSpecificOutput == null' > /dev/null && echo "✓ PASS" || echo "✗ FAIL"
echo ""

# ==============================================================================
# Test 3: run-rule-checks.ts - Non-Write/Edit tool (should skip)
# ==============================================================================
echo "Test 3: run-rule-checks.ts - Non-Write/Edit tool (should skip)"
echo '{"hook_event_name":"PostToolUse","tool_use_id":"test3","tool_name":"Read","tool_input":{"file_path":"test.ts"},"tool_response":"ok","session_id":"test","transcript_path":"/tmp/transcript.jsonl","cwd":"'$CWD'","permission_mode":"default"}' \
  | $RUNNER "$HOOK_DIR/run-rule-checks.ts" \
  | jq -e '.hookSpecificOutput == null' > /dev/null && echo "✓ PASS" || echo "✗ FAIL"
echo ""

# ==============================================================================
# Test 4: enforce-rule-md-headings.ts - Non-Write tool (should allow)
# ==============================================================================
echo "Test 4: enforce-rule-md-headings.ts - Non-Write tool (should allow)"
echo '{"hook_event_name":"PreToolUse","tool_use_id":"test4","tool_name":"Edit","tool_input":{"file_path":"test.md","old_string":"old","new_string":"new"},"session_id":"test","transcript_path":"/tmp/transcript.jsonl","cwd":"'$CWD'","permission_mode":"default"}' \
  | $RUNNER "$HOOK_DIR/enforce-rule-md-headings.ts" \
  | jq -e '.hookSpecificOutput.permissionDecision == "allow"' > /dev/null && echo "✓ PASS" || echo "✗ FAIL"
echo ""

# ==============================================================================
# Test 5: enforce-rule-md-headings.ts - Non-markdown file (should allow)
# ==============================================================================
echo "Test 5: enforce-rule-md-headings.ts - Non-markdown file (should allow)"
echo '{"hook_event_name":"PreToolUse","tool_use_id":"test5","tool_name":"Write","tool_input":{"file_path":"test.ts","content":"const x = 1;"},"session_id":"test","transcript_path":"/tmp/transcript.jsonl","cwd":"'$CWD'","permission_mode":"default"}' \
  | $RUNNER "$HOOK_DIR/enforce-rule-md-headings.ts" \
  | jq -e '.hookSpecificOutput.permissionDecision == "allow"' > /dev/null && echo "✓ PASS" || echo "✗ FAIL"
echo ""

# ==============================================================================
# Test 6: enforce-rule-md-headings.ts - Markdown file not in .claude/rules (should allow)
# ==============================================================================
echo "Test 6: enforce-rule-md-headings.ts - Markdown file not in .claude/rules (should allow)"
echo '{"hook_event_name":"PreToolUse","tool_use_id":"test6","tool_name":"Write","tool_input":{"file_path":"README.md","content":"# Title\n## Section"},"session_id":"test","transcript_path":"/tmp/transcript.jsonl","cwd":"'$CWD'","permission_mode":"default"}' \
  | $RUNNER "$HOOK_DIR/enforce-rule-md-headings.ts" \
  | jq -e '.hookSpecificOutput.permissionDecision == "allow"' > /dev/null && echo "✓ PASS" || echo "✗ FAIL"
echo ""

# ==============================================================================
# Test 7: enforce-rule-md-headings.ts - Valid required headings (should allow)
# ==============================================================================
echo "Test 7: enforce-rule-md-headings.ts - Valid required headings (should allow)"
CONTENT='# Test Rule

## Overview
This is the overview section.

## Implementation
Implementation details here.'

echo '{"hook_event_name":"PreToolUse","tool_use_id":"test7","tool_name":"Write","tool_input":{"file_path":"'$CWD'/.claude/rules/test-rule.md","content":"'$(echo "$CONTENT" | sed 's/"/\\"/g' | tr '\n' ' ')'"},"session_id":"test","transcript_path":"/tmp/transcript.jsonl","cwd":"'$CWD'","permission_mode":"default"}' \
  | $RUNNER "$HOOK_DIR/enforce-rule-md-headings.ts" 2>&1 \
  | tee /tmp/test7-output.json \
  | jq -e 'if .hookSpecificOutput then .hookSpecificOutput.permissionDecision == "allow" else true end' > /dev/null && echo "✓ PASS" || echo "✗ FAIL"
echo ""

# ==============================================================================
# Test 8: enforce-rule-md-headings.ts - Missing required heading (should deny)
# ==============================================================================
echo "Test 8: enforce-rule-md-headings.ts - Missing required heading (should deny)"
CONTENT='# Test Rule

## Overview
This is the overview section.'

echo '{"hook_event_name":"PreToolUse","tool_use_id":"test8","tool_name":"Write","tool_input":{"file_path":"'$CWD'/.claude/rules/test-rule.md","content":"'$(echo "$CONTENT" | sed 's/"/\\"/g' | tr '\n' ' ')'"},"session_id":"test","transcript_path":"/tmp/transcript.jsonl","cwd":"'$CWD'","permission_mode":"default"}' \
  | $RUNNER "$HOOK_DIR/enforce-rule-md-headings.ts" 2>&1 \
  | tee /tmp/test8-output.json \
  | jq -e 'if .hookSpecificOutput then .hookSpecificOutput.permissionDecision == "deny" else false end' > /dev/null && echo "✓ PASS" || echo "✗ FAIL"
echo ""

# ==============================================================================
# Test 9: enforce-rule-md-headings.ts - Wildcard prefix match (should allow)
# ==============================================================================
echo "Test 9: enforce-rule-md-headings.ts - Wildcard prefix match (should allow)"
CONTENT='# Test Rule

## Overview

### Step 1
First step.

### Step 2
Second step.

### Step Three
Third step.'

echo '{"hook_event_name":"PreToolUse","tool_use_id":"test9","tool_name":"Write","tool_input":{"file_path":"'$CWD'/.claude/rules/test-rule.md","content":"'$(echo "$CONTENT" | sed 's/"/\\"/g' | tr '\n' ' ')'"},"session_id":"test","transcript_path":"/tmp/transcript.jsonl","cwd":"'$CWD'","permission_mode":"default"}' \
  | $RUNNER "$HOOK_DIR/enforce-rule-md-headings.ts" 2>&1 \
  | tee /tmp/test9-output.json \
  | jq -e 'if .hookSpecificOutput then .hookSpecificOutput.permissionDecision == "allow" else true end' > /dev/null && echo "✓ PASS" || echo "✗ FAIL"
echo ""

# ==============================================================================
# Test 10: enforce-rule-md-headings.ts - Repeating heading min constraint (should deny)
# ==============================================================================
echo "Test 10: enforce-rule-md-headings.ts - Repeating heading min constraint (should deny)"
CONTENT='# Test Rule

## Overview
No steps defined.'

echo '{"hook_event_name":"PreToolUse","tool_use_id":"test10","tool_name":"Write","tool_input":{"file_path":"'$CWD'/.claude/rules/test-rule.md","content":"'$(echo "$CONTENT" | sed 's/"/\\"/g' | tr '\n' ' ')'"},"session_id":"test","transcript_path":"/tmp/transcript.jsonl","cwd":"'$CWD'","permission_mode":"default"}' \
  | $RUNNER "$HOOK_DIR/enforce-rule-md-headings.ts" 2>&1 \
  | tee /tmp/test10-output.json \
  | jq -e 'if .hookSpecificOutput then .hookSpecificOutput.permissionDecision == "deny" else false end' > /dev/null && echo "✓ PASS" || echo "✗ FAIL"
echo ""

echo "========================================="
echo "All tests completed!"
echo "========================================="
