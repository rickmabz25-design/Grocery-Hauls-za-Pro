#!/usr/bin/env node
/**
 * Sync prisma/schema.prisma's datasource provider with the configured database.
 *
 * - If DATABASE_URL (process env or root .env) starts with "postgres" → the
 *   schema is set to `provider = "postgresql"` (durable user data on Firebase).
 * - Otherwise (file: URL or nothing) → `provider = "sqlite"` (local dev +
 *   bundled-catalog mode on Firebase).
 *
 * Single source of truth: only the provider line is rewritten; models are
 * written once and stay portable across both providers.
 *
 * Usage:
 *   node scripts/sync-prisma-provider.mjs           # apply (called by build)
 *   node scripts/sync-prisma-provider.mjs --check   # print decision only
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCHEMA = path.join(ROOT, 'prisma', 'schema.prisma')

function readEnvUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  for (const envFile of ['.env', '.env.local']) {
    const p = path.join(ROOT, envFile)
    if (!existsSync(p)) continue
    const line = readFileSync(p, 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith('DATABASE_URL='))
    if (line) return line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
  }
  return undefined
}

const url = readEnvUrl()
const wanted = url?.startsWith('postgres') ? 'postgresql' : 'sqlite'
const source = url ? `${url.split('@').pop() || url}` : 'no DATABASE_URL'

if (process.argv.includes('--check')) {
  console.log(`[sync-prisma] ${wanted} (from: ${source})`)
  process.exit(0)
}

const current = readFileSync(SCHEMA, 'utf8')
const providerRe = /(provider\s*=\s*")(sqlite|postgresql)(")/
const match = current.match(providerRe)

if (!match) {
  console.error('[sync-prisma] ERROR: no provider line found in prisma/schema.prisma')
  process.exit(1)
}

if (match[2] === wanted) {
  console.log(`[sync-prisma] already ${wanted} — no change`)
  process.exit(0)
}

writeFileSync(SCHEMA, current.replace(providerRe, `$1${wanted}$3`))
console.log(`[sync-prisma] switched provider ${match[2]} -> ${wanted} (source: ${source})`)
