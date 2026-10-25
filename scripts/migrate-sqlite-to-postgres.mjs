#!/usr/bin/env bun
/**
 * Migrate the whole Grocery Hauls database from local SQLite to Postgres.
 *
 * Makes user data (lists, wish lists, notifications, admin edits, sessions)
 * durable on Firebase Hosting, where the function filesystem is ephemeral.
 *
 * What it does:
 *  1. Reads the local SQLite database (db/custom.db, read-only)
 *  2. Switches prisma/schema.prisma to postgresql and runs `prisma db push`
 *  3. Copies all 17 tables in foreign-key-safe order (batched, parameterised,
 *     idempotent via ON CONFLICT DO NOTHING)
 *  4. Verifies row counts per table
 *  5. Switches the schema back to sqlite so local development is untouched
 *
 * Usage:
 *   bun scripts/migrate-sqlite-to-postgres.mjs --url postgres://user:pass@host/db
 *   bun scripts/migrate-sqlite-to-postgres.mjs --dry-run          # inspect only
 *   bun scripts/migrate-sqlite-to-postgres.mjs --keep-provider    # stay on postgres
 *
 * The URL can also come from POSTGRES_URL / PG_DATABASE_URL env vars.
 * Get a free Postgres at neon.tech or supabase.com (see DEPLOY.md).
 */
import { Database } from 'bun:sqlite'
import { execFileSync, execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

if (!process.versions.bun) {
  console.error('This script must run with bun (it uses bun:sqlite): bun scripts/migrate-sqlite-to-postgres.mjs')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// CLI / config
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const KEEP_PROVIDER = args.includes('--keep-provider')
const argIdx = args.indexOf('--url')
const PG_URL =
  (argIdx !== -1 ? args[argIdx + 1] : undefined) ||
  process.env.POSTGRES_URL ||
  process.env.PG_DATABASE_URL ||
  (process.env.DATABASE_URL?.startsWith('postgres') ? process.env.DATABASE_URL : undefined)

if (!DRY_RUN && !PG_URL) {
  console.error('Missing Postgres URL. Pass --url postgres://... or set POSTGRES_URL.')
  process.exit(1)
}

function sqlitePath() {
  if (process.env.DATABASE_URL?.startsWith('file:')) return process.env.DATABASE_URL.slice(5)
  const envFile = path.join(ROOT, '.env')
  if (existsSync(envFile)) {
    const line = readFileSync(envFile, 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith('DATABASE_URL='))
    if (line?.includes('file:')) return line.split('=').slice(1).join('=').trim().slice(5)
  }
  return path.join(ROOT, 'db', 'custom.db')
}

const SQLITE_PATH = sqlitePath()
if (!existsSync(SQLITE_PATH)) {
  console.error(`SQLite database not found at ${SQLITE_PATH}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Table metadata (FK-safe insert order + type coercion to Postgres)
// ---------------------------------------------------------------------------
const TABLES = [
  'Store', 'Category', 'User', 'Product', 'StorePrice', 'Promotion',
  'ShoppingList', 'ListItem', 'ShoppingPlan', 'WishListItem', 'WhatsNewPost',
  'Notification', 'ShopSession', 'ShopSessionItem', 'SearchLog', 'Upload',
  'AdminAccount',
]

// Prisma Json columns land as TEXT in SQLite; they need an explicit ::jsonb
// cast going into Postgres. Boolean columns arrive as 0/1 integers. DateTime
// columns can hold epoch-millisecond integers in some rows — normalize to ISO.
const JSON_COLS = {
  ShoppingPlan: ['storeIds', 'details'],
  WishListItem: ['preferredStoreIds'],
  WhatsNewPost: ['promoIds'],
}
const BOOL_COLS = {
  User: ['whatsappOptIn', 'isDemo'],
  Store: ['active'],
  Product: ['active'],
  WhatsNewPost: ['active'],
  Notification: ['read'],
  ShopSessionItem: ['bought'],
}
const DATETIME_COLS = {
  User: ['createdAt', 'lastLoginAt'],
  Product: ['createdAt'],
  Promotion: ['startDate', 'endDate', 'createdAt'],
  ShoppingList: ['createdAt', 'updatedAt', 'completedAt'],
  ListItem: ['createdAt'],
  ShoppingPlan: ['createdAt'],
  WishListItem: ['createdAt'], // lastNotifiedPrice is a Float — deliberately NOT here
  WhatsNewPost: ['datePosted'],
  Notification: ['createdAt'],
  ShopSession: ['startedAt', 'endedAt'],
  SearchLog: ['createdAt'],
  Upload: ['createdAt'],
  AdminAccount: ['createdAt'],
}

function normalizeDateTime(v) {
  if (v == null || typeof v === 'object') return v
  const isNum = typeof v === 'number' || /^\d+$/.test(String(v).trim())
  if (!isNum) return v // already an ISO-ish string Postgres parses
  let ms = Number(v)
  if (Math.abs(ms) < 1e11) ms *= 1000 // epoch seconds -> millis
  return new Date(ms).toISOString()
}

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`
}

// ---------------------------------------------------------------------------
// Read SQLite
// ---------------------------------------------------------------------------
const sqlite = new Database(SQLITE_PATH, { readonly: true })
const data = {}
for (const table of TABLES) {
  const rows = sqlite.query(`SELECT * FROM ${quoteIdent(table)}`).all()
  data[table] = rows
}

let total = 0
console.log('\n=== SQLite source contents ===')
for (const table of TABLES) {
  total += data[table].length
  console.log(`${table.padEnd(16)} ${String(data[table].length).padStart(5)} rows`)
}
console.log(`${'TOTAL'.padEnd(16)} ${String(total).padStart(5)} rows\n`)

// Validate Json columns actually parse before touching Postgres
let jsonOk = true
for (const [table, cols] of Object.entries(JSON_COLS)) {
  for (const row of data[table]) {
    for (const col of cols) {
      if (row[col] == null) continue
      try {
        JSON.parse(row[col])
      } catch {
        jsonOk = false
        console.error(`INVALID JSON ${table}.${col} (id=${row.id}): ${String(row[col]).slice(0, 80)}`)
      }
    }
  }
}
if (!jsonOk) {
  console.error('Aborting: invalid JSON payloads found.')
  process.exit(1)
}

if (DRY_RUN) {
  console.log('Dry run complete — source is healthy. Re-run without --dry-run to migrate.')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Switch schema provider to postgresql + push schema
// ---------------------------------------------------------------------------
const SCHEMA_PATH = path.join(ROOT, 'prisma', 'schema.prisma')
const PROVIDER_RE = /(provider\s*=\s*")(sqlite|postgresql)(")/

function rewriteProvider(provider) {
  const src = readFileSync(SCHEMA_PATH, 'utf8')
  const next = src.replace(PROVIDER_RE, `$1${provider}$3`)
  if (next !== src) {
    writeFileSync(SCHEMA_PATH, next)
    console.log(`[migrate] schema provider set to ${provider}`)
  } else {
    console.log(`[migrate] schema provider already ${provider}`)
  }
}

function setProviderPostgres(pgUrl) {
  // Reuse the shared sync script with the Postgres URL injected, so the same
  // decision logic as the build runs here.
  execSync('node scripts/sync-prisma-provider.mjs', {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: pgUrl },
    stdio: 'inherit',
  })
}

// Resolve the locally installed Prisma CLI explicitly (works regardless of PATH)
const PRISMA_BIN = path.join(ROOT, 'node_modules', '.bin', 'prisma')

function prisma(args, extraEnv) {
  execFileSync(PRISMA_BIN, args, {
    cwd: ROOT,
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
    stdio: 'inherit',
  })
}

console.log('\n=== Switching schema to postgresql + pushing ===')
setProviderPostgres(PG_URL)
prisma(['db', 'push', '--skip-generate', '--accept-data-loss'], { DATABASE_URL: PG_URL })
prisma(['generate'])

// ---------------------------------------------------------------------------
// Copy data into Postgres
// ---------------------------------------------------------------------------
const { default: pg } = await import('pg')
const client = new pg.Client({ connectionString: PG_URL })
await client.connect()

console.log('\n=== Copying data to Postgres ===')
const report = []
for (const table of TABLES) {
  const rows = data[table]
  if (rows.length === 0) {
    report.push([table, 0, 0])
    continue
  }
  const cols = Object.keys(rows[0])
  const jsonCols = JSON_COLS[table] || []
  const boolCols = BOOL_COLS[table] || []
  const dateCols = DATETIME_COLS[table] || []

  let inserted = 0
  const maxParams = 65000
  const batchRows = Math.max(1, Math.floor(maxParams / cols.length))

  for (let i = 0; i < rows.length; i += batchRows) {
    const batch = rows.slice(i, i + batchRows)
    const values = []
    const tuples = batch.map((row) => {
      return (
        '(' +
        cols
          .map((col) => {
            let v = row[col]
            if (v != null && boolCols.includes(col)) v = Boolean(v) // 0/1 -> true/false
            if (v != null && dateCols.includes(col)) v = normalizeDateTime(v) // epoch ms -> ISO
            const placeholder = `$${values.length + 1}`
            values.push(v === undefined ? null : v)
            return jsonCols.includes(col) ? `${placeholder}::jsonb` : placeholder
          })
          .join(',') +
        ')'
      )
    })
    const sql =
      `INSERT INTO ${quoteIdent(table)} (${cols.map(quoteIdent).join(',')}) ` +
      `VALUES ${tuples.join(',')} ON CONFLICT ("id") DO NOTHING`
    const res = await client.query(sql, values)
    inserted += res.rowCount ?? 0
  }
  report.push([table, rows.length, inserted])
  console.log(`${table.padEnd(16)} ${String(inserted).padStart(5)} inserted (of ${rows.length})`)
}

// ---------------------------------------------------------------------------
// Verify counts
// ---------------------------------------------------------------------------
console.log('\n=== Verification ===')
let mismatch = 0
for (const [table, source, inserted] of report) {
  const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM ${quoteIdent(table)}`)
  const ok = rows[0].n === source
  if (!ok) mismatch++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${table.padEnd(16)} pg=${rows[0].n} sqlite=${source}`)
}

await client.end()

// ---------------------------------------------------------------------------
// Restore sqlite provider for local development
// ---------------------------------------------------------------------------
if (!KEEP_PROVIDER) {
  console.log('\n=== Restoring sqlite provider for local development ===')
  rewriteProvider('sqlite')
  prisma(['generate'])
}

console.log('\nDone.')
if (mismatch > 0) {
  console.error(`${mismatch} table(s) had count mismatches — review the log above.`)
  process.exit(1)
}
console.log(`All ${report.length} tables migrated and verified against:\n  ${PG_URL.replace(/:[^:@/]+@/, ':****@')}`)
console.log('\nNext: put this URL as DATABASE_URL in the project .env (or Firebase env), then deploy — see DEPLOY.md.')
