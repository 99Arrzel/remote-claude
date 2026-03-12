import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'
import type { AppRouter } from './router'

export const orpcClient = createORPCClient<RouterClient<AppRouter>>(
  new RPCLink({
    url: typeof window !== 'undefined'
      ? `${window.location.origin}/api/rpc`
      : 'http://localhost:3000/api/rpc',
  }),
)
