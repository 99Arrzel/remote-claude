# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

A self-hosted PWA for managing Claude Code terminal sessions remotely. Spawns and streams Claude CLI PTY sessions via a browser UI, with mobile access in mind (Tailscale). Built with Next.js + Bun, SQLite persistence, and xterm.js streaming.

## Commands

```bash
# Development
bun run dev           # Start dev server

# Production
bun run build         # Build
bun run start         # Start prod server
bun run prod          # Build + start

# Database
bun run db:generate   # Generate migrations from schema changes
bun run db:migrate    # Apply pending migrations
```

**Runtime requirement:** Bun (not Node). The database uses `bun:sqlite` which is a Bun built-in.

## Environment

Copy `.env.example` to `.env.local`:
- `AUTH_TOKEN` — required; the shared secret for login
- `DATABASE_URL` — SQLite path, defaults to `./data/db.sqlite`
- `BROWSE_ROOT` — root directory for the directory picker

## Architecture

### Request Flow

1. Browser authenticates via `POST /api/auth` → httpOnly cookie set
2. All routes protected by `src/middleware.ts` (redirects to `/login` or returns 401)
3. All data operations go through `POST /api/rpc/[...rest]` — type-safe oRPC calls
4. Terminal streaming uses `GET /api/rpc/[...rest]` (async generator / SSE)

### Key Layers

**RPC (`src/lib/orpc/`)**
- `router.ts` — composes sessions, system, directories sub-routers
- `sessions-logic.ts` — core session CRUD + streaming; spawns Claude CLI via node-pty
- `directories-logic.ts` — directory browser with `BROWSE_ROOT` boundary enforcement
- `client.ts` — typed RPC client used by frontend components

**PTY Manager (`src/lib/pty/manager.ts`)**
- In-memory map of `sessionId → {pty, seq}`
- `EventPublisher` provides per-session pub/sub for live terminal streaming
- PTY writes are persisted to DB *and* published; stream endpoint replays DB first then subscribes live (subscribe-before-replay to avoid dropped events)

**Database (`src/lib/db/`)**
- Drizzle ORM on `bun:sqlite`, WAL mode for concurrent reads
- `schema.ts` defines `sessions` (status: active/exited/killed) and `session_output` (seq-ordered output blobs)
- Lazy singleton in `index.ts` — deferred to avoid `bun:sqlite` at module load time (required for Next.js static build phase)
- Migrations in `src/lib/db/migrations/`

**Startup (`src/lib/startup.ts`)**
- On boot, all sessions with `status=active` are reconciled to `exited` (handles server crash recovery)
- Triggered via Next.js `instrumentation.ts`

### Frontend

- `src/app/page.tsx` — dashboard, polls session list every 5s
- `src/app/sessions/[id]/page.tsx` — terminal view
- `src/components/terminal.tsx` — xterm.js integration; streams via `sessions.stream()`, sends keystrokes via `sessions.input()`
- `src/components/session-dashboard.tsx` — session list + create/delete controls
- `src/components/directory-picker.tsx` — recursive directory browser for session CWD

### Important Constraints

- **node-pty and bun:sqlite are `serverExternalPackages`** — they cannot be bundled by webpack. They are lazy-loaded in the RPC handler to avoid being evaluated during the static build phase.
- **API routes are never PWA-cached** — SSE/streaming would break if cached.
- **Force-dynamic** is set on the RPC route (`export const dynamic = 'force-dynamic'`).
