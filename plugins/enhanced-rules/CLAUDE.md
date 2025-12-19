---
title: Enhanced Rules Plugin
description: Enhanced rule validation with markdown structure checking and skill requirements
folder:
  subfolders:
    allowed: [.claude-plugin, hooks]
    required: [.claude-plugin, hooks]
  files:
    allowed: [CLAUDE.md, README.md, TEST-COMMANDS.md, test-hooks.sh, .gitignore]
    required: [CLAUDE.md]
---

# enhanced-rules Plugin

Enhanced rule validation with markdown structure checking and skill requirements.

## Overview

This plugin provides three powerful features for rule enforcement:
1. **Plan file validation** - Enforce required heading structure in plan files (Intent, Plan, Success Criteria)
2. **Markdown heading validation** - Enforce heading structure in .claude/rules/*.md files using frontmatter specifications
3. **Custom checks** - Run executable commands defined in rule frontmatter after file edits

## Current Status

**2 hooks implemented:**
- PreToolUse: Markdown heading validation for rule files and plan files
- PostToolUse: Custom check execution for matching files

## Hooks

### 1. PreToolUse[Write|Edit] - Enforce Markdown Heading Structure

**File**: `shared/hooks/enforce-enhanced-rules.ts`
**Event**: `PreToolUse`
**Matcher**: `Write|Edit` (for .md files in .claude/rules and .claude/plans)

**What it does**:
- Validates markdown heading structure in plan files and rule files
- **Plan files** (.claude/plans/*.md or permission_mode='plan'): Enforces hardcoded required headings
- **Rule files** (.claude/rules/*.md): Validates against frontmatter `markdown.headings` specification
- Supports gitignore-style pattern matching (*, ?)
- Provides clear error messages when validation fails

---

#### Plan File Validation (Automatic)

**Applies to**: Files in `.claude/plans/` or when `permission_mode='plan'`

**Required headings** (hardcoded):
- `# Intent`
- `# Plan`
- `# Success Criteria`

**Behavior**:
- Automatically enforced for all plan files
- Cannot be disabled or customized
- Returns **deny** decision if any required heading is missing

**Example Error**:
```
Plan file validation failed for my-plan.md:

Required plan heading missing: "# Intent"
Required plan heading missing: "# Success Criteria"

All plan files must include these headings:
- # Intent
- # Plan
- # Success Criteria
```

---

#### Rule File Validation (Frontmatter-Configured)

**Applies to**: Files in `.claude/rules/` with `markdown.headings` in frontmatter

**Frontmatter Format**:
```yaml
---
markdown:
  headings:
    required:
      - "## Overview"
      - "## Implementation"
    allowed:
      - "## Overview"
      - "## Implementation"
      - "## Testing"
      - "## *"  # Allow any level-2 heading
    forbidden:
      - "### Private*"  # Forbid headings starting with "### Private"
---
```

**Pattern Matching**:
- **Exact match**: `"## Overview"` matches only "## Overview"
- **Wildcard (*)**: `"## *"` matches "## Foo", "## Bar", any level-2 heading
- **Wildcard (?)**: `"## Test?"` matches "## Test1", "## TestA", but not "## Test12"
- **Partial wildcard**: `"### Step *"` matches "### Step 1", "### Step Two", etc.

**Validation Modes**:
- **required**: Patterns that must have at least one match (fails if missing)
- **allowed**: Patterns that items must match (fails if heading doesn't match any allowed pattern)
- **forbidden**: Patterns that must not have any matches (fails if found)

**Behavior**:
- Only runs for Write/Edit operations on .md files in .claude/rules/
- Extracts headings from content
- Validates against frontmatter specification
- Returns **deny** decision if validation fails
- Returns **allow** decision if validation passes

**Output**:
- Success: `permissionDecision: "allow"`
- Failure: `permissionDecision: "deny"` with detailed error message

**Example Error**:
```
Markdown validation failed for api-standards.md:

Required heading missing: "## Security"
Forbidden heading found: "### PrivateAPI" (matches pattern "### Private*")
Heading "## Random" is not in the allowed list

Please ensure all required items are present, no forbidden items exist,
and all items match allowed patterns.
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
# Optional: markdown structure validation (for the rule file itself)
markdown:
  # Heading structure validation
  headings:
    required:
      - "## Overview"
      - "## Implementation"
    allowed:
      - "## Overview"
      - "## Implementation"
      - "## Testing"
      - "## Examples"
    forbidden:
      - "### Private*"

  # Frontmatter field validation
  frontmatter:
    required:
      - "title"
      - "description"
    allowed:
      - "title"
      - "description"
      - "tags"
      - "category"
    forbidden:
      - "deprecated"

# Optional: executable checks to run on matching files
checks:
  - "bun run lint"
  - "bun run typecheck"
---

# Rule Title

Rule content goes here...
```

**Validation Features**:

1. **Heading Validation** (`markdown.headings`):
   - Validates heading structure within the rule file
   - Uses gitignore-style patterns with `*` and `?` wildcards
   - Supports `required`, `allowed`, and `forbidden` constraints

2. **Frontmatter Validation** (`markdown.frontmatter`):
   - Validates frontmatter field names (not values)
   - Uses same pattern matching as headings
   - Ensures consistency across rule files

**Pattern Matching**:
- Rule filename (without .md) is used as the pattern
- Example: `typescript-rule.md` matches files containing "typescript-rule"
- Future: Support glob patterns in frontmatter

## Use Cases

### Plan File Validation
- **Automatic enforcement** of plan structure across all sessions
- Ensures every plan has clear intent, steps, and success criteria
- Improves plan quality and consistency
- No configuration required - works out of the box

### Rule File Heading Validation
- Ensure consistent structure in rule files
- Enforce documentation standards
- Validate step-by-step guides have required sections
- Prevent forbidden heading patterns
- Control allowed heading structure

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
  "source": "./plugins/enhanced-rules",
  "strict": false
}
```

Install with:
```bash
/plugin install enhanced-rules@constellos
```

## Debug Logging

Enable debug output for hooks:

```bash
DEBUG=* claude                              # All debug output
DEBUG=run-rule-checks claude                # Check execution only
DEBUG=enforce-enhanced-rules claude         # Enhanced rule validation only
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

markdown:
  headings:
    required:
      - "## Overview"
      - "## Implementation"
    allowed:
      - "## Overview"
      - "## Implementation"
      - "## Testing"
      - "## Examples"
---

# TypeScript Project Rules

All TypeScript files must pass linting, type checking, and tests.

## Overview
...

## Implementation
...

## Testing
...
```

### Example 2: API Route Rules

```yaml
---
checks:
  - "npm run lint"
  - "npm test -- api"

markdown:
  headings:
    required:
      - "## Overview"
      - "## Endpoints"
      - "## Security"
    allowed:
      - "## *"        # Allow any level-2 heading
      - "### *"       # Allow any level-3 heading
    forbidden:
      - "### Private*"  # Prevent private API documentation
---

# API Route Standards

Rules for API endpoint files.

## Overview
...

## Endpoints
...

## Security
...
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
