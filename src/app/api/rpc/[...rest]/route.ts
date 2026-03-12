import { RPCHandler } from '@orpc/server/fetch'
import { appRouter } from '@/lib/orpc/router'

const handler = new RPCHandler(appRouter)

async function handle(req: Request) {
  const { response } = await handler.handle(req, { prefix: '/api/rpc' })
  return response ?? new Response('Not Found', { status: 404 })
}

export { handle as GET, handle as POST }
