import { db } from '@/lib/db'
import { bestPromoForProduct } from '@/lib/server/compare'

// Checks every wish-list item for the user: if the current best active promo price
// is below the target price (and below the last price we notified about), create
// an in-app notification. Idempotent via lastNotifiedPrice.
export async function checkWishPriceDrops(userId: string): Promise<number> {
  const wishes = await db.wishListItem.findMany({
    where: { userId },
    include: { product: true },
  })
  let created = 0
  for (const wish of wishes) {
    const storeIds = Array.isArray(wish.preferredStoreIds) ? (wish.preferredStoreIds as string[]) : []
    const best = await bestPromoForProduct(wish.productId, storeIds.length ? storeIds : undefined)
    if (!best) continue

    const price = best.promoPrice
    const target = wish.targetPrice
    const belowTarget = target == null || price <= target
    const isNewDrop =
      wish.lastNotifiedPrice == null || price < wish.lastNotifiedPrice - 0.001

    if (belowTarget && isNewDrop) {
      await db.notification.create({
        data: {
          userId,
          type: 'price-drop',
          title: `Price drop: ${wish.product.name}`,
          body: `Now R${price.toFixed(2)} at ${best.store.name}${
            target != null ? ` — below your target of R${target.toFixed(2)}!` : ''
          }`,
        },
      })
      await db.wishListItem.update({
        where: { id: wish.id },
        data: { lastNotifiedPrice: price },
      })
      created++
    }
  }
  return created
}
