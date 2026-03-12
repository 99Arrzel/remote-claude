import { ORPCError, withEventMeta } from '@orpc/server'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { eq, desc, asc, and, gte } from 'drizzle-orm'
import { sessions, sessionOutput, type Session } from '../db/schema'
import type { getDb } from '../db'
import { ptyManager, sessionPublisher, type SessionEvent, type PtyHandle } from '../pty/manager'

type Db = ReturnType<typeof getDb>

export function buildPtyEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k !== 'CLAUDECODE')
  ) as Record<string, string>
}

/** Spawn claude via a Node.js bridge process (Bun + node-pty is broken: SIGHUP + no onData). */
function spawnBridge(cmd: string, args: string[], opts: { cwd: string; cols: number; rows: number }): PtyHandle {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { spawn } = require('child_process') as typeof import('child_process')
  const bridgePath = join(process.cwd(), 'src', 'lib', 'pty', 'bridge.mjs')
  const child = spawn('node', [bridgePath], {
    env: {
      ...buildPtyEnv(),
      PTY_CMD: cmd,
      PTY_ARGS: JSON.stringify(args),
      PTY_CWD: opts.cwd,
      PTY_COLS: String(opts.cols),
      PTY_ROWS: String(opts.rows),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return {
    write(data: string) { child.stdin.write(data) },
    resize(cols: number, rows: number) {
      child.stdin.write('\x00' + JSON.stringify({ type: 'resize', cols, rows }) + '\n')
    },
    kill() { child.kill() },
    onData(cb: (data: string) => void) {
      child.stdout.on('data', (buf: Buffer) => cb(buf.toString()))
    },
    onExit(cb: (e: { exitCode: number }) => void) {
      child.on('exit', (code: number | null) => cb({ exitCode: code ?? 0 }))
    },
  }
}

export async function createSession(
  input: { name: string; cwd: string; claudeSessionId?: string; resume?: boolean },
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

  // 2. Spawn PTY via Node.js bridge
  let ptyProcess: PtyHandle
  const args = input.claudeSessionId
    ? ['--resume', input.claudeSessionId]
    : input.resume ? ['--continue'] : []
  try {
    ptyProcess = spawnBridge('claude', args, { cwd: input.cwd, cols: 220, rows: 50 })
  } catch (err) {
    throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Failed to spawn claude', cause: err })
  }

  // 3. Insert DB row only after successful spawn
  const id = crypto.randomUUID()
  const now = Date.now()
  const claudeSessionId = input.claudeSessionId ?? null
  await db.insert(sessions).values({ id, name: input.name, cwd: input.cwd, status: 'active', claudeSessionId, createdAt: now, updatedAt: now })

  // 4. Track in manager
  manager.set(id, { pty: ptyProcess, seq: 0 })

  // 5. onData: write to DB synchronously THEN publish
  ptyProcess.onData((data) => {
    let seq: number
    try { seq = manager.incrementSeq(id) } catch { return }
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
      // Unique constraint: sentinel already written — ignore
    }
    db.update(sessions).set({ status: 'exited', updatedAt: Date.now() }).where(eq(sessions.id, id)).run()
    manager.delete(id)
    sessionPublisher.publish(id, { type: 'exit', seq, data: '' })
  })

  return { id, name: input.name, cwd: input.cwd, status: 'active', claudeSessionId, createdAt: now, updatedAt: now }
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
    // Do NOT call manager.delete(id) here — onExit handler will clean up and publish the exit event
    // so active stream subscribers receive the exit sentinel and can close cleanly.
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
    // Client disconnected — PTY keeps running
  }
}
