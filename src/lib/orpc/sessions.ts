import { os } from '@orpc/server'
import { type } from 'arktype'
import { getDb } from '../db'
import { ptyManager, sessionPublisher } from '../pty/manager'
import {
  createSession, getSession, listSessions, deleteSession,
  inputSession, resizeSession, streamSession,
} from './sessions-logic'

export const sessionsRouter = os.router({
  create: os
    .input(type({ name: 'string', cwd: 'string', 'claudeSessionId?': 'string', 'resume?': 'boolean' }))
    .handler(async ({ input }) => createSession(input, getDb(), ptyManager)),

  get: os
    .input(type({ id: 'string' }))
    .handler(async ({ input }) => getSession(input.id, getDb())),

  list: os
    .input(type({ 'status?': 'string' }))
    .handler(async ({ input }) => listSessions(input, getDb())),

  delete: os
    .input(type({ id: 'string' }))
    .handler(async ({ input }) => deleteSession(input.id, getDb(), ptyManager)),

  input: os
    .input(type({ id: 'string', data: 'string' }))
    .handler(async ({ input }) => inputSession(input.id, input.data, getDb(), ptyManager)),

  resize: os
    .input(type({ id: 'string', cols: 'number', rows: 'number' }))
    .handler(async ({ input }) => resizeSession(input.id, input.cols, input.rows, getDb(), ptyManager)),

  stream: os
    .input(type({ id: 'string' }))
    .handler(async function* ({ input, lastEventId }) {
      yield* streamSession(input.id, lastEventId, getDb(), ptyManager, sessionPublisher)
    }),
})
