// Next.js instrumentation hook — runs once when the server starts
// This is the correct place for server-side initialization that requires
// Bun-specific APIs like bun:sqlite
export async function register() {
  // Only run on the server runtime, not during static build
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    return
  }
  // In Bun runtime (production start), run startup reconciliation
  try {
    const { getDb } = await import('./src/lib/db/index')
    const { reconcileActiveSessions } = await import('./src/lib/startup')
    await reconcileActiveSessions(getDb())
  } catch (err) {
    console.error('[startup] reconciliation failed:', err)
  }
}
