# Remote Claude Terminal PWA — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted Next.js PWA that lets the user manage multiple interactive Claude Code PTY sessions from a mobile browser, with full session persistence across disconnects and server restarts.

**Architecture:** Single Next.js App Router process on Bun. oRPC handles all API communication (session CRUD, SSE streaming via event iterators, PTY input/resize). node-pty manages PTY processes in a server-side singleton; Drizzle + SQLite persists all session metadata and terminal output for replay.

**Tech Stack:** Bun · Next.js 15 (App Router) · oRPC · Arktype · Drizzle ORM · bun:sqlite · node-pty · xterm.js (@xterm/xterm) · Tailwind CSS · Ark UI · next-pwa (Workbox)

**Spec:** `docs/superpowers/specs/2026-03-11-remote-claude-terminal-design.md`

---

## Chunk 1: Project Bootstrap

### Task 1: Scaffold Next.js project

**Files:**
- Create: `package.json` (generated)
- Create: `next.config.ts`
- Create: `tsconfig.json` (generated)
- Create: `.env.local`
- Create: `.env.example`

- [ ] **Step 1: Create Next.js app with Bun**

```bash
cd /home/link/work/remote-claude
bun create next-app . --typescript --app --src-dir --no-tailwind --no-eslint --import-alias "@/*"
```

Expected: Next.js scaffold created. Answer prompts: TypeScript=yes, App Router=yes, src/=yes, import alias=`@/*`.

- [ ] **Step 2: Remove boilerplate files**

```bash
rm -f src/app/page.tsx src/app/globals.css src/app/layout.tsx src/app/favicon.ico public/vercel.svg public/next.svg
```

- [ ] **Step 3: Initialize git**

```bash
git init
git add .
git commit -m "chore: scaffold Next.js app with Bun"
```

---

### Task 2: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install production dependencies**

```bash
bun add @orpc/server @orpc/client @orpc/next arktype drizzle-orm node-pty @xterm/xterm @xterm/addon-fit tailwindcss @tailwindcss/postcss postcss @ark-ui/react next-pwa
```

- [ ] **Step 2: Install dev dependencies**

```bash
bun add -d drizzle-kit @types/node-pty
```

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore: install dependencies"
```

---

### Task 3: Configure Tailwind CSS

**Files:**
- Create: `tailwind.config.ts`
- Create: `postcss.config.mjs`
- Create: `src/app/globals.css`
- Create: `src/app/layout.tsx`

- [ ] **Step 1: Create tailwind config**

Create `tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}

export default config
```

- [ ] **Step 2: Create PostCSS config**

Create `postcss.config.mjs`:
```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

- [ ] **Step 3: Create global CSS**

Create `src/app/globals.css`:
```css
@import "tailwindcss";
```

- [ ] **Step 4: Create root layout**

Create `src/app/layout.tsx`:
```typescript
import './globals.css'
import type { ReactNode } from 'react'

export const metadata = {
  title: 'Remote Claude',
  description: 'Claude terminal sessions from anywhere',
  manifest: '/manifest.json',
}

export const viewport = {
  themeColor: '#10b981',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-50 min-h-screen">{children}</body>
    </html>
  )
}
```

- [ ] **Step 5: Create temp homepage and verify Tailwind works**

Create `src/app/page.tsx`:
```typescript
export default function Page() {
  return <div className="p-8 text-2xl font-bold text-emerald-400">Remote Claude</div>
}
```

Run `bun dev` and open http://localhost:3000 — text should be large, green, padded. Then Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "chore: configure Tailwind CSS and root layout"
```

---

### Task 4: Environment variable validation

**Files:**
- Create: `src/lib/env.ts`
- Create: `src/__tests__/env.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/env.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'bun:test'

describe('getEnv', () => {
  beforeEach(() => {
    delete process.env.AUTH_TOKEN
    delete process.env.DATABASE_URL
    delete process.env.BROWSE_ROOT
  })

  it('returns config with defaults when AUTH_TOKEN is set', () => {
    process.env.AUTH_TOKEN = 'test-token'
    // Re-require to pick up env changes
    delete require.cache[require.resolve('../lib/env')]
    const { getEnv } = require('../lib/env')
    const env = getEnv()
    expect(env.authToken).toBe('test-token')
    expect(env.databaseUrl).toBe('./data/db.sqlite')
    expect(env.browseRoot).toBe('/')
  })

  it('uses DATABASE_URL and BROWSE_ROOT when set', () => {
    process.env.AUTH_TOKEN = 'tok'
    process.env.DATABASE_URL = './custom.sqlite'
    process.env.BROWSE_ROOT = '/home/user'
    delete require.cache[require.resolve('../lib/env')]
    const { getEnv } = require('../lib/env')
    const env = getEnv()
    expect(env.databaseUrl).toBe('./custom.sqlite')
    expect(env.browseRoot).toBe('/home/user')
  })

  it('throws when AUTH_TOKEN is missing', () => {
    delete require.cache[require.resolve('../lib/env')]
    const { getEnv } = require('../lib/env')
    expect(() => getEnv()).toThrow('AUTH_TOKEN')
  })

  it('throws when AUTH_TOKEN is empty string', () => {
    process.env.AUTH_TOKEN = ''
    delete require.cache[require.resolve('../lib/env')]
    const { getEnv } = require('../lib/env')
    expect(() => getEnv()).toThrow('AUTH_TOKEN')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/__tests__/env.test.ts
```

Expected: FAIL — `../lib/env` not found.

- [ ] **Step 3: Implement env validation**

Create `src/lib/env.ts`:
```typescript
export interface Env {
  authToken: string
  databaseUrl: string
  browseRoot: string
}

export function getEnv(): Env {
  const authToken = process.env.AUTH_TOKEN
  if (!authToken) {
    throw new Error('AUTH_TOKEN env var is required but missing or empty')
  }
  return {
    authToken,
    databaseUrl: process.env.DATABASE_URL || './data/db.sqlite',
    browseRoot: process.env.BROWSE_ROOT || '/',
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/__tests__/env.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Create .env.local and .env.example**

Create `.env.local`:
```
AUTH_TOKEN=change-me-to-a-strong-secret
# DATABASE_URL=./data/db.sqlite
# BROWSE_ROOT=/
```

Create `.env.example`:
```
AUTH_TOKEN=your-secret-token-here
DATABASE_URL=./data/db.sqlite
BROWSE_ROOT=/home/youruser
```

Append to `.gitignore`:
```
.env.local
data/
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/env.ts src/__tests__/env.test.ts .env.example .gitignore
git commit -m "feat: add environment variable validation"
```

---

## Chunk 2: Database Layer

### Task 5: Drizzle schema, client, and migrations

**Files:**
- Create: `src/lib/db/schema.ts`
- Create: `src/lib/db/index.ts`
- Create: `src/lib/db/migrate.ts`
- Create: `drizzle.config.ts`
- Create: `src/__tests__/db.test.ts`

- [ ] **Step 1: Create Drizzle schema**

Create `src/lib/db/schema.ts`:
```typescript
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const sessions = sqliteTable('sessions', {
  id:        text('id').primaryKey(),
  name:      text('name').notNull(),
  cwd:       text('cwd').notNull(),
  status:    text('status').notNull().$type<'active' | 'exited' | 'killed'>(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const sessionOutput = sqliteTable('session_output', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  seq:       integer('seq').notNull(),
  type:      text('type').notNull().$type<'output' | 'exit'>(),
  data:      text('data').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  seqUnique: uniqueIndex('session_output_session_seq_idx').on(t.sessionId, t.seq),
}))

export type Session = typeof sessions.$inferSelect
export type SessionOutput = typeof sessionOutput.$inferSelect
```

- [ ] **Step 2: Create Drizzle client**

Create `src/lib/db/index.ts`:
```typescript
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { getEnv } from '../env'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getDb() {
  if (_db) return _db
  const { databaseUrl } = getEnv()
  const dir = dirname(databaseUrl)
  if (dir !== '.') mkdirSync(dir, { recursive: true })
  const sqlite = new Database(databaseUrl)
  // Enable WAL mode for better concurrent read performance
  sqlite.run('PRAGMA journal_mode = WAL')
  _db = drizzle(sqlite, { schema })
  return _db
}

export { schema }
```

- [ ] **Step 3: Create drizzle.config.ts**

Create `drizzle.config.ts`:
```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? './data/db.sqlite',
  },
} satisfies Config
```

- [ ] **Step 4: Generate initial migration**

```bash
bun drizzle-kit generate
```

Expected: `src/lib/db/migrations/0000_*.sql` created.

- [ ] **Step 5: Create migration runner**

Create `src/lib/db/migrate.ts`:
```typescript
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { getEnv } from '../env'
import { getDb } from '.'

const { databaseUrl } = getEnv()
mkdirSync(dirname(databaseUrl), { recursive: true })
migrate(getDb(), { migrationsFolder: './src/lib/db/migrations' })
console.log('Migrations complete')
```

- [ ] **Step 6: Write the failing test**

Tests use a shared in-memory helper that runs migrations so schema is always in sync with `schema.ts`.

Create `src/__tests__/db.test.ts`:
```typescript
import { describe, it, expect } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { sessions, sessionOutput } from '../lib/db/schema'

function makeTestDb() {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder: './src/lib/db/migrations' })
  return db
}

describe('sessions table', () => {
  it('inserts and retrieves a session', async () => {
    const db = makeTestDb()
    const now = Date.now()
    await db.insert(sessions).values({
      id: 'test-id', name: 'Test', cwd: '/tmp',
      status: 'active', createdAt: now, updatedAt: now,
    })
    const rows = await db.select().from(sessions)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('test-id')
    expect(rows[0].status).toBe('active')
  })
})

describe('session_output table', () => {
  it('inserts output and exit rows', async () => {
    const db = makeTestDb()
    const now = Date.now()
    await db.insert(sessions).values({ id: 's1', name: 'S', cwd: '/tmp', status: 'active', createdAt: now, updatedAt: now })
    await db.insert(sessionOutput).values({ sessionId: 's1', seq: 1, type: 'output', data: 'hello', createdAt: now })
    await db.insert(sessionOutput).values({ sessionId: 's1', seq: 2, type: 'exit', data: '', createdAt: now })
    const rows = await db.select().from(sessionOutput)
    expect(rows).toHaveLength(2)
    expect(rows[0].type).toBe('output')
    expect(rows[1].type).toBe('exit')
  })

  it('enforces unique (session_id, seq)', async () => {
    const db = makeTestDb()
    const now = Date.now()
    await db.insert(sessions).values({ id: 's1', name: 'S', cwd: '/tmp', status: 'active', createdAt: now, updatedAt: now })
    await db.insert(sessionOutput).values({ sessionId: 's1', seq: 1, type: 'output', data: 'a', createdAt: now })
    await expect(
      db.insert(sessionOutput).values({ sessionId: 's1', seq: 1, type: 'output', data: 'b', createdAt: now })
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 7: Run test to verify it passes**

First run migrations so test migration folder exists, then run tests:

```bash
AUTH_TOKEN=test bun src/lib/db/migrate.ts
bun test src/__tests__/db.test.ts
```

Expected: `Migrations complete`, then 3 tests pass.

- [ ] **Step 8: Add scripts to package.json**

In `package.json` scripts:
```json
"db:migrate": "bun src/lib/db/migrate.ts",
"db:generate": "bun drizzle-kit generate"
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/db/ drizzle.config.ts src/__tests__/db.test.ts package.json
git commit -m "feat: add Drizzle schema, client, migrations"
```

---

### Task 6: Startup reconciliation

**Files:**
- Create: `src/lib/startup.ts`
- Create: `src/__tests__/startup.test.ts`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/startup.test.ts`:
```typescript
import { describe, it, expect } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { sessions } from '../lib/db/schema'

function makeTestDb() {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder: './src/lib/db/migrations' })
  return db
}

describe('reconcileActiveSessions', () => {
  it('sets active sessions to exited, leaves others unchanged', async () => {
    const db = makeTestDb()
    const now = Date.now()
    await db.insert(sessions).values([
      { id: 'a', name: 'A', cwd: '/tmp', status: 'active', createdAt: now, updatedAt: now },
      { id: 'b', name: 'B', cwd: '/tmp', status: 'exited', createdAt: now, updatedAt: now },
      { id: 'c', name: 'C', cwd: '/tmp', status: 'killed', createdAt: now, updatedAt: now },
    ])
    const { reconcileActiveSessions } = await import('../lib/startup')
    await reconcileActiveSessions(db)
    const rows = await db.select().from(sessions)
    expect(rows.find(r => r.id === 'a')?.status).toBe('exited')
    expect(rows.find(r => r.id === 'b')?.status).toBe('exited')  // unchanged
    expect(rows.find(r => r.id === 'c')?.status).toBe('killed') // unchanged
  })

  it('does nothing when no active sessions', async () => {
    const db = makeTestDb()
    const { reconcileActiveSessions } = await import('../lib/startup')
    await expect(reconcileActiveSessions(db)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/__tests__/startup.test.ts
```

Expected: FAIL — `../lib/startup` not found.

- [ ] **Step 3: Implement startup reconciliation**

Create `src/lib/startup.ts`:
```typescript
import { eq } from 'drizzle-orm'
import type { getDb } from './db'
import { sessions } from './db/schema'

export async function reconcileActiveSessions(db: ReturnType<typeof getDb>): Promise<void> {
  await db
    .update(sessions)
    .set({ status: 'exited', updatedAt: Date.now() })
    .where(eq(sessions.status, 'active'))
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/__tests__/startup.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Call reconciliation from layout**

Modify `src/app/layout.tsx` — add startup call before first request:
```typescript
import './globals.css'
import type { ReactNode } from 'react'
import { getDb } from '@/lib/db'
import { reconcileActiveSessions } from '@/lib/startup'

let reconciled = false
async function ensureReconciled() {
  if (reconciled) return
  reconciled = true
  await reconcileActiveSessions(getDb())
}

export const metadata = {
  title: 'Remote Claude',
  description: 'Claude terminal sessions from anywhere',
  manifest: '/manifest.json',
}

export const viewport = {
  themeColor: '#10b981',
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  await ensureReconciled()
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-50 min-h-screen">{children}</body>
    </html>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/startup.ts src/__tests__/startup.test.ts src/app/layout.tsx
git commit -m "feat: add startup reconciliation for orphaned active sessions"
```

---

## Chunk 3: PTY Manager

### Task 7: PTY manager singleton

**Files:**
- Create: `src/lib/pty/manager.ts`
- Create: `src/__tests__/pty-manager.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/pty-manager.test.ts`:
```typescript
import { describe, it, expect } from 'bun:test'

describe('PtyManager', () => {
  it('starts with empty map', async () => {
    const { ptyManager } = await import('../lib/pty/manager')
    expect(ptyManager.size()).toBe(0)
  })

  it('returns null for unknown session', async () => {
    const { ptyManager } = await import('../lib/pty/manager')
    expect(ptyManager.get('nope')).toBeNull()
  })

  it('stores and retrieves an entry', async () => {
    const { ptyManager } = await import('../lib/pty/manager')
    const fakePty = { write: () => {}, resize: () => {}, kill: () => {}, onData: () => {}, onExit: () => {} } as any
    ptyManager.set('s1', { pty: fakePty, seq: 0 })
    const entry = ptyManager.get('s1')
    expect(entry).not.toBeNull()
    expect(entry!.seq).toBe(0)
    ptyManager.delete('s1')
  })

  it('deletes an entry', async () => {
    const { ptyManager } = await import('../lib/pty/manager')
    const fakePty = { write: () => {}, resize: () => {}, kill: () => {}, onData: () => {}, onExit: () => {} } as any
    ptyManager.set('s2', { pty: fakePty, seq: 0 })
    ptyManager.delete('s2')
    expect(ptyManager.get('s2')).toBeNull()
  })

  it('incrementSeq returns new value', async () => {
    const { ptyManager } = await import('../lib/pty/manager')
    const fakePty = { write: () => {}, resize: () => {}, kill: () => {}, onData: () => {}, onExit: () => {} } as any
    ptyManager.set('s3', { pty: fakePty, seq: 0 })
    expect(ptyManager.incrementSeq('s3')).toBe(1)
    expect(ptyManager.incrementSeq('s3')).toBe(2)
    ptyManager.delete('s3')
  })

  it('incrementSeq throws for unknown session', async () => {
    const { ptyManager } = await import('../lib/pty/manager')
    expect(() => ptyManager.incrementSeq('unknown')).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/__tests__/pty-manager.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement PTY manager**

Create `src/lib/pty/manager.ts`:
```typescript
import type { IPty } from 'node-pty'
import { EventPublisher } from '@orpc/server'

export interface PtyEntry {
  pty: IPty
  seq: number
}

export type SessionEvent =
  | { type: 'output'; seq: number; data: string }
  | { type: 'exit'; seq: number; data: '' }

// One channel per sessionId — PTY handlers publish, sessions.stream subscribes
export const sessionPublisher = new EventPublisher<Record<string, SessionEvent>>()

class PtyManager {
  private readonly map = new Map<string, PtyEntry>()

  get(sessionId: string): PtyEntry | null {
    return this.map.get(sessionId) ?? null
  }

  set(sessionId: string, entry: PtyEntry): void {
    this.map.set(sessionId, entry)
  }

  delete(sessionId: string): void {
    this.map.delete(sessionId)
  }

  size(): number {
    return this.map.size
  }

  /** Atomically increments seq counter and returns new value. Throws if session absent. */
  incrementSeq(sessionId: string): number {
    const entry = this.map.get(sessionId)
    if (!entry) throw new Error(`Session ${sessionId} not found in PTY map`)
    entry.seq += 1
    return entry.seq
  }
}

export const ptyManager = new PtyManager()
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/__tests__/pty-manager.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pty/manager.ts src/__tests__/pty-manager.test.ts
git commit -m "feat: add PTY manager singleton with EventPublisher"
```

---

## Chunk 4: oRPC Router + Session Procedures

### Task 8: oRPC router and Next.js handler

**Files:**
- Create: `src/lib/orpc/router.ts`
- Create: `src/app/api/rpc/[...rest]/route.ts`
- Create: `src/lib/orpc/sessions.ts` (stub)
- Create: `src/lib/orpc/system.ts` (stub)
- Create: `src/lib/orpc/directories.ts` (stub)

- [ ] **Step 1: Create stub sub-routers**

Create `src/lib/orpc/sessions.ts`:
```typescript
import { os } from '@orpc/server'
export const sessionsRouter = os.router({})
```

Create `src/lib/orpc/system.ts`:
```typescript
import { os } from '@orpc/server'
export const systemRouter = os.router({})
```

Create `src/lib/orpc/directories.ts`:
```typescript
import { os } from '@orpc/server'
export const directoriesRouter = os.router({})
```

- [ ] **Step 2: Create root router**

Create `src/lib/orpc/router.ts`:
```typescript
import { os } from '@orpc/server'
import { sessionsRouter } from './sessions'
import { systemRouter } from './system'
import { directoriesRouter } from './directories'

export const appRouter = os.router({
  sessions: sessionsRouter,
  system: systemRouter,
  directories: directoriesRouter,
})

export type AppRouter = typeof appRouter
```

- [ ] **Step 3: Create Next.js API route handler**

Create `src/app/api/rpc/[...rest]/route.ts`:
```typescript
import { RPCHandler } from '@orpc/server/fetch'
import { appRouter } from '@/lib/orpc/router'

const handler = new RPCHandler(appRouter)

async function handle(req: Request) {
  const { response } = await handler.handle(req, { prefix: '/api/rpc' })
  return response ?? new Response('Not Found', { status: 404 })
}

export { handle as GET, handle as POST }
```

- [ ] **Step 4: Verify it compiles**

```bash
AUTH_TOKEN=test bun run build 2>&1 | grep -c " error " || echo "0 errors"
```

Expected: `0 errors`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orpc/ src/app/api/rpc/
git commit -m "feat: add oRPC router scaffold and Next.js handler"
```

---

### Task 9: sessions.create and sessions.get

**Files:**
- Create: `src/lib/orpc/sessions-logic.ts`
- Modify: `src/lib/orpc/sessions.ts`
- Create: `src/__tests__/sessions-create-get.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/sessions-create-get.test.ts`:
```typescript
import { describe, it, expect } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { sessions } from '../lib/db/schema'

function makeTestDb() {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder: './src/lib/db/migrations' })
  return db
}

describe('createSession', () => {
  it('throws BAD_REQUEST if cwd does not exist', async () => {
    const { createSession } = await import('../lib/orpc/sessions-logic')
    const mockManager = { set: () => {}, size: () => 0, incrementSeq: () => 1, get: () => null, delete: () => {} } as any
    await expect(
      createSession({ name: 'test', cwd: '/nonexistent/path/xyz' }, makeTestDb(), mockManager)
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('throws BAD_REQUEST if cwd is a file', async () => {
    const { createSession } = await import('../lib/orpc/sessions-logic')
    const mockManager = { set: () => {}, size: () => 0, incrementSeq: () => 1, get: () => null, delete: () => {} } as any
    await expect(
      createSession({ name: 'test', cwd: '/etc/hosts' }, makeTestDb(), mockManager)
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('getSession', () => {
  it('throws NOT_FOUND for unknown id', async () => {
    const { getSession } = await import('../lib/orpc/sessions-logic')
    await expect(getSession('nonexistent', makeTestDb())).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('returns session for known id', async () => {
    const { getSession } = await import('../lib/orpc/sessions-logic')
    const db = makeTestDb()
    const now = Date.now()
    await db.insert(sessions).values({ id: 'test', name: 'T', cwd: '/tmp', status: 'active', createdAt: now, updatedAt: now })
    const s = await getSession('test', db)
    expect(s.id).toBe('test')
    expect(s.name).toBe('T')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/__tests__/sessions-create-get.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create sessions-logic.ts**

Create `src/lib/orpc/sessions-logic.ts`:
```typescript
import { ORPCError, withEventMeta } from '@orpc/server'
import { stat } from 'node:fs/promises'
import * as nodePty from 'node-pty'
import { eq, desc, asc, and, gte } from 'drizzle-orm'
import { sessions, sessionOutput, type Session } from '../db/schema'
import type { getDb } from '../db'
import { ptyManager, sessionPublisher, type SessionEvent } from '../pty/manager'

type Db = ReturnType<typeof getDb>

export async function createSession(
  input: { name: string; cwd: string },
  db: Db,
  manager: typeof ptyManager,
): Promise<Session> {
  // 1. Validate cwd is a real directory
  try {
    const s = await stat(input.cwd)
    if (!s.isDirectory()) throw new Error('not a directory')
  } catch {
    throw new ORPCError('BAD_REQUEST', { message: `cwd is not a valid directory: ${input.cwd}` })
  }

  // 2. Spawn PTY
  let ptyProcess: ReturnType<typeof nodePty.spawn>
  try {
    ptyProcess = nodePty.spawn('claude', [], {
      name: 'xterm-256color',
      cols: 220,
      rows: 50,
      cwd: input.cwd,
      env: process.env as Record<string, string>,
    })
  } catch (err) {
    throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Failed to spawn claude', cause: err })
  }

  // 3. Insert DB row only after successful spawn
  const id = crypto.randomUUID()
  const now = Date.now()
  await db.insert(sessions).values({ id, name: input.name, cwd: input.cwd, status: 'active', createdAt: now, updatedAt: now })

  // 4. Track in manager
  manager.set(id, { pty: ptyProcess, seq: 0 })

  // 5. onData: write to DB synchronously THEN publish (gap-free guarantee)
  ptyProcess.onData((data) => {
    const seq = manager.incrementSeq(id)
    db.insert(sessionOutput)
      .values({ sessionId: id, seq, type: 'output', data, createdAt: Date.now() })
      .run()
    sessionPublisher.publish(id, { type: 'output', seq, data })
  })

  // 6. onExit: write sentinel, update status, clean up
  ptyProcess.onExit(() => {
    let seq: number
    try { seq = manager.incrementSeq(id) } catch { return }
    try {
      db.insert(sessionOutput)
        .values({ sessionId: id, seq, type: 'exit', data: '', createdAt: Date.now() })
        .run()
    } catch {
      // Unique constraint: concurrent delete already wrote sentinel — ignore
    }
    db.update(sessions).set({ status: 'exited', updatedAt: Date.now() }).where(eq(sessions.id, id)).run()
    manager.delete(id)
    sessionPublisher.publish(id, { type: 'exit', seq, data: '' })
  })

  return { id, name: input.name, cwd: input.cwd, status: 'active', createdAt: now, updatedAt: now }
}

export async function getSession(id: string, db: Db): Promise<Session> {
  const rows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1)
  if (!rows.length) throw new ORPCError('NOT_FOUND', { message: `Session not found: ${id}` })
  return rows[0]
}

export async function listSessions(input: { status?: string }, db: Db): Promise<Session[]> {
  let query = db.select().from(sessions) as any
  if (input.status) query = query.where(eq(sessions.status, input.status as Session['status']))
  return query.orderBy(desc(sessions.createdAt))
}

export async function deleteSession(id: string, db: Db, manager: typeof ptyManager): Promise<void> {
  const entry = manager.get(id)
  if (entry) {
    entry.pty.kill()
    manager.delete(id)
  }
  await db.update(sessions).set({ status: 'killed', updatedAt: Date.now() }).where(eq(sessions.id, id))
}

export async function inputSession(id: string, data: string, db: Db, manager: typeof ptyManager): Promise<void> {
  const rows = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, id)).limit(1)
  if (!rows.length) throw new ORPCError('NOT_FOUND', { message: `Session not found: ${id}` })
  const entry = manager.get(id)
  if (!entry) throw new ORPCError('GONE', { message: `Session not active: ${id}` })
  entry.pty.write(data)
}

export async function resizeSession(id: string, cols: number, rows: number, db: Db, manager: typeof ptyManager): Promise<void> {
  const sessionRows = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, id)).limit(1)
  if (!sessionRows.length) throw new ORPCError('NOT_FOUND', { message: `Session not found: ${id}` })
  const entry = manager.get(id)
  if (!entry) throw new ORPCError('GONE', { message: `Session not active: ${id}` })
  entry.pty.resize(cols, rows)
}

export async function* streamSession(
  id: string,
  lastEventId: string | undefined,
  db: Db,
  manager: typeof ptyManager,
  publisher: typeof sessionPublisher,
): AsyncGenerator<SessionEvent> {
  const sessionRows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1)
  if (!sessionRows.length) throw new ORPCError('NOT_FOUND', { message: `Session not found: ${id}` })
  const session = sessionRows[0]

  const parsed = parseInt(lastEventId ?? '')
  const replayFrom = isNaN(parsed) ? 0 : parsed + 1

  // Inactive session: replay stored rows and return cleanly
  if (session.status !== 'active') {
    const rows = await db
      .select()
      .from(sessionOutput)
      .where(and(eq(sessionOutput.sessionId, id), gte(sessionOutput.seq, replayFrom)))
      .orderBy(asc(sessionOutput.seq))
    for (const row of rows) {
      yield withEventMeta(
        { type: row.type as 'output' | 'exit', seq: row.seq, data: row.data },
        { id: String(row.seq) },
      ) as SessionEvent
    }
    return
  }

  // Active session: subscribe BEFORE replay query to prevent race window
  const liveIterator = publisher.subscribe(id, { signal: AbortSignal.timeout(24 * 60 * 60 * 1000) })
  try {
    const replayRows = await db
      .select()
      .from(sessionOutput)
      .where(and(eq(sessionOutput.sessionId, id), gte(sessionOutput.seq, replayFrom)))
      .orderBy(asc(sessionOutput.seq))

    let lastReplayedSeq = replayFrom - 1
    for (const row of replayRows) {
      yield withEventMeta(
        { type: row.type as 'output' | 'exit', seq: row.seq, data: row.data },
        { id: String(row.seq) },
      ) as SessionEvent
      lastReplayedSeq = row.seq
    }

    for await (const event of liveIterator) {
      if (event.seq <= lastReplayedSeq) continue
      yield withEventMeta(event, { id: String(event.seq) }) as SessionEvent
    }
  } finally {
    // Unsubscribe on client disconnect — PTY keeps running
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/__tests__/sessions-create-get.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Wire into sessions router**

Replace `src/lib/orpc/sessions.ts`:
```typescript
import { os } from '@orpc/server'
import { type } from 'arktype'
import { getDb } from '../db'
import { ptyManager, sessionPublisher } from '../pty/manager'
import {
  createSession, getSession, listSessions, deleteSession,
  inputSession, resizeSession, streamSession,
} from './sessions-logic'

export const sessionsRouter = os.router({
  create: os
    .input(type({ name: 'string', cwd: 'string' }))
    .handler(async ({ input }) => createSession(input, getDb(), ptyManager)),

  get: os
    .input(type({ id: 'string' }))
    .handler(async ({ input }) => getSession(input.id, getDb())),

  list: os
    .input(type({ 'status?': 'string' }))
    .handler(async ({ input }) => listSessions(input, getDb())),

  delete: os
    .input(type({ id: 'string' }))
    .handler(async ({ input }) => deleteSession(input.id, getDb(), ptyManager)),

  input: os
    .input(type({ id: 'string', data: 'string' }))
    .handler(async ({ input }) => inputSession(input.id, input.data, getDb(), ptyManager)),

  resize: os
    .input(type({ id: 'string', cols: 'number', rows: 'number' }))
    .handler(async ({ input }) => resizeSession(input.id, input.cols, input.rows, getDb(), ptyManager)),

  stream: os
    .input(type({ id: 'string' }))
    .handler(async function* ({ input, lastEventId }) {
      yield* streamSession(input.id, lastEventId, getDb(), ptyManager, sessionPublisher)
    }),
})
```

- [ ] **Step 6: Write remaining session logic tests**

Create `src/__tests__/sessions-logic.test.ts`:
```typescript
import { describe, it, expect } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { sessions, sessionOutput } from '../lib/db/schema'

function makeTestDb() {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder: './src/lib/db/migrations' })
  return db
}

describe('listSessions', () => {
  it('returns empty array', async () => {
    const { listSessions } = await import('../lib/orpc/sessions-logic')
    expect(await listSessions({}, makeTestDb())).toEqual([])
  })

  it('orders by createdAt DESC', async () => {
    const { listSessions } = await import('../lib/orpc/sessions-logic')
    const db = makeTestDb()
    await db.insert(sessions).values([
      { id: 'a', name: 'A', cwd: '/tmp', status: 'active', createdAt: 1000, updatedAt: 1000 },
      { id: 'b', name: 'B', cwd: '/tmp', status: 'exited', createdAt: 2000, updatedAt: 2000 },
    ])
    const result = await listSessions({}, db)
    expect(result[0].id).toBe('b')
    expect(result[1].id).toBe('a')
  })

  it('filters by status', async () => {
    const { listSessions } = await import('../lib/orpc/sessions-logic')
    const db = makeTestDb()
    await db.insert(sessions).values([
      { id: 'a', name: 'A', cwd: '/tmp', status: 'active', createdAt: 1000, updatedAt: 1000 },
      { id: 'b', name: 'B', cwd: '/tmp', status: 'exited', createdAt: 2000, updatedAt: 2000 },
    ])
    const result = await listSessions({ status: 'active' }, db)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
  })
})

describe('deleteSession', () => {
  it('is a no-op for nonexistent id', async () => {
    const { deleteSession } = await import('../lib/orpc/sessions-logic')
    const manager = { get: () => null, delete: () => {} } as any
    await expect(deleteSession('nonexistent', makeTestDb(), manager)).resolves.toBeUndefined()
  })

  it('kills PTY and sets status to killed', async () => {
    const { deleteSession } = await import('../lib/orpc/sessions-logic')
    const db = makeTestDb()
    const now = Date.now()
    await db.insert(sessions).values({ id: 'test', name: 'T', cwd: '/tmp', status: 'active', createdAt: now, updatedAt: now })
    let killed = false
    const manager = { get: () => ({ pty: { kill: () => { killed = true } }, seq: 1 }), delete: () => {} } as any
    await deleteSession('test', db, manager)
    expect(killed).toBe(true)
    const rows = await db.select().from(sessions)
    expect(rows[0].status).toBe('killed')
  })
})

describe('inputSession', () => {
  it('throws NOT_FOUND when session absent', async () => {
    const { inputSession } = await import('../lib/orpc/sessions-logic')
    const manager = { get: () => null } as any
    await expect(inputSession('x', 'data', makeTestDb(), manager)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws GONE when PTY not active', async () => {
    const { inputSession } = await import('../lib/orpc/sessions-logic')
    const db = makeTestDb()
    const now = Date.now()
    await db.insert(sessions).values({ id: 't', name: 'T', cwd: '/tmp', status: 'active', createdAt: now, updatedAt: now })
    const manager = { get: () => null } as any
    await expect(inputSession('t', 'data', db, manager)).rejects.toMatchObject({ code: 'GONE' })
  })

  it('writes to PTY stdin', async () => {
    const { inputSession } = await import('../lib/orpc/sessions-logic')
    const db = makeTestDb()
    const now = Date.now()
    await db.insert(sessions).values({ id: 't', name: 'T', cwd: '/tmp', status: 'active', createdAt: now, updatedAt: now })
    const written: string[] = []
    const manager = { get: () => ({ pty: { write: (d: string) => written.push(d) }, seq: 1 }) } as any
    await inputSession('t', 'hello', db, manager)
    expect(written).toEqual(['hello'])
  })
})

describe('streamSession', () => {
  async function* emptyGen() {}

  it('throws NOT_FOUND for unknown session', async () => {
    const { streamSession } = await import('../lib/orpc/sessions-logic')
    const manager = { get: () => null } as any
    const publisher = { subscribe: () => emptyGen() } as any
    const gen = streamSession('nope', undefined, makeTestDb(), manager, publisher)
    await expect(gen.next()).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('replays all rows for exited session', async () => {
    const { streamSession } = await import('../lib/orpc/sessions-logic')
    const db = makeTestDb()
    const now = Date.now()
    await db.insert(sessions).values({ id: 's1', name: 'T', cwd: '/tmp', status: 'exited', createdAt: now, updatedAt: now })
    await db.insert(sessionOutput).values([
      { sessionId: 's1', seq: 1, type: 'output', data: 'hello', createdAt: now },
      { sessionId: 's1', seq: 2, type: 'exit', data: '', createdAt: now },
    ])
    const manager = { get: () => null } as any
    const publisher = { subscribe: () => emptyGen() } as any
    const events: any[] = []
    for await (const e of streamSession('s1', undefined, db, manager, publisher)) events.push(e)
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ type: 'output', seq: 1, data: 'hello' })
    expect(events[1]).toMatchObject({ type: 'exit', seq: 2 })
  })

  it('respects lastEventId for partial replay', async () => {
    const { streamSession } = await import('../lib/orpc/sessions-logic')
    const db = makeTestDb()
    const now = Date.now()
    await db.insert(sessions).values({ id: 's2', name: 'T', cwd: '/tmp', status: 'exited', createdAt: now, updatedAt: now })
    await db.insert(sessionOutput).values([
      { sessionId: 's2', seq: 1, type: 'output', data: 'a', createdAt: now },
      { sessionId: 's2', seq: 2, type: 'output', data: 'b', createdAt: now },
      { sessionId: 's2', seq: 3, type: 'exit', data: '', createdAt: now },
    ])
    const manager = { get: () => null } as any
    const publisher = { subscribe: () => emptyGen() } as any
    const events: any[] = []
    for await (const e of streamSession('s2', '1', db, manager, publisher)) events.push(e)
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ seq: 2 })
    expect(events[1]).toMatchObject({ seq: 3 })
  })
})
```

- [ ] **Step 7: Run all session logic tests**

```bash
bun test src/__tests__/sessions-create-get.test.ts src/__tests__/sessions-logic.test.ts
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/orpc/sessions-logic.ts src/lib/orpc/sessions.ts src/__tests__/sessions-create-get.test.ts src/__tests__/sessions-logic.test.ts
git commit -m "feat: implement all session oRPC procedures"
```

---

## Chunk 5: System, Directories, and Auth

### Task 10: system.home and directories.browse

**Files:**
- Create: `src/lib/orpc/directories-logic.ts`
- Modify: `src/lib/orpc/system.ts`
- Modify: `src/lib/orpc/directories.ts`
- Create: `src/__tests__/directories.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/directories.test.ts`:
```typescript
import { describe, it, expect } from 'bun:test'

describe('browseDirectory', () => {
  it('returns subdirectory names for /tmp', async () => {
    const { browseDirectory } = await import('../lib/orpc/directories-logic')
    const result = await browseDirectory('/tmp', '/')
    expect(result.path).toBe('/tmp')
    expect(Array.isArray(result.dirs)).toBe(true)
  })

  it('throws NOT_FOUND for nonexistent path', async () => {
    const { browseDirectory } = await import('../lib/orpc/directories-logic')
    await expect(browseDirectory('/nonexistent/xyz/abc123', '/')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws BAD_REQUEST when path is a file', async () => {
    const { browseDirectory } = await import('../lib/orpc/directories-logic')
    await expect(browseDirectory('/etc/hosts', '/')).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('throws FORBIDDEN when path is outside BROWSE_ROOT', async () => {
    const { browseDirectory } = await import('../lib/orpc/directories-logic')
    await expect(browseDirectory('/etc', '/home')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('prevents path traversal via ../', async () => {
    const { browseDirectory } = await import('../lib/orpc/directories-logic')
    await expect(browseDirectory('/home/../etc', '/home')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/__tests__/directories.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create directories-logic.ts**

Create `src/lib/orpc/directories-logic.ts`:
```typescript
import { ORPCError } from '@orpc/server'
import { stat, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function browseDirectory(
  path: string,
  browseRoot: string,
): Promise<{ path: string; dirs: string[] }> {
  const resolvedPath = resolve(path)
  const resolvedRoot = resolve(browseRoot)

  // Security: canonicalize both paths to prevent traversal
  const rootPrefix = resolvedRoot === '/' ? '/' : resolvedRoot + '/'
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(rootPrefix)) {
    throw new ORPCError('FORBIDDEN', { message: `Path is outside BROWSE_ROOT: ${path}` })
  }

  let pathStat: Awaited<ReturnType<typeof stat>>
  try {
    pathStat = await stat(resolvedPath)
  } catch {
    throw new ORPCError('NOT_FOUND', { message: `Path not found: ${path}` })
  }

  if (!pathStat.isDirectory()) {
    throw new ORPCError('BAD_REQUEST', { message: `Path is not a directory: ${path}` })
  }

  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(resolvedPath, { withFileTypes: true })
  } catch {
    throw new ORPCError('FORBIDDEN', { message: `Cannot read directory: ${path}` })
  }

  const dirs = entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => e.name)
    .sort()

  return { path: resolvedPath, dirs }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/__tests__/directories.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Wire into oRPC routers**

Replace `src/lib/orpc/system.ts`:
```typescript
import { os } from '@orpc/server'

export const systemRouter = os.router({
  home: os.handler(async () => ({
    home: process.env.HOME ?? '/',
  })),
})
```

Replace `src/lib/orpc/directories.ts`:
```typescript
import { os } from '@orpc/server'
import { type } from 'arktype'
import { getEnv } from '../env'
import { browseDirectory } from './directories-logic'

export const directoriesRouter = os.router({
  browse: os
    .input(type({ path: 'string' }))
    .handler(async ({ input }) => browseDirectory(input.path, getEnv().browseRoot)),
})
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/orpc/directories-logic.ts src/lib/orpc/system.ts src/lib/orpc/directories.ts src/__tests__/directories.test.ts
git commit -m "feat: implement system.home and directories.browse"
```

---

### Task 11: Auth — /api/auth route and middleware

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/route.ts`
- Create: `src/middleware.ts`
- Create: `src/__tests__/auth.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/auth.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'bun:test'

describe('validateToken', () => {
  beforeEach(() => { delete process.env.AUTH_TOKEN })

  it('returns true when token matches AUTH_TOKEN', () => {
    process.env.AUTH_TOKEN = 'secret'
    delete require.cache[require.resolve('../lib/auth')]
    const { validateToken } = require('../lib/auth')
    expect(validateToken('secret')).toBe(true)
  })

  it('returns false for wrong token', () => {
    process.env.AUTH_TOKEN = 'secret'
    delete require.cache[require.resolve('../lib/auth')]
    const { validateToken } = require('../lib/auth')
    expect(validateToken('wrong')).toBe(false)
  })

  it('returns false for empty token', () => {
    process.env.AUTH_TOKEN = 'secret'
    delete require.cache[require.resolve('../lib/auth')]
    const { validateToken } = require('../lib/auth')
    expect(validateToken('')).toBe(false)
  })

  it('returns false when AUTH_TOKEN is not set', () => {
    delete require.cache[require.resolve('../lib/auth')]
    const { validateToken } = require('../lib/auth')
    expect(validateToken('anything')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/__tests__/auth.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create auth utility**

Create `src/lib/auth.ts`:
```typescript
export const AUTH_COOKIE_NAME = 'session'

export function validateToken(token: string): boolean {
  if (!token) return false
  const authToken = process.env.AUTH_TOKEN
  if (!authToken) return false
  return token === authToken
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/__tests__/auth.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Create /api/auth route**

Create `src/app/api/auth/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { validateToken, AUTH_COOKIE_NAME } from '@/lib/auth'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { token?: string }
  if (!body.token || !validateToken(body.token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(AUTH_COOKIE_NAME, body.token, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
  })
  return res
}
```

- [ ] **Step 6: Create middleware**

Create `src/middleware.ts`:
```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { validateToken, AUTH_COOKIE_NAME } from '@/lib/auth'

const PUBLIC_PATHS = ['/login', '/api/auth']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return NextResponse.next()

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value ?? ''
  if (!validateToken(token)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/).*)'],
}
```

- [ ] **Step 7: Run all tests**

```bash
bun test
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth/route.ts src/middleware.ts src/__tests__/auth.test.ts
git commit -m "feat: add auth route and middleware with session cookie"
```

---

## Chunk 6: Frontend

### Task 12: oRPC client

**Files:**
- Create: `src/lib/orpc/client.ts`

- [ ] **Step 1: Create oRPC browser client**

Create `src/lib/orpc/client.ts`:
```typescript
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { AppRouter } from './router'

export const orpcClient = createORPCClient<AppRouter>({
  links: [
    new RPCLink({
      url: typeof window !== 'undefined'
        ? `${window.location.origin}/api/rpc`
        : 'http://localhost:3000/api/rpc',
      // Session cookie is sent automatically by the browser for same-origin requests
    }),
  ],
})
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/orpc/client.ts
git commit -m "feat: add oRPC browser client"
```

---

### Task 13: Login page

**Files:**
- Create: `src/app/login/page.tsx`

- [ ] **Step 1: Create login page**

Create `src/app/login/page.tsx`:
```typescript
'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        setError('Invalid token')
      }
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-emerald-400 mb-8 text-center">Remote Claude</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Access Token</label>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-50 focus:outline-none focus:border-emerald-500"
              placeholder="Enter your token"
              required
              autoFocus
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat: add login page"
```

---

### Task 14: Session card and dashboard

**Files:**
- Create: `src/components/session-card.tsx`
- Create: `src/components/session-dashboard.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create session card component**

Create `src/components/session-card.tsx`:
```typescript
'use client'

import { useRouter } from 'next/navigation'
import type { Session } from '@/lib/db/schema'

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

const STATUS_STYLES: Record<Session['status'], string> = {
  active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  exited: 'bg-zinc-700/40 text-zinc-400 border-zinc-600/30',
  killed: 'bg-red-500/20 text-red-400 border-red-500/30',
}

export function SessionCard({ session }: { session: Session }) {
  const router = useRouter()
  return (
    <button
      onClick={() => router.push(`/sessions/${session.id}`)}
      className="w-full text-left bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-4 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-medium text-zinc-50 truncate">{session.name}</span>
        <div className="flex items-center gap-2 shrink-0">
          {session.status === 'active' && (
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLES[session.status]}`}>
            {session.status}
          </span>
        </div>
      </div>
      <p className="text-xs text-zinc-500 truncate font-mono">{session.cwd}</p>
      <p className="text-xs text-zinc-600 mt-1">{timeAgo(session.updatedAt)}</p>
    </button>
  )
}
```

- [ ] **Step 2: Create session dashboard client component**

Create `src/components/session-dashboard.tsx`:
```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { orpcClient } from '@/lib/orpc/client'
import type { Session } from '@/lib/db/schema'
import { SessionCard } from './session-card'
import { CreateSessionDialog } from './directory-picker'

export function SessionDashboard({ initialHome }: { initialHome: string }) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [showCreate, setShowCreate] = useState(false)

  const fetchSessions = useCallback(async () => {
    try {
      const data = await orpcClient.sessions.list({})
      setSessions(data)
    } catch (err) {
      console.error('Failed to fetch sessions', err)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
    const interval = setInterval(fetchSessions, 5000)
    window.addEventListener('focus', fetchSessions)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', fetchSessions)
    }
  }, [fetchSessions])

  return (
    <div className="max-w-2xl mx-auto p-4 pt-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-emerald-400">Remote Claude</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New Session
        </button>
      </div>
      {sessions.length === 0 ? (
        <p className="text-zinc-500 text-center py-12">No sessions yet. Create one to get started.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => <SessionCard key={s.id} session={s} />)}
        </div>
      )}
      {showCreate && (
        <CreateSessionDialog
          initialHome={initialHome}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchSessions() }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Update app/page.tsx**

Replace `src/app/page.tsx`:
```typescript
import { orpcClient } from '@/lib/orpc/client'
import { SessionDashboard } from '@/components/session-dashboard'

export default async function HomePage() {
  const { home } = await orpcClient.system.home()
  return <SessionDashboard initialHome={home} />
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/session-card.tsx src/components/session-dashboard.tsx src/app/page.tsx
git commit -m "feat: add session dashboard and session card"
```

---

### Task 15: Directory picker

**Files:**
- Create: `src/components/directory-picker.tsx`

- [ ] **Step 1: Create directory picker and create session dialog**

Create `src/components/directory-picker.tsx`:
```typescript
'use client'

import { useState, useEffect } from 'react'
import { orpcClient } from '@/lib/orpc/client'

interface CreateDialogProps {
  initialHome: string
  onClose: () => void
  onCreated: () => void
}

export function CreateSessionDialog({ initialHome, onClose, onCreated }: CreateDialogProps) {
  const [name, setName] = useState('')
  const [currentPath, setCurrentPath] = useState(initialHome)
  const [dirs, setDirs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function browse(path: string) {
    try {
      const result = await orpcClient.directories.browse({ path })
      setDirs(result.dirs)
      setCurrentPath(result.path)
      setError('')
    } catch (err: any) {
      setError(err.message ?? 'Cannot browse path')
    }
  }

  useEffect(() => { browse(initialHome) }, [initialHome])

  async function handleCreate() {
    if (!name.trim()) { setError('Name is required'); return }
    setLoading(true)
    setError('')
    try {
      await orpcClient.sessions.create({ name: name.trim(), cwd: currentPath })
      onCreated()
    } catch (err: any) {
      setError(err.message ?? 'Failed to create session')
      setLoading(false)
    }
  }

  const parts = currentPath.split('/').filter(Boolean)
  const breadcrumbs = [
    { label: '/', path: '/' },
    ...parts.map((part, i) => ({
      label: part,
      path: '/' + parts.slice(0, i + 1).join('/'),
    })),
  ]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="font-semibold text-zinc-50">New Session</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 text-xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Session name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. my-project"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Working directory</label>
            <div className="flex flex-wrap gap-1 mb-2 text-xs">
              {breadcrumbs.map((crumb, i) => (
                <button key={crumb.path} onClick={() => browse(crumb.path)} className="text-emerald-400 hover:text-emerald-300">
                  {crumb.label}{i < breadcrumbs.length - 1 ? ' /' : ''}
                </button>
              ))}
            </div>
            <div className="bg-zinc-800 rounded-lg border border-zinc-700 max-h-48 overflow-y-auto">
              {dirs.length === 0 && <p className="text-zinc-500 text-sm p-3">No subdirectories</p>}
              {dirs.map(dir => (
                <button
                  key={dir}
                  onClick={() => browse(`${currentPath}/${dir}`)}
                  className="w-full text-left text-sm px-3 py-2 hover:bg-zinc-700 text-zinc-300 transition-colors"
                >
                  📁 {dir}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-1 font-mono truncate">{currentPath}</p>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
        <div className="p-4 border-t border-zinc-800">
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors"
          >
            {loading ? 'Creating…' : 'Create Session'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/directory-picker.tsx
git commit -m "feat: add directory picker and create session dialog"
```

---

### Task 16: Terminal view

**Files:**
- Create: `src/components/terminal.tsx`
- Create: `src/app/sessions/[id]/page.tsx`

- [ ] **Step 1: Create terminal component**

Create `src/components/terminal.tsx`:
```typescript
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { orpcClient } from '@/lib/orpc/client'

export function TerminalView({ sessionId }: { sessionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<string>('loading')
  const [sessionName, setSessionName] = useState('')
  const [cwd, setCwd] = useState('')
  const [ended, setEnded] = useState(false)
  const router = useRouter()

  const killSession = useCallback(async () => {
    if (!confirm('Kill this session?')) return
    await orpcClient.sessions.delete({ id: sessionId })
    router.push('/')
  }, [sessionId, router])

  useEffect(() => {
    if (!containerRef.current) return
    let destroyed = false

    async function init() {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ])
      await import('@xterm/xterm/css/xterm.css')
      if (destroyed) return

      const session = await orpcClient.sessions.get({ id: sessionId })
      if (destroyed) return
      setSessionName(session.name)
      setCwd(session.cwd)
      setStatus(session.status)

      const term = new Terminal({
        theme: { background: '#09090b', foreground: '#f4f4f5', cursor: '#10b981' },
        fontSize: 14,
        fontFamily: 'monospace',
        cursorBlink: true,
      })
      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(containerRef.current!)
      fitAddon.fit()

      if (session.status === 'active') {
        await orpcClient.sessions.resize({ id: sessionId, cols: term.cols, rows: term.rows })
        term.onKey(({ key }) => {
          orpcClient.sessions.input({ id: sessionId, data: key }).catch(() => {})
        })
      }

      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit()
        if (!destroyed && session.status === 'active') {
          orpcClient.sessions.resize({ id: sessionId, cols: term.cols, rows: term.rows }).catch(() => {})
        }
      })
      resizeObserver.observe(containerRef.current!)

      // Stream terminal output (works for active, exited, and killed sessions)
      for await (const event of await orpcClient.sessions.stream({ id: sessionId })) {
        if (destroyed) break
        if (event.type === 'output') {
          term.write(event.data)
        } else if (event.type === 'exit') {
          setEnded(true)
          setStatus('exited')
        }
      }

      resizeObserver.disconnect()
      term.dispose()
    }

    init().catch(console.error)
    return () => { destroyed = true }
  }, [sessionId])

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
        <button onClick={() => router.push('/')} className="text-zinc-400 hover:text-zinc-200 text-lg leading-none">←</button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-50 truncate">{sessionName || sessionId}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${
              status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
              status === 'killed' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
              'bg-zinc-700/40 text-zinc-400 border-zinc-600/30'
            }`}>{status}</span>
          </div>
          <p className="text-xs text-zinc-500 font-mono truncate">{cwd}</p>
        </div>
        {status === 'active' && (
          <button onClick={killSession} className="text-sm text-red-400 hover:text-red-300 shrink-0">Kill</button>
        )}
      </div>
      <div className="flex-1 overflow-hidden relative">
        <div ref={containerRef} className="w-full h-full" />
        {ended && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm px-4 py-2 rounded-full">
            Session ended
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create sessions/[id] page**

Create `src/app/sessions/[id]/page.tsx`:
```typescript
import { TerminalView } from '@/components/terminal'

interface Props {
  params: Promise<{ id: string }>
}

export default async function SessionPage({ params }: Props) {
  const { id } = await params
  return <TerminalView sessionId={id} />
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/terminal.tsx src/app/sessions/[id]/page.tsx
git commit -m "feat: add terminal view with xterm.js and oRPC streaming"
```

---

## Chunk 7: PWA + Final Integration

### Task 17: Configure next.config.ts

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Update next.config.ts**

Replace `next.config.ts`:
```typescript
import type { NextConfig } from 'next'
import withPWA from 'next-pwa'

const nextConfig: NextConfig = {
  // node-pty is a native module — must stay server-side only
  serverExternalPackages: ['node-pty'],
}

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^\/api\//,
      handler: 'NetworkOnly', // Never cache API routes — SSE streams must not be intercepted
    },
    {
      urlPattern: /^\/_next\/static\//,
      handler: 'CacheFirst',
      options: { cacheName: 'static-assets' },
    },
    {
      urlPattern: /^\/(?!api|_next)/,
      handler: 'NetworkFirst',
      options: { cacheName: 'pages', networkTimeoutSeconds: 10 },
    },
  ],
})(nextConfig)
```

- [ ] **Step 2: Commit**

```bash
git add next.config.ts
git commit -m "chore: configure next-pwa and node-pty as server external package"
```

---

### Task 18: PWA manifest and icons

**Files:**
- Create: `public/manifest.json`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`

- [ ] **Step 1: Create manifest.json**

Create `public/manifest.json`:
```json
{
  "name": "Remote Claude",
  "short_name": "RemoteClaude",
  "description": "Manage Claude Code terminal sessions from anywhere",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#09090b",
  "theme_color": "#10b981",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Create placeholder icons**

```bash
mkdir -p public/icons
# Write a minimal valid 1×1 PNG as a placeholder — replace with real icons before deploying
bun -e "
const fs = require('fs')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=', 'base64')
fs.writeFileSync('public/icons/icon-192.png', png)
fs.writeFileSync('public/icons/icon-512.png', png)
console.log('Placeholder icons created')
"
```

Note: Replace with real 192×192 and 512×512 PNGs before deploying.

- [ ] **Step 3: Commit**

```bash
git add public/
git commit -m "feat: add PWA manifest and placeholder icons"
```

---

### Task 19: Final integration and smoke test

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run all tests**

```bash
AUTH_TOKEN=test bun test
```

Expected: All tests pass.

- [ ] **Step 2: Build the app**

```bash
AUTH_TOKEN=test bun run build
```

Expected: Build succeeds. `public/sw.js` generated by next-pwa.

- [ ] **Step 3: Run migrations and smoke test**

```bash
AUTH_TOKEN=test-token bun run db:migrate

AUTH_TOKEN=test-token bun run start &
sleep 3

# Unauthenticated request should redirect
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)
echo "Unauthenticated / → $STATUS"  # expect 307

# Login
curl -s -c /tmp/rc-cookies.txt -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"token":"test-token"}' | grep '"ok":true'  # expect "ok":true

# List sessions (authenticated, empty list)
curl -s -b /tmp/rc-cookies.txt -X POST http://localhost:3000/api/rpc/sessions.list \
  -H "Content-Type: application/json" \
  -d '{}' | head -30  # expect []

kill %1
```

- [ ] **Step 4: Update README**

Replace `README.md`:
```markdown
# Remote Claude

A self-hosted PWA for managing interactive Claude Code terminal sessions remotely.
Access Claude instances from your phone via Tailscale.

## Requirements

- [Bun](https://bun.sh) runtime
- `claude` CLI in your PATH

## Setup

1. **Install dependencies**
   ```bash
   bun install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local — set AUTH_TOKEN to a strong secret
   ```

3. **Run database migrations**
   ```bash
   bun run db:migrate
   ```

4. **Start development server**
   ```bash
   bun dev
   ```

5. Open http://localhost:3000, enter your `AUTH_TOKEN` to log in.

## Production

```bash
bun run build
bun run start
```

Expose via [Tailscale](https://tailscale.com) for secure remote access from your phone.
Install as a PWA from your phone's browser for a native app experience.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTH_TOKEN` | yes | — | Your login token |
| `DATABASE_URL` | no | `./data/db.sqlite` | SQLite file path |
| `BROWSE_ROOT` | no | `/` | Restrict directory picker to this root |
```

- [ ] **Step 5: Final commit**

```bash
git add README.md
git commit -m "docs: update README with setup instructions"
```
