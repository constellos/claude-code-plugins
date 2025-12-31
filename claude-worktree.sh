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
# Known repo locations (searched in order):
#   ~/constellos/
#   ~/celestian-dev/
#   ~/

# Known locations to search for repos
_CW_REPO_PATHS=(
  "${HOME}/constellos"
  "${HOME}/celestian-dev"
  "${HOME}"
)

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
  local cur="${COMP_WORDS[COMP_CWORD]}"
  local repos=()

  # Only complete first argument as repo
  if [[ ${COMP_CWORD} -eq 1 ]]; then
    # Check if input has a slash (owner/repo format)
    if [[ "$cur" == */* ]]; then
      local owner="${cur%%/*}"
      local partial_repo="${cur#*/}"
      local owner_path="${HOME}/${owner}"

      if [[ -d "$owner_path" ]]; then
        for dir in "${owner_path}"/*/; do
          if [[ -d "${dir}.git" ]]; then
            local repo_name=$(basename "$dir")
            if [[ "$repo_name" == "$partial_repo"* ]]; then
              repos+=("${owner}/${repo_name}")
            fi
          fi
        done
      fi
    else
      # No slash - show owner/ prefixes and direct repo matches
      for base in "${_CW_REPO_PATHS[@]}"; do
        [[ "$base" == "$HOME" ]] && continue  # Skip home dir for completion
        local owner=$(basename "$base")
        if [[ "$owner" == "$cur"* || -z "$cur" ]]; then
          repos+=("${owner}/")
        fi
        for dir in "${base}"/*/; do
          if [[ -d "${dir}.git" ]]; then
            local repo_name=$(basename "$dir")
            if [[ "$repo_name" == "$cur"* ]]; then
              repos+=("$repo_name")
            fi
          fi
        done
      done
    fi
  fi

  COMPREPLY=($(compgen -W "${repos[*]}" -- "$cur"))

  # If completing owner/, don't add space after
  if [[ ${#COMPREPLY[@]} -eq 1 && "${COMPREPLY[0]}" == */ ]]; then
    compopt -o nospace
  fi
}

# Detect if script is being sourced or executed
_cw_is_sourced() {
  [[ "${BASH_SOURCE[0]}" != "${0}" ]]
}

# Main worktree creation logic
_cw_main() {
  set -e

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
    echo "Using repo: $target_repo"
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
    echo "Currently in a worktree, navigating to parent repository..."
    local gitdir=$(grep "gitdir:" .git | cut -d' ' -f2)
    local parent_repo=$(echo "$gitdir" | sed 's/\.git\/worktrees\/.*//')

    if [[ -d "$parent_repo" ]]; then
      cd "$parent_repo"
      echo "Switched to parent repo: $(pwd)"
    else
      echo "Error: Could not find parent repository at $parent_repo"
      return 1
    fi
  fi

  # Now we're in the parent repo, proceed with worktree creation
  local repo_root=$(git rev-parse --show-toplevel)
  local repo_name=$(basename "$repo_root")
  local worktree_dir="${HOME}/.claude-worktrees/${repo_name}/${branch_name}"

  # Detect remote
  local remote=$(git remote | head -1)

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

  # Fetch latest from remote main branch
  echo "Fetching latest from ${remote}/${main_branch}..."
  git fetch "$remote" "$main_branch"

  # Update local main
  echo "Updating local ${main_branch} from ${remote}/${main_branch}..."
  local current_branch=$(git branch --show-current)
  if [[ "$current_branch" == "$main_branch" ]]; then
    if ! git pull --ff-only "$remote" "$main_branch"; then
      echo "Error: Failed to pull ${remote}/${main_branch}"
      echo "Resolve manually before creating a worktree."
      return 1
    fi
  else
    if ! git fetch "$remote" "${main_branch}:${main_branch}"; then
      echo "Error: Failed to update local ${main_branch}"
      echo "Resolve manually before creating a worktree."
      return 1
    fi
  fi
  echo "Local ${main_branch} updated successfully."

  echo "Creating: $branch_name"
  echo "From: ${remote}/${main_branch}"

  # Create worktree
  git worktree add -b "$branch_name" "$worktree_dir" "${remote}/${main_branch}"

  if [[ $? -eq 0 ]]; then
    cd "$worktree_dir"
    echo "Worktree ready at: $worktree_dir"

    # Plugin refresh (non-fatal)
    set +e
    local settings_file="${repo_root}/.claude/settings.json"
    if [[ -f "$settings_file" ]] && command -v jq &>/dev/null; then
      local plugins=$(jq -r '.enabledPlugins | keys[]' "$settings_file" 2>/dev/null)
      if [[ -n "$plugins" ]]; then
        echo "Refreshing plugin cache..."
        while IFS= read -r plugin; do
          claude plugin uninstall --scope project "$plugin" 2>/dev/null || true
          claude plugin install --scope project "$plugin" 2>/dev/null || true
        done <<< "$plugins"
      fi
    fi
    set -e

    # Launch Claude Code
    claude "$@"
    echo "Claude exited. You're in: $(pwd)"
  else
    echo "Error: Failed to create worktree"
    return 1
  fi
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
