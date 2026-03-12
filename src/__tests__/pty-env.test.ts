import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

describe('buildPtyEnv', () => {
  const originalClaudeCode = process.env.CLAUDECODE

  beforeEach(() => { process.env.CLAUDECODE = 'test-value' })
  afterEach(() => {
    if (originalClaudeCode !== undefined) process.env.CLAUDECODE = originalClaudeCode
    else delete process.env.CLAUDECODE
  })

  it('excludes CLAUDECODE from the spawned env', async () => {
    const { buildPtyEnv } = await import('../lib/orpc/sessions-logic')
    const env = buildPtyEnv()
    expect('CLAUDECODE' in env).toBe(false)
  })

  it('preserves other environment variables', async () => {
    const { buildPtyEnv } = await import('../lib/orpc/sessions-logic')
    process.env.HOME = process.env.HOME ?? '/root'
    const env = buildPtyEnv()
    expect(env.HOME).toBe(process.env.HOME)
  })
})
