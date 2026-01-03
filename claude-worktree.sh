#!/usr/bin/env bash

# Claude Code Worktree Launcher
#
# Creates an isolated git worktree for Claude Code sessions.
# Each session gets its own branch and worktree in ~/.claude-worktrees/{repo}/
#
# Usage:
#   cw [owner/repo] [claude CLI flags]
#
# Examples:
#   cw                          # Use current directory
#   cw lazyjobs                 # Find lazyjobs in known locations
#   cw celestian-dev/lazyjobs   # Use ~/celestian-dev/lazyjobs
#   cw constellos/nodes-md      # Use ~/constellos/nodes-md
#   cw --verbose                # Current dir with claude flags
#
# Setup (add to ~/.bashrc or ~/.zshrc):
#   source ~/constellos/claude-code-plugins/claude-worktree.sh
#
# Self-Update:
#   The script auto-updates from origin/main when sourced or called.
#   If updates are pulled, you'll be prompted to re-source your shell config.
#
# Known repo locations (searched in order):
#   ~/constellos/
#   ~/celestian-dev/
#   ~/

# Store the directory where this script lives (for self-update)
_CW_SCRIPT_DIR=""
if [[ -n "${BASH_SOURCE[0]}" ]]; then
  _CW_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

# Known locations to search for repos
_CW_REPO_PATHS=(
  "${HOME}/constellos"
  "${HOME}/celestian-dev"
  "${HOME}"
)

# Output formatting helpers
_cw_section() {
  local title="$1"
  echo ""
  echo "─── $title ───"
}

_cw_item() {
  local status="$1"
  local message="$2"
  echo "  $status $message"
}

# Self-update function: pulls latest from origin/main if script repo has updates
# If an update is found, exec-reinvokes with the updated script (never returns)
# Returns 0 if no update needed
# Arguments: All arguments to pass to cw on re-invocation
_cw_self_update() {
  # Only update if we know where the script lives and it's a git repo
  if [[ -z "$_CW_SCRIPT_DIR" ]] || [[ ! -d "$_CW_SCRIPT_DIR/.git" ]]; then
    return 0
  fi

  local current_dir="$PWD"
  cd "$_CW_SCRIPT_DIR" || return 0

  # Fetch latest from origin (silently)
  if ! git fetch origin main --quiet 2>/dev/null; then
    cd "$current_dir"
    return 0
  fi

  # Get current branch and check if main is behind
  local current_branch=$(git branch --show-current 2>/dev/null)
  local main_hash=$(git rev-parse main 2>/dev/null || git rev-parse origin/main 2>/dev/null)
  local remote_hash=$(git rev-parse origin/main 2>/dev/null)

  # If main is up to date, nothing to do
  if [[ "$main_hash" == "$remote_hash" ]]; then
    cd "$current_dir"
    return 0
  fi

  echo "🔄 Updating cw script from origin/main..."

  # If we're not on main, switch to it
  local switched_branch=""
  if [[ "$current_branch" != "main" ]]; then
    # Check for uncommitted changes
    if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
      echo "⚠️  Uncommitted changes in $current_branch, stashing..."
      git stash push -m "cw-auto-update: stashed from $current_branch" --quiet 2>/dev/null
    fi
    switched_branch="$current_branch"
    if ! git checkout main --quiet 2>/dev/null; then
      echo "⚠️  Could not checkout main, skipping update"
      cd "$current_dir"
      return 0
    fi
  fi

  # Now update main
  if git pull --ff-only origin main --quiet 2>/dev/null; then
    # Switch back to original branch if we switched
    if [[ -n "$switched_branch" ]]; then
      git checkout "$switched_branch" --quiet 2>/dev/null
      # Restore stash if we created one
      if git stash list 2>/dev/null | grep -q "cw-auto-update: stashed from $switched_branch"; then
        git stash pop --quiet 2>/dev/null
      fi
    fi

    echo "✔ cw script updated, re-invoking with new version..."
    echo ""

    # Build quoted args string for re-invocation
    local quoted_args=""
    for arg in "$@"; do
      quoted_args+=" $(printf '%q' "$arg")"
    done

    # Return to original directory before exec
    cd "$current_dir"

    # Exec-reinvoke with updated script - this replaces the current process
    # The new bash will source the updated script file and run cw
    exec bash -c "source '$_CW_SCRIPT_DIR/claude-worktree.sh' && cw$quoted_args"
  else
    echo "⚠️  Could not fast-forward main (local changes?), skipping update"
    # Switch back if we switched
    if [[ -n "$switched_branch" ]]; then
      git checkout "$switched_branch" --quiet 2>/dev/null
    fi
  fi

  cd "$current_dir"
  return 0
}

# Find a repo by name or owner/name
_cw_find_repo() {
  local query="$1"

  # If query contains /, treat as owner/repo
  if [[ "$query" == */* ]]; then
    local owner="${query%%/*}"
    local repo="${query#*/}"
    local path="${HOME}/${owner}/${repo}"
    if [[ -d "$path/.git" ]]; then
      echo "$path"
      return 0
    fi
  else
    # Search in known locations
    for base in "${_CW_REPO_PATHS[@]}"; do
      local path="${base}/${query}"
      if [[ -d "$path/.git" ]]; then
        echo "$path"
        return 0
      fi
    done
  fi

  return 1
}

# Tab completion function
_cw_completions() {
  local cur="${COMP_WORDS[COMP_CWORD]:-}"
  local repos=()
  local dir repo_name owner base owner_path partial_repo

  # Save and set nullglob to handle empty directories gracefully
  local nullglob_was_set=0
  shopt -q nullglob && nullglob_was_set=1
  shopt -s nullglob

  # Only complete first argument as repo
  if [[ ${COMP_CWORD:-0} -eq 1 ]]; then
    # Check if input has a slash (owner/repo format)
    if [[ "$cur" == */* ]]; then
      owner="${cur%%/*}"
      partial_repo="${cur#*/}"
      owner_path="${HOME}/${owner}"

      if [[ -d "$owner_path" ]]; then
        for dir in "${owner_path}"/*/; do
          [[ -d "${dir}.git" ]] || continue
          repo_name=$(basename "$dir")
          if [[ "$repo_name" == "$partial_repo"* ]]; then
            repos+=("${owner}/${repo_name}")
          fi
        done
      fi
    else
      # No slash - show owner/ prefixes and direct repo matches
      for base in "${_CW_REPO_PATHS[@]:-}"; do
        [[ -z "$base" || "$base" == "$HOME" ]] && continue
        [[ -d "$base" ]] || continue
        owner=$(basename "$base")
        if [[ "$owner" == "$cur"* || -z "$cur" ]]; then
          repos+=("${owner}/")
        fi
        for dir in "${base}"/*/; do
          [[ -d "${dir}.git" ]] || continue
          repo_name=$(basename "$dir")
          if [[ "$repo_name" == "$cur"* ]]; then
            repos+=("$repo_name")
          fi
        done
      done
    fi
  fi

  # Restore nullglob setting
  [[ $nullglob_was_set -eq 0 ]] && shopt -u nullglob

  COMPREPLY=($(compgen -W "${repos[*]}" -- "$cur" 2>/dev/null)) || COMPREPLY=()

  # If completing owner/, don't add space after
  if [[ ${#COMPREPLY[@]} -eq 1 && "${COMPREPLY[0]}" == */ ]]; then
    compopt -o nospace 2>/dev/null || true
  fi
}

# Detect if script is being sourced or executed
_cw_is_sourced() {
  [[ "${BASH_SOURCE[0]}" != "${0}" ]]
}

# Main worktree creation logic
_cw_main() {
  set -e

  # Self-update check: pull latest script from origin/main if available
  # If update found, _cw_self_update will exec-reinvoke with new script (never returns)
  _cw_self_update "$@"

  local target_repo=""

  # Parse first argument - could be a repo reference or a claude flag
  if [[ $# -gt 0 && "$1" != -* ]]; then
    if _cw_find_repo "$1" >/dev/null 2>&1; then
      target_repo=$(_cw_find_repo "$1")
      shift
    fi
  fi

  # If we have a target repo, cd to it
  if [[ -n "$target_repo" ]]; then
    cd "$target_repo"
  fi

  # Adjectives for branch naming
  local adjectives=(
    admiring agile ambitious bold brave bright calm clever cosmic curious
    dazzling determined eager elegant epic fearless focused gallant gentle happy
    hopeful inspiring inventive jolly keen kind lucid magical merry mindful
    noble optimistic peaceful polished proud quick quirky radiant resolute
    serene sharp sleek smooth stellar stoic swift tender thoughtful tranquil
    upbeat valiant vibrant vigilant vivid warm wise witty zealous zen
  )

  # Animal names for branch naming
  local names=(
    albatross badger cardinal dolphin eagle falcon gecko heron ibis jaguar
    kestrel lemur marmot narwhal otter panda quail raven starling toucan
    urchin viper walrus xerus yak zebra bandicoot capybara dingo echidna
    flamingo gopher hedgehog iguana jackal koala lynx mongoose numbat ocelot
  )

  # Generate unique branch name
  local adj=${adjectives[$RANDOM % ${#adjectives[@]}]}
  local name=${names[$RANDOM % ${#names[@]}]}
  local suffix=$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 8)
  local branch_name="claude-${adj}-${name}-${suffix}"

  # Check if we're in a git repository
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    echo "Not in a git repo, launching claude normally..."
    claude "$@"
    return 0
  fi

  # Check if we're currently in a worktree
  if [[ -f .git ]]; then
    local gitdir=$(grep "gitdir:" .git | cut -d' ' -f2)
    local parent_repo=$(echo "$gitdir" | sed 's/\.git\/worktrees\/.*//')

    if [[ -d "$parent_repo" ]]; then
      cd "$parent_repo"
    else
      echo "Error: Could not find parent repository at $parent_repo"
      return 1
    fi
  fi

  # Now we're in the parent repo, proceed with worktree creation
  local repo_root=$(git rev-parse --show-toplevel)
  local repo_name=$(basename "$repo_root")
  local worktree_base="${HOME}/.claude-worktrees/${repo_name}"
  local worktree_dir="${worktree_base}/${branch_name}"

  # Detect remote
  local remote=$(git remote | head -1)
  if [[ -z "$remote" ]]; then
    echo "Error: No git remote configured"
    return 1
  fi

  # Show header
  echo ""
  echo "claude-worktree (cw) ${repo_name}"
  echo "═══════════════════════════════════════"

  # Status checks section
  _cw_section "Status"

  # Check cw script is up to date (already done in _cw_self_update, just report success)
  _cw_item "✔" "cw script up to date"

  # Fetch and check main branch sync
  git fetch --prune "$remote" 2>/dev/null || true

  # Detect main branch
  local main_branch=""
  if git show-ref --verify --quiet "refs/remotes/${remote}/main"; then
    main_branch="main"
  elif git show-ref --verify --quiet "refs/remotes/${remote}/master"; then
    main_branch="master"
  else
    echo "Error: Could not find main or master branch on remote '${remote}'"
    return 1
  fi

  # Sync local main with remote
  local current_branch=$(git branch --show-current)
  if [[ "$current_branch" == "$main_branch" ]]; then
    if git pull --ff-only "$remote" "$main_branch" 2>/dev/null; then
      _cw_item "✔" "local ${main_branch} synced with ${remote}/${main_branch}"
    else
      _cw_item "⚠" "local ${main_branch} has diverged (resolve manually)"
      return 1
    fi
  else
    if git fetch "$remote" "${main_branch}:${main_branch}" 2>/dev/null; then
      _cw_item "✔" "local ${main_branch} synced with ${remote}/${main_branch}"
    else
      _cw_item "⚠" "failed to update local ${main_branch}"
      return 1
    fi
  fi

  # Clean up stale worktrees
  local stale_count=0
  if [[ -d "$worktree_base" ]]; then
    local remote_branches=""
    remote_branches=$(git ls-remote --heads "$remote" 2>/dev/null | awk '{print $2}' | sed 's|refs/heads/||')

    local wt_path=""
    local is_locked=false
    while IFS= read -r line; do
      if [[ "$line" == "worktree "* ]]; then
        wt_path="${line#worktree }"
        is_locked=false
      elif [[ "$line" == "locked"* ]]; then
        is_locked=true
      elif [[ "$line" == "branch "* ]]; then
        local branch="${line#branch refs/heads/}"
        if [[ "$wt_path" == "$worktree_base"/* && "$branch" == claude-* ]]; then
          if [[ "$is_locked" != true ]]; then
            local should_remove=false
            if ! git show-ref --verify --quiet "refs/heads/$branch"; then
              should_remove=true
            elif [[ -n "$remote_branches" ]] && ! echo "$remote_branches" | grep -qx "$branch"; then
              should_remove=true
            fi
            if [[ "$should_remove" == true ]]; then
              if git worktree remove --force "$wt_path" 2>/dev/null; then
                ((stale_count++)) || true
              fi
            fi
          fi
        fi
        wt_path=""
        is_locked=false
      elif [[ -z "$line" ]]; then
        wt_path=""
        is_locked=false
      fi
    done < <(git worktree list --porcelain)
    git worktree prune 2>/dev/null
  fi

  if [[ $stale_count -gt 0 ]]; then
    _cw_item "✔" "cleaned ${stale_count} stale worktree(s)"
  fi

  # Create worktree
  _cw_section "Worktree"
  if ! git worktree add -b "$branch_name" "$worktree_dir" "${remote}/${main_branch}" 2>/dev/null; then
    _cw_item "✘" "failed to create worktree"
    return 1
  fi
  _cw_item "✔" "branch: ${branch_name}"
  _cw_item "✔" "path: ${worktree_dir/#$HOME/~}"

  cd "$worktree_dir"

  # Plugin refresh (non-fatal)
  set +e
  local settings_file="${worktree_dir}/.claude/settings.json"
  local marketplace_file="${worktree_dir}/.claude-plugin/marketplace.json"
  local registered_local_marketplace=""
  local has_marketplace_output=false

  if [[ -f "$settings_file" ]] && command -v jq &>/dev/null; then
    # Local marketplace registration (only for plugin repos with marketplace.json)
    if [[ -f "$marketplace_file" ]]; then
      local has_local_marketplace=$(jq -r '.extraKnownMarketplaces["constellos-local"] // empty' "$settings_file" 2>/dev/null)

      if [[ -n "$has_local_marketplace" ]]; then
        local current_path=$(claude plugin marketplace list 2>/dev/null | grep -A1 "constellos-local" | grep "Directory" | sed 's/.*(\(.*\))/\1/')

        if [[ -z "$current_path" || "$current_path" != "$worktree_dir" ]]; then
          claude plugin marketplace remove constellos-local &>/dev/null || true
          rm -rf ~/.claude/plugins/cache/constellos-local 2>/dev/null

          if [[ "$has_marketplace_output" == false ]]; then
            _cw_section "Marketplace"
            has_marketplace_output=true
          fi

          if claude plugin marketplace add "$worktree_dir" &>/dev/null; then
            _cw_item "✔" "constellos-local registered"
            registered_local_marketplace="constellos-local"
          else
            _cw_item "⚠" "constellos-local failed"
          fi
        else
          registered_local_marketplace="constellos-local"
        fi
      fi
    fi

    # Update git-based marketplaces
    local marketplace_names=$(jq -r '.extraKnownMarketplaces | keys[]' "$settings_file" 2>/dev/null)
    if [[ -n "$marketplace_names" ]]; then
      while IFS= read -r marketplace_name; do
        local marketplace_source=$(jq -r ".extraKnownMarketplaces[\"$marketplace_name\"].source.source" "$settings_file" 2>/dev/null)
        local marketplace_path="$HOME/.claude/plugins/marketplaces/$marketplace_name"

        if [[ "$marketplace_source" == "github" || "$marketplace_source" == "git" ]] && [[ -d "$marketplace_path/.git" ]]; then
          if [[ "$has_marketplace_output" == false ]]; then
            _cw_section "Marketplace"
            has_marketplace_output=true
          fi

          if git -C "$marketplace_path" fetch origin main --quiet 2>/dev/null && \
             git -C "$marketplace_path" reset --hard origin/main --quiet 2>/dev/null; then
            _cw_item "✔" "${marketplace_name} updated"
          else
            _cw_item "⚠" "${marketplace_name} (cached)"
          fi
        fi
      done <<< "$marketplace_names"
    fi

    # Install plugins from worktree settings
    local plugins=$(jq -r '.enabledPlugins | keys[]' "$settings_file" 2>/dev/null)
    if [[ -n "$plugins" ]]; then
      _cw_section "Plugins"
      local plugin_count=0
      local installed_count=0

      while IFS= read -r plugin; do
        local plugin_name="${plugin%@*}"
        local marketplace="${plugin#*@}"

        # Skip plugins from just-registered local marketplace (already installed by marketplace add)
        if [[ "$marketplace" == "$registered_local_marketplace" ]]; then
          _cw_item "✔" "${plugin}"
          ((plugin_count++)) || true
          ((installed_count++)) || true
          continue
        fi

        ((plugin_count++)) || true

        # Uninstall quietly
        claude plugin uninstall --scope project "$plugin" &>/dev/null || true

        # Clear this plugin's cache
        rm -rf ~/.claude/plugins/cache/"${marketplace}"/"${plugin_name}" 2>/dev/null || true

        # Reinstall (suppress verbose output)
        if claude plugin install --scope project "$plugin" &>/dev/null; then
          _cw_item "✔" "${plugin}"
          ((installed_count++)) || true
        else
          _cw_item "✘" "${plugin}"
        fi
      done <<< "$plugins"
    fi
  fi
  set -e

  # Ready message
  echo ""
  echo "Ready!"

  # Launch Claude Code
  claude "$@" || true  # Ignore exit code to prevent set -e from terminating shell
  echo ""
  echo "Claude exited. You're in: $(pwd)"
}

# The cw function that users call
cw() {
  _cw_main "$@"
}

# Setup when sourced
if _cw_is_sourced; then
  # Zsh compatibility
  if [[ -n "$ZSH_VERSION" ]]; then
    autoload -U +X bashcompinit && bashcompinit 2>/dev/null
  fi

  # Register completion
  complete -F _cw_completions cw 2>/dev/null

  # Success message (only on interactive shells)
  if [[ $- == *i* ]]; then
    echo "cw: Claude worktree command ready (tab completion enabled)"
  fi
else
  # Script executed directly
  _cw_main "$@"
fi
