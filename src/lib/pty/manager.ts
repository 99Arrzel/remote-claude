import { EventPublisher } from '@orpc/server'

export interface PtyHandle {
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(cb: (data: string) => void): void
  onExit(cb: (e: { exitCode: number }) => void): void
}

export interface PtyEntry {
  pty: PtyHandle
  seq: number
}

export type SessionEvent =
  | { type: 'output'; seq: number; data: string }
  | { type: 'exit'; seq: number; data: '' }

export type NotificationEvent = {
  type: 'session_idle'
  sessionId: string
  sessionName: string
}

// One channel per sessionId — PTY handlers publish, sessions.stream subscribes
export const sessionPublisher = new EventPublisher<Record<string, SessionEvent>>()

// Global notification channel for idle detection etc.
export const notificationPublisher = new EventPublisher<Record<string, NotificationEvent>>()

// --- Idle detection ---
// Tracks output activity per session. After 5s of silence following substantial
// output (>200 bytes), publishes a session_idle notification.
const IDLE_TIMEOUT_MS = 5_000
const IDLE_BYTE_THRESHOLD = 200

const activityTimers = new Map<string, ReturnType<typeof setTimeout>>()
const activityBytes = new Map<string, number>()
const sessionNames = new Map<string, string>()

export function trackSessionName(sessionId: string, name: string) {
  sessionNames.set(sessionId, name)
}

export function markSessionActive(sessionId: string, bytes: number) {
  activityBytes.set(sessionId, (activityBytes.get(sessionId) ?? 0) + bytes)

  const existing = activityTimers.get(sessionId)
  if (existing) clearTimeout(existing)

  activityTimers.set(sessionId, setTimeout(() => {
    activityTimers.delete(sessionId)
    const totalBytes = activityBytes.get(sessionId) ?? 0
    activityBytes.set(sessionId, 0)
    if (totalBytes >= IDLE_BYTE_THRESHOLD) {
      const name = sessionNames.get(sessionId) ?? 'Session'
      notificationPublisher.publish('global', { type: 'session_idle', sessionId, sessionName: name })
    }
  }, IDLE_TIMEOUT_MS))
}

export function clearActivityTimer(sessionId: string) {
  const timer = activityTimers.get(sessionId)
  if (timer) {
    clearTimeout(timer)
    activityTimers.delete(sessionId)
  }
  activityBytes.delete(sessionId)
  sessionNames.delete(sessionId)
}

class PtyManager {
  private readonly map = new Map<string, PtyEntry>()

  get(sessionId: string): PtyEntry | null {
    return this.map.get(sessionId) ?? null
  }

  set(sessionId: string, entry: PtyEntry): void {
    this.map.set(sessionId, entry)
  }

  delete(sessionId: string): void {
    this.map.delete(sessionId)
  }

  size(): number {
    return this.map.size
  }

  /** Atomically increments seq counter and returns new value. Throws if session absent. */
  incrementSeq(sessionId: string): number {
    const entry = this.map.get(sessionId)
    if (!entry) throw new Error(`Session ${sessionId} not found in PTY map`)
    entry.seq += 1
    return entry.seq
  }
}

export const ptyManager = new PtyManager()
