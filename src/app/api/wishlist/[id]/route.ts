import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, unauthorized, notFound, badRequest } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))

  const wish = await db.wishListItem.findFirst({ where: { id, userId: user.id } })
  if (!wish) return notFound('Wish list item not found')

  const data: Record<string, unknown> = {}
  if (body.targetPrice !== undefined) {
    const t = body.targetPrice === null || body.targetPrice === '' ? null : Number(body.targetPrice)
    if (t != null && (Number.isNaN(t) || t < 0)) return badRequest('Target price must be a positive amount')
    data.targetPrice = t
  }
  if (Array.isArray(body.preferredStoreIds)) data.preferredStoreIds = body.preferredStoreIds

  const item = await db.wishListItem.update({ where: { id: wish.id }, data })
  await db.wishListItem.update({ where: { id: item.id }, data: {} }).catch(() => {})
  return NextResponse.json({ item })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const wish = await db.wishListItem.findFirst({ where: { id, userId: user.id } })
  if (!wish) return notFound('Wish list item not found')
  await db.wishListItem.delete({ where: { id: wish.id } })
  return NextResponse.json({ ok: true })
}
