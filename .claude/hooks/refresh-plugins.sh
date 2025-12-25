#!/bin/bash
# Refresh constellos plugins by clearing cache and reinstalling
# Uses manual installation for Claude Code Web compatibility

echo "🔄 Refreshing constellos plugins..."

# Clear entire constellos cache directory
echo "  - Clearing constellos cache..."
rm -rf ~/.claude/plugins/cache/constellos 2>/dev/null || true
rm -f ~/.claude/plugins/installed_plugins.json 2>/dev/null || true

# Reset installed_plugins.json
echo '{"version":1,"plugins":{}}' > ~/.claude/plugins/installed_plugins.json

# Run manual installation script
bash "$(dirname "$0")/manual-install-plugins.sh"

echo "✅ Plugin refresh complete - fresh plugins ready for next session"
