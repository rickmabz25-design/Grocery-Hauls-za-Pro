import { PrismaClient } from '@prisma/client'
import { copyFileSync, existsSync } from 'fs'
import path from 'path'

// ---------------------------------------------------------------------------
// SQLite bootstrap for serverless hosting (Firebase Hosting / Cloud Functions)
//
// Locally, .env provides DATABASE_URL=file:<abs path to db/custom.db> and
// everything below is a no-op.
//
// On Firebase Hosting's framework-aware deploy (Cloud Functions runtime):
//   - the deployed filesystem is read-only except /tmp
//   - no .env ships (it is git-ignored on purpose), so DATABASE_URL is unset
//   - the seeded catalog database ships at <app root>/db/custom.db
// So on cold start we copy the bundled database to /tmp (writable) and point
// Prisma at it. Catalog data (stores/products/promos) therefore works out of
// the box; user-generated rows reset when the instance is recycled (see
// DEPLOY.md for the Postgres migration path for durable user data).
// ---------------------------------------------------------------------------
function resolveDatabaseUrl(): string | undefined {
  let configured = process.env.DATABASE_URL

  // Guard against a stale absolute SQLite path (e.g. the local .env reaching
  // the cloud, or a moved db file): fall back to the bundled copy below.
  if (configured?.startsWith('file:')) {
    const filePath = configured.slice('file:'.length)
    if (!existsSync(filePath)) configured = undefined
  }

  if (configured) return configured

  const bundled = path.join(process.cwd(), 'db', 'custom.db')
  const target = '/tmp/custom.db'
  try {
    if (existsSync(bundled) && !existsSync(target)) {
      copyFileSync(bundled, target)
    }
    if (existsSync(target)) {
      process.env.DATABASE_URL = `file:${target}`
      return process.env.DATABASE_URL
    }
  } catch {
    /* fall through — Prisma will surface a clear connection error */
  }
  return undefined
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
    datasources: resolveDatabaseUrl()
      ? { db: { url: process.env.DATABASE_URL } }
      : undefined,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
