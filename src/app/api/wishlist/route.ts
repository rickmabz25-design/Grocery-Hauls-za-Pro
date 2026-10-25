import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, unauthorized, badRequest } from '@/lib/server/auth'
import { checkWishPriceDrops } from '@/lib/server/wishlist-check'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()

  const wishes = await db.wishListItem.findMany({
    where: { userId: user.id },
    include: { product: { include: { category: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const now = new Date()
  const productIds = wishes.map((w) => w.productId)
  const promos = productIds.length
    ? await db.promotion.findMany({
        where: {
          productId: { in: productIds },
          status: 'published',
          startDate: { lte: now },
          endDate: { gte: now },
        },
        include: { store: true },
        orderBy: { promoPrice: 'asc' },
      })
    : []

  const items = wishes.map((w) => {
    const promosFor = promos.filter((p) => p.productId === w.productId)
    const best = promosFor[0] ?? null
    const preferred = Array.isArray(w.preferredStoreIds) ? (w.preferredStoreIds as string[]) : []
    const onPromo = best != null
    return {
      id: w.id,
      productId: w.productId,
      name: w.product.name,
      unit: w.product.unit,
      categoryIcon: w.product.category.icon,
      targetPrice: w.targetPrice,
      preferredStoreIds: preferred,
      onPromo,
      statusText: onPromo ? `On promotion at ${best!.store.name}` : 'Not on promotion yet.',
      bestPromo: best
        ? {
            promoPrice: best.promoPrice,
            normalPrice: best.normalPrice,
            storeName: best.store.name,
            storeColor: best.store.color,
            endDate: best.endDate,
            meetsTarget: w.targetPrice == null || best.promoPrice <= w.targetPrice,
          }
        : null,
      normalFrom: null as number | null,
    }
  })

  // lowest normal price for items not on promo
  const prices = productIds.length
    ? await db.storePrice.findMany({ where: { productId: { in: productIds } }, include: { store: true } })
    : []
  for (const item of items) {
    const lowest = prices
      .filter((p) => p.productId === item.productId)
      .sort((a, b) => a.price - b.price)[0]
    if (lowest) item.normalFrom = lowest.price
  }

  // run price-drop check so notifications stay fresh
  await checkWishPriceDrops(user.id)

  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const body = await req.json().catch(() => ({}))
  if (!body.productId) return badRequest('Missing product')

  const product = await db.product.findUnique({ where: { id: body.productId } })
  if (!product) return badRequest('Product not found')

  const targetPrice = body.targetPrice != null && body.targetPrice !== '' ? Number(body.targetPrice) : null
  if (targetPrice != null && (Number.isNaN(targetPrice) || targetPrice < 0))
    return badRequest('Target price must be a positive amount')

  const preferredStoreIds = Array.isArray(body.preferredStoreIds) ? body.preferredStoreIds : []

  const existing = await db.wishListItem.findUnique({
    where: { userId_productId: { userId: user.id, productId: product.id } },
  })
  if (existing) {
    const item = await db.wishListItem.update({
      where: { id: existing.id },
      data: { targetPrice, preferredStoreIds },
    })
    return NextResponse.json({ item, updated: true })
  }

  const item = await db.wishListItem.create({
    data: { userId: user.id, productId: product.id, targetPrice, preferredStoreIds },
  })

  // immediate check: is it already on promo below target?
  await checkWishPriceDrops(user.id)

  return NextResponse.json({ item })
}
