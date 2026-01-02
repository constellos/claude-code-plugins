#!/bin/bash
#
# Sync root shared/ to all plugin shared/ folders
#
# The root shared/ directory is the source of truth for:
# - TypeScript types (types/types.ts)
# - Hook utilities (hooks/utils/*.ts)
#
# This script syncs these files to plugin shared/ folders.
# Run this after any changes to root shared utilities.
#
# Usage:
#   ./scripts/sync-shared.sh           # Sync all plugins
#   ./scripts/sync-shared.sh --dry-run # Preview changes without copying

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SHARED_DIR="$ROOT_DIR/shared"
PLUGINS_DIR="$ROOT_DIR/plugins"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo -e "${YELLOW}DRY RUN MODE - No files will be copied${NC}\n"
fi

# Check if root shared directory exists
if [[ ! -d "$SHARED_DIR" ]]; then
    echo -e "${RED}Error: Root shared directory not found: $SHARED_DIR${NC}"
    exit 1
fi

echo "Syncing from: $SHARED_DIR"
echo "To plugins in: $PLUGINS_DIR"
echo ""

# Sync to each plugin
for plugin_dir in "$PLUGINS_DIR"/*/; do
    plugin_name=$(basename "$plugin_dir")
    plugin_shared="$plugin_dir/shared"

    # Skip if plugin doesn't have a shared directory
    if [[ ! -d "$plugin_shared" ]]; then
        echo -e "${YELLOW}Skipping $plugin_name (no shared/ directory)${NC}"
        continue
    fi

    echo -e "${GREEN}Syncing to $plugin_name...${NC}"

    # Sync types directory
    if [[ -d "$SHARED_DIR/types" ]]; then
        if $DRY_RUN; then
            echo "  Would sync: types/"
            rsync -av --dry-run "$SHARED_DIR/types/" "$plugin_shared/types/" 2>/dev/null | grep -E "^[^>]" | head -10
        else
            mkdir -p "$plugin_shared/types"
            rsync -av "$SHARED_DIR/types/" "$plugin_shared/types/"
        fi
    fi

    # Sync hooks/utils directory
    if [[ -d "$SHARED_DIR/hooks/utils" ]]; then
        if $DRY_RUN; then
            echo "  Would sync: hooks/utils/"
            rsync -av --dry-run "$SHARED_DIR/hooks/utils/" "$plugin_shared/hooks/utils/" 2>/dev/null | grep -E "^[^>]" | head -10
        else
            mkdir -p "$plugin_shared/hooks/utils"
            rsync -av "$SHARED_DIR/hooks/utils/" "$plugin_shared/hooks/utils/"
        fi
    fi

    # Sync any standalone hooks (like run-rule-checks.ts)
    if [[ -d "$SHARED_DIR/hooks" ]]; then
        for hook_file in "$SHARED_DIR/hooks"/*.ts; do
            if [[ -f "$hook_file" ]]; then
                hook_name=$(basename "$hook_file")
                if $DRY_RUN; then
                    echo "  Would sync: hooks/$hook_name"
                else
                    cp "$hook_file" "$plugin_shared/hooks/$hook_name"
                    echo "  Copied: hooks/$hook_name"
                fi
            fi
        done
    fi

    echo ""
done

if $DRY_RUN; then
    echo -e "${YELLOW}DRY RUN complete - run without --dry-run to apply changes${NC}"
else
    echo -e "${GREEN}Sync complete!${NC}"
fi
