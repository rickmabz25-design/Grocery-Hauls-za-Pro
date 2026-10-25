'use client'

// Shared helper for the STATIC (Spark) build: the app has no server, so the
// session is established purely client-side from the Firebase user.
// In the full (SSR/Blaze) build the ID token is verified by /api/auth/firebase
// instead — see login-view.tsx and app/page.tsx.

import type { SessionUser } from '@/lib/store'

type FbUserLike = {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
}

export function sessionUserFromFirebase(fbUser: FbUserLike): SessionUser {
  return {
    id: fbUser.uid,
    email: fbUser.email ?? '',
    name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Shopper',
    image: fbUser.photoURL,
    role: 'user',
    isDemo: false,
    whatsappNumber: null,
    whatsappOptIn: false,
  }
}
