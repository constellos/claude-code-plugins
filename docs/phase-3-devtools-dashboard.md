# Phase 3: Claude Code DevTools Dashboard

## Overview

A real-time observability dashboard for Claude Code sessions, showing active sessions, subagents, file edits, and hook activity at `localhost:3141`.

## Vision

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Claude Code DevTools                              localhost:3141        │
├─────────────────────────────────────────────────────────────────────────┤
│ Sessions                                                                │
│ ├─ session-a1b2c3 (active) ← lazyjobs                    12m 34s       │
│ │  ├─ Explore agent-def456 "Find all test files"         ✓ 2.3s       │
│ │  │  └─ Read: src/tests/*.ts (12 files)                              │
│ │  ├─ Plan agent-ghi789 "Design auth system"             ⏳ running    │
│ │  │  └─ Write: docs/auth-plan.md                                     │
│ │  └─ Hooks: 3 PreToolUse, 2 PostToolUse, 1 SubagentStop              │
│ │                                                                      │
│ └─ session-xyz789 (ended 5m ago) ← claude-code-kit       8m 12s       │
│    └─ 4 agents, 23 edits, 12 hooks                                    │
├─────────────────────────────────────────────────────────────────────────┤
│ Live Activity                                            Auto-refresh ◉│
│ ├─ 14:23:01 [lazyjobs] Write src/auth/login.ts (+45 lines)            │
│ ├─ 14:23:05 [lazyjobs] Edit src/auth/login.ts (lines 12-15)           │
│ ├─ 14:23:08 [lazyjobs] SubagentStop hook fired (log-agent-edits.ts)   │
│ └─ 14:23:10 [lazyjobs] Agent Plan completed (3.2s)                    │
├─────────────────────────────────────────────────────────────────────────┤
│ Stats                                                                   │
│ Total tokens: 45,234 │ Cost: $0.42 │ Agents: 6 │ Edits: 34 │ Hooks: 18│
└─────────────────────────────────────────────────────────────────────────┘
```

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Transcript      │     │   DevTools       │     │   Browser        │
│  Watcher         │────▶│   Server         │────▶│   Dashboard      │
│  (chokidar)      │     │   (express/ws)   │     │   (React)        │
└──────────────────┘     └──────────────────┘     └──────────────────┘
        │                         │
        ▼                         ▼
┌──────────────────┐     ┌──────────────────┐
│  ~/.claude/      │     │  .claude/state/  │
│  projects/       │     │  hook-log.jsonl  │
│  */*.jsonl       │     │                  │
└──────────────────┘     └──────────────────┘
```

## Components

### 1. Transcript Watcher

Watches `~/.claude/projects/` for changes to transcript files.

```typescript
// src/devtools/watcher.ts
import { watch } from 'chokidar';
import { parseTranscript } from '../transcripts/parser';

interface TranscriptEvent {
  type: 'session_start' | 'session_update' | 'agent_start' | 'agent_stop' | 'tool_use';
  sessionId: string;
  projectPath: string;
  timestamp: string;
  data: unknown;
}

export function watchTranscripts(
  projectsDir: string,
  onEvent: (event: TranscriptEvent) => void
) {
  const watcher = watch(`${projectsDir}/**/*.jsonl`, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  watcher.on('add', (path) => handleTranscript(path, onEvent));
  watcher.on('change', (path) => handleTranscript(path, onEvent));

  return watcher;
}

async function handleTranscript(
  path: string,
  onEvent: (event: TranscriptEvent) => void
) {
  const transcript = await parseTranscript(path);
  // Diff against previous state, emit events for new messages
  // ...
}
```

### 2. Hook Log Watcher

Watches `.claude/state/hook-log.jsonl` (created by Phase 2 `cck-hook` runner).

```typescript
// src/devtools/hook-watcher.ts
import { watch } from 'chokidar';
import { createInterface } from 'readline';
import { createReadStream } from 'fs';

interface HookLogEntry {
  timestamp: string;
  hookType: string;
  hookFile: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

export function watchHookLog(
  logPath: string,
  onEntry: (entry: HookLogEntry) => void
) {
  let lastPosition = 0;

  const watcher = watch(logPath, { persistent: true });

  watcher.on('change', async () => {
    // Read only new lines since lastPosition
    const stream = createReadStream(logPath, { start: lastPosition });
    const rl = createInterface({ input: stream });

    for await (const line of rl) {
      if (line.trim()) {
        const entry = JSON.parse(line) as HookLogEntry;
        onEntry(entry);
      }
    }

    // Update position for next read
    lastPosition = (await stat(logPath)).size;
  });

  return watcher;
}
```

### 3. WebSocket Server

Broadcasts events to connected dashboard clients.

```typescript
// src/devtools/server.ts
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

export function createDevToolsServer(port = 3141) {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  const clients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));

    // Send current state on connect
    ws.send(JSON.stringify({ type: 'init', data: getCurrentState() }));
  });

  function broadcast(event: unknown) {
    const message = JSON.stringify(event);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  // Serve static dashboard files
  app.use(express.static('dist/devtools/ui'));

  // REST API for initial data load
  app.get('/api/sessions', (req, res) => {
    res.json(getActiveSessions());
  });

  app.get('/api/sessions/:id', (req, res) => {
    res.json(getSession(req.params.id));
  });

  server.listen(port, () => {
    console.log(`DevTools running at http://localhost:${port}`);
  });

  return { broadcast, server };
}
```

### 4. Dashboard UI

React-based dashboard with real-time updates.

```typescript
// src/devtools/ui/App.tsx
import { useEffect, useState } from 'react';

interface Session {
  id: string;
  projectPath: string;
  startedAt: string;
  status: 'active' | 'ended';
  agents: Agent[];
  edits: Edit[];
  hooks: HookInvocation[];
}

export function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [liveEvents, setLiveEvents] = useState<Event[]>([]);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3141');

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'init':
          setSessions(data.sessions);
          break;
        case 'session_update':
          // Update specific session
          break;
        case 'live_event':
          setLiveEvents(prev => [data.event, ...prev].slice(0, 100));
          break;
      }
    };

    return () => ws.close();
  }, []);

  return (
    <div className="devtools">
      <SessionList sessions={sessions} />
      <LiveActivity events={liveEvents} />
      <Stats sessions={sessions} />
    </div>
  );
}
```

## CLI Command

```bash
# Start the devtools server
pnpm cck devtools

# With custom port
pnpm cck devtools --port 8080

# Watch specific project only
pnpm cck devtools --project /path/to/project
```

### Implementation

```typescript
// bin/cck-devtools.ts
#!/usr/bin/env node

import { watchTranscripts } from '../src/devtools/watcher';
import { watchHookLog } from '../src/devtools/hook-watcher';
import { createDevToolsServer } from '../src/devtools/server';
import { homedir } from 'os';
import { join } from 'path';

const port = parseInt(process.argv[2]) || 3141;
const projectsDir = join(homedir(), '.claude', 'projects');

const { broadcast } = createDevToolsServer(port);

// Watch transcripts
watchTranscripts(projectsDir, (event) => {
  broadcast({ type: 'transcript_event', ...event });
});

// Watch hook logs from all projects
// (Would need to discover active projects first)

console.log(`Claude Code DevTools running at http://localhost:${port}`);
```

## Data Persistence

For historical analysis, store aggregated data in SQLite:

```typescript
// src/devtools/storage.ts
import Database from 'better-sqlite3';

const db = new Database('.claude/state/devtools.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_path TEXT,
    started_at TEXT,
    ended_at TEXT,
    total_tokens INTEGER,
    total_cost_usd REAL
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id),
    type TEXT,
    prompt TEXT,
    started_at TEXT,
    ended_at TEXT,
    duration_ms INTEGER,
    status TEXT
  );

  CREATE TABLE IF NOT EXISTS edits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT REFERENCES sessions(id),
    agent_id TEXT REFERENCES agents(id),
    file_path TEXT,
    operation TEXT,
    timestamp TEXT
  );

  CREATE TABLE IF NOT EXISTS hook_invocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    hook_type TEXT,
    hook_file TEXT,
    duration_ms INTEGER,
    success INTEGER,
    error TEXT,
    timestamp TEXT
  );
`);
```

## Features

### Core Features (MVP)

- [ ] Real-time session list with status
- [ ] Subagent timeline with prompts
- [ ] Live file edit stream
- [ ] Hook invocation log
- [ ] Basic stats (tokens, cost, duration)

### Enhanced Features

- [ ] Session search and filtering
- [ ] Agent prompt full-text search
- [ ] File diff viewer
- [ ] Cost breakdown by agent type
- [ ] Export session data to JSON
- [ ] Keyboard shortcuts

### Advanced Features

- [ ] Session replay (step through transcript)
- [ ] Compare sessions side-by-side
- [ ] Custom hook debugging (breakpoints?)
- [ ] Performance profiling
- [ ] Alert on slow hooks or high costs

## Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "ws": "^8.14.0",
    "chokidar": "^3.5.0",
    "better-sqlite3": "^9.0.0"
  },
  "devDependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "vite": "^5.0.0",
    "@types/ws": "^8.5.0",
    "@types/better-sqlite3": "^7.6.0"
  }
}
```

## Open Questions

1. Should this be a separate package (`@constellos/claude-code-devtools`)?
2. How to handle multiple users on same machine?
3. Should we support remote viewing (auth required)?
4. How to minimize performance impact of file watching?
5. Should we integrate with existing tools (Grafana, DataDog)?

## Future Ideas

- VS Code extension that embeds the dashboard
- CLI-only mode with `cck devtools --tui` (using blessed/ink)
- GitHub Action integration for CI session analysis
- Team dashboard aggregating across developers
