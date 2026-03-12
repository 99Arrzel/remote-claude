import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { AppRouter } from './router'

export const orpcClient = createORPCClient<AppRouter>({
  links: [
    new RPCLink({
      url: typeof window !== 'undefined'
        ? `${window.location.origin}/api/rpc`
        : 'http://localhost:3000/api/rpc',
    }),
  ],
})
