#!/usr/bin/env node
/**
 * Shared Plugin Install Script
 *
 * Reads install commands from .claude/constellos.toml in the plugin directory
 * and executes them in order to set up required dependencies.
 *
 * Usage:
 *   node shared/install.ts <plugin-root>
 *
 * The plugin-root should contain a .claude/constellos.toml file with:
 *
 * ```toml
 * [install]
 * commands = [
 *   "brew install gh",
 *   "npm install -g vercel",
 * ]
 * ```
 *
 * @module install
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { readTomlFile } from './hooks/utils/toml.js';

interface InstallConfig {
  plugin?: {
    name?: string;
    version?: string;
  };
  install?: {
    commands?: string[];
    /** Only run install when CLAUDE_CODE_ENTRYPOINT matches this value (e.g., "remote") */
    require_entrypoint?: string;
  };
}

/**
 * Execute a shell command and return a promise
 */
function execCommand(command: string, cwd: string): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    console.log(`\n→ Running: ${command}`);

    const [cmd, ...args] = command.split(' ');
    const proc = spawn(cmd, args, {
      cwd,
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let output = '';

    proc.stdout?.on('data', (data) => {
      const str = data.toString();
      output += str;
      process.stdout.write(str);
    });

    proc.stderr?.on('data', (data) => {
      const str = data.toString();
      output += str;
      process.stderr.write(str);
    });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        output,
      });
    });

    proc.on('error', (error) => {
      resolve({
        success: false,
        output: error.message,
      });
    });
  });
}

/**
 * Main install function
 */
async function main(): Promise<void> {
  const pluginRoot = process.argv[2];

  if (!pluginRoot) {
    console.error('Usage: node shared/install.ts <plugin-root>');
    console.error('');
    console.error('The plugin-root should contain a .claude/constellos.toml file');
    process.exit(1);
  }

  const configPath = join(pluginRoot, '.claude', 'constellos.toml');
  console.log(`📦 Reading plugin configuration from: ${configPath}`);

  const config = (await readTomlFile(configPath)) as InstallConfig | null;

  if (!config) {
    console.error(`❌ Could not read configuration file: ${configPath}`);
    process.exit(1);
  }

  const pluginName = config.plugin?.name || 'unknown';
  const commands = config.install?.commands || [];
  const requireEntrypoint = config.install?.require_entrypoint;

  // Check if install should only run for specific entrypoint
  if (requireEntrypoint) {
    const currentEntrypoint = process.env.CLAUDE_CODE_ENTRYPOINT;
    if (currentEntrypoint !== requireEntrypoint) {
      console.log(`⏭️  Skipping install for plugin: ${pluginName}`);
      console.log(`   Requires CLAUDE_CODE_ENTRYPOINT="${requireEntrypoint}", but got "${currentEntrypoint || 'undefined'}"`);
      return;
    }
  }

  console.log(`\n🔧 Installing dependencies for plugin: ${pluginName}`);

  if (commands.length === 0) {
    console.log('✅ No install commands specified - nothing to do');
    return;
  }

  console.log(`📋 Found ${commands.length} install command(s)\n`);

  let successCount = 0;
  let failCount = 0;

  for (const command of commands) {
    const result = await execCommand(command, pluginRoot);

    if (result.success) {
      console.log(`✅ Success: ${command}`);
      successCount++;
    } else {
      console.log(`❌ Failed: ${command}`);
      failCount++;
    }
  }

  console.log(`\n📊 Installation Summary`);
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);

  if (failCount > 0) {
    console.log('\n⚠️  Some commands failed. Please check the output above.');
    process.exit(1);
  }

  console.log('\n✅ All dependencies installed successfully!');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
