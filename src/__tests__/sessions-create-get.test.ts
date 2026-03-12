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
      Promise.resolve(createSession({ name: 'test', cwd: '/nonexistent/path/xyz' }, makeTestDb(), mockManager))
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('throws BAD_REQUEST if cwd is a file', async () => {
    const { createSession } = await import('../lib/orpc/sessions-logic')
    const mockManager = { set: () => {}, size: () => 0, incrementSeq: () => 1, get: () => null, delete: () => {} } as any
    await expect(
      Promise.resolve(createSession({ name: 'test', cwd: '/etc/hosts' }, makeTestDb(), mockManager))
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('getSession', () => {
  it('throws NOT_FOUND for unknown id', async () => {
    const { getSession } = await import('../lib/orpc/sessions-logic')
    await expect(
      Promise.resolve(getSession('nonexistent', makeTestDb()))
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
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
