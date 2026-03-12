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

// One channel per sessionId — PTY handlers publish, sessions.stream subscribes
export const sessionPublisher = new EventPublisher<Record<string, SessionEvent>>()

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
