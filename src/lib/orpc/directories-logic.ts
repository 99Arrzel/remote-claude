import { ORPCError } from '@orpc/server'
import { stat, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Dirent } from 'node:fs'

export async function browseDirectory(
  path: string,
  browseRoot: string,
): Promise<{ path: string; dirs: string[] }> {
  const resolvedPath = resolve(path)
  const resolvedRoot = resolve(browseRoot)

  // Security: canonicalize both paths to prevent traversal
  const rootPrefix = resolvedRoot === '/' ? '/' : resolvedRoot + '/'
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(rootPrefix)) {
    throw new ORPCError('FORBIDDEN', { message: `Path is outside BROWSE_ROOT: ${path}` })
  }

  let pathStat: Awaited<ReturnType<typeof stat>>
  try {
    pathStat = await stat(resolvedPath)
  } catch {
    throw new ORPCError('NOT_FOUND', { message: `Path not found: ${path}` })
  }

  if (!pathStat.isDirectory()) {
    throw new ORPCError('BAD_REQUEST', { message: `Path is not a directory: ${path}` })
  }

  let entries: Dirent<string>[]
  try {
    entries = await readdir(resolvedPath, { withFileTypes: true }) as Dirent<string>[]
  } catch {
    throw new ORPCError('FORBIDDEN', { message: `Cannot read directory: ${path}` })
  }

  const dirs = entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => e.name)
    .sort()

  return { path: resolvedPath, dirs }
}
