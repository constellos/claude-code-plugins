/**
 * Supabase Environment Variable Validation Hook
 * PreToolUse[Write|Edit] hook that blocks deprecated Supabase env var names
 * and incorrect prefixes in .env.local and dev.vars files
 * @module validate-supabase-env
 */

import type { PreToolUseInput, PreToolUseHookOutput } from '../shared/types/types.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { basename } from 'path';

/**
 * PreToolUse hook handler
 */
async function handler(input: PreToolUseInput): Promise<PreToolUseHookOutput> {
  if (input.tool_name !== 'Write' && input.tool_name !== 'Edit') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  const toolInput = input.tool_input as {
    file_path?: string;
    content?: string;
    new_string?: string;
  };

  const filePath = toolInput.file_path;
  if (!filePath) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  const fileName = basename(filePath);

  if (fileName !== '.env.local' && fileName !== 'dev.vars') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  const content = input.tool_name === 'Write' ? toolInput.content : toolInput.new_string;

  if (!content) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  const errors: string[] = [];

  if (fileName === '.env.local') {
    // Check for deprecated names
    if (/SUPABASE_ANON_KEY/m.test(content)) {
      errors.push(
        '❌ SUPABASE_ANON_KEY is deprecated. Use NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY instead.'
      );
    }
    if (/SUPABASE_SERVICE_ROLE_KEY/m.test(content)) {
      errors.push('❌ SUPABASE_SERVICE_ROLE_KEY is deprecated. Use SUPABASE_SECRET_KEY instead.');
    }
    // Check for missing NEXT_PUBLIC_ prefix
    if (/^SUPABASE_URL=/m.test(content)) {
      errors.push('❌ In .env.local, use NEXT_PUBLIC_SUPABASE_URL (not SUPABASE_URL).');
    }
    if (/^SUPABASE_PUBLISHABLE_KEY=/m.test(content)) {
      errors.push(
        '❌ In .env.local, use NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (not SUPABASE_PUBLISHABLE_KEY).'
      );
    }
  } else if (fileName === 'dev.vars') {
    // Check for deprecated names
    if (/SUPABASE_ANON_KEY/m.test(content)) {
      errors.push('❌ SUPABASE_ANON_KEY is deprecated. Use SUPABASE_PUBLISHABLE_KEY instead.');
    }
    if (/SUPABASE_SERVICE_ROLE_KEY/m.test(content)) {
      errors.push('❌ SUPABASE_SERVICE_ROLE_KEY is deprecated. Use SUPABASE_SECRET_KEY instead.');
    }
    // Check for incorrect NEXT_PUBLIC_ prefix
    if (/NEXT_PUBLIC_/m.test(content)) {
      errors.push(
        '❌ In dev.vars (Cloudflare), do not use NEXT_PUBLIC_ prefix. Use plain SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.'
      );
    }
  }

  if (errors.length > 0) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Invalid Supabase environment variables in ${fileName}:\n\n${errors.join('\n')}\n\nPlease use the modern variable names with correct prefixes.`,
      },
    };
  }

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  };
}

export { handler };
runHook(handler);
