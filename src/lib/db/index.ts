import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { getEnv } from '../env'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getDb() {
  if (_db) return _db
  const { databaseUrl } = getEnv()
  const dir = dirname(databaseUrl)
  if (dir !== '.') mkdirSync(dir, { recursive: true })
  const sqlite = new Database(databaseUrl)
  // Enable WAL mode for better concurrent read performance
  sqlite.run('PRAGMA journal_mode = WAL')
  _db = drizzle(sqlite, { schema })
  return _db
}

export { schema }
