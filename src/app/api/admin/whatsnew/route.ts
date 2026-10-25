import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdmin, unauthorized, badRequest } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

// Manage What's New campaign posts
export async function GET(req: NextRequest) {
  const admin = await getAdmin(req)
  if (!admin) return unauthorized('Admin access required')
  const posts = await db.whatsNewPost.findMany({
    include: { store: true },
    orderBy: { datePosted: 'desc' },
  })
  const promoIds = posts.flatMap((p) => (Array.isArray(p.promoIds) ? (p.promoIds as string[]) : []))
  const promos = promoIds.length
    ? await db.promotion.findMany({
        where: { id: { in: promoIds } },
        include: { product: true, store: true },
      })
    : []
  const promoMap = new Map(promos.map((p) => [p.id, p]))
  return NextResponse.json({
    posts: posts.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      imageUrl: p.imageUrl,
      tag: p.tag,
      storeId: p.storeId,
      storeName: p.store?.name ?? null,
      active: p.active,
      datePosted: p.datePosted,
      promoCount: Array.isArray(p.promoIds) ? (p.promoIds as string[]).length : 0,
      promoNames: (Array.isArray(p.promoIds) ? (p.promoIds as string[]) : [])
        .map((id) => promoMap.get(id))
        .filter(Boolean)
        .map((pr) => `${pr!.product.name} @ ${pr!.store.name}`),
    })),
  })
}

export async function POST(req: NextRequest) {
  const admin = await getAdmin(req)
  if (!admin) return unauthorized('Admin access required')
  const body = await req.json().catch(() => ({}))
  const title = String(body.title || '').trim()
  const description = String(body.description || '').trim()
  if (!title || !description) return badRequest('Title and description are required')

  const post = await db.whatsNewPost.create({
    data: {
      title: title.slice(0, 120),
      description: description.slice(0, 500),
      tag: String(body.tag || 'new'),
      storeId: body.storeId || null,
      imageUrl: body.imageUrl || null,
      promoIds: Array.isArray(body.promoIds) ? body.promoIds : [],
      datePosted: body.datePosted ? new Date(body.datePosted) : new Date(),
    },
  })
  return NextResponse.json({ post: { id: post.id } })
}

export async function PATCH(req: NextRequest) {
  const admin = await getAdmin(req)
  if (!admin) return unauthorized('Admin access required')
  const body = await req.json().catch(() => ({}))
  if (!body.id) return badRequest('Missing id')
  const data: Record<string, unknown> = {}
  if (body.active !== undefined) data.active = Boolean(body.active)
  if (body.title) data.title = String(body.title).slice(0, 120)
  if (body.description) data.description = String(body.description).slice(0, 500)
  if (body.tag) data.tag = String(body.tag)
  if (body.promoIds !== undefined) data.promoIds = Array.isArray(body.promoIds) ? body.promoIds : []
  const post = await db.whatsNewPost.update({ where: { id: body.id }, data })
  return NextResponse.json({ post: { id: post.id, active: post.active } })
}

export async function DELETE(req: NextRequest) {
  const admin = await getAdmin(req)
  if (!admin) return unauthorized('Admin access required')
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return badRequest('Missing id')
  await db.whatsNewPost.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
