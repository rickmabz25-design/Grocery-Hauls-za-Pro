import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Promo cards with filters: ?store=&category=&sort=discount|price|ending|new
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const storeId = sp.get('store') || ''
  const categoryId = sp.get('category') || ''
  const sort = sp.get('sort') || 'discount'
  const now = new Date()

  const promos = await db.promotion.findMany({
    where: {
      status: 'published',
      startDate: { lte: now },
      endDate: { gte: now },
      ...(storeId ? { storeId } : {}),
      ...(categoryId ? { product: { categoryId } } : {}),
    },
    include: { store: true, product: { include: { category: true } } },
  })

  const cards = promos.map((p) => ({
    id: p.id,
    productId: p.productId,
    name: p.product.name,
    unit: p.product.unit,
    category: { id: p.product.category.id, name: p.product.category.name, icon: p.product.category.icon },
    storeId: p.storeId,
    storeName: p.store.name,
    storeColor: p.store.color,
    promoPrice: p.promoPrice,
    normalPrice: p.normalPrice,
    discount: p.normalPrice > 0 ? Math.round((1 - p.promoPrice / p.normalPrice) * 100) : 0,
    saved: Math.round((p.normalPrice - p.promoPrice) * 100) / 100,
    startDate: p.startDate,
    endDate: p.endDate,
    createdAt: p.createdAt,
  }))

  switch (sort) {
    case 'price':
      cards.sort((a, b) => a.promoPrice - b.promoPrice)
      break
    case 'ending':
      cards.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
      break
    case 'new':
      cards.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      break
    default:
      cards.sort((a, b) => b.discount - a.discount || a.promoPrice - b.promoPrice)
  }

  return NextResponse.json({ promos: cards })
}
