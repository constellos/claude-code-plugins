/**
 * Configuration resolution for the Constellos harness hooks
 *
 * Resolves the Constellos server URL and space slug for the current session.
 * The server URL is always reduced to the bare origin: the constellos CLI keys
 * its token directory on a hash of the bare URL, so passing a path suffix like
 * `/mcp` would look up a different (empty) token directory than `constellos auth`
 * wrote.
 *
 * @module config
 */

import * as fs from 'fs';
import * as path from 'path';

/** Default Constellos server origin (bare - never a path suffix) */
export const DEFAULT_SERVER_URL = 'https://mcp.constellos.ai';

/** Resolved harness configuration for one hook invocation */
export interface HarnessConfig {
  /** Bare server origin, e.g. https://mcp.constellos.ai */
  serverUrl: string;
  /** Space slug to scope calls to, or null to let the server use the user's default */
  space: string | null;
}

/**
 * Reduce a URL to its bare origin (scheme + host + port)
 *
 * @param url - Any URL string; may carry a path or query
 * @returns The origin, or the input unchanged if it does not parse as a URL
 */
export function bareOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

/**
 * Extract the Constellos `?space=` slug from a `.mcp.json` document
 *
 * Scans `mcpServers` entries for an http(s) server whose URL points at a
 * Constellos host and carries a `space` query parameter.
 *
 * @param json - Raw contents of a .mcp.json file
 * @returns The space slug, or null when none is declared
 */
export function parseSpaceFromMcpJson(json: string): string | null {
  try {
    const parsed = JSON.parse(json) as {
      mcpServers?: Record<string, { url?: string }>;
    };
    for (const server of Object.values(parsed.mcpServers ?? {})) {
      if (typeof server?.url !== 'string') continue;
      let url: URL;
      try {
        url = new URL(server.url);
      } catch {
        continue;
      }
      const space = url.searchParams.get('space');
      if (space && url.hostname.includes('constellos')) {
        return space;
      }
    }
  } catch {
    // Malformed .mcp.json - treat as absent
  }
  return null;
}

/**
 * Resolve the harness configuration for the current session
 *
 * Server URL: `CONSTELLOS_SERVER_URL` env, else the default origin - always
 * bared. Space: `CONSTELLOS_SPACE` env, else the `?space=` parameter of a
 * Constellos server in `<cwd>/.mcp.json`, else null (server-side default).
 *
 * @param cwd - The session's working directory
 * @returns The resolved configuration
 */
export function resolveConfig(cwd: string): HarnessConfig {
  const serverUrl = bareOrigin(process.env.CONSTELLOS_SERVER_URL || DEFAULT_SERVER_URL);

  let space: string | null = process.env.CONSTELLOS_SPACE || null;
  if (!space) {
    try {
      const raw = fs.readFileSync(path.join(cwd, '.mcp.json'), 'utf8');
      space = parseSpaceFromMcpJson(raw);
    } catch {
      // No .mcp.json - fall through to null
    }
  }

  return { serverUrl, space };
}
