import { os } from '@orpc/server'
import { sessionsRouter } from './sessions'
import { systemRouter } from './system'
import { directoriesRouter } from './directories'
import { claudeSessionsRouter } from './claude-sessions'
import { notificationsRouter } from './notifications'

export const appRouter = os.router({
  sessions: sessionsRouter,
  claudeSessions: claudeSessionsRouter,
  notifications: notificationsRouter,
  system: systemRouter,
  directories: directoriesRouter,
})

export type AppRouter = typeof appRouter
