import { NextResponse } from 'next/server'
import { validateToken, AUTH_COOKIE_NAME } from '@/lib/auth'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { token?: string }
  if (!body.token || !validateToken(body.token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(AUTH_COOKIE_NAME, body.token, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
  })
  return res
}
