/**
 * Next.js 16+ Proxy Migration Hook
 * PreToolUse[Write|Edit] hook that blocks middleware.ts creation in Next.js 16+ projects
 * Next.js 16 requires proxy.ts instead of middleware.ts
 * Exception: Allows middleware.ts in supabase folders
 * @module use-proxy-nextjs-16
 */

import type { PreToolUseInput, PreToolUseHookOutput } from '../shared/types/types.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { basename, normalize } from 'path';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Detect Next.js major version from package.json
 * @param cwd - Current working directory
 * @returns Major version number or null if not found
 */
function getNextJsVersion(cwd: string): number | null {
  const packageJsonPath = join(cwd, 'package.json');

  if (!existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const nextVersion = packageJson.dependencies?.next || packageJson.devDependencies?.next;

    if (!nextVersion) {
      return null;
    }

    // Extract major version from strings like "^16.0.0", "~16.1.0", "16.0.0", ">=16.0.0"
    const versionMatch = nextVersion.match(/(\d+)/);
    return versionMatch ? parseInt(versionMatch[1], 10) : null;
  } catch {
    return null;
  }
}

/**
 * Check if file path is in a supabase folder
 * @param filePath - Path to check
 * @returns True if path contains /supabase/ or \supabase\
 */
function isSupabaseRelated(filePath: string): boolean {
  const normalizedPath = normalize(filePath).toLowerCase();
  return normalizedPath.includes('/supabase/') || normalizedPath.includes('\\supabase\\');
}

/**
 * PreToolUse hook handler
 */
async function handler(input: PreToolUseInput): Promise<PreToolUseHookOutput> {
  // Only process Write and Edit operations
  if (input.tool_name !== 'Write' && input.tool_name !== 'Edit') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  const toolInput = input.tool_input as { file_path?: string };
  const filePath = toolInput.file_path;

  // Early return if no file path
  if (!filePath) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  const fileName = basename(filePath);

  // Only check middleware.ts files
  if (fileName.toLowerCase() !== 'middleware.ts') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  // Allow middleware.ts in supabase folders
  if (isSupabaseRelated(filePath)) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  // Check Next.js version
  const nextVersion = getNextJsVersion(input.cwd);

  // Allow if Next.js version is less than 16 or not found
  if (nextVersion === null || nextVersion < 16) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  // Block middleware.ts creation in Next.js 16+
  const errorMessage = `❌ middleware.ts is deprecated in Next.js 16+

Next.js 16 requires using proxy.ts instead of middleware.ts for routing middleware.

Please:
1. Rename this file to proxy.ts
2. Update your configuration to use the new proxy API

Learn more: https://nextjs.org/docs/app/api-reference/file-conventions/proxy.md

Note: Supabase middleware files are exempt from this check.`;

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
