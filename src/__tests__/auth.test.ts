import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { validateToken } from '../lib/auth'

describe('validateToken', () => {
  const originalToken = process.env.AUTH_TOKEN

  beforeEach(() => { delete process.env.AUTH_TOKEN })
  afterEach(() => {
    if (originalToken) process.env.AUTH_TOKEN = originalToken
    else delete process.env.AUTH_TOKEN
  })

  it('returns true when token matches AUTH_TOKEN', () => {
    process.env.AUTH_TOKEN = 'secret'
    expect(validateToken('secret')).toBe(true)
  })

  it('returns false for wrong token', () => {
    process.env.AUTH_TOKEN = 'secret'
    expect(validateToken('wrong')).toBe(false)
  })

  it('returns false for empty token', () => {
    process.env.AUTH_TOKEN = 'secret'
    expect(validateToken('')).toBe(false)
  })

  it('returns false when AUTH_TOKEN is not set', () => {
    expect(validateToken('anything')).toBe(false)
  })
})
