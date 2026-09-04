/**
 * Pure path logic for the docs-as-artifacts reminder (PostToolUse hook)
 *
 * Decides when an edit under a watched source tree warrants a reminder that
 * no doc or spec changed alongside it. Kept free of I/O so it is unit-testable;
 * the hook supplies the git working-tree state.
 *
 * @module doc-reminder
 */

import * as path from 'path';

/** Source trees whose edits warrant a doc reminder */
export const WATCHED_PREFIXES = ['services/mcp/internal/', 'apps/web/src/'];

/**
 * Is this repo-relative path inside a watched source tree?
 *
 * Markdown files are exempt - editing a doc is never grounds for a doc
 * reminder.
 *
 * @param rel - Repo-relative path with forward slashes
 * @returns true when a reminder may apply to this edit
 */
export function isWatchedPath(rel: string): boolean {
  return (
    !rel.startsWith('..') &&
    !rel.endsWith('.md') &&
    WATCHED_PREFIXES.some((prefix) => rel.startsWith(prefix))
  );
}

/**
 * Package label for the reminder, e.g. `services/mcp/internal/reviewapi`
 *
 * @param rel - Repo-relative path of the edited file
 * @returns The watched prefix plus its next path segment
 */
export function packageOf(rel: string): string {
  const prefix = WATCHED_PREFIXES.find((p) => rel.startsWith(p));
  if (!prefix) return path.posix.dirname(rel);
  const rest = rel.slice(prefix.length);
  const segment = rest.split('/')[0];
  return segment && rest.includes('/') ? prefix + segment : path.posix.dirname(rel);
}

/**
 * Does any working-tree change satisfy the doc requirement for this edit?
 *
 * Satisfied by a change under `docs/specs/`, `.constellos/docs/`, or a
 * markdown file sitting beside the edited source file.
 *
 * @param changed - Repo-relative changed paths (tracked diffs + untracked files)
 * @param editedRel - Repo-relative path of the edited source file
 * @returns true when a doc/spec change accompanies the edit
 */
export function hasDocChange(changed: string[], editedRel: string): boolean {
  const editedDir = path.posix.dirname(editedRel);
  return changed.some(
    (p) =>
      p.startsWith('docs/specs/') ||
      p.startsWith('.constellos/docs/') ||
      (p.endsWith('.md') && path.posix.dirname(p) === editedDir)
  );
}
