import { os } from '@orpc/server'
import { notificationPublisher } from '../pty/manager'

export const notificationsRouter = os.router({
  stream: os
    .handler(async function* () {
      for await (const event of notificationPublisher.subscribe('global', {
        signal: AbortSignal.timeout(24 * 60 * 60 * 1000),
      })) {
        yield event
      }
    }),
})
