import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdmin, unauthorized } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v)
  return '"' + s.replace(/"/g, '""') + '"'
}

// View users (with search) or export all to CSV (?export=1)
export async function GET(req: NextRequest) {
  const admin = await getAdmin(req)
  if (!admin) return unauthorized('Admin access required')

  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  const isExport = req.nextUrl.searchParams.get('export') === '1'

  const users = await db.user.findMany({
    where: q
      ? {
          OR: [{ email: { contains: q } }, { name: { contains: q } }],
        }
      : {},
    include: {
      lists: { select: { id: true } },
      wishItems: { select: { id: true } },
      shopSessions: { select: { id: true } },
      plans: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (isExport) {
    const header = ['Name', 'Email', 'WhatsApp Number', 'WhatsApp Opt-in', 'Sign-up Date', 'Last Login', 'Lists Created', 'Wish List Items', 'Shop Sessions', 'Plans Saved', 'Role']
    const rows = users.map((u) =>
      [
        u.name,
        u.email,
        u.whatsappNumber ?? '',
        u.whatsappOptIn ? 'yes' : 'no',
        u.createdAt.toISOString().slice(0, 10),
        u.lastLoginAt.toISOString().slice(0, 16).replace('T', ' '),
        u.lists.length,
        u.wishItems.length,
        u.shopSessions.length,
        u.plans.length,
        u.role,
      ]
        .map(csvEscape)
        .join(',')
    )
    const csv = [header.map(csvEscape).join(','), ...rows].join('\n')
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="grocery-hauls-users-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image,
      whatsappNumber: u.whatsappNumber,
      whatsappOptIn: u.whatsappOptIn,
      role: u.role,
      isDemo: u.isDemo,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      listCount: u.lists.length,
      wishCount: u.wishItems.length,
      sessionCount: u.shopSessions.length,
      planCount: u.plans.length,
    })),
  })
}
