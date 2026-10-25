import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { getAdmin, setAdminCookie, clearCookie, ADMIN_COOKIE, badRequest, unauthorized } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

// Admin login — restricted to approved admin email accounts with passwords
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  if (!email || !password) return badRequest('Enter your admin email and password')

  const account = await db.adminAccount.findUnique({ where: { email } })
  if (!account) return unauthorized('This email is not an approved admin account')

  const valid = await bcrypt.compare(password, account.passwordHash)
  if (!valid) return unauthorized('Incorrect password')

  // ensure the matching user record is admin-flagged
  await db.user.updateMany({ where: { email }, data: { role: 'admin' } })

  const res = NextResponse.json({ admin: { email } })
  return setAdminCookie(res, email)
}

export async function GET(req: NextRequest) {
  const admin = await getAdmin(req)
  return NextResponse.json({ admin })
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ ok: true })
  return clearCookie(res, ADMIN_COOKIE)
}
