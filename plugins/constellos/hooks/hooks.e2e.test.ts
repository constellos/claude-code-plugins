/**
 * End-to-end tests for the four hook scripts, driven with sample stdin
 *
 * Each test spawns the real hook script the way Claude Code does - a fresh
 * process, the event JSON on stdin, the response JSON on stdout - against a
 * fake `constellos` CLI and a scratch home directory. What the hooks must
 * guarantee is exactly what is asserted here: a well-formed
 * `hookSpecificOutput` on the happy path, and on EVERY degradation (no CLI,
 * a CLI failure, a rejected argument) a clean exit with no block, because a
 * harness that can block a developer's turn on its own availability is a
 * harness nobody enables.
 *
 * The stdin payloads are the shapes MEASURED from a real session (Claude Code
 * 2.1.258, `claude --debug`) rather than the ones the spec inferred:
 * `UserPromptSubmit.prompt`, `Stop.stop_hook_active` +
 * `last_assistant_message`, `PostToolUse.tool_name`/`tool_input`/
 * `tool_response`, and the common `session_id`/`transcript_path`/`cwd`/
 * `hook_event_name`.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const HOOKS_DIR = path.dirname(fileURLToPath(import.meta.url));
const HOOK_TIMEOUT = 60_000;

const SESSION = '1cb55403-08a3-42bb-ad1b-0a337481799a';
const TRANSCRIPT = 'C:\\Users\\dev\\.claude\\projects\\repo\\1cb55403.jsonl';

let dir: string;
let home: string;
let cliLog: string;
let fakeCli: string;

/** One hook run: the JSON it printed, plus the raw process outcome */
interface HookRun {
  status: number | null;
  stdout: string;
  stderr: string;
  json: Record<string, unknown>;
}

/**
 * Spawn a hook script with sample stdin, the way Claude Code does
 *
 * @param script - Hook file name under hooks/, e.g. "stop.ts"
 * @param input - The hook event payload written to the script's stdin
 * @param env - Extra environment for the hook process
 * @returns The parsed response plus the raw process outcome
 */
function runHookScript(
  script: string,
  input: Record<string, unknown>,
  env: Record<string, string> = {}
): HookRun {
  const proc = spawnSync(process.execPath, ['--import', 'tsx', path.join(HOOKS_DIR, script)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: HOOK_TIMEOUT,
    env: {
      ...process.env,
      HOME: home,
      // os.homedir() reads USERPROFILE on Windows and ignores HOME, so a test
      // that sets only HOME writes into the developer's real home directory.
      USERPROFILE: home,
      CONSTELLOS_CLI: fakeCli,
      FAKE_CLI_LOG: cliLog,
      CONSTELLOS_SERVER_URL: 'https://mcp.example.test',
      CONSTELLOS_SPACE: 'constellos',
      CONSTELLOS_THREAD: '',
      CONSTELLOS_ROOT_OBJECTIVE: '',
      CLAUDE_ENV_FILE: '',
      ...env,
    },
  });
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(proc.stdout) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { status: proc.status, stdout: proc.stdout, stderr: proc.stderr, json };
}

/** Every argv the fake CLI has been called with since the last reset */
function cliCalls(): string[][] {
  if (!fs.existsSync(cliLog)) return [];
  return fs
    .readFileSync(cliLog, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string[]);
}

/** The context string a hook emitted, or "" when it emitted none */
function contextOf(run: HookRun): string {
  const specific = run.json.hookSpecificOutput as { additionalContext?: string } | undefined;
  return specific?.additionalContext ?? '';
}

/** Session state as the hooks left it on disk */
function stateOf(sessionId: string): Record<string, unknown> {
  const file = path.join(home, '.constellos', 'harness', 'sessions', `${sessionId}.json`);
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
}

/** SessionStart payload, measured shape (this event carries no permission_mode) */
function sessionStart(source = 'startup'): Record<string, unknown> {
  return {
    session_id: SESSION,
    transcript_path: TRANSCRIPT,
    cwd: dir,
    hook_event_name: 'SessionStart',
    source,
  };
}

/** UserPromptSubmit payload, measured shape (prompt, prompt_id, permission_mode) */
function userPromptSubmit(prompt: string): Record<string, unknown> {
  return {
    session_id: SESSION,
    transcript_path: TRANSCRIPT,
    cwd: dir,
    prompt_id: 'e4b61cb3-81f6-4c8d-b1ce-2176f39d848b',
    permission_mode: 'acceptEdits',
    hook_event_name: 'UserPromptSubmit',
    prompt,
  };
}

/** Stop payload, measured shape (stop_hook_active + last_assistant_message) */
function stop(lastAssistantMessage: string, stopHookActive = false): Record<string, unknown> {
  return {
    session_id: SESSION,
    transcript_path: TRANSCRIPT,
    cwd: dir,
    hook_event_name: 'Stop',
    stop_hook_active: stopHookActive,
    last_assistant_message: lastAssistantMessage,
  };
}

/** PostToolUse payload, measured shape (adds tool_use_id and duration_ms) */
function postToolUse(filePath: string, cwd: string): Record<string, unknown> {
  return {
    session_id: SESSION,
    transcript_path: TRANSCRIPT,
    cwd,
    permission_mode: 'acceptEdits',
    hook_event_name: 'PostToolUse',
    tool_name: 'Edit',
    tool_use_id: 'toolu_01ABC',
    duration_ms: 12,
    tool_input: { file_path: filePath },
    tool_response: { filePath, success: true },
  };
}

/**
 * Write a fake constellos CLI that logs its argv and answers from `body`
 *
 * @param body - JS source for the request handler; `tool` and `flag` are in scope
 */
function writeFakeCli(body: string): void {
  const preamble = [
    'const fs = require("fs");',
    'const argv = process.argv.slice(2);',
    'const tool = argv.find((a) => !a.startsWith("--") && a !== "");',
    'const flag = (n) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : undefined; };',
    'fs.appendFileSync(process.env.FAKE_CLI_LOG, JSON.stringify(argv) + String.fromCharCode(10));',
  ].join('\n');
  fs.writeFileSync(fakeCli, preamble + '\n' + body, 'utf8');
}

/** Mints threads, answers `get` for the thread's turn and for the objective */
const HAPPY_CLI = [
  'if (tool === "message") {',
  '  const thread = flag("thread") || "harness-session-thread";',
  '  const payload = { thread, seq: 1, path: "messages/" + thread + "/1" };',
  '  process.stdout.write(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(payload) }] }));',
  '  process.exit(0);',
  '}',
  'if (tool === "get" && String(flag("path")).startsWith("messages/")) {',
  '  process.stdout.write(JSON.stringify({ structuredContent: { metadata: { path: flag("path"), relations: { incoming: [',
  '    { relation: "ownedBy", path: "people/dev" },',
  '    { relation: "addressedBy", path: "objectives/ship-the-harness" },',
  '  ] } } } }));',
  '  process.exit(0);',
  '}',
  'if (tool === "get") {',
  '  process.stdout.write(JSON.stringify({ structuredContent: {',
  '    name: "Ship the harness",',
  '    spec: { residual: "the plugin is not enabled in the app repo", matchExpression: "kind == artifact" },',
  '  } }));',
  '  process.exit(0);',
  '}',
  'process.stderr.write("unknown tool");',
  'process.exit(1);',
].join('\n');

/** A CLI that fails every call with the given stderr line */
function failingCli(message: string): string {
  return `process.stderr.write(${JSON.stringify(message)}); process.exit(1);`;
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'constellos-hooks-'));
  home = path.join(dir, 'home');
  fs.mkdirSync(home, { recursive: true });
  cliLog = path.join(dir, 'cli.log');
  fakeCli = path.join(dir, 'fake-cli.js');
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(cliLog, { force: true });
  fs.rmSync(path.join(home, '.constellos'), { recursive: true, force: true });
  writeFakeCli(HAPPY_CLI);
});

describe('session-start.ts', () => {
  it(
    'mints a thread, caches it, and reports the harness active',
    () => {
      const run = runHookScript('session-start.ts', sessionStart('startup'));
      expect(run.status).toBe(0);
      expect(run.json.hookSpecificOutput).toMatchObject({ hookEventName: 'SessionStart' });
      expect(contextOf(run)).toContain('Constellos harness active');
      expect(contextOf(run)).toContain('messages/harness-session-thread');
      expect(contextOf(run)).toContain('in space constellos');

      // The mint is an empty --thread, with the session named in the first turn.
      const calls = cliCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].slice(0, 6)).toEqual([
        'message',
        '--space',
        'constellos',
        '--thread',
        '',
        '--message',
      ]);
      expect(calls[0][6]).toContain(SESSION);

      // The cache - not $CLAUDE_ENV_FILE - is what carries state to later hooks.
      expect(stateOf(SESSION)).toEqual({
        thread: 'harness-session-thread',
        threadPath: 'messages/harness-session-thread/1',
        space: 'constellos',
      });
    },
    HOOK_TIMEOUT
  );

  it(
    'reuses the cached thread on resume instead of minting a second one',
    () => {
      runHookScript('session-start.ts', sessionStart('startup'));
      fs.rmSync(cliLog, { force: true });

      const run = runHookScript('session-start.ts', sessionStart('resume'));
      expect(run.status).toBe(0);
      expect(contextOf(run)).toContain('resuming thread messages/harness-session-thread');
      expect(cliCalls()).toEqual([]);
    },
    HOOK_TIMEOUT
  );

  it(
    'degrades without blocking when the mint fails',
    () => {
      writeFakeCli(failingCli('Not authenticated. Run `constellos auth` first.'));
      const run = runHookScript('session-start.ts', sessionStart('startup'));
      expect(run.status).toBe(0);
      expect(contextOf(run)).toContain('Constellos harness inactive');
      expect(contextOf(run)).toContain('could not mint a thread');
      expect(contextOf(run)).toContain('Not authenticated');
      expect(run.json.decision).toBeUndefined();
      expect(stateOf(SESSION)).toEqual({});
    },
    HOOK_TIMEOUT
  );
});

describe('user-prompt-submit.ts', () => {
  it(
    'records the prompt and injects the objective found through the thread',
    () => {
      runHookScript('session-start.ts', sessionStart('startup'));
      fs.rmSync(cliLog, { force: true });

      const run = runHookScript('user-prompt-submit.ts', userPromptSubmit('Build PR-P'));
      expect(run.status).toBe(0);

      const calls = cliCalls();
      expect(calls[0]).toEqual([
        'message',
        '--space',
        'constellos',
        '--thread',
        'harness-session-thread',
        '--message',
        'Build PR-P',
      ]);
      // A prompt carries no --role: the server's default is `user`, which is
      // what a prompt is, and sending nothing works against every server.
      expect(calls[0]).not.toContain('--role');
      expect(calls[1]).toEqual([
        'get',
        '--space',
        'constellos',
        '--path',
        'messages/harness-session-thread/1',
        '--includeIncomingRelations',
        'addresses',
      ]);
      expect(calls[2]).toEqual([
        'get',
        '--space',
        'constellos',
        '--path',
        'objectives/ship-the-harness',
      ]);

      expect(run.json.hookSpecificOutput).toMatchObject({ hookEventName: 'UserPromptSubmit' });
      expect(contextOf(run)).toContain('objectives/ship-the-harness');
      expect(contextOf(run)).toContain('residual: the plugin is not enabled in the app repo');
      expect(contextOf(run).split('\n').length).toBeLessThanOrEqual(40);

      // Discovery is cached: the next prompt skips the thread read.
      expect(stateOf(SESSION).objective).toBe('objectives/ship-the-harness');
      fs.rmSync(cliLog, { force: true });
      runHookScript('user-prompt-submit.ts', userPromptSubmit('And again'));
      expect(cliCalls().map((c) => c[0])).toEqual(['message', 'get']);
    },
    HOOK_TIMEOUT
  );

  it(
    'takes CONSTELLOS_ROOT_OBJECTIVE as an override and skips discovery',
    () => {
      runHookScript('session-start.ts', sessionStart('startup'));
      fs.rmSync(cliLog, { force: true });

      const run = runHookScript('user-prompt-submit.ts', userPromptSubmit('Build PR-P'), {
        CONSTELLOS_ROOT_OBJECTIVE: 'objectives/other',
      });
      expect(run.status).toBe(0);
      expect(cliCalls().map((c) => [c[0], c[c.length - 1]])).toEqual([
        ['message', 'Build PR-P'],
        ['get', 'objectives/other'],
      ]);
      expect(contextOf(run)).toContain('objectives/other');
    },
    HOOK_TIMEOUT
  );

  it(
    'never blocks when the CLI fails, and emits no context',
    () => {
      writeFakeCli(failingCli('network unreachable'));
      const run = runHookScript('user-prompt-submit.ts', userPromptSubmit('Build PR-P'));
      expect(run.status).toBe(0);
      expect(run.json).toEqual({});
      expect(run.stderr).toContain('prompt not recorded');
    },
    HOOK_TIMEOUT
  );
});

describe('stop.ts', () => {
  it(
    'records last_assistant_message as an assistant turn',
    () => {
      runHookScript('session-start.ts', sessionStart('startup'));
      fs.rmSync(cliLog, { force: true });

      const run = runHookScript('stop.ts', stop('Shipped the plugin.'));
      expect(run.status).toBe(0);
      expect(run.json).toEqual({});
      expect(cliCalls()).toEqual([
        [
          'message',
          '--space',
          'constellos',
          '--thread',
          'harness-session-thread',
          '--message',
          'Shipped the plugin.',
          '--role',
          'assistant',
        ],
      ]);
    },
    HOOK_TIMEOUT
  );

  it(
    'does nothing while stop_hook_active is true (the loop guard)',
    () => {
      runHookScript('session-start.ts', sessionStart('startup'));
      fs.rmSync(cliLog, { force: true });

      const run = runHookScript('stop.ts', stop('Shipped the plugin.', true));
      expect(run.status).toBe(0);
      expect(run.json).toEqual({});
      expect(cliCalls()).toEqual([]);
    },
    HOOK_TIMEOUT
  );

  it(
    'skips rather than mislabels when the server rejects the role argument',
    () => {
      runHookScript('session-start.ts', sessionStart('startup'));
      writeFakeCli(failingCli('Error: unknown argument "role"'));
      fs.rmSync(cliLog, { force: true });

      const first = runHookScript('stop.ts', stop('Shipped the plugin.'));
      expect(first.status).toBe(0);
      expect(first.stderr).toContain('rejected the role argument');
      expect(stateOf(SESSION).roleSupported).toBe(false);

      // Cached: the next Stop does not try again, and never records a turn
      // without the role - that would land it mislabeled as a user turn.
      fs.rmSync(cliLog, { force: true });
      const second = runHookScript('stop.ts', stop('And again.'));
      expect(second.status).toBe(0);
      expect(cliCalls()).toEqual([]);
    },
    HOOK_TIMEOUT
  );

  it(
    'says nothing when the turn produced no assistant message',
    () => {
      runHookScript('session-start.ts', sessionStart('startup'));
      fs.rmSync(cliLog, { force: true });

      const run = runHookScript('stop.ts', {
        session_id: SESSION,
        transcript_path: TRANSCRIPT,
        cwd: dir,
        hook_event_name: 'Stop',
        stop_hook_active: false,
      });
      expect(run.status).toBe(0);
      expect(cliCalls()).toEqual([]);
    },
    HOOK_TIMEOUT
  );
});

describe('post-tool-use.ts', () => {
  let repo: string;
  const edited = 'services/mcp/internal/reviewapi/handler.go';

  beforeAll(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'constellos-repo-'));
    const git = (...args: string[]) =>
      spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', timeout: 30_000 });
    git('init', '-q');
    git('config', 'user.email', 'test@example.test');
    git('config', 'user.name', 'Test');
    fs.writeFileSync(path.join(repo, 'README.md'), '# repo\n');
    git('add', '-A');
    git('commit', '-qm', 'init');
    fs.mkdirSync(path.join(repo, path.dirname(edited)), { recursive: true });
    fs.writeFileSync(path.join(repo, edited), 'package reviewapi\n');
  });

  afterAll(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it(
    'reminds when a watched tree changed with no doc or spec beside it',
    () => {
      const run = runHookScript('post-tool-use.ts', postToolUse(path.join(repo, edited), repo));
      expect(run.status).toBe(0);
      expect(run.json.hookSpecificOutput).toMatchObject({ hookEventName: 'PostToolUse' });
      expect(contextOf(run)).toContain('services/mcp/internal/reviewapi');
      expect(contextOf(run)).toContain('no doc or spec changed');
      // PostToolUse has no decision channel and this hook claims none, so the
      // reminder can never turn into a block.
      expect(run.json.decision).toBeUndefined();
      expect(cliCalls()).toEqual([]);
    },
    HOOK_TIMEOUT
  );

  it(
    'stays silent once a doc changed alongside the edit',
    () => {
      const sibling = path.join(repo, 'services/mcp/internal/reviewapi/README.md');
      fs.writeFileSync(sibling, '# why\n');
      try {
        const run = runHookScript('post-tool-use.ts', postToolUse(path.join(repo, edited), repo));
        expect(run.status).toBe(0);
        expect(run.json).toEqual({});
      } finally {
        fs.rmSync(sibling, { force: true });
      }
    },
    HOOK_TIMEOUT
  );

  it(
    'ignores an edit outside the watched trees',
    () => {
      const run = runHookScript('post-tool-use.ts', postToolUse(path.join(repo, 'README.md'), repo));
      expect(run.status).toBe(0);
      expect(run.json).toEqual({});
    },
    HOOK_TIMEOUT
  );
});
