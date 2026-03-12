export const AUTH_COOKIE_NAME = 'session'

export function validateToken(token: string): boolean {
  if (!token) return false
  const authToken = process.env.AUTH_TOKEN
  if (!authToken) return false
  return token === authToken
}
