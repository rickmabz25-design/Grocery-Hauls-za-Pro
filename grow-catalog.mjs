// Catalog grower (Task 39): inserts curated SA grocery staples into
// db/custom.db (Product + StorePrice) and refreshes public/data/*.json.
//
// Usage:
//   bun scripts/grow-catalog.mjs --limit 15          # add up to 15 per run (daily job)
//   bun scripts/grow-catalog.mjs                     # add the whole remaining queue
//   bun scripts/grow-catalog.mjs --dry-run           # show what would be added
//
// Design:
//   - Queue lives in scripts/catalog-seed.json ("items"). Inserted items are
//     REMOVED from the queue so a daily run always grows by fresh items.
//   - Idempotent: dedupe against existing DB rows (case-insensitive name)
//     AND inside the queue itself.
//   - Prices: per-store deterministic spread around the item's base price
//     (Woolworths priciest, Boxer cheapest) + jitter, rounded to x.99.
//   - After inserts it regenerates public/data/*.json via gen-catalog-json.mjs.

import { Database } from 'bun:sqlite'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const DB_PATH = process.env.CATALOG_DB || path.join(ROOT, 'db', 'custom.db')
const SEED_PATH = path.join(HERE, 'catalog-seed.json')
const GEN = path.join(HERE, 'gen-catalog-json.mjs')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitIdx = args.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) || 15 : Infinity

// store keys -> ids in db/custom.db
const STORES = {
  boxer: 'cmvf8db690000nd5yglrgwp22',
  shoprite: 'cmvf8db6b0001nd5ygpc2qkt0',
  checkers: 'cmvf8db6b0002nd5yu29vuj15',
  pnp: 'cmvf8db6c0003nd5yerbaoig6',
  woolworths: 'cmvf8db6d0004nd5yhj2qxzd9',
  spar: 'cmvf8db6e0005nd5yna5eu2rf',
  clicks: 'cmvf8db6f0006nd5ybzpjvxyf',
}
// store price bias (relative to base) — realistic SA hierarchy
const BIAS = {
  boxer: -0.03,
  shoprite: -0.02,
  spar: 0,
  pnp: 0.01,
  checkers: 0.02,
  clicks: 0.04,
  woolworths: 0.06,
}
// categories where Clicks doesn't really trade fresh food
const CAT_DEFAULT_STOCK = {
  fresh: ['boxer', 'shoprite', 'checkers', 'pnp', 'woolworths', 'spar'],
  grocery: ['boxer', 'shoprite', 'checkers', 'pnp', 'woolworths', 'spar', 'clicks'],
}
const CATEGORY_STOCK = {
  'Bread & Bakery': 'fresh',
  'Eggs & Dairy': 'fresh',
  'Maize, Rice & Grains': 'grocery',
  'Cooking Oil & Staples': 'grocery',
  'Meat & Chicken': 'fresh',
  'Fruit & Vegetables': 'fresh',
  Drinks: 'grocery',
  Snacks: 'grocery',
  'Cleaning Products': 'grocery',
  Toiletries: 'grocery',
  'Baby Products': 'grocery',
  'Pet Food': 'fresh',
  'Home & Appliances': 'grocery',
  'Breakfast Cereals': 'grocery',
}

const db = new Database(DB_PATH)
const now = Date.now()

// deterministic 32-bit hash for stable jitter
function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}
const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()
// round UP to the nearest x.99 like real shelf pricing (12.31 -> 12.99, 12.0 -> 11.99)
function shelf(v) {
  const r = Math.round(v)
  return Math.max(2.99, v <= r - 0.5 ? r - 1 + 0.99 : r - 0.01)
}
function newId() {
  const t = Date.now().toString(36)
  const rnd = () => Math.floor(Math.random() * 1e12).toString(36).padStart(8, '0')
  return `cman${t}${rnd()}${rnd()}`.slice(0, 25)
}

// existing names for dedupe
const existing = new Set(db.prepare('SELECT name FROM Product').all().map((r) => norm(r.name)))
const catRows = db.prepare('SELECT id, name FROM Category').all()
const catByName = new Map(catRows.map((c) => [norm(c.name), c.id]))

const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'))
const queue = Array.isArray(seed.items) ? seed.items : []

// in-queue dedupe
const seen = new Set()
const items = []
for (const it of queue) {
  const key = norm(it.name)
  if (seen.has(key)) continue
  if (existing.has(key)) continue // already in DB — will be dropped below
  seen.add(key)
  items.push(it)
}

const toAdd = items.slice(0, Number.isFinite(LIMIT) ? LIMIT : items.length)
const added = []
const skipped = []

for (const it of toAdd) {
  const catId = catByName.get(norm(it.cat))
  if (!catId) {
    skipped.push({ name: it.name, why: `unknown category "${it.cat}"` })
    continue
  }
  const id = newId()
  // explicit per-item stock list wins, else category default mode
  const storesForItem =
    Array.isArray(it.stock) && it.stock.length
      ? it.stock
      : CAT_DEFAULT_STOCK[CATEGORY_STOCK[it.cat] || 'grocery']

  const prices = {}
  for (const key of storesForItem) {
    const storeId = STORES[key]
    if (!storeId) continue
    const jitter = (hash(`${it.name}|${key}`) - 0.5) * 0.06 // ±3%
    prices[storeId] = shelf(it.base * (1 + (BIAS[key] ?? 0) + jitter))
  }
  if (dryRun) {
    added.push({ name: it.name, unit: it.unit || null, cat: it.cat, prices: Object.keys(prices).length })
    continue
  }
  db.prepare(
    'INSERT INTO Product (id, name, categoryId, barcode, imageUrl, description, unit, brand, active, createdAt) VALUES (?,?,?,?,?,?,?,?,1,?)'
  ).run(id, it.name, catId, null, null, null, it.unit || null, it.brand || null, now)
  const ins = db.prepare('INSERT INTO StorePrice (id, storeId, productId, price) VALUES (?,?,?,?)')
  for (const [storeId, price] of Object.entries(prices)) {
    ins.run(newId(), storeId, id, price)
  }
  added.push({ name: it.name, unit: it.unit || null, cat: it.cat, prices: Object.keys(prices).length })
}

// consume the queue (remove what was inserted / confirmed skip-unknown)
if (!dryRun) {
  const done = new Set(added.map((a) => norm(a.name)))
  const remaining = queue.filter((q) => {
    const k = norm(q.name)
    if (existing.has(k)) return false // drop items already in DB forever
    return !done.has(k)
  })
  seed.items = remaining
  writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2) + '\n')
}

console.log(`queue: ${queue.length} | new candidates: ${items.length} | limit: ${Number.isFinite(LIMIT) ? LIMIT : 'all'}`)
for (const a of added) {
  console.log(`  + ${a.name}${a.unit ? ` (${a.unit})` : ''} [${a.cat}] ${a.prices} stores`)
}
for (const s of skipped) console.log(`  ? skipped ${s.name}: ${s.why}`)
console.log(dryRun ? `DRY RUN — nothing written` : `inserted: ${added.length} | queue left: ${Number.isFinite(LIMIT) ? Math.max(0, items.length - added.length) + skipped.length : 0}`)

if (!dryRun && added.length > 0) {
  // refresh public/data/*.json from the DB
  const proc = Bun.spawnSync(['bun', GEN], { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' })
  if (proc.exitCode !== 0) {
    console.error('gen-catalog-json failed')
    process.exit(1)
  }
  const count = JSON.parse(readFileSync(path.join(ROOT, 'public/data/products.json'), 'utf8')).products.length
  console.log(`public/data/products.json now has ${count} products`)
}
