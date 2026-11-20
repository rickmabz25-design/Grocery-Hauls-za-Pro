import { db } from '@/lib/db'
import { TRAVEL_WARNING_THRESHOLD } from '@/lib/format'

export type CompareItem = {
  itemId: string
  name: string
  unit: string | null
  quantity: number
  source: string
  manualStoreId: string | null
  imageUrl: string | null
  categoryIcon: string
}

export type StoreCompare = {
  storeId: string
  name: string
  color: string
  emoji: string
  available: number
  missing: number
  missingNames: string[]
  notOnPromo: number
  onPromo: number
  total: number
  fullTotal: number // total if counting normal prices of all items found
  savings: number
  cheapest: boolean
  mostExpensive: boolean
  preferred: boolean
}

export type SplitAssignment = {
  itemId: string
  name: string
  quantity: number
  unit: string | null
  price: number
  storeId: string
  storeName: string
  storeColor: string
}

export type SplitResult = {
  store1: { storeId: string; name: string; color: string; items: SplitAssignment[]; cost: number }
  store2: { storeId: string; name: string; color: string; items: SplitAssignment[]; cost: number }
  splitTotal: number
  cheapestSingleTotal: number
  cheapestSingleStoreName?: string | null
  saving: number
  worthIt: boolean
  travelWarning: boolean
}

export type CompareResult = {
  listId: string
  listName: string
  stores: StoreCompare[]
  cheapest: { storeId: string; name: string; total: number; savings: number } | null
  mostExpensive: { storeId: string; name: string; total: number } | null
  overallCheaperBy: number
  split: SplitResult | null
  splitMessage?: string | null
  itemCount: number
}

type EffectivePrice = { price: number; promoPrice: number | null; normal: number }

export async function computeComparison(
  listId: string,
  userId: string,
  storeIds: string[],
  preferredStoreId?: string | null
): Promise<CompareResult | null> {
  const list = await db.shoppingList.findFirst({
    where: { id: listId, userId },
    include: { items: { include: { product: { include: { category: true } } } } },
  })
  if (!list) return null

  const stores = await db.store.findMany({ where: { id: { in: storeIds } } })
  if (stores.length === 0) return null

  const items = list.items
  const productIds = items.map((i) => i.productId).filter((x): x is string => Boolean(x))

  const [prices, promos] = await Promise.all([
    db.storePrice.findMany({
      where: { productId: { in: productIds }, storeId: { in: storeIds } },
    }),
    db.promotion.findMany({
      where: {
        productId: { in: productIds },
        storeId: { in: storeIds },
        status: 'published',
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
      },
    }),
  ])

  const priceMap = new Map<string, Map<string, number>>() // productId -> storeId -> normal price
  for (const p of prices) {
    if (!priceMap.has(p.productId)) priceMap.set(p.productId, new Map())
    priceMap.get(p.productId)!.set(p.storeId, p.price)
  }
  const promoMap = new Map<string, EffectivePrice>() // `${productId}:${storeId}` -> effective
  for (const pr of promos) {
    const key = `${pr.productId}:${pr.storeId}`
    const normal = priceMap.get(pr.productId)?.get(pr.storeId) ?? pr.normalPrice
    const best = promoMap.get(key)
    if (!best || pr.promoPrice < best.promoPrice!) {
      promoMap.set(key, { price: pr.promoPrice, promoPrice: pr.promoPrice, normal })
    }
  }

  const effective = (productId: string, storeId: string): EffectivePrice | null => {
    const key = `${productId}:${storeId}`
    if (promoMap.has(key)) return promoMap.get(key)!
    const normal = priceMap.get(productId)?.get(storeId)
    if (normal == null) return null
    return { price: normal, promoPrice: null, normal }
  }

  const now = new Date()
  const storeResults: StoreCompare[] = stores.map((s) => {
    let total = 0
    let savings = 0
    let fullTotal = 0
    let available = 0
    let notOnPromo = 0
    let onPromo = 0
    const missingNames: string[] = []
    for (const item of items) {
      const qty = item.quantity || 1
      if (item.productId && item.product) {
        const eff = effective(item.productId, s.id)
        if (!eff) {
          missingNames.push(item.product.name)
          continue
        }
        available += 1
        total += eff.price * qty
        fullTotal += eff.normal * qty
        if (eff.promoPrice != null) {
          onPromo += 1
          savings += (eff.normal - eff.promoPrice) * qty
        } else {
          notOnPromo += 1
        }
      } else {
        // manual item — only available at the store it was added for
        if (item.manualStoreId === s.id) {
          available += 1
          total += (item.manualPrice ?? 0) * qty
          notOnPromo += 1
        } else {
          missingNames.push(item.manualName || 'Manual item')
        }
      }
    }
    return {
      storeId: s.id,
      name: s.name,
      color: s.color,
      emoji: s.emoji,
      available,
      missing: missingNames.length,
      missingNames,
      notOnPromo,
      onPromo,
      total: Math.round(total * 100) / 100,
      fullTotal: Math.round(fullTotal * 100) / 100,
      savings: Math.round(savings * 100) / 100,
      cheapest: false,
      mostExpensive: false,
      preferred: s.id === preferredStoreId,
    }
  })

  const valid = storeResults.filter((s) => s.available > 0)

  const ranked = [...valid].sort((a, b) => a.total - b.total)
  const cheapest = ranked[0] ?? null
  const mostExpensive = ranked.length > 1 ? ranked[ranked.length - 1] : null
  for (const s of storeResults) {
    s.cheapest = cheapest?.storeId === s.storeId
    s.mostExpensive = mostExpensive?.storeId === s.storeId
  }
  const overallCheaperBy =
    cheapest && mostExpensive ? Math.round((mostExpensive.total - cheapest.total) * 100) / 100 : 0

  // ---------- Split-shopping analysis (compare like-for-like coverage) ----------
  let split: SplitResult | null = null
  let splitMessage: string | null = null
  if (stores.length >= 2 && items.length > 0) {
    let bestPair: {
      a: (typeof stores)[0]; b: (typeof stores)[0]; total: number
      covered: number; missingNames: string[]
    } | null = null

    for (let i = 0; i < stores.length; i++) {
      for (let j = i + 1; j < stores.length; j++) {
        const a = stores[i], b = stores[j]
        let pairTotal = 0, covered = 0
        const missingNames: string[] = []
        for (const item of items) {
          const qty = item.quantity || 1
          if (item.productId) {
            const ea = effective(item.productId, a.id)
            const eb = effective(item.productId, b.id)
            if (!ea && !eb) {
              missingNames.push(item.product?.name || 'Product')
              continue
            }
            covered++
            pairTotal += Math.min(ea ? ea.price * qty : Infinity, eb ? eb.price * qty : Infinity)
          } else if (item.manualStoreId === a.id || item.manualStoreId === b.id) {
            covered++
            pairTotal += (item.manualPrice ?? 0) * qty
          } else {
            missingNames.push(item.manualName || 'Manual item')
          }
        }
        if (!bestPair || covered > bestPair.covered ||
          (covered === bestPair.covered && pairTotal < bestPair.total)) {
          bestPair = { a, b, total: pairTotal, covered, missingNames }
        }
      }
    }

    if (bestPair && bestPair.covered < items.length) {
      splitMessage = `No two-store combination can cover the full basket. The best pair, ${bestPair.a.name} and ${bestPair.b.name}, covers ${bestPair.covered} of ${items.length} products; ${items.length - bestPair.covered} are unavailable at both stores. A full-basket saving cannot be calculated.`
    } else if (bestPair) {
      const { a, b } = bestPair
      const s1items: SplitAssignment[] = []
      const s2items: SplitAssignment[] = []
      let s1cost = 0, s2cost = 0
      for (const item of items) {
        const qty = item.quantity || 1
        if (item.productId && item.product) {
          const ea = effective(item.productId, a.id)!
          const eb = effective(item.productId, b.id)!
          const pa = ea.price * qty, pb = eb.price * qty
          let chosen: 'a' | 'b'
          if (preferredStoreId === a.id && ea) chosen = 'a'
          else if (preferredStoreId === b.id && eb) chosen = 'b'
          else chosen = pa <= pb ? 'a' : 'b'
          const eff = chosen === 'a' ? ea : eb
          const store = chosen === 'a' ? a : b
          const assign: SplitAssignment = {
            itemId: item.id, name: item.product.name, quantity: qty,
            unit: item.product.unit, price: Math.round(eff.price * qty * 100) / 100,
            storeId: store.id, storeName: store.name, storeColor: store.color,
          }
          if (chosen === 'a') { s1items.push(assign); s1cost += assign.price }
          else { s2items.push(assign); s2cost += assign.price }
        } else {
          const store = item.manualStoreId === a.id ? a : b
          const assign: SplitAssignment = {
            itemId: item.id, name: item.manualName || 'Manual item', quantity: qty,
            unit: null, price: Math.round((item.manualPrice ?? 0) * qty * 100) / 100,
            storeId: store.id, storeName: store.name, storeColor: store.color,
          }
          if (store.id === a.id) { s1items.push(assign); s1cost += assign.price }
          else { s2items.push(assign); s2cost += assign.price }
        }
      }
      const splitTotal = Math.round((s1cost + s2cost) * 100) / 100
      // Only compare against a single-store total when that store covers every item.
      const completeSingle = storeResults.filter(s => s.available === items.length).sort((x, y) => x.total - y.total)[0]
      const cheapestSingleTotal = completeSingle?.total ?? splitTotal
      const saving = completeSingle ? Math.round((cheapestSingleTotal - splitTotal) * 100) / 100 : 0
      split = {
        store1: { storeId: a.id, name: a.name, color: a.color, items: s1items, cost: Math.round(s1cost * 100) / 100 },
        store2: { storeId: b.id, name: b.name, color: b.color, items: s2items, cost: Math.round(s2cost * 100) / 100 },
        splitTotal, cheapestSingleTotal, cheapestSingleStoreName: completeSingle?.name ?? null,
        saving, worthIt: saving > 0,
        travelWarning: saving > 0 && saving < TRAVEL_WARNING_THRESHOLD,
      }
      if (!completeSingle) {
        splitMessage = 'This pair covers the full basket, but no single store stocks every item, so there is no complete single-store total to compare against.'
      }
    }
  }

  return {
    listId: list.id,
    listName: list.name,
    stores: storeResults,
    cheapest: cheapest
      ? { storeId: cheapest.storeId, name: cheapest.name, total: cheapest.total, savings: cheapest.savings }
      : null,
    mostExpensive: mostExpensive ? { storeId: mostExpensive.storeId, name: mostExpensive.name, total: mostExpensive.total } : null,
    overallCheaperBy,
    split,
    splitMessage,
    itemCount: items.length,
  }
}

// Best active promo for a product, optionally limited to preferred stores
export async function bestPromoForProduct(productId: string, storeIds?: string[]) {
  const promos = await db.promotion.findMany({
    where: {
      productId,
      status: 'published',
      startDate: { lte: new Date() },
      endDate: { gte: new Date() },
      ...(storeIds && storeIds.length ? { storeId: { in: storeIds } } : {}),
    },
    include: { store: true, product: true },
    orderBy: { promoPrice: 'asc' },
    take: 1,
  })
  return promos[0] ?? null
}
