'use client'

import { useEffect, useState } from 'react'
import { apiGet, apiPatch, apiDelete } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Bell, CheckCheck, Tag, Info, Trash2, ArrowRight } from 'lucide-react'

type NotificationT = {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  createdAt: string
}

export function NotificationsView() {
  const [items, setItems] = useState<NotificationT[]>([])
  const [loading, setLoading] = useState(true)
  const go = useApp((s) => s.go)

  const load = () =>
    apiGet<{ notifications: NotificationT[] }>('/api/notifications')
      .then((d) => setItems(d.notifications))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))

  useEffect(() => {
    load()
  }, [])

  const markAll = async () => {
    await apiPatch('/api/notifications', {}).catch(() => {})
    setItems((prev) => prev.map((i) => ({ ...i, read: true })))
  }

  const markOne = async (id: string) => {
    await apiPatch('/api/notifications', { id }).catch(() => {})
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read: true } : i)))
  }

  const removeOne = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    await apiDelete(`/api/notifications?id=${id}`).catch(() => {})
  }

  const unread = items.filter((i) => !i.read).length

  return (
    <div className="px-4 pt-4 max-w-xl mx-auto pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-900">🔔 Notifications</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Wish list price drops and updates</p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={markAll} className="border-blue-300 text-blue-700 hover:bg-blue-50">
            <CheckCheck className="h-4 w-4 mr-1" /> Mark all read
          </Button>
        )}
      </div>

      <div className="space-y-2 mt-4">
        {loading && <p className="text-sm text-zinc-400 text-center py-10">Loading notifications…</p>}
        {!loading && items.length === 0 && (
          <div className="text-center py-14 text-zinc-400">
            <p className="text-4xl mb-3">🔕</p>
            <p className="text-sm font-medium">No notifications yet</p>
            <p className="text-xs mt-1">Wish list price drops will appear here automatically.</p>
            <Button onClick={() => go('wishlist')} className="mt-4 bg-blue-600 hover:bg-blue-700">
              Browse your Wish List <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
        {items.map((n) => (
          <div
            key={n.id}
            className={`rounded-2xl border p-3.5 flex items-start gap-3 ${
              n.read ? 'bg-white border-zinc-100' : 'bg-red-50 border-red-200'
            }`}
          >
            <span
              className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                n.type === 'price-drop' ? 'bg-red-100 text-red-600' : 'bg-sky-100 text-sky-600'
              }`}
            >
              {n.type === 'price-drop' ? <Tag className="h-4 w-4" /> : <Info className="h-4 w-4" />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-zinc-900">{n.title}</p>
              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{n.body}</p>
              <p className="text-[10px] text-zinc-400 mt-1">{timeAgo(n.createdAt)}</p>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              {!n.read && (
                <button
                  onClick={() => markOne(n.id)}
                  className="text-zinc-300 hover:text-blue-600"
                  aria-label="Mark as read"
                >
                  <CheckCheck className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => removeOne(n.id)}
                className="text-zinc-300 hover:text-red-500"
                aria-label="Delete notification"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
