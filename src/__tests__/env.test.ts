import { describe, it, expect, beforeEach } from 'bun:test'

describe('getEnv', () => {
  beforeEach(() => {
    delete process.env.AUTH_TOKEN
    delete process.env.DATABASE_URL
    delete process.env.BROWSE_ROOT
  })

  it('returns config with defaults when AUTH_TOKEN is set', () => {
    process.env.AUTH_TOKEN = 'test-token'
    // Re-require to pick up env changes
    delete require.cache[require.resolve('../lib/env')]
    const { getEnv } = require('../lib/env')
    const env = getEnv()
    expect(env.authToken).toBe('test-token')
    expect(env.databaseUrl).toBe('./data/db.sqlite')
    expect(env.browseRoot).toBe('/')
  })

  it('uses DATABASE_URL and BROWSE_ROOT when set', () => {
    process.env.AUTH_TOKEN = 'tok'
    process.env.DATABASE_URL = './custom.sqlite'
    process.env.BROWSE_ROOT = '/home/user'
    delete require.cache[require.resolve('../lib/env')]
    const { getEnv } = require('../lib/env')
    const env = getEnv()
    expect(env.databaseUrl).toBe('./custom.sqlite')
    expect(env.browseRoot).toBe('/home/user')
  })

  it('throws when AUTH_TOKEN is missing', () => {
    delete require.cache[require.resolve('../lib/env')]
    const { getEnv } = require('../lib/env')
    expect(() => getEnv()).toThrow('AUTH_TOKEN')
  })

  it('throws when AUTH_TOKEN is empty string', () => {
    process.env.AUTH_TOKEN = ''
    delete require.cache[require.resolve('../lib/env')]
    const { getEnv } = require('../lib/env')
    expect(() => getEnv()).toThrow('AUTH_TOKEN')
  })
})
