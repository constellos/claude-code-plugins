#!/bin/bash
# Manually install plugins by creating cache structure
# This is needed for Claude Code Web where plugin commands hang

set -e

PROJECT_ROOT="/home/user/claude-code-plugins"
CACHE_DIR="$HOME/.claude/plugins/cache/constellos"
INSTALLED_FILE="$HOME/.claude/plugins/installed_plugins.json"

echo "📦 Manually installing constellos plugins..."

# Create cache directory structure
echo "  - Creating cache directory..."
mkdir -p "$CACHE_DIR"

# Get list of plugins from marketplace
PLUGINS=$(jq -r '.plugins[].name' "$PROJECT_ROOT/.claude-plugin/marketplace.json")

# Copy each plugin to cache
while IFS= read -r plugin; do
  if [ -z "$plugin" ]; then
    continue
  fi

  echo "  - Installing $plugin..."

  PLUGIN_DIR="$PROJECT_ROOT/plugins/$plugin"
  TARGET_DIR="$CACHE_DIR/$plugin"

  if [ -d "$PLUGIN_DIR" ]; then
    # Create plugin directory in cache
    mkdir -p "$TARGET_DIR"

    # Copy plugin files
    cp -r "$PLUGIN_DIR/.claude-plugin" "$TARGET_DIR/" 2>/dev/null || true
    cp -r "$PLUGIN_DIR/hooks" "$TARGET_DIR/" 2>/dev/null || true

    # Copy README if exists
    [ -f "$PLUGIN_DIR/README.md" ] && cp "$PLUGIN_DIR/README.md" "$TARGET_DIR/" || true

    echo "    ✓ Copied to $TARGET_DIR"
  else
    echo "    ⚠️  Plugin directory not found: $PLUGIN_DIR"
  fi
done <<< "$PLUGINS"

# Update installed_plugins.json
echo "  - Updating installed_plugins.json..."

# Create the JSON structure for installed plugins
PLUGIN_ENTRIES=""
while IFS= read -r plugin; do
  if [ -z "$plugin" ]; then
    continue
  fi

  VERSION=$(jq -r ".plugins[] | select(.name == \"$plugin\") | .version" "$PROJECT_ROOT/.claude-plugin/marketplace.json")

  if [ -n "$PLUGIN_ENTRIES" ]; then
    PLUGIN_ENTRIES="$PLUGIN_ENTRIES,"
  fi

  PLUGIN_ENTRIES="$PLUGIN_ENTRIES
    \"$plugin@constellos\": {
      \"name\": \"$plugin\",
      \"marketplace\": \"constellos\",
      \"version\": \"$VERSION\",
      \"installedAt\": \"$(date -Iseconds)\",
      \"scope\": \"global\"
    }"
done <<< "$PLUGINS"

# Write the JSON file
cat > "$INSTALLED_FILE" <<EOF
{
  "version": 1,
  "plugins": {$PLUGIN_ENTRIES
  }
}
EOF

echo "✅ Manual installation complete!"
echo ""
echo "Installed plugins:"
jq -r '.plugins | keys[]' "$INSTALLED_FILE"
echo ""
echo "Cache location: $CACHE_DIR"
echo "Note: Restart Claude Code for plugins to take effect"
