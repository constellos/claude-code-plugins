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

  # Launch Claude Code with all provided CLI flags
  claude "$@"

  echo "Claude exited. You're in: $(pwd)"
else
  echo "Error: Failed to create worktree"
  exit 1
fi
