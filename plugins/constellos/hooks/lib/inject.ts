/**
 * Objective-context extraction for prompt injection (UserPromptSubmit hook)
 *
 * The injection is the point of the harness: the addressed objective's
 * residual and surrounding beliefs, printed into every prompt - the same
 * context the web agent gets from its system prompt. The entity shape varies
 * by server version, so extraction reads only the fields it knows and
 * degrades to nothing.
 *
 * @module inject
 */

/** Injection cap from the spec: "the residual and beliefs, <= ~40 lines" */
export const MAX_INJECT_LINES = 40;

/**
 * Pull the injectable lines out of an objective entity payload
 *
 * Reads `residual`, `matchExpression` (either spelling), and a name/title
 * wherever they sit - top-level or under `spec` - and ignores everything else.
 *
 * @param payload - The `get` tool's payload for the objective
 * @param objectivePath - The objective's path, used as the heading
 * @returns Context lines, empty when nothing recognizable was found
 */
export function extractObjectiveContext(payload: unknown, objectivePath: string): string[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const obj = payload as Record<string, unknown>;
  const spec = (typeof obj.spec === 'object' && obj.spec !== null ? obj.spec : {}) as Record<
    string,
    unknown
  >;
  const pick = (key: string): string | null => {
    for (const source of [obj, spec]) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  };

  const lines: string[] = [];
  const name = pick('name') ?? pick('title');
  lines.push(`Objective ${objectivePath}${name ? ` (${name})` : ''}:`);
  const residual = pick('residual');
  if (residual) lines.push(`residual: ${residual}`);
  const match = pick('matchExpression') ?? pick('match_expression');
  if (match) lines.push(`matchExpression: ${match}`);
  return lines.length > 1 ? lines : [];
}
