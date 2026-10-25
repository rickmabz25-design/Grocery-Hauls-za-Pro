import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, unauthorized, notFound, badRequest } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

// Add scanned / manual / searched product to the live shopping basket
export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))

  const session = await db.shopSession.findFirst({ where: { id, userId: user.id } })
  if (!session) return notFound('Session not found')
  if (session.status !== 'active') return badRequest('This shopping session has ended')

  const now = new Date()
  let name = String(body.name || '').trim()
  let price = body.price != null ? Number(body.price) : null
  let promoPrice: number | null = null
  let productId: string | null = body.productId || null

  if (body.barcode && !productId) {
    const product = await db.product.findFirst({ where: { barcode: String(body.barcode) } })
    if (product) productId = product.id
  }

  if (productId) {
    const product = await db.product.findUnique({
      where: { id: productId },
      include: { category: true },
    })
    if (!product) return badRequest('Product not found')
    name = name || product.name
    const sp = await db.storePrice.findUnique({
      where: { storeId_productId: { storeId: session.storeId, productId: product.id } },
    })
    const promo = await db.promotion.findFirst({
      where: {
        productId: product.id,
        storeId: session.storeId,
        status: 'published',
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { promoPrice: 'asc' },
    })
    if (price == null) {
      price = promo ? promo.promoPrice : sp?.price ?? null
    }
    if (promo) promoPrice = promo.promoPrice
    if (price == null) price = 0
  } else {
    if (!name) return badRequest('Enter the product name or scan a barcode')
    if (price == null || Number.isNaN(price) || price < 0)
      return badRequest('Enter the shelf price from the price tag')
  }

  const item = await db.shopSessionItem.create({
    data: {
      sessionId: session.id,
      productId,
      name: name.slice(0, 80),
      price,
      promoPrice,
      quantity: Math.max(1, Math.min(99, parseInt(body.quantity, 10) || 1)),
      source: body.source ?? (productId ? 'scan' : 'manual'),
    },
  })

  return NextResponse.json({
    item,
    onPromo: promoPrice != null,
    message: promoPrice != null ? undefined : 'Not on promotion.',
  })
}

// Update quantity / bought / correct price
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))

  const session = await db.shopSession.findFirst({ where: { id, userId: user.id } })
  if (!session) return notFound('Session not found')
  if (!body.itemId) return badRequest('Missing itemId')

  const existing = await db.shopSessionItem.findFirst({ where: { id: body.itemId, sessionId: session.id } })
  if (!existing) return notFound('Item not found')

  const data: Record<string, unknown> = {}
  if (body.quantity != null) data.quantity = Math.max(1, Math.min(99, parseInt(body.quantity, 10) || 1))
  if (body.bought != null) data.bought = Boolean(body.bought)
  if (body.price != null) {
    const p = Number(body.price)
    if (!Number.isNaN(p) && p >= 0) data.price = p
  }
  if (body.promoPrice !== undefined) data.promoPrice = body.promoPrice

  const item = await db.shopSessionItem.update({ where: { id: existing.id }, data })
  return NextResponse.json({ item })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const itemId = req.nextUrl.searchParams.get('itemId')
  const session = await db.shopSession.findFirst({ where: { id, userId: user.id } })
  if (!session) return notFound('Session not found')
  if (!itemId) return badRequest('Missing itemId')
  const existing = await db.shopSessionItem.findFirst({ where: { id: itemId, sessionId: session.id } })
  if (!existing) return notFound('Item not found')
  await db.shopSessionItem.delete({ where: { id: existing.id } })
  return NextResponse.json({ ok: true })
}
