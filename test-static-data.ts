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
const { handleStaticApi } = await import(path.join(ROOT, 'src/lib/static-data.ts').replace(/\.ts$/, '') + '')

// promos from the build snapshot (no Firestore in unit tests)
const promosPayload = JSON.parse(readFileSync(path.join(ROOT, 'public/data/promos.json'), 'utf8'))
const ctx = { mergedPromos: async () => promosPayload.promos }

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

const noPrice = await POST(`/api/lists/${created.list.id}/items`, { name: 'No price item' }).catch((e: Error) => e)
check('manual item without price rejected', (noPrice as Error).message === 'Enter the shelf price from the price tag')

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
  check('search result carries lowest price', hit && hit.price === Math.min(...Object.values(milkProd.storePrices)))
}
const promoFirst = (await GET('/api/products?q=')) as { results: Array<{ inPromo: boolean }> }
const firstPromoIdx = promoFirst.results.findIndex((r) => r.inPromo)
const firstNonPromoIdx = promoFirst.results.findIndex((r) => !r.inPromo)
check(
  'promo products sort first',
  firstPromoIdx === -1 || firstNonPromoIdx === -1 || firstPromoIdx < firstNonPromoIdx
)
const cat = products[0].categoryId
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

// verify cheapest store: manual item (R44.99) sits at stores[0], so stores that
// do not stock the manual item can win on total with just the product price.
const MANUAL_PRICE = 44.99
const expectedTotals = priceStoreIds.map((id) => ({
  id,
  total: Math.round((withPrices.storePrices[id] + (id === stores[0].id ? MANUAL_PRICE : 0)) * 100) / 100,
}))
const expectedCheapest = expectedTotals.reduce((a, b) => (b.total < a.total ? b : a))
check(
  'cheapest total matches expected store math',
  r.cheapest?.storeId === expectedCheapest.id && r.cheapest?.total === expectedCheapest.total,
  `expected ${expectedCheapest.id} @ R${expectedCheapest.total}, got ${r.cheapest?.storeId} @ R${r.cheapest?.total}`
)
check(
  'cheapest flag set exactly once on cheapest store',
  r.stores.filter((s) => s.cheapest).length === 1 && r.stores.find((s) => s.cheapest)!.storeId === expectedCheapest.id
)

if (r.split) {
  check('split total <= cheapest single total', r.split.splitTotal <= r.split.cheapestSingleTotal + 0.001)
  check('split saving = single - split', Math.abs(r.split.saving - (r.split.cheapestSingleTotal - r.split.splitTotal)) < 0.01)
}

// compare with an invalid store list
const badCmp = await GET(`/api/lists/${created.list.id}/compare?stores=`).catch((e: Error) => e)
check('compare without stores rejected', (badCmp as Error).message === 'Select at least one store to compare')

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

// =========================== 7. router passthrough ===========================
console.log('7. Router boundaries')
const notHandled = await handleStaticApi('GET', '/api/notifications', undefined, ctx)
check('unhandled path returns null (falls back)', notHandled === null)
const del404 = await DEL('/api/lists/local_missing').catch((e: Error) => e)
check('missing list 404s with message', (del404 as Error).message === 'List not found')

// persistence: data survives across "sessions" (module re-uses localStorage)
const persisted = (await GET('/api/lists')) as { lists: unknown[] }
check('lists persist in localStorage', persisted.lists.length === 2)

console.log(`\n========== RESULTS: ${pass} passed, ${fail} failed ==========`)
if (failures.length) {
  console.log('Failures:')
  failures.forEach((f) => console.log(' - ' + f))
  process.exit(1)
}
