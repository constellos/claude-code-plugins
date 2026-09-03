/**
 * Tests for the CLI transport
 *
 * Pure functions are tested directly; callTool/sendThreadMessage run against
 * a generated fake CLI (a node script written to a temp dir and pointed at
 * via CONSTELLOS_CLI) so the full spawn/parse/unwrap path is exercised
 * without a network.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  callTool,
  looksLikeRoleUnsupported,
  resolveCli,
  sendThreadMessage,
  unwrapToolResult,
  type CallOptions,
} from './transport.js';

describe('unwrapToolResult', () => {
  it('prefers structuredContent', () => {
    expect(unwrapToolResult({ structuredContent: { thread: 't' }, content: [] })).toEqual({
      thread: 't',
    });
  });

  it('parses JSON out of content[0].text', () => {
    const envelope = { content: [{ type: 'text', text: '{"recorded":true,"thread":"abc"}' }] };
    expect(unwrapToolResult(envelope)).toEqual({ recorded: true, thread: 'abc' });
  });

  it('wraps non-JSON text', () => {
    expect(unwrapToolResult({ content: [{ type: 'text', text: 'plain' }] })).toEqual({
      text: 'plain',
    });
  });

  it('passes through already-flat payloads', () => {
    expect(unwrapToolResult({ thread: 'x' })).toEqual({ thread: 'x' });
  });
});

describe('looksLikeRoleUnsupported', () => {
  it('matches an unknown-argument rejection naming role', () => {
    expect(looksLikeRoleUnsupported('Error: unknown argument "role"')).toBe(true);
    expect(looksLikeRoleUnsupported('additionalProperties: role is not allowed')).toBe(true);
  });

  it('does not match unrelated failures', () => {
    expect(looksLikeRoleUnsupported('Not authenticated. Run `constellos auth` first.')).toBe(false);
    expect(looksLikeRoleUnsupported('unknown argument "thread"')).toBe(false);
  });
});

describe('against a fake CLI', () => {
  let dir: string;
  let fakeCli: string;
  let opts: CallOptions;
  const envBackup: Record<string, string | undefined> = {};

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'constellos-fake-cli-'));
    fakeCli = path.join(dir, 'fake-cli.mjs');
    // Mimics the real CLI's surface: `<tool> --flag value ...` in, one JSON
    // MCP result envelope out. FAKE_CLI_NO_ROLE simulates a pre-PR-B server
    // refusing the role argument.
    fs.writeFileSync(
      fakeCli,
      `const args = process.argv.slice(2);
const tool = args[0];
const flags = {};
for (let i = 1; i < args.length; i += 2) flags[args[i].replace(/^--/, '')] = args[i + 1];
if (tool === 'message') {
  if (flags.role && process.env.FAKE_CLI_NO_ROLE) {
    console.error('tool error: unknown argument "role"');
    process.exit(1);
  }
  const thread = flags.thread || 'minted-thread';
  const body = JSON.stringify({ recorded: true, thread, seq: 1, path: 'messages/' + thread + '/1' });
  console.log(JSON.stringify({ content: [{ type: 'text', text: body }] }));
} else if (tool === 'get') {
  console.log(JSON.stringify({ structuredContent: { residual: 'r', matchExpression: 'm' } }));
} else {
  console.error('unknown tool ' + tool);
  process.exit(1);
}
`
    );
    envBackup.CONSTELLOS_CLI = process.env.CONSTELLOS_CLI;
    process.env.CONSTELLOS_CLI = fakeCli;
    opts = { cwd: dir, serverUrl: 'https://mcp.constellos.ai', space: 'constellos' };
  });

  afterAll(() => {
    if (envBackup.CONSTELLOS_CLI === undefined) delete process.env.CONSTELLOS_CLI;
    else process.env.CONSTELLOS_CLI = envBackup.CONSTELLOS_CLI;
    delete process.env.FAKE_CLI_NO_ROLE;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolveCli honors CONSTELLOS_CLI and runs scripts through node', () => {
    expect(resolveCli(dir)).toEqual(['node', fakeCli]);
  });

  it('mints a thread through message with an empty --thread', () => {
    const cli = resolveCli(dir)!;
    const sent = sendThreadMessage(cli, { thread: '', message: 'first turn' }, opts);
    expect(sent).toMatchObject({ ok: true, thread: 'minted-thread', seq: 1 });
  });

  it('records to an existing thread', () => {
    const cli = resolveCli(dir)!;
    const sent = sendThreadMessage(cli, { thread: 'existing', message: 'hi' }, opts);
    expect(sent).toMatchObject({ ok: true, thread: 'existing', path: 'messages/existing/1' });
  });

  it('flags roleUnsupported when the server rejects --role', () => {
    process.env.FAKE_CLI_NO_ROLE = '1';
    const cli = resolveCli(dir)!;
    const sent = sendThreadMessage(
      cli,
      { thread: 'existing', message: 'reply', role: 'assistant' },
      opts
    );
    delete process.env.FAKE_CLI_NO_ROLE;
    expect(sent).toMatchObject({ ok: false, roleUnsupported: true });
  });

  it('callTool unwraps structuredContent from get', () => {
    const cli = resolveCli(dir)!;
    const got = callTool(cli, 'get', { path: 'objectives/x' }, opts);
    expect(got).toEqual({ ok: true, result: { residual: 'r', matchExpression: 'm' } });
  });

  it('degrades to ok:false when the CLI is missing', () => {
    const got = callTool(['node', path.join(dir, 'missing.mjs')], 'get', { path: 'x' }, opts);
    expect(got.ok).toBe(false);
  });
});
