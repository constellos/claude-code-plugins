#!/usr/bin/env node
/**
 * Claude Code Kit CLI
 *
 * Unified CLI for claude-code-kit utilities.
 *
 * Usage:
 *   cck init                Initialize project with hooks and MCP types
 *   cck hook <file.ts>      Run a TypeScript hook file
 *   cck gen-mcp-types       Generate MCP type definitions
 *   cck add-subagent-state     Save agent context (SubagentStart hook)
 *   cck clear-subagent-state   Process agent and cleanup (SubagentStop hook)
 *   cck --help              Show this help message
 */

import { main as hookMain } from '../dist/runners/index.js';

const args = process.argv.slice(2);
const command = args[0];

function showHelp() {
  console.log(`
Claude Code Kit CLI

Usage:
  cck <command> [options]

Commands:
  init              Initialize project with hooks and MCP types
                    Creates .claude/settings.json with SubagentStart/Stop hooks
                    and generates MCP type definitions

  hook <file.ts>    Run a TypeScript hook file
                    Reads JSON from stdin, executes hook, writes JSON to stdout
                    Options:
                      --log    Enable debug logging

  gen-mcp-types     Generate MCP type definitions from configured servers
                    Options:
                      --project <path>   Project directory (default: cwd)
                      --output <path>    Output directory
                      --force            Regenerate even if up to date
                      --timeout <ms>     Server connection timeout (default: 15000)

  add-subagent-state     Save agent context at SubagentStart
                         Use in hooks config: { "command": "pnpm --silent cck add-subagent-state" }

  clear-subagent-state   Process agent at SubagentStop and cleanup state
                         Use in hooks config: { "command": "pnpm --silent cck clear-subagent-state" }

  --help, -h        Show this help message
  --version, -v     Show version

Examples:
  cck init
  cck hook .claude/hooks/pre-tool-use.ts
  cck gen-mcp-types --force

Aliases:
  claude-code-kit   Same as cck
`);
}

async function main() {
  if (!command || command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json');
    console.log(pkg.version);
    process.exit(0);
  }

  if (command === 'init') {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const cwd = process.cwd();
    const settingsPath = path.join(cwd, '.claude', 'settings.json');

    // Create .claude directory if needed
    await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });

    // Read existing settings or create new
    let settings = {};
    try {
      const existing = await fs.promises.readFile(settingsPath, 'utf-8');
      settings = JSON.parse(existing);
    } catch {
      // File doesn't exist, start fresh
    }

    // Add hooks if not present
    settings.hooks = settings.hooks || {};
    settings.hooks.SubagentStart = settings.hooks.SubagentStart || [
      { hooks: [{ type: 'command', command: 'pnpm --silent cck add-subagent-state' }] }
    ];
    settings.hooks.SubagentStop = settings.hooks.SubagentStop || [
      { hooks: [{ type: 'command', command: 'pnpm --silent cck clear-subagent-state' }] }
    ];
    settings.hooks.SessionStart = settings.hooks.SessionStart || [
      { hooks: [{ type: 'command', command: 'pnpm --silent cck gen-mcp-types' }] }
    ];

    // Write settings
    await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    console.log(`Created ${settingsPath}`);
    console.log('');
    console.log('⚠️  Note: Settings changes only apply to NEW Claude Code sessions.');
    console.log('   Restart Claude Code to activate the hooks.');

    // Run gen-mcp-types
    console.log('Generating MCP types...');
    try {
      const { syncMcpTypes } = await import('../dist/mcp/index.js');
      const result = await syncMcpTypes({ projectPath: cwd });

      if (result.skipped) {
        console.log('MCP types up to date');
      } else if (result.synced.length > 0) {
        console.log(`Generated types for: ${result.synced.join(', ')}`);
      } else if (result.errors.length > 0) {
        console.log('MCP type generation had errors:');
        result.errors.forEach(err => console.log(`  - ${err}`));
      } else {
        console.log('No MCP servers configured');
      }
    } catch (err) {
      console.log(`MCP types skipped: ${err.message}`);
    }

    console.log('Done!');
    return;
  }

  if (command === 'hook') {
    // Pass remaining args to hook runner
    process.argv = [process.argv[0], process.argv[1], ...args.slice(1)];
    await hookMain();
    return;
  }

  if (command === 'gen-mcp-types') {
    // Dynamic import the mcp-types command
    const mcpTypesPath = new URL('./cck-sync-mcp.js', import.meta.url);
    process.argv = [process.argv[0], process.argv[1], ...args.slice(1)];
    await import(mcpTypesPath);
    return;
  }

  if (command === 'add-subagent-state') {
    const { readStdinJson, writeStdoutJson } = await import('../dist/runners/index.js');
    const { saveAgentStartContext } = await import('../dist/transcripts/index.js');

    const input = await readStdinJson();

    await saveAgentStartContext({
      agent_id: input.agent_id,
      agent_type: input.agent_type,
      session_id: input.session_id,
      cwd: input.cwd,
      transcript_path: input.transcript_path,
    });

    writeStdoutJson({
      hookSpecificOutput: { hookEventName: 'SubagentStart' }
    });
    return;
  }

  if (command === 'clear-subagent-state') {
    const { readStdinJson, writeStdoutJson } = await import('../dist/runners/index.js');
    const { getAgentEdits } = await import('../dist/transcripts/index.js');

    const input = await readStdinJson();

    // getAgentEdits loads saved context and cleans it up
    await getAgentEdits(input.agent_transcript_path, {
      cwd: input.cwd,
    });

    writeStdoutJson({
      hookSpecificOutput: { hookEventName: 'SubagentStop' }
    });
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.error('Run "cck --help" for usage information.');
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
