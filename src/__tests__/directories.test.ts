import { describe, it, expect } from 'bun:test'

describe('browseDirectory', () => {
  it('returns subdirectory names for /tmp', async () => {
    const { browseDirectory } = await import('../lib/orpc/directories-logic')
    const result = await browseDirectory('/tmp', '/')
    expect(result.path).toBe('/tmp')
    expect(Array.isArray(result.dirs)).toBe(true)
  })

  it('throws NOT_FOUND for nonexistent path', async () => {
    const { browseDirectory } = await import('../lib/orpc/directories-logic')
    await expect(
      Promise.resolve(browseDirectory('/nonexistent/xyz/abc123', '/'))
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws BAD_REQUEST when path is a file', async () => {
    const { browseDirectory } = await import('../lib/orpc/directories-logic')
    await expect(
      Promise.resolve(browseDirectory('/etc/hosts', '/'))
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('throws FORBIDDEN when path is outside BROWSE_ROOT', async () => {
    const { browseDirectory } = await import('../lib/orpc/directories-logic')
    await expect(
      Promise.resolve(browseDirectory('/etc', '/home'))
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('prevents path traversal via ../', async () => {
    const { browseDirectory } = await import('../lib/orpc/directories-logic')
    await expect(
      Promise.resolve(browseDirectory('/home/../etc', '/home'))
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
