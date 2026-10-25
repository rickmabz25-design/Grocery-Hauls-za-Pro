import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, clearCookie, USER_COOKIE } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  return NextResponse.json({ user })
}

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true })
  return clearCookie(res, USER_COOKIE)
}
