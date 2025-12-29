#!/usr/bin/env bash

# Claude Code Worktree Launcher
#
# Creates an isolated git worktree for Claude Code sessions.
# Each session gets its own branch and worktree in .worktrees/
#
# Usage:
#   bash claude-worktree.sh [claude CLI flags]
#
# Example:
#   bash claude-worktree.sh --verbose
#   bash claude-worktree.sh --no-context
#
# Setup:
#   Add to .bashrc or .zshrc:
#   claude-worktree() {
#     bash /path/to/claude-code-plugins/claude-worktree.sh "$@"
#   }

set -e

# Adjectives for branch naming
_CLAUDE_ADJECTIVES=(
  admiring agile ambitious bold brave bright calm clever cosmic curious
  dazzling determined eager elegant epic fearless focused gallant gentle happy
  hopeful inspiring inventive jolly keen kind lucid magical merry mindful
  noble optimistic peaceful polished proud quick quirky radiant resolute
  serene sharp sleek smooth stellar stoic swift tender thoughtful tranquil
  upbeat valiant vibrant vigilant vivid warm wise witty zealous zen
)

# Animal names for branch naming
_CLAUDE_NAMES=(
  albatross badger cardinal dolphin eagle falcon gecko heron ibis jaguar
  kestrel lemur marmot narwhal otter panda quail raven starling toucan
  urchin viper walrus xerus yak zebra bandicoot capybara dingo echidna
  flamingo gopher hedgehog iguana jackal koala lynx mongoose numbat ocelot
)

# Generate unique branch name
_generate_claude_name() {
  local adj=${_CLAUDE_ADJECTIVES[$RANDOM % ${#_CLAUDE_ADJECTIVES[@]}]}
  local name=${_CLAUDE_NAMES[$RANDOM % ${#_CLAUDE_NAMES[@]}]}
  local suffix=$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 8)
  echo "${adj}-${name}-${suffix}"
}

# Get enabled plugins from .claude/settings.json
_get_enabled_plugins() {
  local settings_file="${repo_root}/.claude/settings.json"

  if [[ ! -f "$settings_file" ]]; then
    return 0
  fi

  # Check if jq is available
  if ! command -v jq &>/dev/null; then
    echo "⚠️  Warning: jq not found. Cannot auto-refresh plugins." >&2
    echo "   Install with: brew install jq (macOS) or apt install jq (Linux)" >&2
    return 1
  fi

  # Parse enabledPlugins from settings.json
  jq -r '.enabledPlugins | keys[]' "$settings_file" 2>/dev/null || return 1
}

# Clean up invalid plugin installations
_cleanup_invalid_plugins() {
  local cache_dir="$HOME/.claude/plugins/cache/constellos"

  if [[ ! -d "$cache_dir" ]]; then
    return 0
  fi

  echo "Checking for invalid plugin installations..."

  # Check each cached plugin
  for plugin_dir in "$cache_dir"/*; do
    if [[ ! -d "$plugin_dir" ]]; then
      continue
    fi

    local plugin_name=$(basename "$plugin_dir")
    local source_dir="${repo_root}/plugins/${plugin_name}"

    # If source doesn't exist, plugin is invalid
    if [[ ! -d "$source_dir" ]]; then
      echo "  ⚠️  Invalid: $plugin_name (source not found)"
      echo "     Removing cache at: $plugin_dir"
      rm -rf "$plugin_dir"
    fi
  done
}

# Uninstall and reinstall all enabled plugins
_refresh_plugins() {
  local plugins=($(_get_enabled_plugins))

  if [[ ${#plugins[@]} -eq 0 ]]; then
    echo "No plugins configured in .claude/settings.json (or jq not available)"
    return 0
  fi

  echo "Refreshing plugin cache for worktree..."

  # Uninstall all plugins first (clears cache)
  for plugin in "${plugins[@]}"; do
    echo "  🔄 Uninstalling: $plugin"
    claude plugin uninstall --scope project "$plugin" 2>/dev/null || true
  done

  # Reinstall all plugins from fresh source
  for plugin in "${plugins[@]}"; do
    echo "  ✅ Installing: $plugin"
    if ! claude plugin install --scope project "$plugin"; then
      echo "     ⚠️  Failed to install $plugin" >&2
      return 1
    fi
  done

  echo "✅ Plugin cache refreshed!"
}

# Check if we're in a git repository
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  echo "Not in a git repo, launching claude normally..."
  claude "$@"
  exit 0
fi

# Check if we're currently in a worktree
# In a worktree, .git is a file (not a directory) pointing to the actual git dir
if [[ -f .git ]]; then
  echo "Currently in a worktree, navigating to parent repository..."

  # Parse .git file to find the parent repo
  # Format: gitdir: /path/to/repo/.git/worktrees/branch-name
  gitdir=$(grep "gitdir:" .git | cut -d' ' -f2)

  # Extract parent repo path by removing /.git/worktrees/branch-name
  parent_repo=$(echo "$gitdir" | sed 's/\.git\/worktrees\/.*//')

  if [[ -d "$parent_repo" ]]; then
    cd "$parent_repo"
    echo "Switched to parent repo: $(pwd)"
  else
    echo "Error: Could not find parent repository at $parent_repo"
    exit 1
  fi
fi

# Now we're in the parent repo, proceed with worktree creation
repo_root=$(git rev-parse --show-toplevel)
repo_name=$(basename "$repo_root")
branch_name="claude-$(_generate_claude_name)"
worktree_dir="${repo_root}/.worktrees/${branch_name}"

# Detect remote (usually 'origin')
remote=$(git remote | head -1)

# Detect main branch (check for 'main', fallback to 'master')
main_branch=""
if git show-ref --verify --quiet "refs/remotes/${remote}/main"; then
  main_branch="main"
elif git show-ref --verify --quiet "refs/remotes/${remote}/master"; then
  main_branch="master"
else
  echo "Error: Could not find main or master branch on remote '${remote}'"
  exit 1
fi

# Fetch latest from remote main branch
# CRITICAL: This ensures worktree is created from latest remote code
echo "Fetching latest from ${remote}/${main_branch}..."
git fetch "$remote" "$main_branch"

echo "Creating: $branch_name"
echo "From: ${remote}/${main_branch}"

# Create worktree from remote branch
git worktree add -b "$branch_name" "$worktree_dir" "${remote}/${main_branch}"

if [[ $? -eq 0 ]]; then
  cd "$worktree_dir"
  echo "Worktree ready at: $worktree_dir"

  # Plugin cache management (don't fail on errors)
  set +e
  _cleanup_invalid_plugins
  cleanup_exit=$?
  _refresh_plugins
  refresh_exit=$?
  set -e

  if [[ $cleanup_exit -ne 0 ]] || [[ $refresh_exit -ne 0 ]]; then
    echo ""
    echo "⚠️  Warning: Plugin cache refresh had errors"
    echo "   You may need to manually reinstall plugins:"
    echo "   claude plugin uninstall --scope project plugin-name@constellos"
    echo "   claude plugin install --scope project plugin-name@constellos"
    echo ""
  fi

  # Launch Claude Code with all provided CLI flags
  claude "$@"

  echo "Claude exited. You're in: $(pwd)"
else
  echo "Error: Failed to create worktree"
  exit 1
fi
