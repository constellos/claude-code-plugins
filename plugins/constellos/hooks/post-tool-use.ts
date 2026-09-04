/**
 * PostToolUse hook (Write|Edit): docs-as-artifacts reminder
 *
 * Purely local - no network. When an edit lands under a watched source tree
 * (`services/mcp/internal/**` or `apps/web/src/**`) and the working tree
 * shows no change under `docs/specs/**`, `.constellos/docs/**`, or a sibling
 * `*.md`, this emits a reminder as additional context. It cannot block -
 * the spec explicitly rejects a blocking docs hook.
 */

import { spawnSync } from 'child_process';
import * as path from 'path';
import type {
  PostToolUseHookOutput,
  PostToolUseInputFor,
} from '../shared/types/types.js';
import { runHook } from '../shared/hooks/utils/io.js';
import { hasDocChange, isWatchedPath, packageOf } from './lib/doc-reminder.js';

function gitLines(cwd: string, args: string[]): string[] | null {
  const proc = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 5_000 });
  if (proc.status !== 0) return null;
  return proc.stdout.split('\n').filter(Boolean);
}

async function handler(
  input: PostToolUseInputFor<'Write' | 'Edit'>
): Promise<PostToolUseHookOutput> {
  try {
    const filePath = input.tool_input?.file_path;
    if (typeof filePath !== 'string' || !filePath) return {};

    const rel = path.isAbsolute(filePath)
      ? path.relative(input.cwd, filePath).split(path.sep).join('/')
      : filePath.split(path.sep).join('/');
    if (!isWatchedPath(rel)) return {};

    // Tracked changes vs HEAD plus untracked files; a git failure (not a
    // repo, no HEAD yet) means no basis for a reminder.
    const diffed = gitLines(input.cwd, ['diff', '--name-only', 'HEAD']);
    const untracked = gitLines(input.cwd, ['ls-files', '--others', '--exclude-standard']);
    if (diffed === null || untracked === null) return {};
    if (hasDocChange([...diffed, ...untracked], rel)) return {};

    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext:
          `This edit touched \`${packageOf(rel)}\`; no doc or spec changed in the working tree ` +
          `(docs/specs/**, .constellos/docs/**, or a sibling *.md). Update the nearest doc or ` +
          `say why not.`,
      },
    };
  } catch (error) {
    console.error(
      `constellos harness: ${error instanceof Error ? error.message : String(error)}`
    );
    return {};
  }
}

export { handler };

runHook(handler);
