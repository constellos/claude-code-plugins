# Plugin and Marketplace Validation

This document describes how to validate Claude Code plugins and marketplaces using the `claude plugin` CLI commands.

## Validation Commands

### Validate Individual Plugin

Validate a single plugin by providing its directory path:

```bash
claude plugin validate plugins/github-vercel-supabase-ci
claude plugin validate plugins/github-review-sync
claude plugin validate plugins/nextjs-supabase-ai-sdk-dev
claude plugin validate plugins/code-context
claude plugin validate plugins/markdown-structure-rules
```

**Expected output (success):**
```
Validating plugin manifest: /path/to/plugin/.claude-plugin/plugin.json

✔ Validation passed
```

**Expected output (failure):**
```
Validating plugin manifest: /path/to/plugin/.claude-plugin/plugin.json

✘ Found 1 error:

  ❯ <error details>

✘ Validation failed
```

### List Registered Marketplaces

Check which marketplaces are registered:

```bash
claude plugin marketplace list
```

**Expected output:**
```
Configured marketplaces:

  ❯ constellos
    Source: Directory (/path/to/project)

  ❯ claude-code-plugins
    Source: GitHub (anthropics/claude-code)
```

### Validate Plugin Installation

Check if a plugin is properly installed and enabled:

```bash
# Check .claude/settings.json for enabledPlugins
cat .claude/settings.json | jq '.enabledPlugins'
```

**Expected output:**
```json
{
  "github-vercel-supabase-ci@constellos": true,
  "github-review-sync@constellos": true,
  "nextjs-supabase-ai-sdk-dev@constellos": true,
  "code-context@constellos": true,
  "markdown-structure-rules@constellos": true,
  "plugin-dev@claude-code-plugins": true
}
```

## Validate Hooks Structure

### Check hooks.json Has Required Wrapper

All `hooks.json` files must wrap hook events in a `"hooks"` object:

```bash
# Validate single plugin's hooks.json structure
cat plugins/github-vercel-supabase-ci/hooks/hooks.json | jq -e '.hooks' > /dev/null && echo "✓ Valid structure" || echo "✗ Missing hooks wrapper"
```

### Check All Plugins Have Valid hooks.json

```bash
for plugin in github-vercel-supabase-ci github-review-sync nextjs-supabase-ai-sdk-dev code-context markdown-structure-rules; do
  echo "=== $plugin ==="
  cat "plugins/$plugin/hooks/hooks.json" | jq -e '.hooks' > /dev/null && echo "✓ Has hooks wrapper" || echo "✗ Missing hooks wrapper"
done
```

### Validate JSON Syntax

```bash
# Check if hooks.json is valid JSON
cat plugins/github-vercel-supabase-ci/hooks/hooks.json | jq '.' > /dev/null 2>&1 && echo "✓ Valid JSON" || echo "✗ Invalid JSON"
```

## Required Structure for hooks.json

```json
{
  "_comment": "Optional comment",
  "_notes": ["Optional notes array"],
  "description": "Required plugin description",
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx tsx ${CLAUDE_PLUGIN_ROOT}/hooks/my-hook.ts",
            "description": "Hook description"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npx tsx ${CLAUDE_PLUGIN_ROOT}/hooks/my-hook.ts",
            "description": "Hook description"
          }
        ]
      }
    ]
  }
}
```

## Required Structure for plugin.json

Located at `plugins/<plugin-name>/.claude-plugin/plugin.json`:

```json
{
  "name": "plugin-name",
  "version": "0.1.0",
  "description": "Plugin description",
  "author": {
    "name": "Author Name"
  },
  "repository": "https://github.com/user/repo",
  "license": "MIT",
  "keywords": ["keyword1", "keyword2"]
}
```

## Troubleshooting

### SessionStart Hooks Not Firing

**Symptom:** SessionStart hooks don't execute when starting a new Claude Code session.

**Possible Causes:**

1. **Missing `"hooks"` wrapper** in `hooks.json`
2. **Stale plugin cache** after changing hooks.json format
3. **Hooks only load at session start** - changes require restart

**Solution:**

1. **Verify hooks.json format** using claude-code-guide agent:
   ```bash
   # In Claude Code, use the Task tool with subagent_type='claude-code-guide'
   # Ask: "What is the correct format for hooks.json files?"
   ```

2. **Check hook structure**:
   ```bash
   cat plugins/plugin-name/hooks/hooks.json | jq '.hooks'
   ```
   If output is `null`, the hooks wrapper is missing.

3. **Check plugin cache** (the actual source used by Claude Code):
   ```bash
   cat ~/.claude/plugins/cache/marketplace-name/plugin-name/0.1.0/hooks/hooks.json | jq '.hooks'
   ```

4. **Reinstall plugin** to refresh cache after format changes:
   ```bash
   claude plugin uninstall --scope project plugin-name@marketplace
   claude plugin install --scope project plugin-name@marketplace
   ```

5. **Restart Claude Code session** - hooks only load when Claude Code starts:
   - Exit current session completely
   - Start new session
   - Verify hooks fire by checking `.claude/logs/hook-events.json`

6. **Validate plugin**:
   ```bash
   claude plugin validate plugins/plugin-name
   ```

### Plugin Not Found

**Symptom:** `claude plugin validate plugin-name@marketplace` fails with "File not found"

**Cause:** Incorrect plugin reference format.

**Solution:** Use the plugin directory path instead: `claude plugin validate plugins/plugin-name`

### Invalid JSON

**Symptom:** Validation fails with JSON parsing errors.

**Cause:** Syntax errors in `hooks.json` or `plugin.json`.

**Solution:**
1. Validate JSON: `cat plugins/plugin-name/hooks/hooks.json | jq .`
2. Fix syntax errors (missing commas, unclosed braces, etc.)
3. Re-validate: `claude plugin validate plugins/plugin-name`

## Using claude-code-guide Agent for Troubleshooting

When troubleshooting plugin or hook issues, **always use the claude-code-guide agent** for accurate, up-to-date documentation:

```typescript
// In Claude Code session, use the Task tool
Task({
  subagent_type: 'claude-code-guide',
  prompt: 'What is the correct format for hooks.json files in Claude Code plugins?'
})
```

**Benefits:**
- Gets latest documentation from official Claude Code sources
- Provides accurate hook event types and lifecycle info
- Explains plugin installation and configuration
- Offers debugging techniques

**Common Questions to Ask:**
- "What is the correct format for hooks.json?"
- "Should hooks be wrapped in a hooks object?"
- "What hook events are available?"
- "How do I debug plugin loading issues?"
- "What are the plugin validation requirements?"

**Example Usage:**

```bash
# In Claude Code
> Use the claude-code-guide agent to research: "What is the correct format for hooks.json files?"

# Agent will fetch official docs and provide accurate format
# Agent ID is returned for resuming if needed
```

## References

- [Claude Code Plugin Development](https://github.com/anthropics/claude-code/tree/main/plugins)
- [Marketplace Schema](https://code.claude.com/schemas/marketplace-schema.json)
- Official examples: https://github.com/anthropics/claude-code/blob/main/.claude-plugin/marketplace.json
- **Always prefer claude-code-guide agent** for the most accurate and current information
