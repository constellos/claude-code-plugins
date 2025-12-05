# Bash Tool Behavior

The Bash tool executes shell commands with the following persistence behavior:

- **Working directory persists**: When Claude changes the working directory (e.g., `cd /path/to/dir`), subsequent Bash commands will execute in that directory. You can use `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR=1` to reset to the project directory after each command.
- **Environment variables do NOT persist**: Environment variables set in one Bash command (e.g., `export MY_VAR=value`) are not available in subsequent Bash commands. Each Bash command runs in a fresh shell environment.

To make environment variables available in Bash commands, you have three options:

## Option 1: Activate environment before starting Claude Code (simplest approach)

Activate your virtual environment in your terminal before launching Claude Code:

```bash
conda activate myenv
# or: source /path/to/venv/bin/activate
claude
```

This works for shell environments but environment variables set within Claude's Bash commands will not persist between commands.

## Option 2: Set CLAUDE_ENV_FILE before starting Claude Code (persistent environment setup)

Export the path to a shell script containing your environment setup:

```bash
export CLAUDE_ENV_FILE=/path/to/env-setup.sh
claude
```

Where `/path/to/env-setup.sh` contains:

```bash
conda activate myenv
# or: source /path/to/venv/bin/activate
# or: export MY_VAR=value
```

Claude Code will source this file before each Bash command, making the environment persistent across all commands.

## Option 3: Use a SessionStart hook (project-specific configuration)

Configure in `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup",
      "hooks": [{
        "type": "command",
        "command": "echo 'conda activate myenv' >> \"$CLAUDE_ENV_FILE\""
      }]
    }]
  }
}
```

The hook writes to `$CLAUDE_ENV_FILE`, which is then sourced before each Bash command. This is ideal for team-shared project configurations.

See SessionStart hooks for more details on Option 3.

## Using CLAUDE_ENV_FILE for Active Subagent Tracking

Since `$CLAUDE_ENV_FILE` is sourced before each Bash command and persists for the session, it's ideal for tracking active subagents:

```typescript
// In SubagentStart hook
const envLine = `export ACTIVE_SUBAGENT_${agentId}='${JSON.stringify(context)}'`;
await exec(`echo "${envLine}" >> "$CLAUDE_ENV_FILE"`);

// In SubagentStop hook - context is available via process.env
const context = process.env[`ACTIVE_SUBAGENT_${agentId}`];
```

Benefits over file-based storage:
- Automatically cleaned up when session ends
- No file I/O needed to read context
- Follows Claude Code's built-in persistence model
