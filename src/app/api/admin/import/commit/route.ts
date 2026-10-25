import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdmin, unauthorized, badRequest } from '@/lib/server/auth'
import { checkWishPriceDrops } from '@/lib/server/wishlist-check'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const FIELD_KEYS = [
  'store', 'name', 'category', 'barcode', 'normalPrice', 'promoPrice',
  'discount', 'startDate', 'endDate', 'imageUrl', 'description',
] as const

function parsePrice(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/[^0-9.,-]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function parseDate(v: unknown): Date | null {
  if (v == null || v === '') return null
  if (v instanceof Date && !isNaN(v.getTime())) return v
  const s = String(v).trim()
  // ISO
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  // dd/mm/yyyy or dd-mm-yyyy
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function titleCase(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// Commit an imported CSV/Excel: creates/updates products, store prices and promotions
// body: { rows: object[], mapping: Record<fieldKey, headerName> }
export async function POST(req: NextRequest) {
  const admin = await getAdmin(req)
  if (!admin) return unauthorized('Admin access required')

  const body = await req.json().catch(() => ({}))
  const rows: Record<string, unknown>[] = Array.isArray(body.rows) ? body.rows : []
  const mapping: Record<string, string> = body.mapping || {}
  if (!rows.length) return badRequest('No rows to import')
  if (!mapping.name || !mapping.store || !mapping.normalPrice) {
    return badRequest('Map at least Store, Product Name and Normal Price columns')
  }

  const errors: string[] = []
  let productsCreated = 0
  let productsUpdated = 0
  let pricesUpserted = 0
  let promosCreated = 0
  const touchedUsers = new Set<string>()

  // cache lookups
  const storeCache = new Map<string, string>()
  const catCache = new Map<string, string>()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const get = (key: string) => (mapping[key] ? row[mapping[key]] : undefined)
    try {
      const storeName = titleCase(String(get('store') ?? ''))
      const name = String(get('name') ?? '').trim()
      const normalPrice = parsePrice(get('normalPrice'))
      if (!storeName || !name || normalPrice == null) {
        errors.push(`Row ${i + 2}: missing store, product name or normal price — skipped`)
        continue
      }

      let storeId = storeCache.get(storeName)
      if (!storeId) {
        const store = await db.store.upsert({
          where: { name: storeName },
          update: {},
          create: { name: storeName, color: '#4b5563', emoji: '🏬' },
        })
        storeCache.set(storeName, store.id)
        storeId = store.id
      }

      const catName = titleCase(String(get('category') ?? '')) || 'Other'
      let categoryId = catCache.get(catName)
      if (!categoryId) {
        const cat = await db.category.upsert({
          where: { name: catName },
          update: {},
          create: { name: catName, icon: '🛒', sortOrder: 99 },
        })
        catCache.set(catName, cat.id)
        categoryId = cat.id
      }

      const barcode = String(get('barcode') ?? '').trim() || null
      let product = barcode
        ? await db.product.findFirst({ where: { barcode } })
        : null
      if (!product) product = await db.product.findFirst({ where: { name } })
      if (product) {
        await db.product.update({
          where: { id: product.id },
          data: { categoryId, barcode: barcode ?? product.barcode, imageUrl: String(get('imageUrl') ?? '') || product.imageUrl, description: String(get('description') ?? '') || product.description },
        })
        productsUpdated++
      } else {
        product = await db.product.create({
          data: {
            name,
            categoryId,
            barcode,
            imageUrl: String(get('imageUrl') ?? '') || null,
            description: String(get('description') ?? '') || null,
          },
        })
        productsCreated++
      }
      const productId = product.id

      await db.storePrice.upsert({
        where: { storeId_productId: { storeId, productId } },
        update: { price: normalPrice },
        create: { storeId, productId, price: normalPrice },
      })
      pricesUpserted++

      const promoPrice = parsePrice(get('promoPrice'))
      if (promoPrice != null && promoPrice > 0 && promoPrice < normalPrice) {
        const start = parseDate(get('startDate')) ?? new Date()
        const end = parseDate(get('endDate')) ?? new Date(Date.now() + 30 * 86400_000)
        // avoid exact duplicates
        const dup = await db.promotion.findFirst({
          where: { storeId, productId, promoPrice, status: 'published', endDate: { gte: new Date() } },
        })
        if (!dup) {
          await db.promotion.create({
            data: { storeId, productId, promoPrice, normalPrice, startDate: start, endDate: end, source: 'import' },
          })
          promosCreated++
        }
      }
    } catch (e) {
      errors.push(`Row ${i + 2}: ${(e as Error).message} — skipped`)
    }
  }

  // Notify users of any new wish-list price drops caused by the import
  const users = await db.user.findMany({ select: { id: true } })
  for (const u of users) {
    const created = await checkWishPriceDrops(u.id)
    if (created > 0) touchedUsers.add(u.id)
  }

  return NextResponse.json({
    summary: {
      rowsProcessed: rows.length,
      productsCreated,
      productsUpdated,
      pricesUpserted,
      promosCreated,
      errors: errors.slice(0, 20),
      errorCount: errors.length,
      usersNotified: touchedUsers.size,
    },
  })
}
