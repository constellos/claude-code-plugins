![Version](https://img.shields.io/badge/version-0.1.1-blue?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=for-the-badge&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?style=for-the-badge&logo=typescript)
![Markdown](https://img.shields.io/badge/Markdown-000000?style=for-the-badge&logo=markdown)

# 🔌 Project Context Plugin

> Automatic context discovery, structure validation, and plan scoping for Claude Code projects

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Installation](#-installation)
- [Hooks](#-hooks)
- [Configuration](#-configuration)
- [Use Cases](#-use-cases)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [See Also](#-see-also)
- [License](#-license)

---

## 🎯 Overview

The Project Context plugin provides automatic context discovery and project structure validation for Claude Code projects. It automatically discovers and links CLAUDE.md documentation, validates .claude directory structure, enforces plan-based path scoping, and provides intelligent URL redirection to prefer markdown documentation.

This plugin helps Claude access markdown-friendly documentation, understand project structure, maintain consistent organization, and work within defined scope boundaries.

---

## ✨ Features

### Context Discovery
- **Automatic CLAUDE.md Linking**: Finds and links related documentation when reading files
- **Search Strategy**: Project root → parent directories → child directories (one level deep)
- **Clickable Links**: Provides file:// URLs for easy navigation

### Markdown Preference
- **URL Redirection**: Redirects WebFetch to markdown versions of documentation
- **AI-Friendly**: Prefers .md file URLs over HTML for better parsing
- **Offline Access**: Markdown docs work offline and are easier to diff

### Structure Validation
- **Directory Validation**: Ensures .claude directories follow proper organization
- **File Validation**: Validates agents, skills, rules, hooks directory structure
- **Blocking Prevention**: Stops invalid file creation that would break conventions

### Plan Scoping
- **Path Enforcement**: Enforces file operation boundaries based on plan frontmatter
- **Write Blocking**: Blocks writes outside defined scope
- **Read Warnings**: Warns when reads are outside plan scope (non-blocking guidance)
- **Context Management**: Helps manage context and separate concerns in large projects

---

## 📦 Installation

```bash
claude plugin install project-context@constellos
```

---

## 🪝 Hooks

### UserPromptSubmit - encourage-context-review.ts

**File:** `hooks/encourage-context-review.ts`
**Blocking:** No (informational)

Encourages updating plans, agents, skills, and CLAUDE.md files based on user prompts. Analyzes prompt content and suggests documentation updates when appropriate.

<details>
<summary>📝 Trigger Examples</summary>

- User creates or modifies features → Suggest updating relevant skills
- User discusses new agent workflows → Suggest creating agent documentation
- User changes project structure → Suggest updating CLAUDE.md
</details>

---

### PreToolUse[Task] - log-task-call.ts

**File:** `shared/hooks/log-task-call.ts`
**Blocking:** No

Logs Task tool calls before execution and saves context to `.claude/logs/task-calls.json`. Provides metadata for SubagentStop hooks to enhance commit messages.

**Saved context:**
- Tool use ID
- Agent type
- Session ID
- Task prompt
- Timestamp

---

### PreToolUse[Write|Edit] - validate-folder-structure-write.ts

**File:** `shared/hooks/validate-folder-structure-write.ts`
**Blocking:** Yes (on structure violations)

Validates .claude directory structure when creating files. Ensures files are created in proper locations (agents/, skills/, rules/, hooks/, etc.).

**Validates:**
- Files go in correct subdirectories
- Required parent directories exist
- Naming conventions are followed
- No invalid nested structures

<details>
<summary>📝 Example Validation</summary>

**Allowed:**
- `.claude/agents/my-agent.md` ✅
- `.claude/skills/my-skill/SKILL.md` ✅
- `.claude/rules/my-rule.md` ✅

**Blocked:**
- `.claude/my-file.md` ❌ (must be in subdirectory)
- `.claude/agents/nested/file.md` ❌ (invalid nesting)
</details>

---

### PreToolUse[Write|Edit] - validate-rules-file.ts

**File:** `shared/hooks/validate-rules-file.ts`
**Blocking:** Yes (on validation errors)

Validates rule file structure and Required Skills frontmatter. Ensures all rule files have proper headings and metadata.

**Validates:**
- "Required Skills:" heading exists
- Format is correct (comma-separated list or "None")
- Frontmatter includes markdown heading rules

---

### PreToolUse[Bash] - validate-folder-structure-mkdir.ts

**File:** `shared/hooks/validate-folder-structure-mkdir.ts`
**Blocking:** Yes (on invalid paths)

Validates mkdir commands for .claude directories. Prevents creation of invalid directory structures.

---

### PreToolUse[WebFetch] - try-markdown-page.ts

**File:** `hooks/try-markdown-page.ts`
**Blocking:** No (redirects URL)

Redirects WebFetch to markdown versions of documentation when available. Converts URLs to raw markdown for better AI parsing.

**URL transformation strategies:**
1. **GitHub documentation** - Converts `github.com/owner/repo/blob/branch/path` to `raw.githubusercontent.com/owner/repo/branch/path.md`
2. **HTML pages** - Tries changing `.html` extension to `.md`
3. **Documentation sites** - Attempts appending `.md` to paths without extensions

**How it works:**
1. Intercepts WebFetch tool calls before execution
2. Generates candidate markdown URLs based on the original URL
3. Uses `curl` with HEAD requests to check if markdown versions exist (5 second timeout)
4. If found, modifies the WebFetch URL to fetch the markdown version

<details>
<summary>📝 Example</summary>

```
Original URL: https://github.com/vercel/next.js/blob/canary/docs/app/guide.html
Redirected to: https://raw.githubusercontent.com/vercel/next.js/canary/docs/app/guide.md

Additional context: 📝 Found markdown version: redirecting from [original] to [markdown]
```
</details>

---

### PostToolUse[Task] - log-task-result.ts

**File:** `shared/hooks/log-task-result.ts`
**Blocking:** No

Logs Task tool results after agent completion. Tracks agent execution for debugging and analysis.

---

### PostToolUse[Write|Edit] - create-plan-symlink.ts

**File:** `hooks/create-plan-symlink.ts`
**Blocking:** No

Creates PLAN.md symlink when plan files are written. Maintains `${cwd}/PLAN.md` → plan file path symlink for easy access.

**Behavior:**
1. Detects writes to `.claude/plans/*.md` files
2. Removes existing `PLAN.md` symlink (if present)
3. Creates new symlink: `${cwd}/PLAN.md` → plan file path

**Provides template pattern for similar symlink hooks**

---

### PostToolUse[Write|Edit|Read] - enforce-plan-scoping.ts

**File:** `shared/hooks/enforce-plan-scoping.ts`
**Blocking:** Conditional (blocks writes, warns on reads)

Enforces plan-based path scoping for file operations. Reads plan frontmatter `paths` field and validates operations against defined scope.

**Plan frontmatter schema:**

```yaml
---
paths:
  main-agent:
    allowedPaths: ["plugins/**", "shared/**", "*.md", ".claude/**"]
    forbiddenPaths: ["node_modules/**", "dist/**"]
  subagents:
    allowedPaths: ["**/*.ts", "**/*.md", "tests/**"]
    forbiddenPaths: ["src/components/**", "src/lib/**"]
---
```

**Behavior:**
1. Reads `PLAN.md` symlink to access active plan
2. Parses `paths` frontmatter for main-agent and subagents scopes
3. Determines agent context using `wasToolEventMainAgent()`
4. Validates file path against appropriate scope:
   - **Forbidden patterns** - Block if path matches any forbidden pattern
   - **Allowed patterns** - If specified, path must match at least one
5. For **Write/Edit**: Denies operations outside allowed scope (blocking)
6. For **Read**: Returns non-blocking warning if outside scope

**Pattern matching:**
- Supports `*` (glob - matches any characters)
- Supports `?` (single character)
- Forbidden patterns take precedence over allowed

<details>
<summary>📝 Agent-specific messages</summary>

- **Main agent denied**: "Write denied. Main agent scope is restricted by plan. Use Plan agent to update scope or delegate to subagents."
- **Subagent denied**: "Write denied. Subagent scope is restricted by plan. Have main agent handle this area or update plan."
- **Read warning**: Non-blocking guidance to stay within plan boundaries
</details>

---

### PostToolUse[Read] - add-folder-context.ts

**File:** `hooks/add-folder-context.ts`
**Blocking:** No

Discovers and adds CLAUDE.md context when reading files. Automatically finds related documentation and provides clickable links.

**Search Strategy:**
1. Project root - checks for `/CLAUDE.md`
2. Parent directories - walks up from read file to project root
3. Child directories - scans one level deep in the file's directory

<details>
<summary>📝 Example Output</summary>

```
Related context:
[/project/CLAUDE.md](file:///project/CLAUDE.md)
[/project/src/CLAUDE.md](file:///project/src/CLAUDE.md)
[/project/src/api/CLAUDE.md](file:///project/src/api/CLAUDE.md)
```
</details>

---

## ⚙️ Configuration

Add to `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "project-context@constellos": true
  }
}
```

**Plan Scoping Configuration:**

Add `paths` object to plan frontmatter to enable scoping:

```yaml
---
paths:
  main-agent:
    allowedPaths: ["plugins/**", "shared/**"]
    forbiddenPaths: ["node_modules/**"]
  subagents:
    allowedPaths: ["**/*.ts", "tests/**"]
    forbiddenPaths: []
---
```

---

## 💡 Use Cases

| Use Case | Description | Benefit |
|----------|-------------|---------|
| Large codebases | Automatic CLAUDE.md discovery and linking | Navigate documentation without manual searching |
| .claude structures | Validates agents, skills, rules, hooks organization | Maintains consistent project structure |
| Plan-driven development | Enforces file operation boundaries | Manages context and separates concerns |
| Documentation-heavy projects | Prefers markdown URLs for WebFetch | Better AI parsing and offline access |
| Team standards | Enforces structure and rules validation | Consistent organization across team |

---

## 🐛 Troubleshooting

<details>
<summary>Context not discovering CLAUDE.md files</summary>

1. Verify CLAUDE.md files exist in expected locations
2. Check file naming (must be exactly `CLAUDE.md`)
3. Enable debug logging:
   ```bash
   DEBUG=add-folder-context claude
   ```
4. Verify you're reading files (hook only fires on Read operations)
</details>

<details>
<summary>Structure validation blocking writes</summary>

1. Review .claude directory structure requirements
2. Ensure files are in correct subdirectories (agents/, skills/, rules/)
3. Check error message for specific validation failure
4. Enable debug logging:
   ```bash
   DEBUG=validate-folder-structure claude
   ```
</details>

<details>
<summary>Plan scoping blocking writes</summary>

1. Check plan frontmatter `paths` object
2. Verify target file matches glob patterns
3. Update plan scope to include new paths if needed
4. Enable debug logging:
   ```bash
   DEBUG=enforce-plan-scoping claude
   ```
</details>

<details>
<summary>Markdown URLs not redirecting</summary>

1. Verify URL is from supported documentation site (GitHub, Next.js, Vercel, Supabase)
2. Check that markdown version exists
3. Enable debug logging:
   ```bash
   DEBUG=try-markdown-page claude
   ```
4. Check `.claude/logs/hook-events.json` for redirect details
</details>

---

## 🤝 Contributing

When modifying hooks:

1. Update hook implementation in `hooks/` or `shared/hooks/`
2. Run type checking: `npm run typecheck`
3. Run linting: `npm run lint`
4. Test hooks manually with `DEBUG=* claude`
5. Update this README
6. Update [CLAUDE.md](./CLAUDE.md) quick reference
7. Reinstall plugin to refresh cache

---

## 📚 See Also

- [CLAUDE.md](./CLAUDE.md) - Quick reference for AI context
- [Marketplace](../../CLAUDE.md) - All available plugins and architecture
- [Shared Validation Hooks](./shared/CLAUDE.md) - Shared validation hooks documentation
- [Plugin Development Guide](../../.claude/skills/claude-plugins/SKILL.md)
- [Hook Development Guide](../../.claude/skills/claude-hooks/SKILL.md)

---

## 📄 License

MIT © constellos
