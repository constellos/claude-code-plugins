/**
 * Tests for objective-context extraction
 */

import { describe, it, expect } from 'vitest';
import { extractObjectiveContext } from './inject.js';

describe('extractObjectiveContext', () => {
  it('reads residual and matchExpression from the top level', () => {
    const lines = extractObjectiveContext(
      { name: 'Code quality', residual: 'tighten error paths', matchExpression: 'kind=code' },
      'objectives/code-quality'
    );
    expect(lines[0]).toContain('objectives/code-quality');
    expect(lines[0]).toContain('Code quality');
    expect(lines).toContain('residual: tighten error paths');
    expect(lines).toContain('matchExpression: kind=code');
  });

  it('reads fields nested under spec, either spelling', () => {
    const lines = extractObjectiveContext(
      { spec: { residual: 'r', match_expression: 'm' } },
      'objectives/x'
    );
    expect(lines).toContain('residual: r');
    expect(lines).toContain('matchExpression: m');
  });

  it('returns nothing when no recognizable field is present', () => {
    expect(extractObjectiveContext({ irrelevant: true }, 'objectives/x')).toEqual([]);
    expect(extractObjectiveContext(null, 'objectives/x')).toEqual([]);
    expect(extractObjectiveContext('a string', 'objectives/x')).toEqual([]);
  });
});
