'use client'

import { handleStaticApi, setStaticUserId } from '@/lib/static-data'
import { useApp } from '@/lib/store'

// Static hosting has no server API. User data is handled by the browser-local
// adapter; only published catalogue snapshots are fetched from /data/*.json.
export const STATIC_MODE = true

const LOCAL_ONLY = 'This action is not available in the local-only app yet.'

type PromoCard = {
  id: string; productId: string; name: string; unit: string | null
  category: { id: string; name: string; icon: string }; storeId: string
  storeName: string; storeColor: string; promoPrice: number; normalPrice: number
  discount: number; saved: number; startDate: string; endDate: string; createdAt: string
}

const STATIC_EMPTY: Record<string, unknown> = {
  '/api/notifications': { notifications: [], unread: 0 },
  '/api/auth/session': { user: null },
}
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
      if (!res.ok) throw new Error(`Failed to load /data/promos.json (${res.status})`)
      promosCache = ((await res.json()) as { promos: PromoCard[] }).promos
    }
    const now = new Date()
    const active = promosCache.filter((p) => new Date(p.startDate) <= now && new Date(p.endDate) >= now)
    const store = sp.get('store') || '', category = sp.get('category') || '', sort = sp.get('sort') || 'discount'
    let rows = active.filter((p) => (!store || p.storeId === store) && (!category || p.category.id === category))
    rows = [...rows]
    if (sort === 'price') rows.sort((a, b) => a.promoPrice - b.promoPrice)
    else if (sort === 'ending') rows.sort((a, b) => +new Date(a.endDate) - +new Date(b.endDate))
    else if (sort === 'new') rows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    else rows.sort((a, b) => b.discount - a.discount || a.promoPrice - b.promoPrice)
    return { promos: rows } as T
  }
  if (STATIC_FILES[pathname]) {
    const res = await fetch(STATIC_FILES[pathname])
    if (!res.ok) throw new Error(`Failed to load ${STATIC_FILES[pathname]} (${res.status})`)
    return await res.json() as T
  }
  throw new Error(`This local-only feature is not available yet: ${pathname}`)
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = options
  const method = (rest.method || 'GET').toUpperCase()

  if (STATIC_MODE) {
    const currentUser = useApp.getState().user
    setStaticUserId(currentUser?.id)
    let body = json
    if (body === undefined && typeof rest.body === 'string') {
      try { body = JSON.parse(rest.body) } catch { body = undefined }
    }
    const localResult = await handleStaticApi(method, path, body as Record<string, any> | undefined, { userId: currentUser?.id, user: currentUser })
    if (localResult !== null) return localResult as T
    if (method === 'GET') return staticGet<T>(path)
    throw new Error(LOCAL_ONLY)
  }

  // Non-static development/server builds retain their existing server API path.
  const res = await fetch(path, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...(rest.headers || {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: 'same-origin',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  return data as T
}

export const apiGet = <T = unknown,>(path: string) => api<T>(path)
export const apiPost = <T = unknown,>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json })
export const apiPatch = <T = unknown,>(path: string, json?: unknown) => api<T>(path, { method: 'PATCH', json })
export const apiDelete = <T = unknown,>(path: string) => api<T>(path, { method: 'DELETE' })

export async function apiUpload<T = unknown,>(path: string, formData: FormData): Promise<T> {
  if (STATIC_MODE) {
    // Imports must be parsed and reviewed in the browser; never POST files to a server.
    throw new Error('File imports are being moved to browser-local review. No upload was sent.')
  }
  const res = await fetch(path, { method: 'POST', body: formData, credentials: 'same-origin' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `Upload failed (${res.status})`)
  return data as T
}
