// Builds the STATIC (Firebase Spark) version of Grocery Hauls Pro ZA.
//
// Steps:
//   1. Generate public/data/*.json from db/custom.db (catalog snapshot)
//   2. Temporarily stash src/app/api away — `output: 'export'` refuses to
//      build non-static route handlers (POST routes, dynamic GETs)
//   3. next build with NEXT_PUBLIC_STATIC=1 -> static export in ./out
//   4. Restore src/app/api (ALWAYS, even on failure)
//   5. Verify out/ contents
//
// Deploy: firebase deploy --only hosting  (firebase.json -> public "out")

import { execSync } from 'child_process'
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// fileURLToPath works in BOTH node and bun (import.meta.dir is bun-only)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const API_DIR = path.join(ROOT, 'src', 'app', 'api')
const STASH = path.join(ROOT, '.api-stash-static')
const OUT_DIR = path.join(ROOT, 'out')

// Prefer Bun when available (original setup); fall back to plain Node + npx
// so the build also runs on CI images that only ship Node (e.g. Cloudflare
// Pages). gen-catalog-json.mjs picks its SQLite driver the same way.
function hasBun() {
  try {
    execSync('bun --version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
const BUN = hasBun()
const nodeMajor = Number(process.versions.node.split('.')[0])
// node:sqlite needs --experimental-sqlite on Node 22.x; unflagged from 23+
const nodeSqliteCmd =
  !BUN && nodeMajor <= 22 ? 'node --experimental-sqlite' : 'node'

console.log(`[build-static] runtime: ${BUN ? 'bun ' + execSync('bun --version').toString().trim() : 'node ' + process.versions.node}`)

console.log('[build-static] 1/5 generating catalog JSON…')
execSync(
  BUN
    ? 'bun scripts/gen-catalog-json.mjs'
    : `${nodeSqliteCmd} scripts/gen-catalog-json.mjs`,
  { cwd: ROOT, stdio: 'inherit' }
)

console.log('[build-static] 2/5 stashing src/app/api (static export cannot ship API routes)…')
if (existsSync(API_DIR)) {
  if (existsSync(STASH)) rmSync(STASH, { recursive: true, force: true })
  renameSync(API_DIR, STASH)
}

try {
  console.log('[build-static] 3/5 next build (static export)…')
  execSync(BUN ? 'bunx next build' : 'npx --no-install next build', {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, NEXT_PUBLIC_STATIC: '1' },
  })
} finally {
  console.log('[build-static] 4/5 restoring src/app/api…')
  if (existsSync(STASH)) {
    if (existsSync(API_DIR)) rmSync(API_DIR, { recursive: true, force: true })
    renameSync(STASH, API_DIR)
  }
}

console.log('[build-static] 5/5 verifying out/…')
const required = ['index.html', 'data/stores.json', 'data/categories.json', 'data/promos.json', 'data/whats-new.json']
const missing = required.filter((f) => !existsSync(path.join(OUT_DIR, f)))
if (missing.length) {
  console.error(`[build-static] MISSING in out/: ${missing.join(', ')}`)
  process.exit(1)
}
let total = 0
for (const f of required) {
  total += statSync(path.join(OUT_DIR, f)).size
}
console.log(`[build-static] OK — out/ ready (required assets present, ${(total / 1024).toFixed(1)} KB of data)`)
console.log('[build-static] Deploy with: firebase deploy --only hosting')
