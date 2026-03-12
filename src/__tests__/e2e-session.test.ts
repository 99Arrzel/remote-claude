import { describe, it, expect, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { eq } from 'drizzle-orm'
import { sessions, sessionOutput } from '../lib/db/schema'
import { ptyManager } from '../lib/pty/manager'

function makeTestDb() {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder: './src/lib/db/migrations' })
  return db
}

describe('e2e: session lifecycle via bridge', () => {
  const sessionIds: string[] = []

  afterEach(() => {
    for (const id of sessionIds) {
      const entry = ptyManager.get(id)
      if (entry) {
        entry.pty.kill()
        ptyManager.delete(id)
      }
    }
    sessionIds.length = 0
  })

  it('creates a session that stays active and produces output', async () => {
    const { createSession } = await import('../lib/orpc/sessions-logic')
    const db = makeTestDb()

    const session = await createSession(
      { name: 'e2e-test', cwd: '/tmp' },
      db,
      ptyManager,
    )
    sessionIds.push(session.id)

    expect(session.status).toBe('active')

    // Wait for output
    await new Promise(r => setTimeout(r, 2000))

    // Session should still be active in DB
    const rows = db.select().from(sessions).where(eq(sessions.id, session.id)).all()
    expect(rows[0].status).toBe('active')

    // PTY manager should still have the entry
    const entry = ptyManager.get(session.id)
    expect(entry).not.toBeNull()

    // Should have produced some output (Claude renders its TUI)
    const output = db.select().from(sessionOutput).where(eq(sessionOutput.sessionId, session.id)).all()
    expect(output.length).toBeGreaterThan(0)
    expect(output.every(o => o.type === 'output')).toBe(true)
  }, 10000)

  it('records exit event when session is killed', async () => {
    const { createSession } = await import('../lib/orpc/sessions-logic')
    const db = makeTestDb()

    const session = await createSession(
      { name: 'e2e-kill', cwd: '/tmp' },
      db,
      ptyManager,
    )
    sessionIds.push(session.id)

    await new Promise(r => setTimeout(r, 1000))
    expect(ptyManager.get(session.id)).not.toBeNull()

    // Kill the PTY
    ptyManager.get(session.id)!.pty.kill()

    // Wait for exit propagation
    await new Promise(r => setTimeout(r, 1000))

    const rows = db.select().from(sessions).where(eq(sessions.id, session.id)).all()
    expect(rows[0].status).toBe('exited')

    expect(ptyManager.get(session.id)).toBeNull()
  }, 10000)
})
