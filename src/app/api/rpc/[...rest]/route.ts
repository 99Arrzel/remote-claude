// This route uses bun:sqlite and node-pty — never statically generated
export const dynamic = 'force-dynamic'

// Lazy singleton — deferred until first request so the module graph
// for this route does NOT contain a static require('bun:sqlite'),
// which would crash Next.js Node.js build workers during page data collection.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _handler: any | null = null

async function getHandler() {
  if (_handler) return _handler
  const { RPCHandler } = await import('@orpc/server/fetch')
  const { appRouter } = await import('@/lib/orpc/router')
  _handler = new RPCHandler(appRouter)
  return _handler
}

async function handle(req: Request) {
  const handler = await getHandler()
  const { response } = await handler.handle(req, { prefix: '/api/rpc' })
  return response ?? new Response('Not Found', { status: 404 })
}

export { handle as GET, handle as POST }
