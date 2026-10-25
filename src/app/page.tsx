'use client'

import { useEffect, useState } from 'react'
import { useApp, View } from '@/lib/store'
import { apiGet, apiPost, STATIC_MODE } from '@/lib/api'
import { sessionUserFromFirebase } from '@/lib/static-session'
import { SessionUser } from '@/lib/store'
import { LoginView } from '@/components/views/login-view'
import { AdminView } from '@/components/admin/admin-view'
import { TopBar } from '@/components/shared/top-bar'
import { BottomNav } from '@/components/shared/bottom-nav'
import { WhatsNewFab } from '@/components/shared/whats-new-fab'
import { HomeView } from '@/components/views/home-view'
import { CreateListView } from '@/components/views/create-list-view'
import { SpecialsView } from '@/components/views/specials-view'
import { MyListsView } from '@/components/views/my-lists-view'
import { ListDetailView } from '@/components/views/list-detail-view'
import { CompareView } from '@/components/views/compare-view'
import { SplitView } from '@/components/views/split-view'
import { WishListView } from '@/components/views/wish-list-view'
import { WhatsNewView } from '@/components/views/whats-new-view'
import { ShopModeView } from '@/components/views/shop-mode-view'
import { ProfileView } from '@/components/views/profile-view'
import { NotificationsView } from '@/components/views/notifications-view'
import { PWARegister } from '@/components/shared/pwa-register'

function Splash() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-700 to-sky-500">
      <img
        src="/brand/logo-lockup.png"
        alt="GroceryHaulz-Pro za"
        className="w-64 max-w-[70vw] mb-5 animate-bounce drop-shadow-2xl"
      />
      <h1 className="sr-only">Grocery Hauls Pro za</h1>
      <p className="text-white text-sm font-medium">Super Intelligence Budget Shopping</p>
    </div>
  )
}

// Shown on the static build when /#/admin is opened: the admin console
// writes through server APIs, which static hosting (Cloudflare Pages /
// Firebase Spark free plan) cannot run.
function SparkAdminPanel() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-sky-50 px-6 text-center">
      <img src="/brand/logo-lockup.png" alt="GroceryHaulz-Pro za" className="w-48 max-w-[60vw] mb-6" />
      <div className="bg-white rounded-3xl shadow-lg border border-sky-100 p-6 max-w-sm">
        <h1 className="font-bold text-lg mb-2">Admin console unavailable</h1>
        <p className="text-sm text-zinc-600 leading-relaxed">
          The admin console edits catalog data through server APIs. This site is on
          <span className="font-semibold"> static hosting</span>, which cannot run
          server code. Manage the catalog from the local preview and redeploy to publish changes.
        </p>
      </div>
    </div>
  )
}

function ViewRouter() {
  const view = useApp((s) => s.view)
  switch (view) {
    case 'home':
      return <HomeView />
    case 'create':
      return <CreateListView />
    case 'specials':
      return <SpecialsView />
    case 'lists':
      return <MyListsView />
    case 'list-detail':
      return <ListDetailView />
    case 'compare':
      return <CompareView />
    case 'split':
      return <SplitView />
    case 'wishlist':
      return <WishListView />
    case 'whatsnew':
      return <WhatsNewView />
    case 'shop':
      return <ShopModeView />
    case 'profile':
      return <ProfileView />
    case 'notifications':
      return <NotificationsView />
    default:
      return <HomeView />
  }
}

export default function Page() {
  const { booted, user, isAdminArea, setBooted, setUser, go } = useApp()
  const [adminChecked, setAdminChecked] = useState(false)

  // Bootstrap: restore session + detect #/admin hash
  useEffect(() => {
    const boot = async () => {
      const checkHash = () => {
        if (window.location.hash === '#/admin') {
          useApp.setState({ isAdminArea: true })
          return true
        }
        return false
      }
      const isAdmin = checkHash()
      window.addEventListener('hashchange', () => {
        const nowAdmin = checkHash()
        if (!nowAdmin) useApp.setState({ isAdminArea: false })
      })
      try {
        const data = await apiGet<{ user: SessionUser | null }>('/api/auth/session')
        if (data.user) {
          setUser(data.user)
          if (!isAdmin) useApp.setState({ view: 'home' as View })
        }
      } catch {
        /* not signed in */
      }
      setAdminChecked(true)
      setBooted(true)
    }
    boot()
  }, [setBooted, setUser, go])

  // Firebase sign-in state restore: if the user previously signed in with
  // Google (Firebase persists the session in IndexedDB) but the server session
  // cookie is missing/expired, silently re-establish it via onAuthStateChanged.
  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    let done = false
    ;(async () => {
      try {
        const { getFirebaseAuth, onAuthStateChanged } = await import('@/firebase')
        unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (fbUser) => {
          if (cancelled || done) return
          if (!fbUser) return // no Firebase session — cookie/boot flow decides
          if (useApp.getState().user) return // already signed in via cookie
          done = true
          try {
            if (STATIC_MODE) {
              // Spark static build: session lives purely client-side
              if (!cancelled) {
                setUser(sessionUserFromFirebase(fbUser))
                useApp.setState({ view: 'home' as View })
              }
              return
            }
            const idToken = await fbUser.getIdToken()
            const data = await apiPost<{ user: SessionUser }>('/api/auth/firebase', { idToken })
            if (!cancelled) {
              setUser(data.user)
              useApp.setState({ view: 'home' as View })
            }
          } catch {
            /* verification failed — stay on login; user can retry manually */
          }
        })
      } catch {
        /* Firebase unavailable — cookie session flow still works */
      }
    })()
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [setUser])

  // Test hook for the static (Spark) build only: lets automated browser
  // tests flip the local UI into the signed-in shell without a Google
  // account. Client-side state only — there is no server and no
  // privileged data behind sign-in on the static build.
  if (STATIC_MODE && typeof window !== 'undefined') {
    ;(window as unknown as Record<string, unknown>).__ghStaticSetUser = (u: SessionUser | null) =>
      useApp.getState().setUser(u)
  }

  if (!booted || !adminChecked) return <Splash />
  if (isAdminArea) return STATIC_MODE ? <SparkAdminPanel /> : <AdminView />
  if (!user) return <LoginView />

  return (
    <div className="min-h-screen flex flex-col bg-sky-50">
      <PWARegister />
      <TopBar />
      <main className="flex-1 pb-28">
        <ViewRouter />
      </main>
      <WhatsNewFab />
      <BottomNav />
    </div>
  )
}
