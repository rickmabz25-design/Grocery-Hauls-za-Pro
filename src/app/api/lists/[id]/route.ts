import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, unauthorized, notFound } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

// List detail with enriched items (product, prices, best promos)
export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params

  const list = await db.shoppingList.findFirst({
    where: { id, userId: user.id },
    include: {
      items: {
        include: {
          product: { include: { category: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      plans: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  })
  if (!list) return notFound('List not found')

  const now = new Date()
  const productIds = list.items.map((i) => i.productId).filter((x): x is string => Boolean(x))
  const [prices, promos] = await Promise.all([
    productIds.length
      ? db.storePrice.findMany({ where: { productId: { in: productIds } }, include: { store: true } })
      : Promise.resolve([]),
    productIds.length
      ? db.promotion.findMany({
          where: {
            productId: { in: productIds },
            status: 'published',
            startDate: { lte: now },
            endDate: { gte: now },
          },
          include: { store: true },
        })
      : Promise.resolve([]),
  ])

  const priceBy = new Map<string, { min: number; storeName: string; storeId: string }>()
  for (const p of prices) {
    const cur = priceBy.get(p.productId)
    if (!cur || p.price < cur.min) priceBy.set(p.productId, { min: p.price, storeName: p.store.name, storeId: p.storeId })
  }
  const promoBy = new Map<string, { promoPrice: number; normalPrice: number; storeName: string; storeColor: string; storeId: string; endDate: Date }>()
  for (const p of promos) {
    const cur = promoBy.get(p.productId)
    if (!cur || p.promoPrice < cur.promoPrice)
      promoBy.set(p.productId, {
        promoPrice: p.promoPrice,
        normalPrice: p.normalPrice,
        storeName: p.store.name,
        storeColor: p.store.color,
        storeId: p.storeId,
        endDate: p.endDate,
      })
  }

  const items = list.items.map((i) => ({
    id: i.id,
    productId: i.productId,
    name: i.product?.name ?? i.manualName ?? 'Item',
    unit: i.product?.unit ?? null,
    categoryIcon: i.product?.category.icon ?? '🛒',
    categoryName: i.product?.category.name ?? null,
    quantity: i.quantity,
    source: i.source,
    manualStoreId: i.manualStoreId,
    manualStoreName: i.manualStoreId
      ? prices.find((p) => p.storeId === i.manualStoreId)?.store.name ?? null
      : null,
    manualPrice: i.manualPrice,
    lowestPrice: i.productId ? priceBy.get(i.productId)?.min ?? null : null,
    lowestStoreName: i.productId ? priceBy.get(i.productId)?.storeName ?? null : null,
    lowestStoreId: i.productId ? priceBy.get(i.productId)?.storeId ?? null : null,
    promo: i.productId ? promoBy.get(i.productId) ?? null : null,
    notOnPromo: Boolean(i.productId) && !promoBy.has(i.productId),
  }))

  return NextResponse.json({
    list: {
      id: list.id,
      name: list.name,
      status: list.status,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      completedAt: list.completedAt,
      lastTotal: list.lastTotal,
      lastSavings: list.lastSavings,
    },
    items,
    plans: list.plans,
  })
}

// Rename / mark completed / reopen
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))

  const list = await db.shoppingList.findFirst({ where: { id, userId: user.id } })
  if (!list) return notFound('List not found')

  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim().slice(0, 60)
  if (body.status === 'completed') {
    data.status = 'completed'
    data.completedAt = new Date()
  }
  if (body.status === 'active') {
    data.status = 'active'
    data.completedAt = null
  }
  if (typeof body.lastTotal === 'number') data.lastTotal = body.lastTotal
  if (typeof body.lastSavings === 'number') data.lastSavings = body.lastSavings

  const updated = await db.shoppingList.update({ where: { id: list.id }, data })
  return NextResponse.json({ list: { id: updated.id, name: updated.name, status: updated.status } })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const list = await db.shoppingList.findFirst({ where: { id, userId: user.id } })
  if (!list) return notFound('List not found')
  await db.shoppingList.delete({ where: { id: list.id } })
  return NextResponse.json({ ok: true })
}
