import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  trackSessionName,
  markSessionActive,
  clearActivityTimer,
  notificationPublisher,
} from '../lib/pty/manager'

describe('idle notification', () => {
  const sessionId = 'test-idle-session'

  afterEach(() => {
    clearActivityTimer(sessionId)
  })

  it('publishes session_idle after 5s of silence with enough output', async () => {
    trackSessionName(sessionId, 'Test Session')

    // Simulate substantial output
    markSessionActive(sessionId, 300)

    const events: any[] = []
    const ac = new AbortController()

    const collectPromise = (async () => {
      for await (const event of notificationPublisher.subscribe('global', { signal: ac.signal })) {
        if (event.sessionId !== sessionId) continue
        events.push(event)
        break
      }
    })()

    // Wait for idle timeout (5s) + buffer
    await new Promise(r => setTimeout(r, 5500))
    ac.abort()

    try { await collectPromise } catch { /* abort */ }

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('session_idle')
    expect(events[0].sessionId).toBe(sessionId)
    expect(events[0].sessionName).toBe('Test Session')
  }, 10000)

  it('does NOT publish if output is below byte threshold', async () => {
    trackSessionName(sessionId, 'Tiny Session')

    // Simulate tiny output (below 200 byte threshold)
    markSessionActive(sessionId, 50)

    const events: any[] = []
    const ac = new AbortController()

    const collectPromise = (async () => {
      for await (const event of notificationPublisher.subscribe('global', { signal: ac.signal })) {
        if (event.sessionId !== sessionId) continue
        events.push(event)
      }
    })()

    await new Promise(r => setTimeout(r, 5500))
    ac.abort()

    try { await collectPromise } catch { /* abort */ }

    expect(events).toHaveLength(0)
  }, 10000)

  it('resets timer on new activity', async () => {
    trackSessionName(sessionId, 'Active Session')

    markSessionActive(sessionId, 300)

    // After 3s, send more output — should reset the 5s timer
    await new Promise(r => setTimeout(r, 3000))
    markSessionActive(sessionId, 100)

    const events: any[] = []
    const ac = new AbortController()

    const collectPromise = (async () => {
      for await (const event of notificationPublisher.subscribe('global', { signal: ac.signal })) {
        if (event.sessionId !== sessionId) continue
        events.push(event)
        break
      }
    })()

    // At 3s we reset, so idle fires at 3+5=8s. Wait until 6s total — should NOT have fired yet
    await new Promise(r => setTimeout(r, 2500))
    expect(events).toHaveLength(0)

    // Wait for the remaining time + buffer
    await new Promise(r => setTimeout(r, 3000))
    ac.abort()

    try { await collectPromise } catch { /* abort */ }

    expect(events).toHaveLength(1)
  }, 12000)
})
