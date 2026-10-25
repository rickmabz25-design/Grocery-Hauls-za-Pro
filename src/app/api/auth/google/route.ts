import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, setUserCookie, badRequest, avatarDataUrl } from '@/lib/server/auth'

// Demo Google sign-in: accepts the user's Google/Gmail account details and creates
// a private account. Structured so a real OAuth provider callback can replace it later.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = String(body.email || '').trim().toLowerCase()
    const name = String(body.name || '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return badRequest('Please enter a valid email address (e.g. you@gmail.com)')
    }
    const displayName = name || email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

    const user = await db.user.upsert({
      where: { email },
      update: { name: displayName, lastLoginAt: new Date() },
      create: {
        email,
        name: displayName,
        googleId: 'google-demo-' + email,
        image: avatarDataUrl(displayName),
      },
    })

    const res = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
        isDemo: user.isDemo,
        whatsappNumber: user.whatsappNumber,
        whatsappOptIn: user.whatsappOptIn,
      },
    })
    return setUserCookie(res, user.id)
  } catch {
    return badRequest('Sign-in failed. Please try again.')
  }
}
