'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { apiGet, apiPost } from '@/lib/api'
import { initialsOf } from '@/lib/format'
import { Bell, Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function TopBar() {
  const user = useApp((s) => s.user)
  const go = useApp((s) => s.go)
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await apiGet<{ unread: number }>('/api/notifications')
        if (!cancelled) setUnread(data.unread)
      } catch {
        /* ignore */
      }
    }
    load()
    const t = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  return (
    <header className="sticky top-0 z-40 bg-gradient-to-r from-blue-700 to-sky-500 text-white shadow-md">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          className="flex items-center gap-2 text-left"
          onClick={() => go('home')}
          aria-label="Go to home"
        >
          <img
            src="/brand/logo-tile.png"
            alt="Grocery Hauls Pro za logo"
            className="h-9 w-9 rounded-[10px] shadow-sm"
          />
          <span>
            <span className="block text-sm font-extrabold leading-tight tracking-tight">
              Grocery Hauls Pro za
            </span>
            <span className="block text-[10px] font-medium text-sky-100 leading-tight">
              Super Intelligence Budget Shopping
            </span>
          </span>
        </button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-blue-900/25 relative"
            onClick={() => go('wishlist')}
            aria-label="Wish list"
          >
            <Heart className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-blue-900/25 relative"
            onClick={() => go('notifications')}
            aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
          >
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Button>
          <button
            onClick={() => go('profile')}
            className="ml-1 h-9 w-9 rounded-full bg-white/20 border-2 border-white/70 overflow-hidden flex items-center justify-center text-xs font-bold"
            aria-label="Profile"
          >
            {user?.image ? (
              <img src={user.image} alt={`${user.name} profile`} className="h-full w-full object-cover" />
            ) : (
              initialsOf(user?.name || 'U')
            )}
          </button>
        </div>
      </div>
    </header>
  )
}

export async function markAllNotificationsRead() {
  await apiPost('/api/notifications', {}).catch(() => {})
}
