---
title: Enhanced Rules Plugin
description: Advanced context-aware rules and constraints for code generation and validation
tags: [rules, validation, standards, constraints]
status: active
---

# enhanced-rules Plugin

Advanced context-aware rules and constraints for code generation and validation.

## Overview

This plugin provides two powerful features for rule enforcement:
1. **Custom checks** - Run executable commands defined in rule frontmatter after file edits
2. **Markdown heading validation** - Enforce heading structure in .claude/rules/*.md files

## Current Status

**2 hooks implemented:**
- PreToolUse: Markdown heading validation for rule files
- PostToolUse: Custom check execution for matching files

## Hooks

### 1. PreToolUse[Write] - Enforce Markdown Heading Structure

**File**: `hooks/enforce-rule-md-headings.ts`
**Event**: `PreToolUse`
**Matcher**: `Write` (only for .md files in .claude/rules)

**What it does**:
- Validates markdown heading structure in .claude/rules/*.md files
- Checks against frontmatter `headings:` specification
- Supports required, optional, and repeating headings
- Wildcard pattern matching for flexible heading names

**Frontmatter Format**:
```yaml
---
headings:
  required:
    - "## Overview"
    - "## Implementation"
  optional:
    - "## Testing"
    - "## Notes*"  # Suffix wildcard
  repeating:
    - pattern: "### Step *"  # Prefix wildcard
      min: 1
      max: 10
---
```

**Wildcard Support**:
- **Exact match**: `"## Overview"` matches only "## Overview"
- **Prefix wildcard**: `"### Step *"` matches "### Step 1", "### Step Two", etc.
- **Suffix wildcard**: `"## * Notes"` matches "## Important Notes", "## Notes", etc.

**Behavior**:
- Only runs for Write operations on .md files in .claude/rules/
- Extracts headings from content
- Validates required headings are present
- Validates repeating headings meet min/max constraints
- Returns **deny** decision if validation fails
- Returns **allow** decision if validation passes

**Output**:
- Success: `permissionDecision: "allow"`
- Failure: `permissionDecision: "deny"` with detailed error message

**Example Error**:
```
Markdown heading validation failed for test-rule.md:

Required heading missing: "## Implementation"
Repeating heading "### Step *" appears 0 time(s), but requires at least 1

Please ensure all required headings are present and repeating headings meet min/max constraints.
```

---

### 2. PostToolUse[Write|Edit] - Run Rule Checks

**File**: `hooks/run-rule-checks.ts`
**Event**: `PostToolUse`
**Matcher**: `Write|Edit`

**What it does**:
- Finds rules that match the edited file path
- Extracts `checks:` array from rule frontmatter
- Executes each check command
- Returns blocking decision if any check fails

**Frontmatter Format**:
```yaml
---
checks:
  - "bun run lint"
  - "bun run typecheck"
  - "npm test"
---
```

**Behavior**:
- Only runs for Write and Edit operations
- Matches file paths against rule patterns
- Executes checks with 60-second timeout
- Returns **block** decision if any check fails
- Returns empty output if all checks pass

**Output**:
- Success: Empty (no output)
- Failure: **Blocking decision** with check output

**Example Failure**:
```
decision: 'block'
reason: 'Rule checks failed'
additionalContext: Rule checks failed for /path/to/file.ts:

Check "bun run lint" failed:
/path/to/file.ts
  12:5  error  'foo' is assigned a value but never used

Please fix these issues.
```

---

## Rule File Format

Rules are defined in `.claude/rules/*.md` files with YAML frontmatter:

```yaml
---
# Optional: heading structure validation (for the rule file itself)
headings:
  required:
    - "## Overview"
    - "## Implementation"
  optional:
    - "## Testing"
  repeating:
    - pattern: "### Step *"
      min: 1
      max: 10

# Optional: executable checks to run on matching files
checks:
  - "bun run lint"
  - "bun run typecheck"
---

# Rule Title

Rule content goes here...
```

**Pattern Matching**:
- Rule filename (without .md) is used as the pattern
- Example: `typescript-rule.md` matches files containing "typescript-rule"
- Future: Support glob patterns in frontmatter

## Use Cases

### Heading Validation
- Ensure consistent structure in rule files
- Enforce documentation standards
- Validate step-by-step guides have required sections

### Custom Checks
- Run linting on specific file patterns
- Execute type checking for critical files
- Run tests after test file modifications
- Validate security requirements
- Check architectural constraints
- Run custom validation scripts

## Configuration

This plugin is referenced in `.claude-plugin/marketplace.json`:

```json
{
  "name": "enhanced-rules",
  "source": "../plugins/enhanced-rules",
  "strict": false
}
```

Install with:
```bash
/plugin install enhanced-rules@claude-code-kit-local
```

## Debug Logging

Enable debug output for hooks:

```bash
DEBUG=* claude                              # All debug output
DEBUG=run-rule-checks claude                # Check execution only
DEBUG=enforce-rule-md-headings claude       # Heading validation only
```

## Testing

Run the test suite to validate both hooks:

```bash
cd /home/user/claude-code-plugins
./plugins/enhanced-rules/test-hooks.sh
```

The test script validates:
- Hook skipping for non-matching operations
- Rule file discovery and parsing
- Check execution (passing and failing)
- Heading validation (required, optional, repeating)
- Wildcard pattern matching (prefix, suffix, exact)
- Min/max constraints for repeating headings

## Requirements

- Node.js (for TypeScript hook runner)
- gray-matter (for YAML frontmatter parsing)
- tsx (for TypeScript execution)

## Examples

### Example 1: TypeScript Project Rules

```yaml
---
checks:
  - "bun run lint"
  - "bun run typecheck"
  - "bun test"
headings:
  required:
    - "## Overview"
    - "## Implementation"
  optional:
    - "## Testing"
---

# TypeScript Project Rules

All TypeScript files must pass linting, type checking, and tests.
```

### Example 2: API Route Rules

```yaml
---
checks:
  - "npm run lint"
  - "npm test -- api"
headings:
  required:
    - "## Overview"
    - "## Endpoints"
    - "## Security"
  repeating:
    - pattern: "### *"
      min: 1
---

# API Route Standards

Rules for API endpoint files.
```

## Future Enhancements

Planned improvements:
- Glob pattern support in frontmatter (instead of filename matching)
- AST analysis for code validation
- Integration with ESLint/Prettier configurations
- Rule inheritance and composition
- Context-aware rule selection
- Rule severity levels (error vs warning)
- Custom error messages in frontmatter
