/**
 * Tests for objective-context extraction
 */

import { describe, it, expect } from 'vitest';
import { extractObjectiveContext, pickAddressingObjective } from './inject.js';

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

describe('pickAddressingObjective', () => {
  const incoming = (edges: Array<{ relation: string; path: string }>) => ({
    metadata: { relations: { incoming: edges } },
  });

  it('picks the objective on the addressedBy edge', () => {
    expect(
      pickAddressingObjective(
        incoming([
          { relation: 'ownedBy', path: 'people/dev' },
          { relation: 'addressedBy', path: 'objectives/ship-it' },
        ])
      )
    ).toBe('objectives/ship-it');
  });

  it('prefers addressedBy over another objective-shaped edge', () => {
    expect(
      pickAddressingObjective(
        incoming([
          { relation: 'referencedBy', path: 'objectives/nearby' },
          { relation: 'addressedBy', path: 'objectives/ship-it' },
        ])
      )
    ).toBe('objectives/ship-it');
  });

  it('ignores endpoints that are not objectives', () => {
    expect(
      pickAddressingObjective(
        incoming([
          { relation: 'addressedBy', path: 'tasks/do-the-thing' },
          { relation: 'ownedBy', path: 'people/dev' },
        ])
      )
    ).toBeNull();
  });

  it('reads relations at the top level too', () => {
    expect(
      pickAddressingObjective({
        relations: { incoming: [{ relation: 'addressedBy', path: 'objectives/x' }] },
      })
    ).toBe('objectives/x');
  });

  it('returns null for payloads with no incoming edges', () => {
    expect(pickAddressingObjective({ metadata: { relations: {} } })).toBeNull();
    expect(pickAddressingObjective({})).toBeNull();
    expect(pickAddressingObjective(null)).toBeNull();
    expect(pickAddressingObjective('a string')).toBeNull();
  });
});
