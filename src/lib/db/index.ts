import { drizzle } from 'drizzle-orm/bun-sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { getEnv } from '../env'
import * as schema from './schema'

// Type-only import — does not cause bun:sqlite to be evaluated at module load time
import type { Database as BunDatabase } from 'bun:sqlite'

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>

let _db: DrizzleDb | null = null

export function getDb(): DrizzleDb {
  if (_db) return _db
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Database } = require('bun:sqlite') as { Database: typeof BunDatabase }
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
