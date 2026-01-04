/**
 * Package Manager Enforcement Hook
 * PreToolUse[Bash] hook that enforces correct package manager usage based on lockfiles
 * Blocks npm/yarn/pnpm/bun commands when wrong package manager is detected
 * Allows any package manager when no lockfile exists
 * @module use-correct-package-manager
 */

import type { PreToolUseInput, PreToolUseHookOutput } from '../../../../shared/types/types.js';
import { runHook } from './utils/io.js';
import { detectPackageManager } from '../../../../shared/hooks/utils/package-manager.js';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Check if project has any lockfile
 * @param cwd - Current working directory
 * @returns True if any lockfile exists
 */
function hasLockfile(cwd: string): boolean {
  return (
    existsSync(join(cwd, 'bun.lockb')) ||
    existsSync(join(cwd, 'pnpm-lock.yaml')) ||
    existsSync(join(cwd, 'yarn.lock')) ||
    existsSync(join(cwd, 'package-lock.json'))
  );
}

/**
 * Extract package manager from bash command
 * @param command - Bash command string
 * @returns Package manager name or null if not a package manager command
 */
function extractPackageManagerFromCommand(command: string): string | null {
  // Extract the first command before pipes, semicolons, &&, etc.
  const actualCommand = command.split(/[|;&]/)[0].trim();

  // Match package manager executables
  const pmMatch = actualCommand.match(/^\s*(npm|yarn|pnpm|bun|npx|bunx|pnpx)\b/);

  if (!pmMatch) {
    return null;
  }

  const executable = pmMatch[1];

  // Map executables to package managers
  switch (executable) {
    case 'npm':
    case 'npx':
      return 'npm';
    case 'yarn':
      return 'yarn';
    case 'pnpm':
    case 'pnpx':
      return 'pnpm';
    case 'bun':
    case 'bunx':
      return 'bun';
    default:
      return null;
  }
}

/**
 * Generate error message for package manager mismatch
 * @param usedPm - Package manager used in command
 * @param correctPm - Correct package manager based on lockfile
 * @param command - Original command
 * @returns Formatted error message
 */
function createPackageManagerErrorMessage(
  usedPm: string,
  correctPm: string,
  command: string
): string {
  const pmNames: Record<string, string> = {
    npm: 'npm',
    yarn: 'Yarn',
    pnpm: 'pnpm',
    bun: 'Bun',
  };

  const lockfiles: Record<string, string> = {
    npm: 'package-lock.json',
    yarn: 'yarn.lock',
    pnpm: 'pnpm-lock.yaml',
    bun: 'bun.lockb',
  };

  // Generate corrected command
  let correctedCommand = command;
  if (usedPm === 'npm') {
    correctedCommand = command.replace(/^\s*(npm|npx)\b/, correctPm);
  } else if (usedPm === 'yarn') {
    correctedCommand = command.replace(/^\s*yarn\b/, correctPm);
  } else if (usedPm === 'pnpm') {
    correctedCommand = command.replace(/^\s*(pnpm|pnpx)\b/, correctPm);
  } else if (usedPm === 'bun') {
    correctedCommand = command.replace(/^\s*(bun|bunx)\b/, correctPm);
  }

  return `❌ Wrong package manager detected

This project uses ${pmNames[correctPm]} (detected from ${lockfiles[correctPm]}).

You attempted to use: ${usedPm}
Correct package manager: ${correctPm}

Please use ${correctPm} commands instead. For example:
- Instead of: ${command}
- Use: ${correctedCommand}

Consistent package manager usage ensures:
- Reproducible dependency resolution
- Correct lockfile updates
- Consistent CI/CD behavior`;
}

/**
 * PreToolUse hook handler
 */
async function handler(input: PreToolUseInput): Promise<PreToolUseHookOutput> {
  // Only process Bash commands
  if (input.tool_name !== 'Bash') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  const toolInput = input.tool_input as { command?: string };
  const command = toolInput.command;

  // Early return if no command
  if (!command) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  // Extract package manager from command
  const usedPm = extractPackageManagerFromCommand(command);

  // Allow if not a package manager command
  if (!usedPm) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  // Allow any package manager if no lockfile exists
  if (!hasLockfile(input.cwd)) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  // Detect correct package manager from lockfiles
  const correctPm = detectPackageManager(input.cwd);

  // Allow if package managers match
  if (usedPm === correctPm) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  // Block with error message
  const errorMessage = createPackageManagerErrorMessage(usedPm, correctPm, command);

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: errorMessage,
    },
  };
}

export { handler };
runHook(handler);
