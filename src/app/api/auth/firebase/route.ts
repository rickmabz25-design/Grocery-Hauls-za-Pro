import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { setUserCookie, badRequest, avatarDataUrl } from '@/lib/server/auth'

// Real Firebase Google sign-in: the client signs in with a Google popup via the
// Firebase SDK and sends its ID token here. We verify the token against Google's
// identitytoolkit REST API (validates signature + expiry — no admin SDK needed),
// upsert the account, and issue the same HMAC session cookie used across the app.
//
// Docs: https://firebase.google.com/docs/reference/rest/auth#section-get-account-info

type LookupUser = {
  localId: string
  email?: string
  emailVerified?: boolean
  displayName?: string
  photoUrl?: string
  providerUserInfo?: { providerId: string; federatedId: string }[]
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const idToken = String(body.idToken || '').trim()
    if (!idToken) return badRequest('Missing Google sign-in token. Please sign in again.')

    const apiKey =
      process.env.FIREBASE_API_KEY ||
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
      'AIzaSyAz6RtO7v4OebbUX6RSToak7Al7RmDCzTk' // same public web key as src/firebase.js

    const lookup = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(10_000),
      },
    ).catch(() => null)

    if (!lookup || !lookup.ok) {
      return badRequest('Google sign-in could not be verified. Please try again.')
    }
    const data = await lookup.json()
    const fu: LookupUser | undefined = data?.users?.[0]
    if (!fu?.localId || !fu.email) {
      return badRequest('Google sign-in could not be verified. Please try again.')
    }

    const email = fu.email.toLowerCase()
    const displayName =
      fu.displayName ||
      email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    const photo = fu.photoUrl && fu.photoUrl.startsWith('https://') ? fu.photoUrl : null

    const user = await db.user.upsert({
      where: { email },
      update: {
        googleId: fu.localId,
        name: displayName,
        ...(photo ? { image: photo } : {}),
        lastLoginAt: new Date(),
      },
      create: {
        email,
        name: displayName,
        googleId: fu.localId,
        image: photo || avatarDataUrl(displayName),
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
