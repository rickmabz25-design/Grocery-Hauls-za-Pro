'use client'

/**
 * Local-first replacement for the former /api/* shopping data routes.
 * All mutations stay in this browser's localStorage. No network requests are
 * made for user data; only the public /data/*.json catalogue snapshots load.
 */

type AnyRecord = Record<string, any>
type StaticContext = { mergedPromos?: () => Promise<any[]>; userId?: string | null }

const STORAGE_PREFIX = 'grocery-hauls-static-v1'
let activeUserId = 'anonymous'
export function setStaticUserId(uid?: string | null) {
  activeUserId = uid || 'anonymous'
}
const storageKey = (ctx?: StaticContext) => `${STORAGE_PREFIX}:${ctx?.userId || activeUserId}`
const nowIso = () => new Date().toISOString()
const id = () => {
  const c = globalThis.crypto as Crypto | undefined
  return c?.randomUUID ? c.randomUUID() : `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const number = (v: unknown, fallback = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
const cleanPath = (path: string) => path.split('?')[0].replace(/\/$/, '') || '/'
const paramsOf = (path: string) => new URLSearchParams(path.split('?')[1] || '')
const readState = (ctx?: StaticContext): AnyRecord => {
  if (typeof window === 'undefined') return { lists: [], items: [], plans: [], wishlist: [] }
  try {
    const raw = window.localStorage.getItem(storageKey(ctx))
    if (!raw) return { lists: [], items: [], plans: [], wishlist: [] }
    const parsed = JSON.parse(raw)
    return {
      lists: Array.isArray(parsed.lists) ? parsed.lists : [],
      items: Array.isArray(parsed.items) ? parsed.items : [],
      plans: Array.isArray(parsed.plans) ? parsed.plans : [],
      wishlist: Array.isArray(parsed.wishlist) ? parsed.wishlist : [],
    }
  } catch {
    return { lists: [], items: [], plans: [], wishlist: [] }
  }
}
const writeState = (state: AnyRecord, ctx?: StaticContext) => {
  if (typeof window === 'undefined') throw new Error('Local shopping data is only available in your browser')
  window.localStorage.setItem(storageKey(ctx), JSON.stringify(state))
}
async function jsonFile<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`Could not load catalogue data (${response.status})`)
  return response.json() as Promise<T>
}
const getProducts = async () => (await jsonFile<{ products: AnyRecord[] }>('/data/products.json')).products
const getStores = async () => (await jsonFile<{ stores: AnyRecord[] }>('/data/stores.json')).stores
const getCategories = async () => (await jsonFile<{ categories: AnyRecord[] }>('/data/categories.json')).categories
const getPromos = async (ctx?: StaticContext) => {
  if (ctx?.mergedPromos) return ctx.mergedPromos()
  return (await jsonFile<{ promos: AnyRecord[] }>('/data/promos.json')).promos
}
const fail = (message: string): never => { throw new Error(message) }
const requireList = (state: AnyRecord, listId: string) => {
  const list = state.lists.find((entry: AnyRecord) => entry.id === listId)
  if (!list) return fail('List not found')
  return list
}
const enrichItem = (item: AnyRecord, products: AnyRecord[], stores: AnyRecord[], promos: AnyRecord[]) => {
  const product = products.find((p) => p.id === item.productId)
  const prices = product?.storePrices || {}
  const priceEntries = Object.entries(prices) as [string, number][]
  const lowest = priceEntries.sort((a, b) => a[1] - b[1])[0]
  const active = promos.filter((p) => p.productId === item.productId && new Date(p.startDate) <= new Date() && new Date(p.endDate) >= new Date())
    .sort((a, b) => a.promoPrice - b.promoPrice)[0]
  const manualStore = stores.find((s) => s.id === item.manualStoreId)
  return {
    ...item,
    name: product?.name || item.manualName || 'Item',
    unit: product?.unit ?? null,
    categoryIcon: product?.category?.icon || '🛒',
    categoryName: product?.category?.name ?? null,
    manualStoreName: manualStore?.name ?? null,
    lowestPrice: lowest?.[1] ?? null,
    lowestStoreId: lowest?.[0] ?? null,
    lowestStoreName: stores.find((s) => s.id === lowest?.[0])?.name ?? null,
    promo: active ? {
      promoPrice: active.promoPrice, normalPrice: active.normalPrice,
      storeName: active.storeName, storeColor: active.storeColor, storeId: active.storeId,
      endDate: active.endDate,
    } : null,
    notOnPromo: Boolean(item.productId) && !active,
  }
}
async function compareList(state: AnyRecord, listId: string, storeIds: string[], preferred: string | null, ctx?: StaticContext) {
  if (!storeIds.length) fail('Select at least one store to compare')
  if (storeIds.length > 7) fail('Select up to 7 stores')
  const list = requireList(state, listId)
  const [products, stores, promos] = await Promise.all([getProducts(), getStores(), getPromos(ctx)])
  const selected = stores.filter((s) => storeIds.includes(s.id))
  if (!selected.length) fail('Select at least one valid store to compare')
  const items = state.items.filter((i: AnyRecord) => i.listId === listId)
  const effective = (productId: string, storeId: string) => {
    const product = products.find((p) => p.id === productId)
    const normal = product?.storePrices?.[storeId]
    const promo = promos.filter((p) => p.productId === productId && p.storeId === storeId &&
      new Date(p.startDate) <= new Date() && new Date(p.endDate) >= new Date())
      .sort((a, b) => a.promoPrice - b.promoPrice)[0]
    if (promo) return { price: promo.promoPrice, normal: number(normal, promo.normalPrice), promoPrice: promo.promoPrice }
    return normal == null ? null : { price: number(normal), normal: number(normal), promoPrice: null as number | null }
  }
  const storeResults = selected.map((store) => {
    let total = 0, savings = 0, fullTotal = 0, available = 0, notOnPromo = 0, onPromo = 0
    const missingNames: string[] = []
    for (const item of items) {
      const qty = Math.max(1, number(item.quantity, 1))
      if (item.productId) {
        const eff = effective(item.productId, store.id)
        if (!eff) { missingNames.push(products.find((p) => p.id === item.productId)?.name || 'Product'); continue }
        available++; total += eff.price * qty; fullTotal += eff.normal * qty
        if (eff.promoPrice != null) { onPromo++; savings += (eff.normal - eff.price) * qty } else notOnPromo++
      } else if (item.manualStoreId === store.id) {
        available++; total += number(item.manualPrice) * qty; fullTotal += number(item.manualPrice) * qty; notOnPromo++
      } else missingNames.push(item.manualName || 'Manual item')
    }
    return {
      storeId: store.id, name: store.name, color: store.color, emoji: store.emoji,
      available, missing: missingNames.length, missingNames, notOnPromo, onPromo,
      total: round(total), fullTotal: round(fullTotal), savings: round(savings),
      cheapest: false, mostExpensive: false, preferred: store.id === preferred,
    }
  })
  const ranked = storeResults.filter((s) => s.available > 0).sort((a, b) => a.total - b.total)
  const cheapest = ranked[0] || null
  const mostExpensive = ranked.length > 1 ? ranked[ranked.length - 1] : null
  storeResults.forEach((s) => { s.cheapest = s.storeId === cheapest?.storeId; s.mostExpensive = s.storeId === mostExpensive?.storeId })

  let split: AnyRecord = null
  if (selected.length >= 2 && items.length) {
    let best: { a: AnyRecord; b: AnyRecord; total: number } | null = null
    for (let i = 0; i < selected.length; i++) for (let j = i + 1; j < selected.length; j++) {
      const a = selected[i], b = selected[j]
      let total = 0
      for (const item of items) {
        const qty = Math.max(1, number(item.quantity, 1))
        if (item.productId) {
          const pa = effective(item.productId, a.id), pb = effective(item.productId, b.id)
          if (pa || pb) total += Math.min(pa ? pa.price * qty : Infinity, pb ? pb.price * qty : Infinity)
        } else if (item.manualStoreId === a.id || item.manualStoreId === b.id) total += number(item.manualPrice) * qty
      }
      if (!best || total < best.total) best = { a, b, total }
    }
    if (best) {
      const assignments = [[], []] as AnyRecord[][]
      const costs = [0, 0]
      for (const item of items) {
        const qty = Math.max(1, number(item.quantity, 1))
        let index = -1, price = 0, store: AnyRecord | undefined
        if (item.productId) {
          const pa = effective(item.productId, best.a.id), pb = effective(item.productId, best.b.id)
          if (!pa && !pb) continue
          index = preferred === best.a.id && pa ? 0 : preferred === best.b.id && pb ? 1 : pa && (!pb || pa.price <= pb.price) ? 0 : 1
          price = (index === 0 ? pa!.price : pb!.price) * qty
          store = index === 0 ? best.a : best.b
        } else {
          index = item.manualStoreId === best.a.id ? 0 : item.manualStoreId === best.b.id ? 1 : -1
          if (index < 0) continue
          price = number(item.manualPrice) * qty; store = index === 0 ? best.a : best.b
        }
        const product = products.find((p) => p.id === item.productId)
        assignments[index].push({ itemId: item.id, name: product?.name || item.manualName || 'Item', quantity: qty, unit: product?.unit ?? null, price: round(price), storeId: store!.id, storeName: store!.name, storeColor: store!.color })
        costs[index] += price
      }
      const splitTotal = round(costs[0] + costs[1]), single = cheapest?.total ?? splitTotal
      const saving = round(single - splitTotal)
      split = {
        store1: { storeId: best.a.id, name: best.a.name, color: best.a.color, items: assignments[0], cost: round(costs[0]) },
        store2: { storeId: best.b.id, name: best.b.name, color: best.b.color, items: assignments[1], cost: round(costs[1]) },
        splitTotal, cheapestSingleTotal: single, saving, worthIt: saving > 0, travelWarning: saving > 0 && saving < 30,
      }
    }
  }
  return {
    listId, listName: list.name, stores: storeResults,
    cheapest: cheapest ? { storeId: cheapest.storeId, name: cheapest.name, total: cheapest.total, savings: cheapest.savings } : null,
    mostExpensive: mostExpensive ? { storeId: mostExpensive.storeId, name: mostExpensive.name, total: mostExpensive.total } : null,
    overallCheaperBy: cheapest && mostExpensive ? round(mostExpensive.total - cheapest.total) : 0,
    split, itemCount: items.length,
  }
}

export async function handleStaticApi(method: string, path: string, body?: AnyRecord, ctx?: StaticContext): Promise<any> {
  const verb = method.toUpperCase()
  const pathname = cleanPath(path)
  const query = paramsOf(path)
  const state = readState(ctx)
  const save = () => writeState(state, ctx)

  if (verb === 'GET' && pathname === '/api/stores') return { stores: await getStores() }
  if (verb === 'GET' && pathname === '/api/categories') return { categories: await getCategories() }
  if (verb === 'GET' && pathname === '/api/whats-new') return jsonFile('/data/whats-new.json')
  if (verb === 'GET' && pathname === '/api/promos') {
    const promos = (await getPromos(ctx)).filter((p) => new Date(p.startDate) <= new Date() && new Date(p.endDate) >= new Date())
    const store = query.get('store'), category = query.get('category'), sort = query.get('sort') || 'discount'
    let rows = promos.filter((p) => (!store || p.storeId === store) && (!category || p.category?.id === category))
    rows = [...rows].sort(sort === 'price' ? (a, b) => a.promoPrice - b.promoPrice : sort === 'ending' ? (a, b) => +new Date(a.endDate) - +new Date(b.endDate) : sort === 'new' ? (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt) : (a, b) => b.discount - a.discount || a.promoPrice - b.promoPrice)
    return { promos: rows }
  }
  if (verb === 'GET' && pathname === '/api/auth/session') return { user: null }
  if (verb === 'POST' && pathname === '/api/auth/session') return { ok: true }

  if (pathname === '/api/lists' && verb === 'GET') {
    const lists = state.lists.slice().sort((a: AnyRecord, b: AnyRecord) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map((l: AnyRecord) => {
        const items = state.items.filter((i: AnyRecord) => i.listId === l.id)
        return { ...l, itemCount: items.length, totalQuantity: items.reduce((n: number, i: AnyRecord) => n + number(i.quantity, 1), 0) }
      })
    return { lists }
  }
  if (pathname === '/api/lists' && verb === 'POST') {
    const name = String(body?.name || '').trim()
    if (!name) fail('Give your list a name first')
    const list = { id: id(), name: name.slice(0, 60), status: 'active', createdAt: nowIso(), updatedAt: nowIso(), completedAt: null, lastTotal: null, lastSavings: null }
    state.lists.push(list); save(); return { list: { id: list.id, name: list.name } }
  }
  if (pathname === '/api/wishlist' && verb === 'GET') {
    const [products, promos] = await Promise.all([getProducts(), getPromos(ctx)])
    const items = state.wishlist.map((w: AnyRecord) => {
      const p = products.find((x) => x.id === w.productId)
      const promo = promos.filter((x) => x.productId === w.productId && new Date(x.startDate) <= new Date() && new Date(x.endDate) >= new Date()).sort((a, b) => a.promoPrice - b.promoPrice)[0]
      const normal = p ? Math.min(...Object.values(p.storePrices || {}).map(Number)) : null
      return { ...w, name: p?.name || 'Unknown product', unit: p?.unit ?? null, categoryIcon: p?.category?.icon || '🛒', onPromo: Boolean(promo), statusText: promo ? `On promotion at ${promo.storeName}` : 'Not on promotion yet.', bestPromo: promo ? { promoPrice: promo.promoPrice, normalPrice: promo.normalPrice, storeName: promo.storeName, storeColor: promo.storeColor, endDate: promo.endDate, meetsTarget: w.targetPrice == null || promo.promoPrice <= w.targetPrice } : null, normalFrom: Number.isFinite(normal) ? normal : null }
    })
    return { items }
  }
  if (pathname === '/api/wishlist' && verb === 'POST') {
    if (!body?.productId) fail('Missing product')
    const products = await getProducts()
    if (!products.some((p) => p.id === body.productId)) fail('Product not found')
    const target = body.targetPrice == null || body.targetPrice === '' ? null : Number(body.targetPrice)
    if (target != null && (!Number.isFinite(target) || target < 0)) fail('Target price must be a positive amount')
    const existing = state.wishlist.find((w: AnyRecord) => w.productId === body.productId)
    if (existing) { existing.targetPrice = target; save(); return { item: existing, updated: true } }
    const item = { id: id(), productId: body.productId, targetPrice: target, preferredStoreIds: Array.isArray(body.preferredStoreIds) ? body.preferredStoreIds : [], createdAt: nowIso() }
    state.wishlist.push(item); save(); return { item }
  }

  const listMatch = pathname.match(/^\/api\/lists\/([^/]+)(?:\/(items|compare|plan|duplicate))?$/)
  if (listMatch) {
    const listId = decodeURIComponent(listMatch[1]), action = listMatch[2]
    if (!action) {
      if (verb === 'GET') {
        const list = requireList(state, listId)
        const [products, stores, promos] = await Promise.all([getProducts(), getStores(), getPromos(ctx)])
        const items = state.items.filter((i: AnyRecord) => i.listId === listId).map((i: AnyRecord) => enrichItem(i, products, stores, promos))
        return { list, items, plans: state.plans.filter((p: AnyRecord) => p.listId === listId).sort((a: AnyRecord, b: AnyRecord) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5) }
      }
      if (verb === 'PATCH') {
        const list = requireList(state, listId)
        if (typeof body?.name === 'string' && body.name.trim()) list.name = body.name.trim().slice(0, 60)
        if (body?.status === 'completed') { list.status = 'completed'; list.completedAt = nowIso() }
        if (body?.status === 'active') { list.status = 'active'; list.completedAt = null }
        if (typeof body?.lastTotal === 'number') list.lastTotal = body.lastTotal
        if (typeof body?.lastSavings === 'number') list.lastSavings = body.lastSavings
        list.updatedAt = nowIso(); save(); return { list: { id: list.id, name: list.name, status: list.status } }
      }
      if (verb === 'DELETE') {
        requireList(state, listId)
        state.lists = state.lists.filter((l: AnyRecord) => l.id !== listId)
        state.items = state.items.filter((i: AnyRecord) => i.listId !== listId)
        state.plans = state.plans.filter((p: AnyRecord) => p.listId !== listId)
        save(); return { ok: true }
      }
    }
    if (action === 'items') {
      requireList(state, listId)
      if (verb === 'POST') {
        const quantity = Math.max(1, Math.min(99, parseInt(String(body?.quantity ?? 1), 10) || 1))
        let item: AnyRecord
        if (body?.productId) {
          const products = await getProducts(), product = products.find((p) => p.id === body.productId)
          if (!product) fail('Product not found')
          const existing = state.items.find((i: AnyRecord) => i.listId === listId && i.productId === body.productId)
          if (existing) { existing.quantity = Math.min(99, number(existing.quantity, 1) + quantity); existing.source = body.source ?? existing.source; save(); return { item: existing, merged: true } }
          item = { id: id(), listId, productId: body.productId, manualName: null, manualPrice: null, manualStoreId: null, quantity, source: body.source ?? 'catalogue', note: null, createdAt: nowIso() }
        } else {
          const name = String(body?.name || '').trim(), price = body?.price == null ? null : Number(body.price)
          if (!name) fail('Enter the product name')
          if (price == null || !Number.isFinite(price) || price < 0) fail('Enter the shelf price from the price tag')
          item = { id: id(), listId, productId: null, manualName: name.slice(0, 80), manualPrice: price, manualStoreId: body.storeId || null, quantity, source: body.source ?? 'manual', note: null, createdAt: nowIso() }
        }
        state.items.push(item); save(); return { item }
      }
      if (verb === 'PATCH') {
        if (!body?.itemId) fail('Missing itemId')
        const item = state.items.find((i: AnyRecord) => i.listId === listId && i.id === body.itemId)
        if (!item) fail('Item not found')
        if (body.quantity != null) item.quantity = Math.max(1, Math.min(99, parseInt(String(body.quantity), 10) || 1))
        if (typeof body.note === 'string') item.note = body.note.slice(0, 200)
        if (body.price != null && item.source !== 'catalogue') { const p = Number(body.price); if (Number.isFinite(p) && p >= 0) item.manualPrice = p }
        save(); return { item }
      }
      if (verb === 'DELETE') {
        const itemId = query.get('itemId')
        if (!itemId) fail('Missing itemId')
        if (!state.items.some((i: AnyRecord) => i.listId === listId && i.id === itemId)) fail('Item not found')
        state.items = state.items.filter((i: AnyRecord) => !(i.listId === listId && i.id === itemId))
        save(); return { ok: true }
      }
    }
    if (action === 'compare' && verb === 'GET') {
      const stores = (query.get('stores') || '').split(',').map((s) => s.trim()).filter(Boolean)
      return { result: await compareList(state, listId, stores, query.get('preferred'), ctx) }
    }
    if (action === 'plan' && verb === 'POST') {
      requireList(state, listId)
      const choice = String(body?.choice || '')
      if (!['cheapest', 'preferred', 'split'].includes(choice)) fail('Invalid plan choice')
      const plan = { id: id(), listId, choice, storeIds: Array.isArray(body?.storeIds) ? body.storeIds.filter((s: unknown) => typeof s === 'string') : [], totalCost: number(body?.totalCost), savings: number(body?.savings), details: body?.details ?? {}, createdAt: nowIso() }
      state.plans.push(plan)
      const list = requireList(state, listId); list.lastTotal = plan.totalCost; list.lastSavings = plan.savings; list.updatedAt = nowIso()
      save(); return { plan: { id: plan.id } }
    }
    if (action === 'duplicate' && verb === 'POST') {
      const source = requireList(state, listId)
      const copy = { ...source, id: id(), name: `${source.name} (copy)`.slice(0, 60), status: 'active', createdAt: nowIso(), updatedAt: nowIso(), completedAt: null }
      state.lists.push(copy)
      state.items.push(...state.items.filter((i: AnyRecord) => i.listId === listId).map((i: AnyRecord) => ({ ...i, id: id(), listId: copy.id, createdAt: nowIso() })))
      save(); return { list: { id: copy.id, name: copy.name } }
    }
  }

  const wishMatch = pathname.match(/^\/api\/wishlist\/([^/]+)$/)
  if (wishMatch) {
    const wishId = decodeURIComponent(wishMatch[1])
    const wish = state.wishlist.find((w: AnyRecord) => w.id === wishId)
    if (!wish) fail('Wish list item not found')
    if (verb === 'PATCH') {
      if (body?.targetPrice !== undefined) {
        const target = body.targetPrice === null || body.targetPrice === '' ? null : Number(body.targetPrice)
        if (target != null && (!Number.isFinite(target) || target < 0)) fail('Target price must be a positive amount')
        wish.targetPrice = target
      }
      if (Array.isArray(body?.preferredStoreIds)) wish.preferredStoreIds = body.preferredStoreIds
      save(); return { item: wish }
    }
    if (verb === 'DELETE') { state.wishlist = state.wishlist.filter((w: AnyRecord) => w.id !== wishId); save(); return { ok: true } }
  }

  if (verb === 'GET' && pathname === '/api/products') {
    const [products, promos] = await Promise.all([getProducts(), getPromos(ctx)])
    const q = (query.get('q') || '').trim().toLowerCase(), categoryId = query.get('categoryId') || '', barcode = query.get('barcode') || ''
    const results = products.filter((p) => (!q || [p.name, p.brand, p.description].some((v) => String(v || '').toLowerCase().includes(q))) && (!categoryId || p.categoryId === categoryId) && (!barcode || p.barcode === barcode))
      .map((p) => {
        const promo = promos.filter((x) => x.productId === p.id && new Date(x.startDate) <= new Date() && new Date(x.endDate) >= new Date()).sort((a, b) => a.promoPrice - b.promoPrice)[0]
        const prices = Object.entries(p.storePrices || {}) as [string, number][]
        const low = prices.sort((a, b) => a[1] - b[1])[0]
        return { id: p.id, name: p.name, unit: p.unit, brand: p.brand, category: p.category, inPromo: Boolean(promo), promo: promo ? { promoPrice: promo.promoPrice, normalPrice: promo.normalPrice, endDate: promo.endDate, storeId: promo.storeId, storeName: promo.storeName, storeColor: promo.storeColor } : null, price: low?.[1] ?? null, lowestStoreName: null, lowestStoreId: low?.[0] ?? null }
      }).sort((a, b) => Number(b.inPromo) - Number(a.inPromo) || a.name.localeCompare(b.name)).slice(0, 40)
    const stores = await getStores()
    results.forEach((r) => { r.lowestStoreName = stores.find((s) => s.id === r.lowestStoreId)?.name ?? null })
    return { results }
  }
  if (verb === 'GET' && pathname === '/api/lookup') {
    const q = (query.get('q') || '').trim().toLowerCase()
    if (q.length < 3) return { suggestions: [], source: 'none' }
    const products = await getProducts()
    const suggestions = products.filter((p) => p.name.toLowerCase().includes(q) || String(p.brand || '').toLowerCase().includes(q)).slice(0, 5)
      .map((p) => ({ title: p.name, snippet: `Catalogue match · ${p.unit || 'unit not specified'}`, url: '', price: Math.min(...Object.values(p.storePrices || {}).map(Number)) }))
    return { suggestions, source: suggestions.length ? 'catalogue' : 'none' }
  }
  return null
}
