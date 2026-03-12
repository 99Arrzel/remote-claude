import { os } from '@orpc/server'
import { sessionsRouter } from './sessions'
import { systemRouter } from './system'
import { directoriesRouter } from './directories'

export const appRouter = os.router({
  sessions: sessionsRouter,
  system: systemRouter,
  directories: directoriesRouter,
})

export type AppRouter = typeof appRouter
