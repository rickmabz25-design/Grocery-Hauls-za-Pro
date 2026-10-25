import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, unauthorized, badRequest } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

// Start a Shop Mode session (and optionally attach a saved list)
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const storeId = String(body.storeId || '')
  if (!storeId) return badRequest('Choose the store you are shopping at')

  const store = await db.store.findUnique({ where: { id: storeId } })
  if (!store) return badRequest('Store not found')

  let listId: string | null = null
  let listItems: { productId: string | null; name: string; quantity: number }[] = []
  if (body.listId) {
    const list = await db.shoppingList.findFirst({
      where: { id: body.listId, userId: user.id },
      include: { items: { include: { product: true } } },
    })
    if (list) {
      listId = list.id
      listItems = list.items.map((i) => ({
        productId: i.productId,
        name: i.product?.name ?? i.manualName ?? 'Item',
        quantity: i.quantity,
      }))
    }
  }

  const session = await db.shopSession.create({
    data: { userId: user.id, storeId, listId, status: 'active' },
  })

  // Pre-load the saved list into the session (marked as list items, not yet bought)
  if (listItems.length) {
    // Resolve known prices at this store so the running total starts meaningful
    const productIds = listItems.map((i) => i.productId).filter((x): x is string => Boolean(x))
    const now = new Date()
    const [prices, promos] = await Promise.all([
      productIds.length
        ? db.storePrice.findMany({ where: { storeId, productId: { in: productIds } } })
        : Promise.resolve([]),
      productIds.length
        ? db.promotion.findMany({
            where: {
              storeId,
              productId: { in: productIds },
              status: 'published',
              startDate: { lte: now },
              endDate: { gte: now },
            },
            orderBy: { promoPrice: 'asc' },
          })
        : Promise.resolve([]),
    ])
    const priceMap = new Map(prices.map((p) => [p.productId, p.price]))
    const promoMap = new Map(promos.map((p) => [p.productId, p.promoPrice]))

    await db.shopSessionItem.createMany({
      data: listItems.map((i) => {
        const promo = i.productId ? promoMap.get(i.productId) : undefined
        const normal = i.productId ? priceMap.get(i.productId) : undefined
        const price = promo ?? normal ?? 0
        return {
          sessionId: session.id,
          productId: i.productId,
          name: i.name,
          price,
          promoPrice: promo ?? null,
          quantity: i.quantity,
          bought: false,
          source: 'list',
        }
      }),
    })
  }

  return NextResponse.json({ session: { id: session.id, storeId, listId } })
}

// Session history
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const sessions = await db.shopSession.findMany({
    where: { userId: user.id },
    include: { store: true, items: true },
    orderBy: { startedAt: 'desc' },
    take: 20,
  })
  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      storeName: s.store.name,
      storeColor: s.store.color,
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      itemCount: s.items.length,
      boughtCount: s.items.filter((i) => i.bought).length,
      subtotal: Math.round(s.items.reduce((a, i) => a + i.price * i.quantity, 0) * 100) / 100,
    })),
  })
}
