import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

// Product search: promo products first, then normal catalogue products.
// GET /api/products?q=&categoryId=&barcode=
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') || '').trim()
  const categoryId = sp.get('categoryId') || ''
  const barcode = (sp.get('barcode') || '').trim()

  const now = new Date()

  // Prisma emulates case-insensitive `contains` for SQLite
  const where: Record<string, unknown> = { active: true }
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { brand: { contains: q } },
      { description: { contains: q } },
    ]
  }
  if (categoryId) where.categoryId = categoryId
  if (barcode) where.barcode = barcode

  const products = await db.product.findMany({
    where,
    include: {
      category: true,
      promotions: {
        where: { status: 'published', startDate: { lte: now }, endDate: { gte: now } },
        include: { store: true },
      },
      prices: { include: { store: true } },
    },
    take: 40,
  })

  const results = products
    .map((p) => {
      const bestPromo = p.promotions.slice().sort((a, b) => a.promoPrice - b.promoPrice)[0] ?? null
      const lowestPrice = p.prices.slice().sort((a, b) => a.price - b.price)[0] ?? null
      return {
        id: p.id,
        name: p.name,
        unit: p.unit,
        brand: p.brand,
        category: { id: p.category.id, name: p.category.name, icon: p.category.icon },
        inPromo: Boolean(bestPromo),
        promo: bestPromo
          ? {
              promoPrice: bestPromo.promoPrice,
              normalPrice: bestPromo.normalPrice,
              endDate: bestPromo.endDate,
              storeId: bestPromo.storeId,
              storeName: bestPromo.store.name,
              storeColor: bestPromo.store.color,
            }
          : null,
        price: lowestPrice?.price ?? null,
        lowestStoreName: lowestPrice?.store.name ?? null,
        lowestStoreId: lowestPrice?.storeId ?? null,
      }
    })
    .sort((a, b) => {
      if (a.inPromo !== b.inPromo) return a.inPromo ? -1 : 1
      return a.name.localeCompare(b.name)
    })

  // Log searches for analytics (skip barcode scans)
  if (q && q.length > 1) {
    await db.searchLog.create({ data: { term: q.toLowerCase(), userId: user?.id ?? null } })
  }

  return NextResponse.json({ results })
}
