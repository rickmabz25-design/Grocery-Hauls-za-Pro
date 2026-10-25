import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// What's New campaign feed with attached promo products
export async function GET() {
  const now = new Date()
  const posts = await db.whatsNewPost.findMany({
    where: { active: true },
    orderBy: { datePosted: 'desc' },
  })

  const promoIds = posts.flatMap((p) => (Array.isArray(p.promoIds) ? (p.promoIds as string[]) : []))
  const promos = promoIds.length
    ? await db.promotion.findMany({
        where: { id: { in: promoIds }, status: 'published', endDate: { gte: now } },
        include: { store: true, product: { include: { category: true } } },
      })
    : []
  const promoMap = new Map(promos.map((p) => [p.id, p]))

  const storeIds = posts.map((p) => p.storeId).filter((x): x is string => Boolean(x))
  const stores = storeIds.length ? await db.store.findMany({ where: { id: { in: storeIds } } }) : []
  const storeMap = new Map(stores.map((s) => [s.id, s]))

  const feed = posts.map((post) => {
    const ids = Array.isArray(post.promoIds) ? (post.promoIds as string[]) : []
    return {
      id: post.id,
      title: post.title,
      description: post.description,
      imageUrl: post.imageUrl,
      tag: post.tag,
      datePosted: post.datePosted,
      storeName: post.storeId ? storeMap.get(post.storeId)?.name ?? null : null,
      storeColor: post.storeId ? storeMap.get(post.storeId)?.color ?? null : null,
      promos: ids
        .map((id) => promoMap.get(id))
        .filter(Boolean)
        .map((p) => ({
          id: p!.id,
          productId: p!.productId,
          name: p!.product.name,
          unit: p!.product.unit,
          storeName: p!.store.name,
          storeColor: p!.store.color,
          promoPrice: p!.promoPrice,
          normalPrice: p!.normalPrice,
          discount: p!.normalPrice > 0 ? Math.round((1 - p!.promoPrice / p!.normalPrice) * 100) : 0,
        })),
    }
  })

  return NextResponse.json({ posts: feed })
}
