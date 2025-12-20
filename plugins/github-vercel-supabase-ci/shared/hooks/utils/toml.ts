/**
 * Simple TOML parser for constellos.toml configuration files
 *
 * Supports basic TOML features needed for plugin configuration:
 * - Key-value pairs (strings, numbers, booleans)
 * - Arrays
 * - Tables (sections)
 *
 * @module toml
 */

export interface TomlValue {
  [key: string]: string | number | boolean | string[] | TomlValue;
}

/**
 * Parse a TOML string into a JavaScript object
 *
 * @param content - The TOML string to parse
 * @returns Parsed object
 */
export function parseToml(content: string): TomlValue {
  const result: TomlValue = {};
  let currentSection: TomlValue = result;
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }

    // Handle table headers [section] or [section.subsection]
    if (line.startsWith('[') && line.endsWith(']')) {
      const sectionPath = line.slice(1, -1).trim();
      currentSection = result;

      for (const part of sectionPath.split('.')) {
        if (!(part in currentSection)) {
          currentSection[part] = {};
        }
        currentSection = currentSection[part] as TomlValue;
      }
      continue;
    }

    // Handle key-value pairs
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();

    // Parse the value
    currentSection[key] = parseValue(value, lines, i);
  }

  return result;
}

/**
 * Parse a TOML value
 */
function parseValue(value: string, lines: string[], lineIndex: number): string | number | boolean | string[] {
  // Handle multiline arrays
  if (value === '[' || value.startsWith('[') && !value.endsWith(']')) {
    return parseMultilineArray(value, lines, lineIndex);
  }

  // Handle inline arrays
  if (value.startsWith('[') && value.endsWith(']')) {
    return parseInlineArray(value);
  }

  // Handle strings
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  // Handle booleans
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Handle numbers
  const num = Number(value);
  if (!isNaN(num)) return num;

  // Return as string if nothing else matches
  return value;
}

/**
 * Parse an inline array like [1, 2, 3] or ["a", "b", "c"]
 */
function parseInlineArray(value: string): string[] {
  const inner = value.slice(1, -1).trim();
  if (!inner) return [];

  const items: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (const char of inner) {
    if ((char === '"' || char === "'") && !inQuote) {
      inQuote = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuote) {
      inQuote = false;
      quoteChar = '';
    } else if (char === ',' && !inQuote) {
      const trimmed = current.trim();
      if (trimmed) {
        items.push(trimmed.replace(/^["']|["']$/g, ''));
      }
      current = '';
    } else {
      current += char;
    }
  }

  const trimmed = current.trim();
  if (trimmed) {
    items.push(trimmed.replace(/^["']|["']$/g, ''));
  }

  return items;
}

/**
 * Parse a multiline array
 */
function parseMultilineArray(startValue: string, lines: string[], startIndex: number): string[] {
  const items: string[] = [];
  let content = startValue;

  // Collect lines until we find the closing bracket
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (i > startIndex) {
      content += ' ' + line;
    }
    if (line.includes(']')) {
      break;
    }
  }

  // Now parse as inline array
  const match = content.match(/\[([\s\S]*)\]/);
  if (match) {
    return parseInlineArray('[' + match[1] + ']');
  }

  return items;
}

/**
 * Read and parse a TOML file
 *
 * @param filePath - Path to the TOML file
 * @returns Parsed object or null if file doesn't exist
 */
export async function readTomlFile(filePath: string): Promise<TomlValue | null> {
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');
    return parseToml(content);
  } catch {
    return null;
  }
}
