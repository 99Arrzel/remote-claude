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
      Promise.resolve().then(() =>
        db.insert(sessionOutput).values({ sessionId: 's1', seq: 1, type: 'output', data: 'b', createdAt: now }).run()
      )
    ).rejects.toThrow()
  })
})
