import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, unauthorized, badRequest } from '@/lib/server/auth'
import { isValidSAMobile, normalizeSAMobile } from '@/lib/format'

export const dynamic = 'force-dynamic'

// Update profile: WhatsApp number + opt-in, name
export async function PATCH(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const body = await req.json().catch(() => ({}))

  const data: Record<string, unknown> = {}
  if (body.whatsappNumber !== undefined) {
    const raw = String(body.whatsappNumber || '').trim()
    if (raw === '') {
      data.whatsappNumber = null
      data.whatsappOptIn = false
    } else {
      if (!isValidSAMobile(raw)) {
        return badRequest('Enter a valid South African mobile number, e.g. 082 123 4567 or +27 82 123 4567')
      }
      data.whatsappNumber = normalizeSAMobile(raw)
      data.whatsappOptIn = Boolean(body.whatsappOptIn)
    }
  } else if (body.whatsappOptIn !== undefined) {
    if (!user.whatsappNumber) {
      return badRequest('Add your WhatsApp number first')
    }
    data.whatsappOptIn = Boolean(body.whatsappOptIn)
  }
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim().slice(0, 60)

  const updated = await db.user.update({ where: { id: user.id }, data })
  return NextResponse.json({
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      image: updated.image,
      role: updated.role,
      isDemo: updated.isDemo,
      whatsappNumber: updated.whatsappNumber,
      whatsappOptIn: updated.whatsappOptIn,
    },
  })
}
