import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'

const SECRET = process.env.SESSION_SECRET || 'grocery-hauls-pro-za-session-secret-2026'
export const USER_COOKIE = 'gh_session'
export const ADMIN_COOKIE = 'gh_admin'

export function signToken(data: Record<string, unknown>, days = 30): string {
  const payload = { ...data, exp: Date.now() + days * 86400_000 }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyToken<T = Record<string, unknown>>(token: string | undefined | null): T | null {
  if (!token || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  if (sig !== expected) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (typeof payload.exp === 'number' && payload.exp < Date.now()) return null
    return payload as T
  } catch {
    return null
  }
}

export type SessionUser = {
  id: string
  email: string
  name: string
  image: string | null
  role: string
  isDemo: boolean
  whatsappNumber: string | null
  whatsappOptIn: boolean
}

export async function getAuthUser(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get(USER_COOKIE)?.value
  const payload = verifyToken<{ uid: string }>(token)
  if (!payload?.uid) return null
  const user = await db.user.findUnique({ where: { id: payload.uid } })
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    role: user.role,
    isDemo: user.isDemo,
    whatsappNumber: user.whatsappNumber,
    whatsappOptIn: user.whatsappOptIn,
  }
}

export async function getAdmin(req: NextRequest): Promise<{ email: string } | null> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  const payload = verifyToken<{ email: string; role: string }>(token)
  if (!payload || payload.role !== 'admin') return null
  return { email: payload.email }
}

export function setUserCookie(res: NextResponse, uid: string): NextResponse {
  res.cookies.set(USER_COOKIE, signToken({ uid }), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 86400,
  })
  return res
}

export function setAdminCookie(res: NextResponse, email: string): NextResponse {
  res.cookies.set(ADMIN_COOKIE, signToken({ email, role: 'admin' }), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 12 * 3600,
  })
  return res
}

export function clearCookie(res: NextResponse, name: string): NextResponse {
  res.cookies.set(name, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}

export function unauthorized(message = 'Please sign in to continue') {
  return NextResponse.json({ error: message }, { status: 401 })
}

export function forbidden(message = 'Not allowed') {
  return NextResponse.json({ error: message }, { status: 403 })
}

export function badRequest(message = 'Invalid request') {
  return NextResponse.json({ error: message }, { status: 400 })
}

export function notFound(message = 'Not found') {
  return NextResponse.json({ error: message }, { status: 404 })
}

// Generates a stable colourful avatar (initials on a brand colour) for users without a photo
export function avatarDataUrl(name: string): string {
  const initials = (name || 'U')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const colors = ['#1d4ed8', '#0284c7', '#0ea5e9', '#1e40af', '#4d7c0f', '#65a30d']
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  const bg = colors[hash % colors.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="48" fill="${bg}"/><text x="48" y="60" font-family="Arial, sans-serif" font-size="36" font-weight="700" fill="white" text-anchor="middle">${initials}</text></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}
