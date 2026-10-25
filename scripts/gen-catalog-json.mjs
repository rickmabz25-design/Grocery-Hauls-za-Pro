// Generates public/data/*.json from db/custom.db so the STATIC (Spark)
// deployment serves the exact same response shapes the API routes produce.
// Run automatically by scripts/build-static.mjs before `next build`.
//
// Shapes (must mirror the SSR route handlers):
//   stores.json      -> { stores: Store[] }
//   categories.json  -> { categories: Category[] }
//   promos.json      -> { promos: PromoCard[] }   (default sort: discount)
//   whats-new.json   -> { posts: FeedPost[] }
//   products.json    -> { products: Product[] }   (for client-side search + compare)
//
// PromoCard = { id, productId, name, unit, category{id,name,icon}, storeId,
//               storeName, storeColor, promoPrice, normalPrice, discount,
//               saved, startDate, endDate, createdAt }

// Dual-runtime SQLite: prefer bun:sqlite when running under Bun, fall back
// to node:sqlite (DatabaseSync) under plain Node (>=22.5). Both expose
// prepare().all() with the same row shapes, so the rest of the script is
// runtime-agnostic. This lets the static build run on CI images that ship
// Node only (e.g. Cloudflare Pages) without requiring a Bun install.
let Database
try {
  ;({ Database } = await import('bun:sqlite'))
} catch {
  ;({ DatabaseSync: Database } = await import('node:sqlite'))
}
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// fileURLToPath works in BOTH node and bun (import.meta.dir is bun-only)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const DB_PATH = process.env.CATALOG_DB || path.join(ROOT, 'db', 'custom.db')
const OUT_DIR = path.join(ROOT, 'public', 'data')

// Bun spells the option "readonly"; Node spells it "readOnly" (and rejects
// the other spelling in strict validation on some versions) — branch it.
const IS_BUN = process.versions.bun !== undefined
const db = IS_BUN ? new Database(DB_PATH, { readonly: true }) : new Database(DB_PATH, { readOnly: true })
const q = (sql) => db.prepare(sql).all()

// bun:sqlite returns DATETIME as epoch-ms numbers and BOOLEAN as 0/1;
// the SSR API (Prisma JSON) returns ISO strings and true/false. Normalise
// so the static payloads are byte-shape-compatible with the API shapes.
const iso = (v) => (v == null ? null : new Date(v).toISOString())
const bool = (v) => Boolean(v)

const stores = q(`SELECT * FROM Store WHERE active = 1 ORDER BY name ASC`).map((s) => ({
  ...s,
  active: bool(s.active),
}))
const categories = q(`SELECT * FROM Category ORDER BY sortOrder ASC`)
const catById = new Map(categories.map((c) => [c.id, c]))
const storeById = new Map(stores.map((s) => [s.id, s]))
const productById = new Map(
  q(`SELECT * FROM Product`).map((p) => [p.id, p])
)

// --- Promo cards (same transform as /api/promos) --------------------------
const now = new Date()
const promoRows = q(`SELECT * FROM Promotion WHERE status = 'published'`)
const cards = []
for (const p of promoRows) {
  if (new Date(p.startDate) > now || new Date(p.endDate) < now) continue
  const product = productById.get(p.productId)
  const store = storeById.get(p.storeId)
  if (!product || !store) continue
  const category = catById.get(product.categoryId)
  if (!category) continue
  cards.push({
    id: p.id,
    productId: p.productId,
    name: product.name,
    unit: product.unit,
    category: { id: category.id, name: category.name, icon: category.icon },
    storeId: p.storeId,
    storeName: store.name,
    storeColor: store.color,
    promoPrice: p.promoPrice,
    normalPrice: p.normalPrice,
    discount:
      p.normalPrice > 0
        ? Math.round((1 - p.promoPrice / p.normalPrice) * 100)
        : 0,
    saved: Math.round((p.normalPrice - p.promoPrice) * 100) / 100,
    startDate: iso(p.startDate),
    endDate: iso(p.endDate),
    createdAt: iso(p.createdAt),
  })
}
cards.sort(
  (a, b) => b.discount - a.discount || a.promoPrice - b.promoPrice
)

// --- Products (client-side search / compare / list enrichment) --------------
// Mirrors the shape of a Product row as the /api/products route returns it,
// plus `storePrices` (normal shelf price per store) so the static build can
// compute basket comparisons entirely in the browser.
const productRows = q(`SELECT * FROM Product WHERE active = 1 ORDER BY name ASC`)
const priceRows = q(`SELECT * FROM StorePrice`)
const products = []
for (const p of productRows) {
  const category = catById.get(p.categoryId)
  if (!category) continue
  const storePrices = {}
  for (const pr of priceRows) {
    if (pr.productId === p.id && storeById.has(pr.storeId)) {
      const v = Number(pr.price)
      if (Number.isFinite(v)) storePrices[pr.storeId] = Math.round(v * 100) / 100
    }
  }
  products.push({
    id: p.id,
    name: p.name,
    brand: p.brand ?? null,
    unit: p.unit ?? null,
    barcode: p.barcode ?? null,
    categoryId: p.categoryId,
    category: { id: category.id, name: category.name, icon: category.icon },
    storePrices,
  })
}

// --- What's New feed (same transform as /api/whats-new) --------------------
const posts = q(
  `SELECT * FROM WhatsNewPost WHERE active = 1 ORDER BY datePosted DESC`
)
const cardById = new Map(cards.map((c) => [c.id, c]))
const feed = posts.map((post) => {
  let promoIdList = []
  try {
    promoIdList = Array.isArray(JSON.parse(post.promoIds ?? '[]'))
      ? JSON.parse(post.promoIds)
      : []
  } catch {
    promoIdList = []
  }
  return {
    id: post.id,
    title: post.title,
    description: post.description,
    imageUrl: post.imageUrl,
    tag: post.tag,
    datePosted: iso(post.datePosted),
    storeName: post.storeId ? storeById.get(post.storeId)?.name ?? null : null,
    storeColor: post.storeId
      ? storeById.get(post.storeId)?.color ?? null
      : null,
    promos: promoIdList
      .map((id) => cardById.get(id))
      .filter(Boolean)
      .map((c) => ({
        id: c.id,
        productId: c.productId,
        name: c.name,
        unit: c.unit,
        category: c.category ? { name: c.category.name } : null,
        storeName: c.storeName,
        storeColor: c.storeColor,
        promoPrice: c.promoPrice,
        normalPrice: c.normalPrice,
        discount: c.discount,
      })),
  }
})

mkdirSync(OUT_DIR, { recursive: true })
const files = {
  'stores.json': { stores },
  'categories.json': { categories },
  'promos.json': { promos: cards },
  'whats-new.json': { posts: feed },
  'products.json': { products },
}
let bytes = 0
for (const [name, payload] of Object.entries(files)) {
  const json = JSON.stringify(payload)
  writeFileSync(path.join(OUT_DIR, name), json)
  bytes += json.length
  console.log(
    `[gen-catalog] ${name.padEnd(16)} ${Object.values(payload)[0].length} items  (${(json.length / 1024).toFixed(1)} KB)`
  )
}
console.log(`[gen-catalog] total ${(bytes / 1024).toFixed(1)} KB -> ${OUT_DIR}`)
