import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const stores = await db.store.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  return NextResponse.json({ stores })
}
