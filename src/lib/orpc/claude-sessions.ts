import { os } from '@orpc/server'
import { type } from 'arktype'
import { listClaudeSessions } from './claude-sessions-logic'

export const claudeSessionsRouter = os.router({
  list: os
    .input(type({}))
    .handler(() => listClaudeSessions()),
})
