import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { getEnv } from '../env'
import { getDb } from '.'

const { databaseUrl } = getEnv()
mkdirSync(dirname(databaseUrl), { recursive: true })
migrate(getDb(), { migrationsFolder: './src/lib/db/migrations' })
console.log('Migrations complete')
