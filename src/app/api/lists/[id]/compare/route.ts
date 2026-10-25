import { NextRequest, NextResponse } from 'next/server'
import { computeComparison } from '@/lib/server/compare'
import { getAuthUser, unauthorized, badRequest } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

// Basket comparison + split-shopping recommendation
// GET /api/lists/:id/compare?stores=id1,id2,...&preferred=idX
export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const sp = req.nextUrl.searchParams
  const storeIds = (sp.get('stores') || '').split(',').map((s) => s.trim()).filter(Boolean)
  const preferred = sp.get('preferred') || null

  if (storeIds.length < 1) return badRequest('Select at least one store to compare')
  if (storeIds.length > 7) return badRequest('Select up to 7 stores')

  const result = await computeComparison(id, user.id, storeIds, preferred)
  if (!result) return badRequest('List not found')

  return NextResponse.json({ result })
}
