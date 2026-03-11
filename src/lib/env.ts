export interface Env {
  authToken: string
  databaseUrl: string
  browseRoot: string
}

export function getEnv(): Env {
  const authToken = process.env.AUTH_TOKEN
  if (!authToken) {
    throw new Error('AUTH_TOKEN env var is required but missing or empty')
  }
  return {
    authToken,
    databaseUrl: process.env.DATABASE_URL || './data/db.sqlite',
    browseRoot: process.env.BROWSE_ROOT || '/',
  }
}
