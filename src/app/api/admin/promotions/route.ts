import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdmin, unauthorized, badRequest } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

// Manage promotions: list all, create single, pause/publish, delete
export async function GET(req: NextRequest) {
  const admin = await getAdmin(req)
  if (!admin) return unauthorized('Admin access required')

  const promos = await db.promotion.findMany({
    include: { store: true, product: { include: { category: true } } },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })
  return NextResponse.json({
    promotions: promos.map((p) => ({
      id: p.id,
      productName: p.product.name,
      productId: p.productId,
      category: p.product.category.name,
      storeName: p.store.name,
      storeId: p.storeId,
      promoPrice: p.promoPrice,
      normalPrice: p.normalPrice,
      startDate: p.startDate,
      endDate: p.endDate,
      status: p.status,
      source: p.source,
      createdAt: p.createdAt,
    })),
  })
}

export async function POST(req: NextRequest) {
  const admin = await getAdmin(req)
  if (!admin) return unauthorized('Admin access required')
  const body = await req.json().catch(() => ({}))

  const productId = String(body.productId || '')
  const storeId = String(body.storeId || '')
  const promoPrice = Number(body.promoPrice)
  const normalPrice = Number(body.normalPrice)
  if (!productId || !storeId) return badRequest('Choose a product and a store')
  if (Number.isNaN(promoPrice) || promoPrice <= 0) return badRequest('Enter a valid promo price')
  if (Number.isNaN(normalPrice) || normalPrice <= 0) return badRequest('Enter a valid normal price')
  if (promoPrice >= normalPrice) return badRequest('Promo price must be lower than the normal price')

  const startDate = body.startDate ? new Date(body.startDate) : new Date()
  const endDate = body.endDate ? new Date(body.endDate) : new Date(Date.now() + 30 * 86400_000)

  await db.storePrice.upsert({
    where: { storeId_productId: { storeId, productId } },
    update: { price: normalPrice },
    create: { storeId, productId, price: normalPrice },
  })

  const promo = await db.promotion.create({
    data: { productId, storeId, promoPrice, normalPrice, startDate, endDate, status: 'published' },
  })
  return NextResponse.json({ promotion: { id: promo.id } })
}

export async function PATCH(req: NextRequest) {
  const admin = await getAdmin(req)
  if (!admin) return unauthorized('Admin access required')
  const body = await req.json().catch(() => ({}))
  if (!body.id) return badRequest('Missing id')
  const data: Record<string, unknown> = {}
  if (body.status === 'published' || body.status === 'paused') data.status = body.status
  if (body.promoPrice != null) {
    const p = Number(body.promoPrice)
    if (Number.isNaN(p) || p <= 0) return badRequest('Invalid promo price')
    data.promoPrice = p
  }
  if (body.endDate) data.endDate = new Date(body.endDate)
  const promo = await db.promotion.update({ where: { id: body.id }, data })
  return NextResponse.json({ promotion: { id: promo.id, status: promo.status } })
}

export async function DELETE(req: NextRequest) {
  const admin = await getAdmin(req)
  if (!admin) return unauthorized('Admin access required')
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return badRequest('Missing id')
  await db.promotion.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
