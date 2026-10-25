import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, unauthorized, notFound, badRequest } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

// Add an item (catalogue product or manual entry)
export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))

  const list = await db.shoppingList.findFirst({ where: { id, userId: user.id } })
  if (!list) return notFound('List not found')

  const quantity = Math.max(1, Math.min(99, parseInt(body.quantity, 10) || 1))

  let item
  if (body.productId) {
    const product = await db.product.findUnique({ where: { id: body.productId } })
    if (!product) return badRequest('Product not found')
    // Merge duplicates: bump quantity if product already on the list
    const existing = await db.listItem.findFirst({ where: { listId: list.id, productId: product.id } })
    if (existing) {
      item = await db.listItem.update({
        where: { id: existing.id },
        data: { quantity: Math.min(99, existing.quantity + quantity), source: body.source ?? existing.source },
      })
      return NextResponse.json({ item, merged: true })
    }
    item = await db.listItem.create({
      data: {
        listId: list.id,
        productId: product.id,
        quantity,
        source: body.source ?? 'catalogue',
      },
    })
  } else {
    const manualName = String(body.name || '').trim()
    const manualPrice = body.price != null ? Number(body.price) : null
    if (!manualName) return badRequest('Enter the product name')
    if (manualPrice == null || Number.isNaN(manualPrice) || manualPrice < 0)
      return badRequest('Enter the shelf price from the price tag')
    item = await db.listItem.create({
      data: {
        listId: list.id,
        manualName: manualName.slice(0, 80),
        manualPrice,
        manualStoreId: body.storeId || null,
        quantity,
        source: body.source ?? 'manual',
      },
    })
  }

  return NextResponse.json({ item })
}

// Update quantity / note
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))

  const list = await db.shoppingList.findFirst({ where: { id, userId: user.id } })
  if (!list) return notFound('List not found')
  if (!body.itemId) return badRequest('Missing itemId')

  const existing = await db.listItem.findFirst({ where: { id: body.itemId, listId: list.id } })
  if (!existing) return notFound('Item not found')

  const data: Record<string, unknown> = {}
  if (body.quantity != null) data.quantity = Math.max(1, Math.min(99, parseInt(body.quantity, 10) || 1))
  if (typeof body.note === 'string') data.note = body.note.slice(0, 200)
  if (body.price != null && existing.source !== 'catalogue') {
    const p = Number(body.price)
    if (!Number.isNaN(p) && p >= 0) data.manualPrice = p
  }

  const item = await db.listItem.update({ where: { id: existing.id }, data })
  return NextResponse.json({ item })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const itemId = req.nextUrl.searchParams.get('itemId')
  const list = await db.shoppingList.findFirst({ where: { id, userId: user.id } })
  if (!list) return notFound('List not found')
  if (!itemId) return badRequest('Missing itemId')
  const existing = await db.listItem.findFirst({ where: { id: itemId, listId: list.id } })
  if (!existing) return notFound('Item not found')
  await db.listItem.delete({ where: { id: existing.id } })
  return NextResponse.json({ ok: true })
}
