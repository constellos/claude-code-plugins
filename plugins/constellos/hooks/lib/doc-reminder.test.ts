/**
 * Tests for the docs-as-artifacts reminder path logic
 */

import { describe, it, expect } from 'vitest';
import { hasDocChange, isWatchedPath, packageOf } from './doc-reminder.js';

describe('isWatchedPath', () => {
  it('watches services/mcp/internal', () => {
    expect(isWatchedPath('services/mcp/internal/reviewapi/handler.go')).toBe(true);
  });

  it('watches apps/web/src', () => {
    expect(isWatchedPath('apps/web/src/lib/webhooks/shared/mcp-client.ts')).toBe(true);
  });

  it('ignores unwatched trees', () => {
    expect(isWatchedPath('packages/constellos/src/index.ts')).toBe(false);
  });

  it('ignores markdown files even under a watched tree', () => {
    expect(isWatchedPath('services/mcp/internal/reviewapi/README.md')).toBe(false);
  });

  it('ignores paths outside the repo', () => {
    expect(isWatchedPath('../elsewhere/services/mcp/internal/x.go')).toBe(false);
  });
});

describe('packageOf', () => {
  it('names the package under the watched prefix', () => {
    expect(packageOf('services/mcp/internal/reviewapi/handler.go')).toBe(
      'services/mcp/internal/reviewapi'
    );
  });

  it('falls back to the directory for a file directly under the prefix', () => {
    expect(packageOf('apps/web/src/page.tsx')).toBe('apps/web/src');
  });
});

describe('hasDocChange', () => {
  const edited = 'services/mcp/internal/reviewapi/handler.go';

  it('is satisfied by a docs/specs change', () => {
    expect(hasDocChange(['docs/specs/2026-09-03-x.md'], edited)).toBe(true);
  });

  it('is satisfied by a .constellos/docs change', () => {
    expect(hasDocChange(['.constellos/docs/review.md'], edited)).toBe(true);
  });

  it('is satisfied by a sibling markdown file', () => {
    expect(hasDocChange(['services/mcp/internal/reviewapi/doc.md'], edited)).toBe(true);
  });

  it('is not satisfied by a non-sibling markdown file', () => {
    expect(hasDocChange(['services/mcp/internal/other/doc.md'], edited)).toBe(false);
  });

  it('is not satisfied by unrelated changes', () => {
    expect(hasDocChange(['services/mcp/internal/reviewapi/handler.go'], edited)).toBe(false);
  });
});
