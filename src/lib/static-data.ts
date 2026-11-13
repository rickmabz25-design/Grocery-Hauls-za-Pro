'use client'

/**
 * Local-first replacement for the former /api/* shopping data routes.
 * All mutations stay in this browser's localStorage. No network requests are
 * made for user data; only the public /data/*.json catalogue snapshots load.
 */

type AnyRecord = Record<string, any>
type StaticContext = { mergedPromos?: () => Promise<any[]>; userId?: string | null; user?: AnyRecord | null }

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
  if (typeof window === 'undefined') return { lists: [], items: [], plans: [], wishlist: [], shopSessions: [], notifications: [], profile: null }
  try {
    const raw = window.localStorage.getItem(storageKey(ctx))
    if (!raw) return { lists: [], items: [], plans: [], wishlist: [], shopSessions: [], notifications: [], profile: null }
    const parsed = JSON.parse(raw)
    return {
      lists: Array.isArray(parsed.lists) ? parsed.lists : [],
      items: Array.isArray(parsed.items) ? parsed.items : [],
      plans: Array.isArray(parsed.plans) ? parsed.plans : [],
      wishlist: Array.isArray(parsed.wishlist) ? parsed.wishlist : [],
      shopSessions: Array.isArray(parsed.shopSessions) ? parsed.shopSessions : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      profile: parsed.profile || null,
    }
  } catch {
    return { lists: [], items: [], plans: [], wishlist: [], shopSessions: [], notifications: [], profile: null }
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
const CATALOGUE_OVERRIDE_KEY = 'grocery-hauls-catalogue-overrides-v1'
type CatalogueOverrides = { products: AnyRecord[]; promos: AnyRecord[] }

function readCatalogueOverrides(): CatalogueOverrides {
  if (typeof window === 'undefined') return { products: [], promos: [] }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CATALOGUE_OVERRIDE_KEY) || '{}')
    return {
      products: Array.isArray(parsed.products) ? parsed.products : [],
      promos: Array.isArray(parsed.promos) ? parsed.promos : [],
    }
  } catch {
    return { products: [], promos: [] }
  }
}

/** Apply reviewed import rows to this browser's shared catalogue overlay. */
export async function applyLocalCatalogueImport(rows: Array<{
  name: string; storeId: string; unit?: string; barcode?: string; brand?: string;
  categoryId?: string; normalPrice: number | null; promoPrice: number | null;
  startDate?: string | null; endDate?: string | null;
}>) {
  if (typeof window === 'undefined') throw new Error('Catalogue imports require a browser')
  const [baseProducts, basePromos, stores, categories] = await Promise.all([jsonFile<{ products: AnyRecord[] }>('/data/products.json'), jsonFile<{ promos: AnyRecord[] }>('/data/promos.json'), getStores(), getCategories()])
  const overrides = readCatalogueOverrides()
  const products = [...overrides.products]
  const promos = [...overrides.promos]
  let productsCreated = 0, productsUpdated = 0, pricesUpserted = 0, promosCreated = 0
  const makeId = () => `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
  for (const row of rows) {
    const store = stores.find((s) => s.id === row.storeId)
    if (!store) throw new Error(`Unknown store for ${row.name}`)
    const foundProduct = products.find((p) => p.name.toLowerCase() === row.name.toLowerCase()) ||
      baseProducts.products.find((p) => p.name.toLowerCase() === row.name.toLowerCase())
    let product = foundProduct
    if (foundProduct && !products.some((p) => p.id === foundProduct.id)) {
      product = { ...foundProduct, storePrices: { ...(foundProduct.storePrices || {}) } }
      products.push(product)
    }
    if (!product) {
      const category = categories.find((x) => x.id === row.categoryId) || categories[0]
      product = {
        id: makeId(), name: row.name, brand: row.brand || null, unit: row.unit || null,
        barcode: row.barcode || null, categoryId: category.id,
        category: { id: category.id, name: category.name, icon: category.icon || '🛒' },
        storePrices: {},
      }
      products.push(product)
      productsCreated++
    } else {
      productsUpdated++
      if (row.unit) product.unit = row.unit
      if (row.barcode) product.barcode = row.barcode
      if (row.brand) product.brand = row.brand
      if (row.categoryId) {
        const category = categories.find((x) => x.id === row.categoryId)
        if (category) { product.categoryId = category.id; product.category = { id: category.id, name: category.name, icon: category.icon || '🛒' } }
      }
    }
    if (row.normalPrice != null) {
      product.storePrices = { ...(product.storePrices || {}), [store.id]: row.normalPrice }
      pricesUpserted++
    }
    if (row.promoPrice != null) {
      if (!row.startDate || !row.endDate) throw new Error(`Promotion for ${row.name} needs valid start/end dates`)
      const existingOverride = promos.find((p) => p.productId === product.id && p.storeId === store.id && p.startDate?.slice(0, 10) === row.startDate && p.endDate?.slice(0, 10) === row.endDate)
      const existingBase = basePromos.promos.find((p) => p.productId === product.id && p.storeId === store.id && p.startDate?.slice(0, 10) === row.startDate && p.endDate?.slice(0, 10) === row.endDate)
      const existing = existingOverride || existingBase
      const promo = {
        id: existing?.id || makeId(), productId: product.id, name: product.name, unit: product.unit,
        category: product.category, storeId: store.id, storeName: store.name, storeColor: store.color,
        promoPrice: row.promoPrice, normalPrice: row.normalPrice,
        discount: row.normalPrice != null && row.normalPrice > 0 ? Math.max(0, Math.round((1 - row.promoPrice / row.normalPrice) * 100)) : 0,
        saved: row.normalPrice != null ? Math.round((row.normalPrice - row.promoPrice) * 100) / 100 : 0,
        startDate: `${row.startDate}T00:00:00.000Z`, endDate: `${row.endDate}T23:59:59.999Z`,
        createdAt: existing?.createdAt || nowIso(),
      }
      if (existingOverride) Object.assign(existingOverride, promo)
      else { promos.push(promo); if (!existingBase) promosCreated++ }
    }
  }
  window.localStorage.setItem(CATALOGUE_OVERRIDE_KEY, JSON.stringify({ products, promos }))
  return { productsCreated, productsUpdated, pricesUpserted, promosCreated, rowsProcessed: rows.length }
}

/** Export a merged snapshot that can be reviewed and committed to public/data. */
export async function exportLocalCatalogueSnapshot() {
  const [baseProducts, basePromos] = await Promise.all([
    jsonFile<{ products: AnyRecord[] }>('/data/products.json'),
    jsonFile<{ promos: AnyRecord[] }>('/data/promos.json'),
  ])
  const overrides = readCatalogueOverrides()
  const products = new Map<string, AnyRecord>(baseProducts.products.map((p): [string, AnyRecord] => [p.id, p]))
  overrides.products.forEach((p) => products.set(p.id, p))
  const promos = new Map<string, AnyRecord>(basePromos.promos.map((p): [string, AnyRecord] => [p.id, p]))
  overrides.promos.forEach((p) => promos.set(p.id, p))
  return { products: [...products.values()], promos: [...promos.values()], exportedAt: nowIso() }
}

const getProducts = async () => {
  const base = (await jsonFile<{ products: AnyRecord[] }>('/data/products.json')).products
  const overrides = readCatalogueOverrides().products
  const merged = new Map<string, AnyRecord>(base.map((p): [string, AnyRecord] => [p.id, p]))
  overrides.forEach((p) => merged.set(p.id, p))
  return [...merged.values()]
}
const getStores = async () => (await jsonFile<{ stores: AnyRecord[] }>('/data/stores.json')).stores
const getCategories = async () => (await jsonFile<{ categories: AnyRecord[] }>('/data/categories.json')).categories
const getPromos = async (ctx?: StaticContext) => {
  if (ctx?.mergedPromos) return ctx.mergedPromos()
  const base = (await jsonFile<{ promos: AnyRecord[] }>('/data/promos.json')).promos
  const overrides = readCatalogueOverrides().promos
  const merged = new Map<string, AnyRecord>(base.map((p): [string, AnyRecord] => [p.id, p]))
  overrides.forEach((p) => merged.set(p.id, p))
  return [...merged.values()]
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
    unit: product?.unit ?? item.manualUnit ?? null,
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
  const list = requireList(state, listId)
  const [products, stores, promos] = await Promise.all([getProducts(), getStores(), getPromos(ctx)])
  // Empty selection means all retailers; ignore stale IDs and include every known store.
  const selected = storeIds.length ? stores.filter((s) => storeIds.includes(s.id)) : stores
  if (!selected.length) fail('No retailers are available to compare')
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
      } else if (item.manualStoreId === store.id && item.manualPrice != null) {
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
  // Only rank stores that can supply the entire basket; partial baskets must not be labelled cheapest.
  const ranked = storeResults.filter((s) => s.available > 0 && s.missing === 0).sort((a, b) => a.total - b.total)
  // Only publish a cheapest/most-expensive ranking when at least two stores
  // can price the complete basket. Partial baskets never produce savings claims.
  const cheapest = ranked.length > 1 ? ranked[0] : null
  const mostExpensive = ranked.length > 1 ? ranked[ranked.length - 1] : null
  storeResults.forEach((s) => { s.cheapest = s.storeId === cheapest?.storeId; s.mostExpensive = s.storeId === mostExpensive?.storeId })

  let split: AnyRecord | null = null
  if (selected.length >= 2 && items.length) {
    let best: { a: AnyRecord; b: AnyRecord; total: number } | null = null
    for (let i = 0; i < selected.length; i++) for (let j = i + 1; j < selected.length; j++) {
      const a = selected[i], b = selected[j]
      let total = 0, valid = true
      for (const item of items) {
        const qty = Math.max(1, number(item.quantity, 1))
        if (item.productId) {
          const pa = effective(item.productId, a.id), pb = effective(item.productId, b.id)
          if (!pa && !pb) { valid = false; break }
          total += Math.min(pa ? pa.price * qty : Infinity, pb ? pb.price * qty : Infinity)
        } else if (item.manualPrice != null && (item.manualStoreId === a.id || item.manualStoreId === b.id)) {
          total += number(item.manualPrice) * qty
        } else {
          valid = false
          break
        }
      }
      if (valid && (!best || total < best.total)) best = { a, b, total }
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

export async function handleStaticApi(method: string, path: string, body: AnyRecord = {}, ctx?: StaticContext): Promise<any> {
  const verb = method.toUpperCase()
  const pathname = cleanPath(path)
  const query = paramsOf(path)
  const state = readState(ctx)
  const save = () => writeState(state, ctx)


  if (pathname === '/api/profile' && verb === 'PATCH') {
    const current = state.profile || ctx?.user
    if (!current) fail('Sign in to update your profile')
    const profile = { ...current }
    if (body?.whatsappNumber !== undefined) {
      const raw = String(body.whatsappNumber || '').trim().replace(/[\s\-()]/g, '')
      if (!raw) { profile.whatsappNumber = null; profile.whatsappOptIn = false }
      else {
        const local = raw.replace(/^\+27/, '0')
        if (!/^0[6-8]\d{8}$/.test(local)) fail('Enter a valid South African mobile number, e.g. 082 123 4567 or +27 82 123 4567')
        profile.whatsappNumber = '+27' + local.slice(1)
        profile.whatsappOptIn = Boolean(body.whatsappOptIn)
      }
    } else if (body?.whatsappOptIn !== undefined) {
      if (!profile.whatsappNumber) fail('Add your WhatsApp number first')
      profile.whatsappOptIn = Boolean(body.whatsappOptIn)
    }
    if (typeof body?.name === 'string' && body.name.trim()) profile.name = body.name.trim().slice(0, 60)
    state.profile = profile; save(); return { user: profile }
  }

  if (pathname === '/api/notifications') {
    if (verb === 'GET') return { notifications: state.notifications, unread: state.notifications.filter((n: AnyRecord) => !n.read).length }
    if (verb === 'PATCH') {
      if (body?.id) {
        const item = state.notifications.find((n: AnyRecord) => n.id === body.id)
        if (item) item.read = true
      } else state.notifications.forEach((n: AnyRecord) => { n.read = true })
      save(); return { ok: true }
    }
    if (verb === 'DELETE') {
      const notificationId = query.get('id')
      state.notifications = state.notifications.filter((n: AnyRecord) => n.id !== notificationId)
      save(); return { ok: true }
    }
  }

  if (pathname === '/api/shop/sessions' && verb === 'GET') {
    return { sessions: state.shopSessions.map((s: AnyRecord) => ({
      id: s.id, storeName: s.store.name, storeColor: s.store.color, status: s.status,
      startedAt: s.startedAt, endedAt: s.endedAt, itemCount: s.items.length,
      boughtCount: s.items.filter((i: AnyRecord) => i.bought).length,
      subtotal: round(s.items.reduce((n: number, i: AnyRecord) => n + i.price * i.quantity, 0)),
    })) }
  }
  if (pathname === '/api/shop/sessions' && verb === 'POST') {
    const stores = await getStores()
    const store = stores.find((s) => s.id === body?.storeId)
    if (!store) return fail('Choose the store you are shopping at')
    const list = body?.listId ? state.lists.find((l: AnyRecord) => l.id === body.listId) : null
    const products = await getProducts(), promos = await getPromos(ctx)
    const listItems = list ? state.items.filter((i: AnyRecord) => i.listId === list.id) : []
    const session = { id: id(), status: 'active', startedAt: nowIso(), endedAt: null, storeId: store.id,
      store, listId: list?.id ?? null, listName: list?.name ?? null, items: [] as AnyRecord[] }
    session.items = listItems.map((item: AnyRecord) => {
      const product = products.find((p) => p.id === item.productId)
      const promo = promos.filter((p) => p.productId === item.productId && p.storeId === store.id &&
        new Date(p.startDate) <= new Date() && new Date(p.endDate) >= new Date()).sort((a, b) => a.promoPrice - b.promoPrice)[0]
      const price = promo?.promoPrice ?? product?.storePrices?.[store.id] ?? (item.manualStoreId === store.id ? item.manualPrice : 0) ?? 0
      return { id: id(), listItemId: item.id, productId: item.productId, name: product?.name || item.manualName || 'Item', unit: product?.unit ?? item.manualUnit ?? null,
        price: number(price), promoPrice: promo?.promoPrice ?? null, quantity: item.quantity,
        bought: false, source: item.productId ? 'list' : 'manual' }
    })
    state.shopSessions.unshift(session); save()
    return { session: { id: session.id, storeId: store.id, listId: session.listId } }
  }

  const shopMatch = pathname.match(/^\/api\/shop\/sessions\/([^/]+)(?:\/(items))?$/)
  if (shopMatch) {
    const session = state.shopSessions.find((s: AnyRecord) => s.id === decodeURIComponent(shopMatch[1]))
    if (!session) fail('Session not found')
    const action = shopMatch[2]
    if (!action && verb === 'GET') {
      const total = session.items.reduce((n: number, i: AnyRecord) => n + i.price * i.quantity, 0)
      const promoSavings = session.items.reduce((n: number, i: AnyRecord) => n + (i.promoPrice != null ? Math.max(0, i.price - i.promoPrice) * i.quantity : 0), 0)
      const productsForShop = await getProducts()
      const listItems = state.items.filter((i: AnyRecord) => i.listId === session.listId)
      const boughtNames = new Set(session.items.filter((i: AnyRecord) => i.bought && i.source === 'list').map((i: AnyRecord) => i.name.toLowerCase()))
      const listRemaining = session.listId ? listItems.filter((li: AnyRecord) => {
        const p = productsForShop.find((p) => p.id === li.productId)
        return !boughtNames.has((p?.name || li.manualName || '').toLowerCase())
      }).length : null
      return { session: { id: session.id, status: session.status, startedAt: session.startedAt, endedAt: session.endedAt,
        store: session.store, listId: session.listId, listName: session.listName },
        items: session.items, summary: {
          itemsScanned: session.items.filter((i: AnyRecord) => i.source !== 'list').length,
          itemsInBasket: session.items.length, itemsBought: session.items.filter((i: AnyRecord) => i.bought).length,
          listTotal: session.listId ? listItems.length : null, listRemaining,
          subtotal: round(total), promoSavings: round(promoSavings), estimatedTotal: round(total - promoSavings),
        } }
    }
    if (!action && verb === 'PATCH') { session.status = body?.status === 'active' ? 'active' : 'completed'; session.endedAt = session.status === 'completed' ? nowIso() : null; save(); return { ok: true, status: session.status } }
    if (!action && verb === 'DELETE') { state.shopSessions = state.shopSessions.filter((s: AnyRecord) => s.id !== session.id); save(); return { ok: true } }
    if (action === 'items' && verb === 'POST') {
      if (session.status !== 'active') fail('This shopping session has ended')
      const products = await getProducts(), promos = await getPromos(ctx)
      let product = body?.productId ? products.find((p) => p.id === body.productId) : null
      if (body?.barcode && !product) product = products.find((p) => p.barcode === String(body.barcode)) || null
      let name = String(body?.name || product?.name || '').trim()
      if (!product && body?.barcode) fail('Barcode not recognised')
      if (!name) fail('Enter the product name or scan a barcode')
      const promo = product ? promos.filter((p) => p.productId === product.id && p.storeId === session.storeId &&
        new Date(p.startDate) <= new Date() && new Date(p.endDate) >= new Date()).sort((a, b) => a.promoPrice - b.promoPrice)[0] : null
      const shelf = body?.price == null ? (promo?.promoPrice ?? product?.storePrices?.[session.storeId]) : Number(body.price)
      if (shelf != null && (!Number.isFinite(Number(shelf)) || Number(shelf) < 0)) fail('Enter a valid shelf price')
      const item = { id: id(), productId: product?.id ?? null, name: name.slice(0, 80), unit: product?.unit ?? (body?.unit == null ? null : String(body.unit).trim().slice(0, 40) || null), price: Number(shelf ?? 0),
        promoPrice: promo?.promoPrice ?? null, quantity: Math.max(1, Math.min(99, number(body?.quantity, 1))),
        bought: false, source: body?.source ?? (product ? 'scan' : 'manual') }
      session.items.push(item); save()
      return { item, onPromo: item.promoPrice != null, message: item.promoPrice == null ? 'Not on promotion.' : undefined }
    }
    if (action === 'items' && verb === 'PATCH') {
      const item = session.items.find((i: AnyRecord) => i.id === body?.itemId)
      if (!item) fail('Item not found')
      if (body?.quantity != null) item.quantity = Math.max(1, Math.min(99, number(body.quantity, 1)))
      if (body?.bought != null) item.bought = Boolean(body.bought)
      if (body?.price != null && Number.isFinite(Number(body.price)) && Number(body.price) >= 0) {
        item.price = Number(body.price)
        // A price entered for a manual item loaded from a saved list must update
        // that original list item too, otherwise the next comparison stays unpriced.
        if (item.source === 'manual' && item.listItemId && session.listId) {
          const listItem = state.items.find((li: AnyRecord) => li.id === item.listItemId && li.listId === session.listId)
          if (listItem) { listItem.manualPrice = Number(body.price); listItem.manualStoreId = session.storeId }
        }
      }
      if (body?.promoPrice !== undefined) item.promoPrice = body.promoPrice
      save(); return { item }
    }
    if (action === 'items' && verb === 'DELETE') {
      const itemId = query.get('itemId')
      if (!itemId || !session.items.some((i: AnyRecord) => i.id === itemId)) fail('Item not found')
      session.items = session.items.filter((i: AnyRecord) => i.id !== itemId)
      save(); return { ok: true }
    }
  }

  const localWhatsNewKey = 'grocery-hauls-whats-new-local-v1'
  const readLocalWhatsNew = (): AnyRecord[] => {
    if (typeof window === 'undefined') return []
    try { const value = JSON.parse(window.localStorage.getItem(localWhatsNewKey) || '[]'); return Array.isArray(value) ? value : [] } catch { return [] }
  }
  const writeLocalWhatsNew = (posts: AnyRecord[]) => { if (typeof window === 'undefined') fail('Announcements can only be saved in this browser'); window.localStorage.setItem(localWhatsNewKey, JSON.stringify(posts)) }
  if (pathname === '/api/admin/whatsnew') {
    const posts = readLocalWhatsNew()
    if (verb === 'GET') return { posts: posts.map(post => ({ ...post, promoCount: 0 })) }
    if (verb === 'POST') {
      const title = String(body?.title || '').trim(), description = String(body?.description || '').trim()
      if (!title || !description) fail('Add a title and description before publishing')
      const stores = await getStores(), store = stores.find((item: AnyRecord) => item.id === body.storeId)
      const post = { id: `local_post_${Date.now().toString(36)}`, title: title.slice(0,100), description: description.slice(0,1200), imageUrl: String(body?.imageUrl || '').trim() || null, tag: String(body?.tag || 'new'), datePosted: nowIso(), storeName: store?.name || null, storeColor: store?.color || null, promos: [], promoCount: 0, active: true }
      posts.unshift(post); writeLocalWhatsNew(posts); return { post }
    }
    if (verb === 'PATCH') { const post = posts.find(item => item.id === body?.id); if (post) post.active = Boolean(body.active); writeLocalWhatsNew(posts); return { ok: true } }
    if (verb === 'DELETE') { writeLocalWhatsNew(posts.filter(item => item.id !== query.get('id'))); return { ok: true } }
  }

  if (verb === 'GET' && pathname === '/api/stores') return { stores: await getStores() }
  if (verb === 'GET' && pathname === '/api/categories') return { categories: await getCategories() }
  if (verb === 'GET' && pathname === '/api/whats-new') { const base = await jsonFile<{ posts: AnyRecord[] }>('/data/whats-new.json'); const local = readLocalWhatsNew().filter(post => post.active !== false); return { posts: [...local, ...(base.posts || [])] } }
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
          if (price != null && (!Number.isFinite(price) || price < 0)) fail('Enter a valid shelf price')
          item = { id: id(), listId, productId: null, manualName: name.slice(0, 80), manualUnit: body.unit == null ? null : String(body.unit).trim().slice(0, 40) || null, manualPrice: price, manualStoreId: body.storeId || null, quantity, source: body.source ?? 'manual', note: null, createdAt: nowIso() }
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
