/**
 * Format utility function tests
 */

import { describe, it, expect } from 'bun:test';
import {
  isMarkdownFile,
  parseHeading,
  parseAllHeadings,
  matchesPattern,
  getPatternDescription,
  buildHeadingPath,
  extractHeadingLinkText,
} from '../format/utils.js';

describe('isMarkdownFile', () => {
  it('should return true for .md files', () => {
    expect(isMarkdownFile('README.md')).toBe(true);
    expect(isMarkdownFile('CLAUDE.md')).toBe(true);
    expect(isMarkdownFile('docs/guide.md')).toBe(true);
    expect(isMarkdownFile('/path/to/file.md')).toBe(true);
  });

  it('should return false for non-markdown files', () => {
    expect(isMarkdownFile('file.ts')).toBe(false);
    expect(isMarkdownFile('file.js')).toBe(false);
    expect(isMarkdownFile('file.txt')).toBe(false);
    expect(isMarkdownFile('file.mdx')).toBe(false);
  });

  it('should be case-sensitive', () => {
    expect(isMarkdownFile('file.MD')).toBe(false);
    expect(isMarkdownFile('file.Md')).toBe(false);
  });

  it('should handle edge cases', () => {
    expect(isMarkdownFile('.md')).toBe(true);
    expect(isMarkdownFile('')).toBe(false);
    expect(isMarkdownFile('md')).toBe(false);
  });
});

describe('parseHeading', () => {
  it('should parse h1 headings', () => {
    expect(parseHeading('# Title')).toEqual({ level: 1, text: 'Title' });
  });

  it('should parse h2 headings', () => {
    expect(parseHeading('## Section')).toEqual({ level: 2, text: 'Section' });
  });

  it('should parse h3 through h6 headings', () => {
    expect(parseHeading('### Level 3')).toEqual({ level: 3, text: 'Level 3' });
    expect(parseHeading('#### Level 4')).toEqual({ level: 4, text: 'Level 4' });
    expect(parseHeading('##### Level 5')).toEqual({ level: 5, text: 'Level 5' });
    expect(parseHeading('###### Level 6')).toEqual({ level: 6, text: 'Level 6' });
  });

  it('should trim heading text', () => {
    expect(parseHeading('## Section   ')).toEqual({ level: 2, text: 'Section' });
    expect(parseHeading('##  Multiple Words  ')).toEqual({ level: 2, text: 'Multiple Words' });
  });

  it('should return null for non-headings', () => {
    expect(parseHeading('Not a heading')).toBeNull();
    expect(parseHeading('')).toBeNull();
    expect(parseHeading('##NoSpace')).toBeNull();
    expect(parseHeading('#')).toBeNull();
    expect(parseHeading('# ')).toBeNull();
  });

  it('should return null for headings beyond h6', () => {
    expect(parseHeading('####### Too many')).toBeNull();
  });
});

describe('parseAllHeadings', () => {
  it('should parse all headings from content', () => {
    const content = `# Title

Some text here.

## Section 1

More text.

### Subsection 1.1

## Section 2
`;

    const headings = parseAllHeadings(content);
    expect(headings).toEqual([
      { level: 1, text: 'Title', lineNumber: 1 },
      { level: 2, text: 'Section 1', lineNumber: 5 },
      { level: 3, text: 'Subsection 1.1', lineNumber: 9 },
      { level: 2, text: 'Section 2', lineNumber: 11 },
    ]);
  });

  it('should return empty array for no headings', () => {
    const content = `Just some text.
No headings here.`;

    expect(parseAllHeadings(content)).toEqual([]);
  });

  it('should handle empty content', () => {
    expect(parseAllHeadings('')).toEqual([]);
  });
});

describe('matchesPattern', () => {
  describe('wildcard pattern', () => {
    it('should match any heading with *', () => {
      expect(matchesPattern('Overview', '*')).toBe(true);
      expect(matchesPattern('Anything', '*')).toBe(true);
      expect(matchesPattern('', '*')).toBe(true);
    });
  });

  describe('exact match pattern', () => {
    it('should match exact text', () => {
      expect(matchesPattern('Overview', 'Overview')).toBe(true);
      expect(matchesPattern('Getting Started', 'Getting Started')).toBe(true);
    });

    it('should not match different text', () => {
      expect(matchesPattern('Overview', 'Introduction')).toBe(false);
      expect(matchesPattern('Overview', 'overview')).toBe(false); // case-sensitive
    });
  });

  describe('prefix pattern', () => {
    it('should match headings starting with prefix', () => {
      expect(matchesPattern('Phase 1', 'Phase *')).toBe(true);
      expect(matchesPattern('Phase 2: Implementation', 'Phase *')).toBe(true);
      // Note: 'Phase' matches 'Phase *' because startsWith('Phase') is true
      expect(matchesPattern('Phase', 'Phase *')).toBe(true);
    });

    it('should not match non-matching prefixes', () => {
      expect(matchesPattern('Step 1', 'Phase *')).toBe(false);
      expect(matchesPattern('APhase 1', 'Phase *')).toBe(false);
    });
  });

  describe('alternative patterns (pipe-separated)', () => {
    it('should match any alternative', () => {
      expect(matchesPattern('Overview', 'Overview|Introduction')).toBe(true);
      expect(matchesPattern('Introduction', 'Overview|Introduction')).toBe(true);
    });

    it('should not match if no alternative matches', () => {
      expect(matchesPattern('Summary', 'Overview|Introduction')).toBe(false);
    });

    it('should work with prefix patterns in alternatives', () => {
      expect(matchesPattern('Phase 1', 'Phase *|Step *')).toBe(true);
      expect(matchesPattern('Step 2', 'Phase *|Step *')).toBe(true);
      expect(matchesPattern('Task 1', 'Phase *|Step *')).toBe(false);
    });

    it('should handle spaces around pipes', () => {
      expect(matchesPattern('Overview', 'Overview | Introduction')).toBe(true);
      expect(matchesPattern('Introduction', 'Overview | Introduction')).toBe(true);
    });
  });
});

describe('getPatternDescription', () => {
  it('should describe wildcard pattern', () => {
    expect(getPatternDescription('*')).toBe('any heading');
  });

  it('should describe prefix pattern', () => {
    expect(getPatternDescription('Phase *')).toBe('heading starting with "Phase"');
  });

  it('should describe alternative patterns', () => {
    expect(getPatternDescription('A|B|C')).toBe('one of: A, B, C');
  });

  it('should describe exact match pattern', () => {
    expect(getPatternDescription('Overview')).toBe('"Overview"');
  });
});

describe('buildHeadingPath', () => {
  it('should join path elements with separator', () => {
    expect(buildHeadingPath(['Title', 'Section', 'Subsection'])).toBe('Title > Section > Subsection');
  });

  it('should handle single element', () => {
    expect(buildHeadingPath(['Title'])).toBe('Title');
  });

  it('should handle empty array', () => {
    expect(buildHeadingPath([])).toBe('');
  });
});

describe('extractHeadingLinkText', () => {
  it('should extract link text and URL from markdown link', () => {
    const result = extractHeadingLinkText('[Create a custom style](https://example.com/docs)');

    expect(result).toEqual({
      linkText: 'Create a custom style',
      url: 'https://example.com/docs',
    });
  });

  it('should handle relative URLs', () => {
    const result = extractHeadingLinkText('[Guide](/docs/guide.md)');

    expect(result).toEqual({
      linkText: 'Guide',
      url: '/docs/guide.md',
    });
  });

  it('should return null for non-link headings', () => {
    expect(extractHeadingLinkText('Just a heading')).toBeNull();
    expect(extractHeadingLinkText('')).toBeNull();
  });

  it('should return null for malformed links', () => {
    expect(extractHeadingLinkText('[Missing paren')).toBeNull();
    expect(extractHeadingLinkText('(Missing bracket)')).toBeNull();
    // Empty URL in parentheses doesn't match the regex
    expect(extractHeadingLinkText('[text]()')).toBeNull();
  });
});
