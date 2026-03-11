# Remote Claude Terminal PWA — Design Spec

**Date:** 2026-03-11
**Status:** Draft

---

## Overview

A self-hosted PWA that lets the user manage multiple interactive Claude Code terminal sessions from a phone (or any browser). Each session is a PTY running `claude` on the local machine. Sessions persist across browser disconnects and server restarts. The UI is a mobile-first dashboard with a browser-based terminal emulator per session.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Bun |
| Framework | Next.js (App Router) |
| API / SSE | oRPC (typed procedures + event iterators) |
| Validation | Arktype |
| ORM | Drizzle ORM |
| Database | SQLite via `bun:sqlite` |
| PTY (server) | node-pty |
| Terminal (browser) | xterm.js + xterm-addon-fit |
| Styling | Tailwind CSS + Ark UI (headless) |
| PWA | manifest.json + service worker (Workbox via next-pwa) |

---

## Environment Variables

The server **refuses to start** if `AUTH_TOKEN` is missing or empty.

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTH_TOKEN` | yes | — | Bearer token for all authenticated requests |
| `DATABASE_URL` | no | `./data/db.sqlite` | SQLite database file path |
| `BROWSE_ROOT` | no | `/` | Restricts the directory picker to this root and below |

---

## Architecture

A single Next.js process running on Bun. The oRPC router is mounted at `/api/rpc/[...rest]`. All API communication goes through oRPC.

### Startup Reconciliation

On server start, before handling any requests (`src/lib/startup.ts`):

1. Query Drizzle for all sessions with `status = 'active'`
2. For each, set `status = 'exited'` and `updatedAt = now`

The PTY Map starts empty and immediately consistent with the DB.

### oRPC Procedures

```
sessions.create({ name, cwd })             → Session
sessions.list({ status? })                 → Session[]     (all if status omitted, ordered by createdAt DESC)
sessions.get({ id })                       → Session
sessions.delete({ id })                    → void          (idempotent; overwrites exited → killed if already exited)
sessions.input({ id, data })               → void
sessions.resize({ id, cols, rows })        → void
sessions.stream({ id })                    → EventIterator<TerminalEvent>
                                            // lastEventId is handled automatically by oRPC via the
                                            // SSE Last-Event-ID header — available in handler as
                                            // ({ input, lastEventId }), not part of the input schema
system.home()                              → { home: string }
directories.browse({ path })               → DirectoryListing
```

### PTY Manager (server-side singleton)

Module-level singleton in `src/lib/pty/manager.ts`:
- `Map<sessionId, { pty: IPty, seq: number }>` — active PTY processes with per-session counter
- Global `EventPublisher` with per-session channels

After startup reconciliation the Map is always consistent with the DB.

#### `sessions.create` flow
1. Validate `cwd` exists and is a directory (using `fs.stat`); throw `BAD_REQUEST` if not
2. Spawn `claude` via `node-pty` with `cwd` and default dimensions 220×50
3. **Only if spawn succeeds**: generate UUID v4 `id`, insert session row (`status: 'active'`, `createdAt`/`updatedAt = now`)
4. Store `{ pty, seq: 0 }` in Map (seq starts at 0; first stored value will be 1 after first increment)
5. PTY `onData` handler: increment `seq`, write `{ sessionId, seq, type: 'output', data, createdAt: now }` to `session_output` **synchronously** (DB write completes before publish), then publish `{ type: 'output', seq, data }` to EventPublisher channel
6. PTY `onExit` handler: increment `seq` for the sentinel, write `{ sessionId, seq, type: 'exit', data: '', createdAt: now }` to `session_output` **synchronously**, update `status = 'exited'` + `updatedAt = now`, remove from Map, publish `{ type: 'exit', seq, data: '' }` to EventPublisher channel. If the unique-index constraint fires (concurrent `sessions.delete` already wrote a row at this seq), catch and silently ignore the error — the sentinel already exists.

#### `sessions.get` flow
1. Query DB by `id`; throw `NOT_FOUND` if absent
2. Return `Session`

#### `sessions.stream` flow

`lastEventId` is provided by oRPC from the SSE `Last-Event-ID` header (string or undefined).

**If session status is `exited` or `killed` at the initial DB check:** skip EventPublisher subscription, replay all rows from DB for that session, then return. Stream ends cleanly.

**If session is `active`:**
1. Look up session in DB; throw `NOT_FOUND` if absent. *(This check is safe before subscribing because session IDs are immutable — a session that exists at this point cannot disappear.)*
2. Subscribe to EventPublisher channel — begin buffering live events
3. Parse `lastEventId`: `const replayFrom = isNaN(parseInt(lastEventId ?? '')) ? 0 : parseInt(lastEventId!) + 1` — rows with `seq >= replayFrom` are replayed
4. Query Drizzle: `session_output WHERE session_id = id AND seq >= replayFrom ORDER BY seq ASC`
5. Yield replayed rows as `TerminalEvent` (using `type` column) with `withEventMeta({ id: String(seq) })`
6. `lastReplayedSeq` = highest seq from step 5 (or `replayFrom - 1` if no rows)
7. Yield buffered live events with `seq > lastReplayedSeq` (drop duplicates)
8. Continue yielding live events, each with `withEventMeta({ id: String(seq) })`
9. `try/finally` block unsubscribes on client disconnect — PTY keeps running

**Gap-free guarantee:** DB writes are synchronous and complete before the corresponding publish. The subscription opens (step 2) before the replay query (step 4). Any event emitted between subscribe and query is either already in the DB (caught by replay) or in the buffer (caught by step 7).

#### `sessions.input` flow
1. Look up session in DB; throw `NOT_FOUND` if absent
2. Look up PTY in Map; if absent → throw `GONE`
3. Write `data` to PTY stdin

#### `sessions.resize` flow
1. Look up session in DB; throw `NOT_FOUND` if absent
2. Look up PTY in Map; if absent → throw `GONE`
3. Call `pty.resize(cols, rows)`

#### `sessions.delete` flow
1. Kill PTY via `pty.kill()` if present in Map; remove from Map
2. `UPDATE sessions SET status = 'killed', updated_at = now WHERE id = ?` — silently a no-op if id not in DB; overwrites any prior status including `exited`
3. Retain output rows for history

#### `system.home` flow
1. Return `{ home: process.env.HOME ?? '/' }`

---

## Drizzle Schema

```typescript
// src/lib/db/schema.ts

export const sessions = sqliteTable('sessions', {
  id:        text('id').primaryKey(),           // UUID v4
  name:      text('name').notNull(),
  cwd:       text('cwd').notNull(),
  status:    text('status').notNull(),          // 'active' | 'exited' | 'killed'
  createdAt: integer('created_at').notNull(),   // Unix ms
  updatedAt: integer('updated_at').notNull(),   // Unix ms — updated on every status change
})

export const sessionOutput = sqliteTable('session_output', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  seq:       integer('seq').notNull(),          // per-session monotonic counter; first stored value is 1
  type:      text('type').notNull(),            // 'output' | 'exit'
  data:      text('data').notNull(),            // UTF-8 output chunk; empty string for exit sentinel
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  seqUnique: uniqueIndex('session_output_session_seq_idx').on(t.sessionId, t.seq),
}))
```

---

## Arktype Schemas

```typescript
// Terminal event — discriminated union reconstructed from the `type` DB column
const OutputEvent   = type({ type: '"output"', seq: 'number', data: 'string' })
const ExitEvent     = type({ type: '"exit"',   seq: 'number', data: '""' })
const TerminalEvent = type('OutputEvent | ExitEvent')

// Procedure inputs
const CreateSessionInput = type({ name: 'string', cwd: 'string' })
const SessionInputData   = type({ id: 'string', data: 'string' })
const SessionResizeInput = type({ id: 'string', cols: 'number', rows: 'number' })
const StreamInput        = type({ id: 'string' })   // lastEventId is oRPC handler param, not input
const BrowseInput        = type({ path: 'string' })

// Procedure outputs
const SessionSchema = type({
  id: 'string', name: 'string', cwd: 'string',
  status: 'string', createdAt: 'number', updatedAt: 'number',
})
const DirectoryListing = type({ path: 'string', dirs: 'string[]' })
// Note: only directory names are returned — files are omitted (use case is directory selection only)
```

---

## Auth

Authentication uses a **session cookie** set on login. This allows both the Next.js middleware (which runs server-side and cannot access `localStorage`) and the browser's automatic cookie sending to cover all route types consistently.

- `AUTH_TOKEN` env var (required — server refuses to start if missing/empty)
- `POST /api/auth`: compares posted `token` against `AUTH_TOKEN`; on match, sets an `httpOnly; SameSite=Strict; Path=/` cookie named `session` with the token value; returns `200 { ok: true }` or `401`
- `src/middleware.ts` matches all routes **except** `/login` and `/api/auth`; reads `session` cookie; redirects pages to `/login` or returns `401` for API routes if absent/invalid
- oRPC API routes: cookie is sent automatically by the browser; middleware validates it before the request reaches oRPC handlers
- The oRPC client (`src/lib/orpc/client.ts`) requires no special auth header injection — the cookie is sent automatically with all same-origin requests

---

## Frontend Component Boundaries

### `app/page.tsx` (Server Component)
- Calls `system.home()` server-side to get the initial directory
- Renders `<SessionDashboard initialHome={home} />` (Client Component)

### `components/session-dashboard.tsx` (Client Component)
- Holds session list state
- Calls `sessions.list()` on mount; polls every 5 s and on window focus
- Renders session cards; opens Create Session dialog
- Passes `initialHome` to `DirectoryPicker`

### `app/sessions/[id]/page.tsx` (Server Component shell)
- Renders `<TerminalView id={params.id} />` (Client Component)

### `components/terminal.tsx` (Client Component)
- All xterm.js and oRPC streaming logic lives here

---

## Frontend Pages

### `/login` — Token Entry (excluded from auth middleware)
- Password input + submit
- On submit: `POST /api/auth` with `{ token }` → `200 { ok: true }` or `401`
- On `200`: redirect to `/`

### `/` — Session Dashboard
- Session cards: name, cwd, status badge (`active` / `exited` / `killed`), time since `updatedAt`
- Active sessions show a pulsing indicator
- "New Session" → Create Session dialog

### `/sessions/[id]` — Terminal View
- xterm.js fills most of the viewport; `xterm-addon-fit` sizes to container
- Header: session name, cwd, status, back button, "Kill Session" button
- On mount: call `sessions.stream({ id })` — oRPC Client Retry Plugin sends `Last-Event-ID` header automatically on reconnect; call `sessions.resize({ id, cols, rows })` once with the initial xterm dimensions
- `terminal.onResize` → `sessions.resize({ id, cols, rows })`
- Key input → `sessions.input({ id, data: key })` immediately
- `type: 'exit'` event → terminal read-only, "Session ended" banner
- Replay mode (exited/killed session): xterm uses current container dimensions (no stored dims in v1); output may reflow but is readable

### Directory Picker (Ark UI Dialog)
- Receives `initialHome` from Server Component prop
- Calls `directories.browse({ path })` to list subdirectories only
- `BROWSE_ROOT` boundary enforced server-side using `path.resolve()` to canonicalize both the requested path and `BROWSE_ROOT`, then verifying the resolved path starts with the resolved `BROWSE_ROOT` (prevents `../` traversal)
- Breadcrumb trail; user navigates or confirms

---

## Session Lifecycle

```
startup reconciliation → all DB-active sessions set to exited

sessions.create → validate cwd → spawn PTY → insert DB (active)
                                                   │
                                      ┌────────────┴────────────┐
                                claude exits            sessions.delete
                                      │                          │
                               status: exited          kill PTY → status: killed
                                                        (also overwrites exited → killed)
```

---

## PWA

- `public/manifest.json`: name, short name, icons (192px + 512px), `display: standalone`, `theme_color`, `background_color`
- **next-pwa** (Workbox):
  - Network-first for HTML and RSC pages
  - Cache-first for `/_next/static/**` (content-hashed filenames)
  - `/api/**` **excluded** from service worker interception to prevent broken SSE streams

---

## Error Handling

| Scenario | Behavior |
|---|---|
| PTY spawn failure | `INTERNAL_SERVER_ERROR`; no DB row inserted |
| `sessions.create` — `cwd` invalid/not a directory | `BAD_REQUEST` |
| PTY crashes mid-session | `onExit`: write exit sentinel to DB, status → `exited`, publish sentinel |
| Concurrent `sessions.delete` + `onExit` unique-index conflict | Silent ignore; sentinel already exists |
| `sessions.get` — id not in DB | `NOT_FOUND` |
| `sessions.list` — no sessions | Returns empty array |
| `sessions.delete` — id not in DB | Silent no-op |
| `sessions.delete` — session already exited | Updates status to `killed` |
| `sessions.input` — id not in DB | `NOT_FOUND` |
| `sessions.input` — session not active | `GONE` |
| `sessions.resize` — id not in DB | `NOT_FOUND` |
| `sessions.resize` — session not active | `GONE` |
| `sessions.stream` — id not in DB | `NOT_FOUND` |
| `sessions.stream` — session exited/killed | Replay all output + exit sentinel, return cleanly |
| `directories.browse` — outside `BROWSE_ROOT` (after path.resolve) | `FORBIDDEN` |
| `directories.browse` — path not found | `NOT_FOUND` |
| `directories.browse` — path is a file | `BAD_REQUEST` |
| `directories.browse` — not readable | `FORBIDDEN` |

---

## File Structure

```
src/
  app/
    page.tsx                         # Server Component: fetches system.home, renders SessionDashboard
    login/page.tsx                   # Token entry (excluded from auth middleware)
    sessions/[id]/page.tsx           # Server Component shell: renders TerminalView
    api/
      auth/route.ts                  # POST /api/auth: validates token, sets session cookie
      rpc/[...rest]/route.ts         # oRPC handler
  lib/
    orpc/
      router.ts                      # Root oRPC router
      sessions.ts                    # Sessions procedures
      system.ts                      # system.home procedure
      directories.ts                 # Directory browser procedure
      client.ts                      # oRPC client (no auth header needed; cookie is automatic)
    pty/
      manager.ts                     # PTY singleton (Map + EventPublisher)
    db/
      index.ts                       # Drizzle client (bun:sqlite, DATABASE_URL)
      schema.ts                      # Table definitions + uniqueIndex
      migrations/                    # Drizzle migration files
    startup.ts                       # Startup reconciliation (active → exited)
  components/
    session-dashboard.tsx            # Client Component: session list, polling, create dialog
    session-card.tsx
    terminal.tsx                     # Client Component: xterm.js + resize + stream
    directory-picker.tsx             # Client Component: directory browser dialog
  middleware.ts                      # Auth via session cookie (all routes except /login, /api/auth)
public/
  manifest.json
  icons/
    icon-192.png
    icon-512.png
.env.local                           # AUTH_TOKEN (required), DATABASE_URL, BROWSE_ROOT
```

---

## Open Questions / V2 Ideas

- Store terminal dimensions per session for accurate replay rendering
- Push notifications when a session completes
- Multiple user support with per-user session isolation
- Session sharing / read-only view links
- Pagination for `sessions.list`
