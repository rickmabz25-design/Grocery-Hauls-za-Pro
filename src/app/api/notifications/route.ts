import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/server/auth'
import { checkWishPriceDrops } from '@/lib/server/wishlist-check'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()

  // refresh price-drop notifications before returning
  await checkWishPriceDrops(user.id)

  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const unread = notifications.filter((n) => !n.read).length
  return NextResponse.json({ notifications, unread })
}

// Mark read (all or one)
export async function PATCH(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const body = await req.json().catch(() => ({}))
  if (body.id) {
    await db.notification.updateMany({
      where: { id: body.id, userId: user.id },
      data: { read: true },
    })
  } else {
    await db.notification.updateMany({ where: { userId: user.id }, data: { read: true } })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const id = req.nextUrl.searchParams.get('id')
  await db.notification.deleteMany({
    where: { userId: user.id, ...(id ? { id } : {}) },
  })
  return NextResponse.json({ ok: true })
}
