import { eq } from 'drizzle-orm'
import type { getDb } from './db'
import { sessions } from './db/schema'

export async function reconcileActiveSessions(db: ReturnType<typeof getDb>): Promise<void> {
  await db
    .update(sessions)
    .set({ status: 'exited', updatedAt: Date.now() })
    .where(eq(sessions.status, 'active'))
}
