'use client'

import { create } from 'zustand'

export type View =
  | 'home'
  | 'create'
  | 'specials'
  | 'lists'
  | 'list-detail'
  | 'compare'
  | 'split'
  | 'wishlist'
  | 'whatsnew'
  | 'shop'
  | 'profile'
  | 'notifications'
  | 'admin'

export type SessionUser = {
  id: string
  email: string
  name: string
  image: string | null
  role: string
  isDemo: boolean
  whatsappNumber: string | null
  whatsappOptIn: boolean
}

type AppState = {
  booted: boolean
  user: SessionUser | null
  view: View
  isAdminArea: boolean
  activeListId: string | null
  activeListName: string
  preAddPromoIds: string[] // promo product ids to auto-add when opening create list
  setBooted: (b: boolean) => void
  setUser: (u: SessionUser | null) => void
  go: (view: View) => void
  openList: (id: string, name: string) => void
  openCompare: (id: string, name: string) => void
  openSplit: (id: string, name: string) => void
  setPreAddPromoIds: (ids: string[]) => void
  logoutLocal: () => void
}

export const useApp = create<AppState>((set) => ({
  booted: false,
  user: null,
  view: 'home',
  isAdminArea: false,
  activeListId: null,
  activeListName: '',
  preAddPromoIds: [],
  setBooted: (b) => set({ booted: b }),
  setUser: (u) => set({ user: u }),
  go: (view) =>
    set((s) => ({
      view,
      isAdminArea: view === 'admin',
      // reset list context when leaving list-scoped views
      ...(s.view !== view && !['list-detail', 'compare', 'split'].includes(view)
        ? { activeListId: null, activeListName: '' }
        : {}),
    })),
  openList: (id, name) => set({ view: 'list-detail', activeListId: id, activeListName: name }),
  openCompare: (id, name) => set({ view: 'compare', activeListId: id, activeListName: name }),
  openSplit: (id, name) => set({ view: 'split', activeListId: id, activeListName: name }),
  setPreAddPromoIds: (ids) => set({ preAddPromoIds: ids }),
  logoutLocal: () =>
    set({ user: null, view: 'home', isAdminArea: false, activeListId: null, activeListName: '' }),
}))
