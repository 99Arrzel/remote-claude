import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const SESSION_LINE = (sessionId: string, cwd: string, branch = 'main') => JSON.stringify({
  type: 'user', parentUuid: null, isSidechain: false, userType: 'external',
  cwd, sessionId, version: '2.0.0', gitBranch: branch, isMeta: false,
  uuid: 'uuid-1', timestamp: '2026-01-01T00:00:00.000Z',
  message: { role: 'user', content: 'hello world' },
})

const META_LINE = (sessionId: string, cwd: string) => JSON.stringify({
  type: 'user', parentUuid: null, isSidechain: false, userType: 'external',
  cwd, sessionId, version: '2.0.0', gitBranch: 'main', isMeta: true,
  uuid: 'uuid-meta', timestamp: '2026-01-01T00:00:00.000Z',
  message: { role: 'user', content: '<system-tag>ignored</system-tag>' },
})

let tmpDir: string

beforeEach(() => {
  tmpDir = join(tmpdir(), `claude-sessions-test-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('listClaudeSessions', () => {
  it('returns empty array when projects dir does not exist', async () => {
    const { listClaudeSessions } = await import('../lib/orpc/claude-sessions-logic')
    const result = await listClaudeSessions(join(tmpDir, 'nonexistent'))
    expect(result).toEqual([])
  })

  it('returns empty array when projects dir is empty', async () => {
    const { listClaudeSessions } = await import('../lib/orpc/claude-sessions-logic')
    const result = await listClaudeSessions(tmpDir)
    expect(result).toEqual([])
  })

  it('reads a session from a JSONL file', async () => {
    const { listClaudeSessions } = await import('../lib/orpc/claude-sessions-logic')
    const projDir = join(tmpDir, '-home-link-myproject')
    mkdirSync(projDir)
    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000001'
    writeFileSync(join(projDir, `${sessionId}.jsonl`), SESSION_LINE(sessionId, '/home/link/myproject') + '\n')
    const result = await listClaudeSessions(tmpDir)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(sessionId)
    expect(result[0].cwd).toBe('/home/link/myproject')
    expect(result[0].summary).toBe('hello world')
    expect(result[0].gitBranch).toBe('main')
  })

  it('skips meta messages and uses first real user message as summary', async () => {
    const { listClaudeSessions } = await import('../lib/orpc/claude-sessions-logic')
    const projDir = join(tmpDir, '-home-link')
    mkdirSync(projDir)
    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000002'
    const content = [
      META_LINE(sessionId, '/home/link'),
      SESSION_LINE(sessionId, '/home/link'),
    ].join('\n') + '\n'
    writeFileSync(join(projDir, `${sessionId}.jsonl`), content)
    const result = await listClaudeSessions(tmpDir)
    expect(result[0].summary).toBe('hello world')
  })

  it('returns null summary when no real user message found', async () => {
    const { listClaudeSessions } = await import('../lib/orpc/claude-sessions-logic')
    const projDir = join(tmpDir, '-home-link')
    mkdirSync(projDir)
    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000003'
    writeFileSync(join(projDir, `${sessionId}.jsonl`), META_LINE(sessionId, '/home/link') + '\n')
    const result = await listClaudeSessions(tmpDir)
    expect(result[0].summary).toBeNull()
  })

  it('skips JSONL files with no cwd', async () => {
    const { listClaudeSessions } = await import('../lib/orpc/claude-sessions-logic')
    const projDir = join(tmpDir, '-home-link')
    mkdirSync(projDir)
    writeFileSync(join(projDir, 'aaaaaaaa-0000-0000-0000-000000000004.jsonl'), '{"type":"file-history-snapshot"}\n')
    const result = await listClaudeSessions(tmpDir)
    expect(result).toHaveLength(0)
  })

  it('handles malformed JSON lines gracefully', async () => {
    const { listClaudeSessions } = await import('../lib/orpc/claude-sessions-logic')
    const projDir = join(tmpDir, '-home-link')
    mkdirSync(projDir)
    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000005'
    const content = 'not json\n' + SESSION_LINE(sessionId, '/home/link') + '\n'
    writeFileSync(join(projDir, `${sessionId}.jsonl`), content)
    const result = await listClaudeSessions(tmpDir)
    expect(result).toHaveLength(1)
    expect(result[0].cwd).toBe('/home/link')
  })

  it('sorts results newest-first by file mtime', async () => {
    const { listClaudeSessions } = await import('../lib/orpc/claude-sessions-logic')
    const projDir = join(tmpDir, '-home-link')
    mkdirSync(projDir)
    const id1 = 'aaaaaaaa-0000-0000-0000-000000000006'
    const id2 = 'aaaaaaaa-0000-0000-0000-000000000007'
    writeFileSync(join(projDir, `${id1}.jsonl`), SESSION_LINE(id1, '/home/link') + '\n')
    // Small delay to get different mtime
    await new Promise(r => setTimeout(r, 10))
    writeFileSync(join(projDir, `${id2}.jsonl`), SESSION_LINE(id2, '/home/link/other') + '\n')
    const result = await listClaudeSessions(tmpDir)
    expect(result[0].id).toBe(id2)
    expect(result[1].id).toBe(id1)
  })

  it('truncates summary to 120 characters', async () => {
    const { listClaudeSessions } = await import('../lib/orpc/claude-sessions-logic')
    const projDir = join(tmpDir, '-home-link')
    mkdirSync(projDir)
    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000008'
    const longText = 'a'.repeat(200)
    const line = JSON.stringify({
      type: 'user', cwd: '/home/link', sessionId, isMeta: false,
      message: { role: 'user', content: longText },
    })
    writeFileSync(join(projDir, `${sessionId}.jsonl`), line + '\n')
    const result = await listClaudeSessions(tmpDir)
    expect(result[0].summary?.length).toBe(120)
  })

  it('extracts model and token usage from last assistant message', async () => {
    const { listClaudeSessions } = await import('../lib/orpc/claude-sessions-logic')
    const projDir = join(tmpDir, '-home-link')
    mkdirSync(projDir)
    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000010'
    const lines = [
      SESSION_LINE(sessionId, '/home/link'),
      JSON.stringify({
        type: 'assistant', cwd: '/home/link', sessionId,
        message: {
          role: 'assistant', content: 'hi',
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 100, cache_creation_input_tokens: 200, cache_read_input_tokens: 300, output_tokens: 50 },
        },
      }),
    ].join('\n') + '\n'
    writeFileSync(join(projDir, `${sessionId}.jsonl`), lines)
    const result = await listClaudeSessions(tmpDir)
    expect(result[0].model).toBe('claude-sonnet-4-6')
    expect(result[0].totalTokens).toBe(650)
  })

  it('returns null model/tokens when no assistant messages', async () => {
    const { listClaudeSessions } = await import('../lib/orpc/claude-sessions-logic')
    const projDir = join(tmpDir, '-home-link')
    mkdirSync(projDir)
    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000011'
    writeFileSync(join(projDir, `${sessionId}.jsonl`), SESSION_LINE(sessionId, '/home/link') + '\n')
    const result = await listClaudeSessions(tmpDir)
    expect(result[0].model).toBeNull()
    expect(result[0].totalTokens).toBeNull()
  })

  it('reads cwd from content-array user messages', async () => {
    const { listClaudeSessions } = await import('../lib/orpc/claude-sessions-logic')
    const projDir = join(tmpDir, '-home-link')
    mkdirSync(projDir)
    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000009'
    const line = JSON.stringify({
      type: 'user', cwd: '/home/link', sessionId, isMeta: false,
      message: { role: 'user', content: [{ type: 'text', text: 'array message' }] },
    })
    writeFileSync(join(projDir, `${sessionId}.jsonl`), line + '\n')
    const result = await listClaudeSessions(tmpDir)
    expect(result[0].summary).toBe('array message')
  })
})
