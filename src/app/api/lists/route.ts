import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()

  const lists = await db.shoppingList.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    include: { items: true },
  })

  return NextResponse.json({
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      status: l.status,
      itemCount: l.items.length,
      totalQuantity: l.items.reduce((a, i) => a + (i.quantity || 1), 0),
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      completedAt: l.completedAt,
      lastTotal: l.lastTotal,
      lastSavings: l.lastSavings,
    })),
  })
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'Give your list a name first' }, { status: 400 })

  const list = await db.shoppingList.create({
    data: { userId: user.id, name: name.slice(0, 60) },
  })
  return NextResponse.json({ list: { id: list.id, name: list.name } })
}
