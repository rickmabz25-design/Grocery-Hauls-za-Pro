// Unit tests for the local-first STATIC data layer (src/lib/static-data.ts).
// Run: bun scripts/test-static-data.ts
// Shims window.localStorage and relative /data/*.json fetches so the module
// runs exactly like it does in the browser.

import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// --- localStorage shim -------------------------------------------------------
const mem = new Map<string, string>()
const localStorageShim = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => void mem.clear(),
}
;(globalThis as Record<string, unknown>).window = { localStorage: localStorageShim }

// --- fetch shim for /data/*.json ----------------------------------------------
const realFetch = globalThis.fetch
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).fetch = (input: any, init?: any) => {
  const url = String(input)
  if (url.startsWith('/data/')) {
    const file = path.join(ROOT, 'public', url)
    const body = readFileSync(file, 'utf8')
    return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }))
  }
  return realFetch(input, init)
}

// --- import after shims --------------------------------------------------------
const { handleStaticApi, applyLocalCatalogueImport, exportLocalCatalogueSnapshot } = await import(path.join(ROOT, 'src/lib/static-data.ts').replace(/\.ts$/, '') + '')

// promos from the build snapshot (no Firestore in unit tests)
const promosPayload = JSON.parse(readFileSync(path.join(ROOT, 'public/data/promos.json'), 'utf8'))
const ctx = { mergedPromos: async () => promosPayload.promos, userId: 'test-user', user: { id: 'test-user', email: 'test@example.com', name: 'Tester', role: 'user', whatsappNumber: null, whatsappOptIn: false } }

// --- tiny test harness ----------------------------------------------------------
let pass = 0
let fail = 0
const failures: string[] = []
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++
    console.log(`  ok  ${name}`)
  } else {
    fail++
    failures.push(name + (detail ? ` — ${detail}` : ''))
    console.log(`FAIL  ${name} ${detail}`)
  }
}

// --- helpers --------------------------------------------------------------------
const GET = (p: string) => handleStaticApi('GET', p, undefined, ctx)
const POST = (p: string, b?: unknown) => handleStaticApi('POST', p, b as Record<string, unknown>, ctx)
const PATCH = (p: string, b?: unknown) => handleStaticApi('PATCH', p, b as Record<string, unknown>, ctx)
const DEL = (p: string) => handleStaticApi('DELETE', p, undefined, ctx)

// load catalog for expectations
const products: Array<{ id: string; name: string; storePrices: Record<string, number>; category: { id: string; name: string } }> =
  JSON.parse(readFileSync(path.join(ROOT, 'public/data/products.json'), 'utf8')).products
const stores: Array<{ id: string; name: string; color: string; emoji: string }> = JSON.parse(
  readFileSync(path.join(ROOT, 'public/data/stores.json'), 'utf8')
).stores

// a real product with prices in >= 1 store, for compare math
const withPrices = products.find((p) => Object.keys(p.storePrices).length >= 2)!
const priceStoreIds = Object.keys(withPrices.storePrices)
const cheapestStoreId = priceStoreIds.reduce((a, b) =>
  withPrices.storePrices[b] < withPrices.storePrices[a] ? b : a
)

console.log(`\nUsing product "${withPrices.name}" (stores: ${priceStoreIds.length})\n`)

// =========================== 1. list CRUD ===========================
console.log('1. List CRUD')
const created = (await POST('/api/lists', { name: 'November List' })) as { list: { id: string; name: string } }
check('create list returns id+name', Boolean(created.list?.id) && created.list.name === 'November List')

const dupName = await POST('/api/lists', { name: '   ' }).catch((e: Error) => e)
check('empty name rejected with friendly message', (dupName as Error).message === 'Give your list a name first')

const allLists = (await GET('/api/lists')) as { lists: Array<{ id: string; itemCount: number; totalQuantity: number }> }
check('GET /api/lists shows the list', allLists.lists.length === 1 && allLists.lists[0].itemCount === 0)

// =========================== 2. items ===========================
console.log('2. Add / merge / patch / delete items')
const added = (await POST(`/api/lists/${created.list.id}/items`, { productId: withPrices.id, quantity: 2 })) as {
  item: { id: string; quantity: number }
}
check('add catalogue product', Boolean(added.item?.id) && added.item.quantity === 2)

const merged = (await POST(`/api/lists/${created.list.id}/items`, { productId: withPrices.id, quantity: 1 })) as {
  merged?: boolean
  item: { quantity: number }
}
check('duplicate product merges quantity 2+1=3', merged.merged === true && merged.item.quantity === 3)

const manual = (await POST(`/api/lists/${created.list.id}/items`, {
  name: 'Ace Maize Meal 5kg',
  price: 44.99,
  storeId: stores[0].id,
})) as { item: { id: string; productId: null } }
check('add manual item with store', Boolean(manual.item?.id) && manual.item.productId === null)

const noPrice = (await POST(`/api/lists/${created.list.id}/items`, { name: 'No price item' })) as { item: { id: string; manualPrice: number | null } }
check('manual item without price is saved for later pricing', Boolean(noPrice.item?.id) && noPrice.item.manualPrice === null)
await DEL(`/api/lists/${created.list.id}/items?itemId=${noPrice.item.id}`)
check('unpriced manual item can be removed', ((await GET(`/api/lists/${created.list.id}`)) as { items: unknown[] }).items.length === 2)

await PATCH(`/api/lists/${created.list.id}/items`, { itemId: added.item.id, quantity: 1 })
const afterQty = (await GET(`/api/lists/${created.list.id}`)) as {
  items: Array<{ quantity: number; name: string; lowestPrice: number | null; promo: { promoPrice: number } | null }>
}
check('patch quantity applied', afterQty.items.find((i) => i.name === withPrices.name)?.quantity === 1)

const enriched = afterQty.items.find((i) => i.name === withPrices.name)!
check('enrichment: lowestPrice matches catalog', enriched.lowestPrice === withPrices.storePrices[cheapestStoreId])

await DEL(`/api/lists/${created.list.id}/items?itemId=${added.item.id}`)
const afterDel = (await GET(`/api/lists/${created.list.id}`)) as { items: unknown[] }
check('delete item removes it', afterDel.items.length === 1)

// re-add for compare tests
await POST(`/api/lists/${created.list.id}/items`, { productId: withPrices.id, quantity: 1 })

// =========================== 3. search ===========================
console.log('3. Product search')
const milk = (await GET('/api/products?q=milk')) as { results: Array<{ name: string; inPromo: boolean; price: number | null }> }
check('search "milk" finds products', milk.results.length > 0)
const milkProd = products.find((p) => p.name.toLowerCase().includes('milk'))
if (milkProd) {
  const hit = milk.results.find((r: { name: string }) => r.name === milkProd.name)
  check('search result carries lowest price', Boolean(hit && hit.price === Math.min(...Object.values(milkProd.storePrices))))
}
const promoFirst = (await GET('/api/products?q=')) as { results: Array<{ inPromo: boolean }> }
const firstPromoIdx = promoFirst.results.findIndex((r) => r.inPromo)
const firstNonPromoIdx = promoFirst.results.findIndex((r) => !r.inPromo)
check(
  'promo products sort first',
  firstPromoIdx === -1 || firstNonPromoIdx === -1 || firstPromoIdx < firstNonPromoIdx
)
const cat = products[0].category.id
const byCat = (await GET(`/api/products?categoryId=${cat}`)) as { results: Array<{ category: { id: string } }> }
check('category filter works', byCat.results.every((r) => r.category.id === cat) && byCat.results.length > 0)

// =========================== 4. lookup ===========================
console.log('4. Catalogue lookup')
const lookup = (await GET('/api/lookup?q=Albany')) as {
  suggestions: Array<{ title: string; price: number | null }>
  source: string
}
check('lookup returns catalogue suggestions', lookup.source === 'catalogue' && lookup.suggestions.length > 0)
check('lookup suggestion carries price', lookup.suggestions.every((s) => typeof s.title === 'string' && s.price === null || typeof s.price === 'number'))
const none = (await GET('/api/lookup?q=ZZZ No Such Product')) as { suggestions: unknown[]; source: string }
check('lookup unknown product honestly returns none', none.source === 'none' && none.suggestions.length === 0)
const shortQ = (await GET('/api/lookup?q=ab')) as { suggestions: unknown[] }
check('lookup short query returns none', shortQ.suggestions.length === 0)

// =========================== 5. compare ===========================
console.log('5. Basket comparison + split')
const cmp = (await GET(
  `/api/lists/${created.list.id}/compare?stores=${priceStoreIds.join(',')}`
)) as { result: { stores: Array<{ storeId: string; total: number; available: number; missing: number; cheapest: boolean }>; cheapest: { storeId: string; total: number } | null; split: { splitTotal: number; cheapestSingleTotal: number; saving: number } | null; itemCount: number } }

const r = cmp.result
check('compare returns result', Boolean(r?.stores?.length))
check('itemCount = 2 (product + manual)', r.itemCount === 2)
check('manual item only available at its store', r.stores.find((s) => s.storeId === stores[0].id)!.available === 2)

// A single store has the manual price, so only one store can complete the basket.
// The UI must not call that store cheapest without a second complete-basket option.
check('no cheapest ranking when fewer than two stores can price the full basket', r.cheapest === null)
check('no cheapest flag when there is no valid store-to-store comparison', r.stores.every((s) => !s.cheapest))

// compare with an invalid store list
const allStoresCmp = (await GET(`/api/lists/${created.list.id}/compare?stores=`)) as { result: { stores: Array<{ storeId: string }> } }
check('compare without a saved selection defaults to every retailer', allStoresCmp.result.stores.length === stores.length)
check('compare supports the full retailer catalogue, not a seven-store cap', stores.length <= 7 || allStoresCmp.result.stores.length === stores.length)

// =========================== 6. plan + duplicate + rename + status ===========================
console.log('6. Plans, duplicate, rename, wishlist')
const plan = (await POST(`/api/lists/${created.list.id}/plan`, {
  choice: 'cheapest',
  storeIds: [cheapestStoreId],
  totalCost: r.cheapest?.total ?? 0,
  savings: 5,
})) as { plan: { id: string } }
check('plan saved', Boolean(plan.plan?.id))

const detail = (await GET(`/api/lists/${created.list.id}`)) as { list: { lastTotal: number }; plans: unknown[] }
check('plan updates list lastTotal', detail.list.lastTotal === (r.cheapest?.total ?? 0) && detail.plans.length === 1)

const renamed = (await PATCH(`/api/lists/${created.list.id}`, { name: 'Monthly Groceries' })) as {
  list: { name: string }
}
check('rename list', renamed.list.name === 'Monthly Groceries')

const completed = (await PATCH(`/api/lists/${created.list.id}`, { status: 'completed' })) as {
  list: { status: string }
}
check('mark completed', completed.list.status === 'completed')

const dup = (await POST(`/api/lists/${created.list.id}/duplicate`)) as { list: { id: string; name: string } }
check('duplicate list', dup.list.name === 'Monthly Groceries (copy)' && dup.list.id !== created.list.id)

// wishlist
const w1 = (await POST('/api/wishlist', { productId: withPrices.id, targetPrice: 10 })) as { item: { id: string } }
check('wishlist add', Boolean(w1.item?.id))
const w2 = (await POST('/api/wishlist', { productId: withPrices.id, targetPrice: 12 })) as { updated?: boolean }
check('wishlist update dedupes', w2.updated === true)
const wl = (await GET('/api/wishlist')) as { items: Array<{ targetPrice: number | null; statusText: string }> }
check('wishlist GET enriches', wl.items.length === 1 && wl.items[0].targetPrice === 12)
await PATCH(`/api/wishlist/${w1.item.id}`, { preferredStoreIds: [cheapestStoreId] })
const wl2 = (await GET('/api/wishlist')) as { items: Array<{ preferredStoreIds: string[] }> }
check('wishlist patch persists', wl2.items[0].preferredStoreIds.length === 1)
await DEL(`/api/wishlist/${w1.item.id}`)
const wl3 = (await GET('/api/wishlist')) as { items: unknown[] }
check('wishlist delete', wl3.items.length === 0)

// =========================== 7. profile + Shop Mode ===========================
console.log('7. Profile + Shop Mode')
const profile = (await PATCH('/api/profile', { whatsappNumber: '082 123 4567', whatsappOptIn: true })) as { user: { whatsappNumber: string; whatsappOptIn: boolean } }
check('profile saves normalized SA WhatsApp number', profile.user.whatsappNumber === '+27821234567' && profile.user.whatsappOptIn)

const unpricedForShop = (await POST(`/api/lists/${created.list.id}/items`, { name: 'Shop Mode price sync test' })) as { item: { id: string; manualPrice: number | null } }
const shopStoreId = priceStoreIds[0]
const shopStart = (await POST('/api/shop/sessions', { storeId: shopStoreId, listId: created.list.id })) as { session: { id: string } }
check('Shop Mode session starts from saved list', Boolean(shopStart.session?.id))
const shopDetail = (await GET(`/api/shop/sessions/${shopStart.session.id}`)) as { items: Array<{ id: string; name: string; bought: boolean; source: string; price: number; listItemId?: string }>; summary: { itemsInBasket: number } }
check('Shop Mode preloads saved list items including unpriced manual item', shopDetail.items.length === 3 && shopDetail.summary.itemsInBasket === 3)
const shopUnpriced = shopDetail.items.find((item) => item.name === 'Shop Mode price sync test')!
check('unpriced saved manual item opens at zero for later entry', Boolean(shopUnpriced?.id) && shopUnpriced.price === 0 && shopUnpriced.source === 'manual')
await PATCH(`/api/shop/sessions/${shopStart.session.id}/items`, { itemId: shopDetail.items[0].id, bought: true })
await PATCH(`/api/shop/sessions/${shopStart.session.id}/items`, { itemId: shopUnpriced.id, price: 12.34 })
const afterShopPrice = (await GET(`/api/lists/${created.list.id}`)) as { items: Array<{ id: string; manualPrice: number | null; manualStoreId: string | null }> }
const savedShopPrice = afterShopPrice.items.find((item) => item.id === unpricedForShop.item.id)!
check('Shop Mode price is written back to saved list item', savedShopPrice.manualPrice === 12.34 && savedShopPrice.manualStoreId === shopStoreId)
const incompleteCmp = (await GET(`/api/lists/${created.list.id}/compare?stores=${stores.map((s) => s.id).join(',')}`)) as { result: { cheapest: { storeId: string } | null; stores: Array<{ cheapest: boolean; missing: number }> } }
check('incomplete basket never receives a cheapest-store ranking', incompleteCmp.result.cheapest === null && incompleteCmp.result.stores.every((s) => !s.cheapest))
const shopAfterBuy = (await GET(`/api/shop/sessions/${shopStart.session.id}`)) as { summary: { itemsBought: number } }
check('Shop Mode marks items as bought', shopAfterBuy.summary.itemsBought === 1)
const shopManual = (await POST(`/api/shop/sessions/${shopStart.session.id}/items`, { name: 'Water 1L', price: 9.99, source: 'manual' })) as { item: { id: string } }
check('Shop Mode adds manual basket item', Boolean(shopManual.item?.id))
await DEL(`/api/shop/sessions/${shopStart.session.id}/items?itemId=${shopManual.item.id}`)
await PATCH(`/api/shop/sessions/${shopStart.session.id}`, { status: 'completed' })
const shopHistory = (await GET('/api/shop/sessions')) as { sessions: Array<{ id: string; status: string }> }
check('Shop Mode session history persists', shopHistory.sessions.some((s) => s.id === shopStart.session.id && s.status === 'completed'))

// =========================== 8. router passthrough ===========================
console.log('8. Router boundaries')
const notifications = await GET('/api/notifications') as { notifications: unknown[]; unread: number }
check('notifications return a local empty state', Array.isArray(notifications.notifications) && notifications.notifications.length === 0 && notifications.unread === 0)
const notHandled = await handleStaticApi('GET', '/api/not-a-real-feature', undefined, ctx)
check('unknown paths return null (falls back)', notHandled === null)
const del404 = await DEL('/api/lists/local_missing').catch((e: Error) => e)
check('missing list 404s with message', (del404 as Error).message === 'List not found')

// persistence: data survives across "sessions" (module re-uses localStorage)
const persisted = (await GET('/api/lists')) as { lists: unknown[] }
check('lists persist in localStorage', persisted.lists.length === 2)

// ====================== 9. browser-local catalogue import ======================
console.log('9. Browser-local catalogue import')
const localStore = stores[0]
const importedName = 'V15 Local Import Test Product'
const importDateStart = '2026-11-01'
const importDateEnd = '2026-12-01'
const firstImport = await applyLocalCatalogueImport([{
  name: importedName, storeId: localStore.id, unit: '1kg',
  normalPrice: 20, promoPrice: 15, startDate: importDateStart, endDate: importDateEnd,
}])
check('new product and promotion are saved locally', firstImport.productsCreated === 1 && firstImport.promosCreated === 1)
const GETLOCAL = (p: string) => handleStaticApi('GET', p, undefined, { userId: 'local-import-test' })
const importedSearch = await GETLOCAL('/api/products?q=V15%20Local%20Import%20Test%20Product') as { results: Array<{ id: string; price: number }> }
check('local product search sees imported product and price', importedSearch.results[0]?.price === 20)
const importedPromos = await GETLOCAL('/api/promos') as { promos: Array<{ productId: string; promoPrice: number }> }
check('promotions endpoint sees imported promotion', importedPromos.promos.some(p => p.productId === importedSearch.results[0]?.id && p.promoPrice === 15))
const secondImport = await applyLocalCatalogueImport([{
  name: importedName, storeId: localStore.id, unit: '1kg',
  normalPrice: 18, promoPrice: 12, startDate: importDateStart, endDate: importDateEnd,
}])
check('re-import updates existing product and promotion instead of duplicating', secondImport.productsUpdated === 1 && secondImport.promosCreated === 0)
const updatedSearch = await GETLOCAL('/api/products?q=V15%20Local%20Import%20Test%20Product') as { results: Array<{ price: number }> }
const updatedPromos = await GETLOCAL('/api/promos') as { promos: Array<{ productId: string; promoPrice: number }> }
check('re-imported prices are reflected by local catalogue reads', updatedSearch.results[0]?.price === 18 && updatedPromos.promos.some(p => p.productId === importedSearch.results[0]?.id && p.promoPrice === 12))
const exported = await exportLocalCatalogueSnapshot()
check('catalogue export includes locally imported product and promotion', exported.products.some(p => p.name === importedName) && exported.promos.some(p => p.productId === importedSearch.results[0]?.id && p.promoPrice === 12))
localStorageShim.removeItem('grocery-hauls-catalogue-overrides-v1')

console.log(`\n========== RESULTS: ${pass} passed, ${fail} failed ==========`)
if (failures.length) {
  console.log('Failures:')
  failures.forEach((f) => console.log(' - ' + f))
  process.exit(1)
}
