export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getDb } = await import('./lib/db/index')
    const { reconcileActiveSessions } = await import('./lib/startup')
    await reconcileActiveSessions(getDb())
  }
}
