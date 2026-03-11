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
    await expect(Promise.resolve(reconcileActiveSessions(db))).resolves.toBeUndefined()
  })
})
