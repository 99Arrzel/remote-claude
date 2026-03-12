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
    await expect(Promise.resolve(deleteSession('nonexistent', makeTestDb(), manager))).resolves.toBeUndefined()
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
    await expect(Promise.resolve(inputSession('x', 'data', makeTestDb(), manager))).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws GONE when PTY not active', async () => {
    const { inputSession } = await import('../lib/orpc/sessions-logic')
    const db = makeTestDb()
    const now = Date.now()
    await db.insert(sessions).values({ id: 't', name: 'T', cwd: '/tmp', status: 'active', createdAt: now, updatedAt: now })
    const manager = { get: () => null } as any
    await expect(Promise.resolve(inputSession('t', 'data', db, manager))).rejects.toMatchObject({ code: 'GONE' })
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
    await expect(Promise.resolve(gen.next())).rejects.toMatchObject({ code: 'NOT_FOUND' })
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
