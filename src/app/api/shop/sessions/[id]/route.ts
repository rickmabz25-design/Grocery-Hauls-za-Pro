import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, unauthorized, notFound } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params

  const session = await db.shopSession.findFirst({
    where: { id, userId: user.id },
    include: {
      store: true,
      items: { orderBy: { id: 'asc' } },
      list: { include: { items: true } },
    },
  })
  if (!session) return notFound('Session not found')

  const total = session.items.reduce((a, i) => a + i.price * i.quantity, 0)
  const promoSavings = session.items.reduce(
    (a, i) => a + (i.promoPrice != null ? Math.max(0, i.price - i.promoPrice) * i.quantity : 0),
    0
  )
  const boughtCount = session.items.filter((i) => i.bought).length
  const listTotal = session.list?.items.length ?? 0
  const listBoughtNames = new Set(session.items.filter((i) => i.bought && i.source === 'list').map((i) => i.name.toLowerCase()))
  const listRemaining = session.list
    ? session.list.items.filter((li) => {
        const name = (li.product?.name ?? li.manualName ?? '').toLowerCase()
        return !listBoughtNames.has(name)
      }).length
    : null

  return NextResponse.json({
    session: {
      id: session.id,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      store: { id: session.store.id, name: session.store.name, color: session.store.color, emoji: session.store.emoji },
      listId: session.listId,
      listName: session.list?.name ?? null,
    },
    items: session.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.name,
      price: i.price,
      promoPrice: i.promoPrice,
      quantity: i.quantity,
      bought: i.bought,
      source: i.source,
    })),
    summary: {
      itemsScanned: session.items.filter((i) => i.source !== 'list').length,
      itemsInBasket: session.items.length,
      itemsBought: boughtCount,
      listTotal,
      listRemaining,
      subtotal: Math.round(total * 100) / 100,
      promoSavings: Math.round(promoSavings * 100) / 100,
      estimatedTotal: Math.round((total - promoSavings) * 100) / 100,
    },
  })
}

// Complete / abandon session
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const session = await db.shopSession.findFirst({ where: { id, userId: user.id } })
  if (!session) return notFound('Session not found')
  const body = await req.json().catch(() => ({}))
  const status = body.status === 'active' ? 'active' : 'completed'
  const updated = await db.shopSession.update({
    where: { id: session.id },
    data: { status, endedAt: status === 'completed' ? new Date() : null },
  })
  return NextResponse.json({ ok: true, status: updated.status })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const session = await db.shopSession.findFirst({ where: { id, userId: user.id } })
  if (!session) return notFound('Session not found')
  await db.shopSession.delete({ where: { id: session.id } })
  return NextResponse.json({ ok: true })
}
