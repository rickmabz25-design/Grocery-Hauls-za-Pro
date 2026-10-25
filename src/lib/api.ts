'use client'

// Small client-side fetch wrapper with consistent error handling.
//
// STATIC (Spark) mode — NEXT_PUBLIC_STATIC=1 at build time:
//   The Firebase Spark (free) plan hosts static files only — no server APIs.
//   In this mode the wrapper transparently serves the catalog from
//   /data/*.json (generated from SQLite at build time by
//   scripts/gen-catalog-json.mjs), returns graceful empty states for
//   user-data reads, and throws a friendly error for any write so views
//   surface "coming in Spark Pass 2" instead of a 404.
//   In normal (dev / SSR / Blaze) mode behaviour is unchanged.

export const STATIC_MODE = process.env.NEXT_PUBLIC_STATIC === '1'

const PASS2 = 'Data sync is coming in Spark Pass 2 (Firestore on the free plan). This action needs the full (Blaze) build — the local preview still supports it.'

type PromoCard = {
  id: string
  productId: string
  name: string
  unit: string | null
  category: { id: string; name: string; icon: string }
  storeId: string
  storeName: string
  storeColor: string
  promoPrice: number
  normalPrice: number
  discount: number
  saved: number
  startDate: string
  endDate: string
  createdAt: string
}

// --- static GET rewrites ----------------------------------------------------
// Empty states mirror the real API response shapes so views render cleanly.
const STATIC_EMPTY: Record<string, unknown> = {
  '/api/lists': { lists: [] },
  '/api/wishlist': { items: [] },
  '/api/notifications': { notifications: [], unread: 0 },
  '/api/auth/session': { user: null },
}

// Catalog GETs -> build-time JSON files
const STATIC_FILES: Record<string, string> = {
  '/api/stores': '/data/stores.json',
  '/api/categories': '/data/categories.json',
  '/api/whats-new': '/data/whats-new.json',
}

let promosCache: PromoCard[] | null = null

async function staticGet<T>(path: string): Promise<T> {
  const [pathname, query] = path.split('?')
  const sp = new URLSearchParams(query || '')

  if (STATIC_EMPTY[pathname] !== undefined) return STATIC_EMPTY[pathname] as T

  if (pathname === '/api/promos') {
    if (!promosCache) {
      const res = await fetch('/data/promos.json')
      promosCache = ((await res.json()) as { promos: PromoCard[] }).promos
    }
    const storeId = sp.get('store') || ''
    const categoryId = sp.get('category') || ''
    const sort = sp.get('sort') || 'discount'
    let cards = promosCache
    if (storeId) cards = cards.filter((c) => c.storeId === storeId)
    if (categoryId) cards = cards.filter((c) => c.category.id === categoryId)
    cards = [...cards]
    switch (sort) {
      case 'price':
        cards.sort((a, b) => a.promoPrice - b.promoPrice)
        break
      case 'ending':
        cards.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
        break
      case 'new':
        cards.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        break
      default:
        cards.sort((a, b) => b.discount - a.discount || a.promoPrice - b.promoPrice)
    }
    return { promos: cards } as T
  }

  if (STATIC_FILES[pathname]) {
    const res = await fetch(STATIC_FILES[pathname])
    if (!res.ok) throw new Error(`Failed to load ${STATIC_FILES[pathname]} (${res.status})`)
    return (await res.json()) as T
  }

  throw new Error(`This endpoint is not available on the Spark static build: ${pathname}`)
}

// --- core wrapper ------------------------------------------------------------
export async function api<T = unknown>(
  path: string,
  options: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const { json, ...rest } = options
  const method = (rest.method || 'GET').toUpperCase()

  if (STATIC_MODE) {
    if (method !== 'GET') throw new Error(PASS2)
    return staticGet<T>(path)
  }

  const res = await fetch(path, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...(rest.headers || {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: 'same-origin',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  }
  return data as T
}

export const apiGet = <T = unknown,>(path: string) => api<T>(path)
export const apiPost = <T = unknown,>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json })
export const apiPatch = <T = unknown,>(path: string, json?: unknown) => api<T>(path, { method: 'PATCH', json })
export const apiDelete = <T = unknown,>(path: string) => api<T>(path, { method: 'DELETE' })

export async function apiUpload<T = unknown,>(path: string, formData: FormData): Promise<T> {
  if (STATIC_MODE) throw new Error(PASS2)
  const res = await fetch(path, { method: 'POST', body: formData, credentials: 'same-origin' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `Upload failed (${res.status})`)
  return data as T
}
