import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { getAdmin, unauthorized, badRequest } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

// Manage additional admin accounts (approved emails + passwords)
export async function GET(req: NextRequest) {
  const admin = await getAdmin(req)
  if (!admin) return unauthorized('Admin access required')
  const admins = await db.adminAccount.findMany({ orderBy: { createdAt: 'asc' } })
  return NextResponse.json({
    admins: admins.map((a) => ({ id: a.id, email: a.email, addedBy: a.addedBy, createdAt: a.createdAt })),
  })
}

export async function POST(req: NextRequest) {
  const admin = await getAdmin(req)
  if (!admin) return unauthorized('Admin access required')
  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest('Enter a valid email address')
  if (password.length < 8) return badRequest('Password must be at least 8 characters')

  const existing = await db.adminAccount.findUnique({ where: { email } })
  if (existing) return badRequest('This email is already an admin account')

  const hash = await bcrypt.hash(password, 10)
  await db.adminAccount.create({ data: { email, passwordHash: hash, addedBy: admin.email } })
  await db.user.upsert({
    where: { email },
    update: { role: 'admin' },
    create: { email, name: email.split('@')[0], role: 'admin' },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const admin = await getAdmin(req)
  if (!admin) return unauthorized('Admin access required')
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return badRequest('Missing id')
  const account = await db.adminAccount.findUnique({ where: { id } })
  if (!account) return badRequest('Admin account not found')
  if (account.email === 'rick@endintcap.online') return badRequest('The primary admin account cannot be removed')
  if (account.email === admin.email) return badRequest('You cannot remove your own account')
  await db.adminAccount.delete({ where: { id } })
  await db.user.updateMany({ where: { email: account.email }, data: { role: 'user' } })
  return NextResponse.json({ ok: true })
}
