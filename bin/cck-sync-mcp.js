#!/usr/bin/env node
/**
 * cck-sync-mcp - Sync MCP server tools and generate TypeScript types
 *
 * Usage:
 *   cck-sync-mcp [options]
 *
 * Options:
 *   --project <path>     Project path (defaults to current directory)
 *   --output <path>      Output directory (default: node_modules/.cache/claude-code-kit/mcp-types)
 *   --force              Force sync even if config unchanged
 *   --timeout <ms>       Connection timeout in milliseconds (default: 15000)
 *   --help               Show this help message
 *
 * Config:
 *   Reads MCP servers from ~/.claude.json under projects.<project-path>.mcpServers
 *
 * Examples:
 *   # Sync from current directory
 *   cck-sync-mcp
 *
 *   # Sync for specific project
 *   cck-sync-mcp --project /path/to/project
 *
 *   # Force sync even if config unchanged
 *   cck-sync-mcp --force
 *
 *   # Custom output directory
 *   cck-sync-mcp --output ./types/mcp
 */

import { syncMcpTypes, getProjectMcpServers } from '../dist/mcp/index.js';
import * as path from 'node:path';

function printHelp() {
  console.log(`
cck-sync-mcp - Sync MCP server tools and generate TypeScript types

Usage:
  cck-sync-mcp [options]

Options:
  --project <path>     Project path (defaults to current directory)
  --output <path>      Output directory (default: node_modules/.cache/claude-code-kit/mcp-types)
  --force              Force sync even if config unchanged
  --timeout <ms>       Connection timeout in milliseconds (default: 15000)
  --help               Show this help message

Config:
  Reads MCP servers from ~/.claude.json under projects.<project-path>.mcpServers

  Example ~/.claude.json:
  {
    "projects": {
      "/path/to/project": {
        "mcpServers": {
          "filesystem": {
            "command": "npx",
            "args": ["-y", "@anthropic/mcp-server-filesystem"]
          }
        }
      }
    }
  }

Examples:
  # Sync from current directory
  cck-sync-mcp

  # Sync for specific project
  cck-sync-mcp --project /path/to/project

  # Force sync even if config unchanged
  cck-sync-mcp --force

  # Custom output directory
  cck-sync-mcp --output ./types/mcp

Output:
  Generates per-server type files:
    node_modules/.cache/claude-code-kit/mcp-types/[server-name].d.ts

  Each file exports:
    - [Server][Tool]Request interfaces (extends CallToolRequestParams)
    - [Server][Tool]Result interfaces (extends CallToolResult)
    - [Server]ToolRequest union type
    - [Server]ToolResult union type
    - [Server]ToolMap interface for type-safe lookups
`);
}

function parseArgs(args) {
  const result = {
    projectPath: process.cwd(),
    outputDir: undefined,
    force: false,
    timeout: 15000,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--help':
      case '-h':
        result.help = true;
        break;

      case '--project':
        result.projectPath = path.resolve(args[++i]);
        break;

      case '--output':
        result.outputDir = path.resolve(args[++i]);
        break;

      case '--force':
        result.force = true;
        break;

      case '--timeout':
        result.timeout = parseInt(args[++i], 10);
        break;
    }
  }

  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Check for servers in config
  const servers = getProjectMcpServers(args.projectPath);
  const serverNames = Object.keys(servers);

  if (serverNames.length === 0) {
    console.log('No MCP servers found in config.');
    console.log(`Looked in: ~/.claude.json under projects["${args.projectPath}"].mcpServers`);
    console.log('\nTo configure MCP servers, add them to ~/.claude.json:');
    console.log(`
{
  "projects": {
    "${args.projectPath}": {
      "mcpServers": {
        "your-server": {
          "command": "npx",
          "args": ["-y", "@your/mcp-server"]
        }
      }
    }
  }
}
`);
    process.exit(0);
  }

  console.log(`Found ${serverNames.length} MCP server(s) for project: ${args.projectPath}`);
  for (const name of serverNames) {
    const config = servers[name];
    if (config.type === 'stdio') {
      console.log(`  - ${name}: ${config.command} ${(config.args || []).join(' ')}`);
    } else {
      console.log(`  - ${name}: ${config.url}`);
    }
  }

  try {
    const result = await syncMcpTypes({
      projectPath: args.projectPath,
      outputDir: args.outputDir,
      timeout: args.timeout,
      force: args.force,
    });

    console.log('');

    if (result.skipped) {
      console.log('✓ Config unchanged, sync skipped (use --force to override)');
      process.exit(0);
    }

    if (result.synced.length > 0) {
      console.log(`✓ Synced: ${result.synced.join(', ')}`);
    }
    if (result.errors.length > 0) {
      console.log(`✗ Failed:`);
      for (const error of result.errors) {
        console.log(`  - ${error}`);
      }
    }
    console.log(`\nTypes written to: ${result.outputDir}`);

    process.exit(result.errors.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('Failed to sync MCP types:', error.message);
    process.exit(1);
  }
}

main();
