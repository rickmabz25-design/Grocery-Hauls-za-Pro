import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, unauthorized, notFound } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const list = await db.shoppingList.findFirst({
    where: { id, userId: user.id },
    include: { items: true },
  })
  if (!list) return notFound('List not found')

  const copy = await db.shoppingList.create({
    data: {
      userId: user.id,
      name: `${list.name} (copy)`.slice(0, 60),
      lastTotal: list.lastTotal,
      lastSavings: list.lastSavings,
      items: {
        create: list.items.map((i) => ({
          productId: i.productId,
          manualName: i.manualName,
          manualPrice: i.manualPrice,
          manualStoreId: i.manualStoreId,
          quantity: i.quantity,
          source: i.source,
          note: i.note,
        })),
      },
    },
  })
  return NextResponse.json({ list: { id: copy.id, name: copy.name } })
}
