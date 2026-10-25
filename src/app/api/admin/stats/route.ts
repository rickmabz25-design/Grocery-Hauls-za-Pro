import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdmin, unauthorized } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const admin = await getAdmin(req)
  if (!admin) return unauthorized('Admin access required')

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 86400_000)
  const activeCutoff = new Date(now.getTime() - 30 * 86400_000)

  const [
    totalUsers,
    newUsersWeek,
    activeUsers,
    totalLists,
    totalProducts,
    totalPromotions,
    totalWishItems,
    whatsappUsers,
    shopSessions,
    completedLists,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: weekAgo } } }),
    db.user.count({ where: { lastLoginAt: { gte: activeCutoff } } }),
    db.shoppingList.count(),
    db.product.count(),
    db.promotion.count({ where: { status: 'published' } }),
    db.wishListItem.count(),
    db.user.count({ where: { whatsappNumber: { not: null } } }),
    db.shopSession.count(),
    db.shoppingList.count({ where: { status: 'completed' } }),
  ])

  // Estimated user savings: promo savings from saved plans + list lastSavings
  const plans = await db.shoppingPlan.findMany({ select: { savings: true } })
  const lists = await db.shoppingList.findMany({ where: { lastSavings: { not: null } }, select: { lastSavings: true } })
  const planSavings = plans.reduce((a, p) => a + (p.savings || 0), 0)
  const listSavings = lists.reduce((a, l) => a + (l.lastSavings || 0), 0)
  const estimatedSavings = Math.round((planSavings + listSavings) * 100) / 100

  // Most searched products (top 8)
  const searchLogs = await db.searchLog.groupBy({
    by: ['term'],
    _count: { term: true },
    orderBy: { _count: { term: 'desc' } },
    take: 8,
  })

  // Most added promo products (via list items sourced from promos)
  const promoItems = await db.listItem.groupBy({
    by: ['productId'],
    where: { source: 'promo', productId: { not: null } },
    _count: { productId: true },
    orderBy: { _count: { productId: 'desc' } },
    take: 8,
  })
  const promoProductIds = promoItems.map((p) => p.productId!).filter(Boolean)
  const promoProducts = promoProductIds.length
    ? await db.product.findMany({ where: { id: { in: promoProductIds } } })
    : []
  const promoProductMap = new Map(promoProducts.map((p) => [p.id, p.name]))

  // Most popular stores (from saved plans + promo adds)
  const allPlans = await db.shoppingPlan.findMany({ select: { storeIds: true } })
  const storeCounts = new Map<string, number>()
  for (const plan of allPlans) {
    const ids = Array.isArray(plan.storeIds) ? (plan.storeIds as string[]) : []
    for (const id of ids) storeCounts.set(id, (storeCounts.get(id) || 0) + 1)
  }
  const promoByStore = await db.promotion.groupBy({
    by: ['storeId'],
    where: { status: 'published' },
    _count: { storeId: true },
  })
  for (const p of promoByStore) {
    storeCounts.set(p.storeId, (storeCounts.get(p.storeId) || 0) + p._count.storeId)
  }
  const topStoreIds = [...storeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7)
  const stores = await db.store.findMany()
  const storeMap = new Map(stores.map((s) => [s.id, s.name]))

  return NextResponse.json({
    stats: {
      totalUsers,
      newUsersWeek,
      activeUsers,
      totalLists,
      completedLists,
      totalProducts,
      totalPromotions,
      totalWishItems,
      whatsappUsers,
      shopSessions,
      estimatedSavings,
    },
    topSearches: searchLogs.map((s) => ({ term: s.term, count: s._count.term })),
    topPromoProducts: promoItems.map((p) => ({
      name: promoProductMap.get(p.productId!) || 'Unknown product',
      count: p._count.productId,
    })),
    topStores: topStoreIds.map(([id, count]) => ({ name: storeMap.get(id) || 'Store', count })),
  })
}
