#!/usr/bin/env bash

# Claude Worktree Completion
# Source this file in your .bashrc or .zshrc:
#   source /path/to/claude-code-plugins/claude-worktree-completion.bash

# Path to the worktree script
_CW_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_CW_SCRIPT="${_CW_SCRIPT_DIR}/claude-worktree.sh"

# The main cw function
cw() {
  bash "$_CW_SCRIPT" "$@"
}

# Known repo locations
_CW_REPO_PATHS=(
  "${HOME}/constellos"
  "${HOME}/celestian-dev"
)

# Generate completions for repos
_cw_completions() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  local repos=()

  # Only complete first argument as repo
  if [[ ${COMP_CWORD} -eq 1 ]]; then
    # Check if input has a slash (owner/repo format)
    if [[ "$cur" == */* ]]; then
      # Extract the owner part
      local owner="${cur%%/*}"
      local partial_repo="${cur#*/}"
      local owner_path="${HOME}/${owner}"

      if [[ -d "$owner_path" ]]; then
        # List repos under this owner
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
        local owner=$(basename "$base")
        # Add owner/ as a completion option
        if [[ "$owner" == "$cur"* || -z "$cur" ]]; then
          repos+=("${owner}/")
        fi
        # Also add direct repo matches
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

# Zsh compatibility
if [[ -n "$ZSH_VERSION" ]]; then
  autoload -U +X bashcompinit && bashcompinit
fi

# Register completion
complete -F _cw_completions cw

echo "Claude worktree: 'cw' command available with tab completion"
