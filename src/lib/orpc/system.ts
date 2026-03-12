import { os } from '@orpc/server'

export const systemRouter = os.router({
  home: os.handler(async () => ({
    home: process.env.HOME ?? '/',
  })),
})
