'use client'

import { useEffect, useRef, useState } from 'react'
import { useApp } from '@/lib/store'
import { apiPost, STATIC_MODE } from '@/lib/api'
import { sessionUserFromFirebase } from '@/lib/static-session'
import { Loader2 } from 'lucide-react'
import {
  getFirebaseAuth,
  getRedirectResult,
  googleProvider,
  signInWithPopup,
  signInWithRedirect,
} from '@/firebase'

// Codes that mean "this browser refused to open the popup" — we silently
// retry with a full-page redirect, which works in in-app browsers (e.g.
// opening the link from WhatsApp/Chrome mobile) and strict popup blockers.
const POPUP_BLOCKED_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
])

function friendlyAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || ''
  const here =
    typeof window !== 'undefined' && window.location?.hostname
      ? window.location.hostname
      : 'this domain'
  switch (code) {
    case 'auth/popup-closed-by-request':
    case 'auth/cancelled-popup-request':
    case 'auth/popup-closed-by-user':
      return 'Sign-in was cancelled — the Google window closed before finishing. Please try again.'
    case 'auth/popup-blocked':
    case 'auth/operation-not-supported-in-this-environment':
      return 'Your browser blocked the Google sign-in window. Please allow popups for this site (or open the app in a normal browser tab) and try again.'
    case 'auth/unauthorized-domain':
      return `Google sign-in is blocked on this domain. In Firebase Console → Authentication → Settings → Authorized domains, add: ${here}`
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled for this Firebase project yet. Enable it under Authentication → Sign-in method.'
    case 'auth/network-request-failed':
      return 'Network problem while contacting Google. Check your connection and try again.'
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Please wait a moment and try again.'
    default:
      return 'Google sign-in failed. Please try again.'
  }
}

async function startSession(
  fbUser: { getIdToken: () => Promise<string> } & {
    uid: string
    email: string | null
    displayName: string | null
    photoURL: string | null
  },
) {
  if (STATIC_MODE) {
    // Spark static build: no server exists — establish the session purely
    // client-side from the verified Firebase user.
    useApp.getState().setUser(sessionUserFromFirebase(fbUser))
    return
  }
  // Verify the ID token server-side and start the app session
  // (no Firestore writes here by design)
  const idToken = await fbUser.getIdToken()
  const data = await apiPost<{ user: import('@/lib/store').SessionUser }>(
    '/api/auth/firebase',
    { idToken },
  )
  useApp.getState().setUser(data.user) // success — app switches to Home
}

export function LoginView() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // True while we are returning from a full-page Google redirect and
  // finishing the sign-in automatically.
  const [resuming, setResuming] = useState(false)
  const resumed = useRef(false)

  // Complete a signInWithRedirect flow: when the user comes back from the
  // Google page, getRedirectResult() resolves with their account and we
  // finish the session exactly like the popup path does.
  useEffect(() => {
    if (resumed.current) return
    resumed.current = true
    let cancelled = false
    ;(async () => {
      try {
        const result = await getRedirectResult(getFirebaseAuth())
        if (result?.user && !cancelled) {
          setResuming(true)
          await startSession(result.user)
        }
      } catch (err) {
        if (!cancelled) setError(friendlyAuthError(err))
      } finally {
        if (!cancelled) setResuming(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError('')
    try {
      // 1) Real Google sign-in via Firebase Authentication (browser popup)
      const result = await signInWithPopup(getFirebaseAuth(), googleProvider)
      await startSession(result.user) // 2) start the app session
    } catch (err) {
      const code = (err as { code?: string })?.code || ''
      if (POPUP_BLOCKED_CODES.has(code)) {
        // Popup was blocked (mobile in-app browsers, strict blockers).
        // Fall back to a full-page redirect — the sign-in continues when
        // Google bounces back and getRedirectResult() completes above.
        try {
          await signInWithRedirect(getFirebaseAuth(), googleProvider)
          return // page navigates to Google; no error shown
        } catch {
          setError(friendlyAuthError(err))
        }
      } else {
        setError(friendlyAuthError(err))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-800 via-blue-600 to-sky-500 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img
            src="/brand/logo-lockup.png"
            alt="GroceryHaulz-Pro za"
            className="w-60 max-w-[80vw] mx-auto mb-4 drop-shadow-2xl"
          />
          <h1 className="sr-only">Grocery Hauls Pro za</h1>
          <p className="text-white font-semibold">Super Intelligence Budget Shopping</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-6 space-y-4">
          <div className="text-center">
            <h2 className="font-bold text-lg">Sign in with your Google account</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Your lists, wish list and history stay private to your account.
            </p>
          </div>
          <button
            onClick={handleGoogleSignIn}
            disabled={loading || resuming}
            className="w-full flex items-center justify-center gap-3 border border-zinc-300 rounded-xl py-3.5 font-semibold text-zinc-700 hover:bg-zinc-50 active:scale-[0.98] transition min-h-[52px] disabled:opacity-60"
          >
            {loading || resuming ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                {resuming ? 'Completing sign-in…' : 'Signing in…'}
              </>
            ) : (
              <>
                <GoogleG />
                Sign in with Google
              </>
            )}
          </button>
          {error && (
            <p className="text-sm text-red-600 font-medium text-center leading-relaxed" role="alert">
              {error}
            </p>
          )}
          <p className="text-xs text-zinc-500 text-center leading-relaxed">
            Secured by Firebase Authentication. We only read your name, email and profile photo —
            never your contacts or files.
          </p>
        </div>

        <div className="text-center mt-6 text-sky-100 text-xs leading-relaxed">
          <p className="font-semibold text-white">Compare prices at 7 SA stores</p>
          <p>Boxer • Shoprite • Checkers • Pick n Pay • Woolworths • SPAR • Clicks</p>
        </div>
      </div>
    </div>
  )
}

function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  )
}
