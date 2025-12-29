---
name: debug-plugins
description: Interactive guide for debugging Claude Code plugin issues
---

# Plugin Debugging Guide

You are helping the user debug Claude Code plugin issues. Follow this systematic debugging workflow:

## Step 1: Identify the Problem

Ask the user what type of issue they're experiencing:
1. Plugin not loading / not appearing
2. Hooks not firing
3. Plugin validation errors
4. Cache issues
5. Marketplace configuration problems
6. Settings.json configuration issues

## Step 2: Gather Information

Run these diagnostic commands to gather information:

```bash
# Check Claude Code version
claude --version

# List configured marketplaces
claude plugin marketplace list

# Check user settings
cat ~/.claude/settings.json

# Check project settings (if in a project)
cat .claude/settings.json

# Check plugin cache
ls -la ~/.claude/plugins/cache/
```

## Step 3: Systematic Debugging

### For "Plugin not loading" issues:

1. **Check marketplace configuration:**
   - Is the marketplace listed in `claude plugin marketplace list`?
   - Is the marketplace path correct?
   - For local marketplaces, does the path exist?

2. **Check plugin installation:**
   - Is the plugin in the cache? (`~/.claude/plugins/cache/`)
   - Try reinstalling: `claude plugin uninstall <plugin>@<marketplace> && claude plugin install <plugin>@<marketplace>`

3. **Check settings:**
   - Is the plugin enabled in `~/.claude/settings.json` (user scope)?
   - Is the plugin enabled in `.claude/settings.json` (project scope)?
   - Are there any typos in the plugin name?

4. **Restart Claude Code:**
   - Plugin configuration only loads at session start
   - Exit current session and start a new one

### For "Hooks not firing" issues:

1. **Validate hook configuration:**
   ```bash
   claude plugin validate <path-to-plugin>
   ```

2. **Check hooks.json format:**
   - Hooks must be wrapped in a `"hooks"` object
   - Check the cached hooks.json: `~/.claude/plugins/cache/<marketplace>/<plugin>/hooks/hooks.json`

3. **Check hook event logs:**
   ```bash
   # Look for hook execution logs
   cat .claude/logs/hook-events.json | tail -50
   ```

4. **Verify hook paths:**
   - Hook commands should use `${CLAUDE_PLUGIN_ROOT}` variable
   - Check that the hook file exists in the plugin directory

5. **Reinstall plugin to refresh cache:**
   ```bash
   claude plugin uninstall --scope project <plugin>@<marketplace>
   claude plugin install --scope project <plugin>@<marketplace>
   ```

### For "Validation errors" issues:

1. **Run validation:**
   ```bash
   cd <plugin-directory>
   claude plugin validate .
   ```

2. **Check for common issues:**
   - Missing or invalid `plugin.json`
   - Invalid YAML frontmatter in commands/skills
   - Incorrect directory structure
   - Missing required fields

3. **Compare with working plugins:**
   - Look at official plugins: https://github.com/anthropics/claude-code/tree/main/plugins
   - Check constellos plugins as examples

### For "Cache issues" issues:

1. **Inspect cache directory:**
   ```bash
   ls -la ~/.claude/plugins/cache/<marketplace>/<plugin>/
   ```

2. **Clear and reinstall:**
   ```bash
   # Remove from cache
   rm -rf ~/.claude/plugins/cache/<marketplace>/<plugin>

   # Reinstall
   claude plugin install <plugin>@<marketplace>
   ```

3. **Check for stale plugins:**
   ```bash
   # List all cached plugins
   find ~/.claude/plugins/cache/ -maxdepth 2 -type d

   # Remove plugins not in settings
   # (manually identify and remove)
   ```

### For "Marketplace configuration" issues:

1. **Check marketplace.json:**
   ```bash
   # For directory-based marketplace
   cat <marketplace-path>/.claude-plugin/marketplace.json
   ```

2. **Verify marketplace source:**
   - Directory source: path should point to directory containing `.claude-plugin/`
   - File source: path should point to `marketplace.json` file
   - GitHub source: format should be `owner/repo`

3. **Add marketplace if missing:**
   ```bash
   # For local marketplace
   cd <marketplace-directory>
   claude plugin marketplace add ./
   ```

4. **Check extraKnownMarketplaces in settings:**
   ```json
   {
     "extraKnownMarketplaces": {
       "marketplace-name": {
         "source": {
           "source": "directory",
           "path": "/path/to/marketplace"
         }
       }
     }
   }
   ```

### For "Settings.json configuration" issues:

1. **Validate JSON syntax:**
   ```bash
   cat ~/.claude/settings.json | jq .
   cat .claude/settings.json | jq .
   ```

2. **Check plugin naming format:**
   - Format: `plugin-name@marketplace-name`
   - Example: `github-context@constellos`

3. **Check scope precedence:**
   - User scope: `~/.claude/settings.json`
   - Project scope: `.claude/settings.json`
   - Project settings override user settings

## Step 4: Verification

After fixing issues, verify the solution:

1. **Restart Claude Code session** (for config changes)
2. **Test plugin functionality**
3. **Check hook event logs** (for hook issues)
4. **Run validation** (for structure issues)

## Common Solutions Quick Reference

### Plugin not appearing:
```bash
# 1. Reinstall
claude plugin uninstall <plugin>@<marketplace>
claude plugin install <plugin>@<marketplace>

# 2. Enable in settings
# Add to ~/.claude/settings.json:
{
  "enabledPlugins": {
    "<plugin>@<marketplace>": true
  }
}

# 3. Restart Claude Code session
```

### Hooks not firing:
```bash
# 1. Reinstall to refresh cache
claude plugin uninstall --scope project <plugin>@<marketplace>
claude plugin install --scope project <plugin>@<marketplace>

# 2. Restart Claude Code session
```

### Stale cache:
```bash
# Remove specific plugin from cache
rm -rf ~/.claude/plugins/cache/<marketplace>/<plugin>

# Reinstall
claude plugin install <plugin>@<marketplace>
```

## Additional Resources

- Official Claude Code documentation: https://github.com/anthropics/claude-code
- Official plugins: https://github.com/anthropics/claude-code/tree/main/plugins
- Marketplace format: https://github.com/anthropics/claude-code/blob/main/.claude-plugin/marketplace.json

## Notes

- Always restart Claude Code after changing settings
- Reinstalling plugins refreshes the cache without requiring session restart
- Hook event logs are in `.claude/logs/hook-events.json` (JSONL format)
- Use the `claude-code-guide` agent for detailed Claude Code documentation queries
