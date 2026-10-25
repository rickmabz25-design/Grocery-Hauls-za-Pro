import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, unauthorized, notFound, badRequest } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

// Save the chosen shopping plan (cheapest / preferred / split)
export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))

  const list = await db.shoppingList.findFirst({ where: { id, userId: user.id } })
  if (!list) return notFound('List not found')

  const choice = String(body.choice || '')
  if (!['cheapest', 'preferred', 'split'].includes(choice)) return badRequest('Invalid plan choice')
  const storeIds = Array.isArray(body.storeIds) ? body.storeIds.filter((s: unknown) => typeof s === 'string') : []
  const totalCost = Number(body.totalCost) || 0
  const savings = Number(body.savings) || 0

  const plan = await db.shoppingPlan.create({
    data: {
      listId: list.id,
      userId: user.id,
      choice,
      storeIds,
      totalCost,
      savings,
      details: body.details ?? {},
    },
  })

  // Update list totals so history shows the plan outcome
  await db.shoppingList.update({
    where: { id: list.id },
    data: { lastTotal: totalCost, lastSavings: savings },
  })

  return NextResponse.json({ plan: { id: plan.id } })
}
