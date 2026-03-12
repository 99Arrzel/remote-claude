import { describe, it, expect } from 'bun:test'

describe('PtyManager', () => {
  it('starts with empty map', async () => {
    const { ptyManager } = await import('../lib/pty/manager')
    expect(ptyManager.size()).toBe(0)
  })

  it('returns null for unknown session', async () => {
    const { ptyManager } = await import('../lib/pty/manager')
    expect(ptyManager.get('nope')).toBeNull()
  })

  it('stores and retrieves an entry', async () => {
    const { ptyManager } = await import('../lib/pty/manager')
    const fakePty = { write: () => {}, resize: () => {}, kill: () => {}, onData: () => {}, onExit: () => {} } as any
    ptyManager.set('s1', { pty: fakePty, seq: 0 })
    const entry = ptyManager.get('s1')
    expect(entry).not.toBeNull()
    expect(entry!.seq).toBe(0)
    ptyManager.delete('s1')
  })

  it('deletes an entry', async () => {
    const { ptyManager } = await import('../lib/pty/manager')
    const fakePty = { write: () => {}, resize: () => {}, kill: () => {}, onData: () => {}, onExit: () => {} } as any
    ptyManager.set('s2', { pty: fakePty, seq: 0 })
    ptyManager.delete('s2')
    expect(ptyManager.get('s2')).toBeNull()
  })

  it('incrementSeq returns new value', async () => {
    const { ptyManager } = await import('../lib/pty/manager')
    const fakePty = { write: () => {}, resize: () => {}, kill: () => {}, onData: () => {}, onExit: () => {} } as any
    ptyManager.set('s3', { pty: fakePty, seq: 0 })
    expect(ptyManager.incrementSeq('s3')).toBe(1)
    expect(ptyManager.incrementSeq('s3')).toBe(2)
    ptyManager.delete('s3')
  })

  it('incrementSeq throws for unknown session', async () => {
    const { ptyManager } = await import('../lib/pty/manager')
    expect(() => ptyManager.incrementSeq('unknown')).toThrow()
  })
})
