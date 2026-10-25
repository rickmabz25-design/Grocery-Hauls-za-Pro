import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const categories = await db.category.findMany({ orderBy: { sortOrder: 'asc' } })
  return NextResponse.json({ categories })
}
