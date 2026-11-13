'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { apiGet, apiPost } from '@/lib/api'
import { initialsOf } from '@/lib/format'
import { Bell, Menu, X } from 'lucide-react'

export function TopBar() {
  const user = useApp((s) => s.user)
  const go = useApp((s) => s.go)
  const [unread, setUnread] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await apiGet<{ unread: number }>('/api/notifications')
        if (!cancelled) setUnread(data.unread)
      } catch {
        /* Notifications are optional in local-only mode. */
      }
    }
    load()
    const timer = window.setInterval(load, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const nav = [
    ['home', 'Overview'],
    ['specials', 'Specials'],
    ['create', 'Create a new list'],
    ['lists', 'My lists'],
    ['shop', 'Shop mode'],
    ['whatsnew', "What's new"],
    ['profile', 'Profile'],
  ] as const

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-[#f7f9f7] text-slate-700">
      <div className="relative flex h-[68px] items-center justify-between px-4">
        <button
          onClick={() => setMenuOpen((value) => !value)}
          className="rounded-xl p-2 hover:bg-slate-200/70"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
        <span className="absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold tracking-tight">
          Overview
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => go('notifications')}
            className="relative rounded-xl p-2 hover:bg-slate-200/70"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
          >
            <Bell className="h-6 w-6" />
            {unread > 0 && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-[#f7f9f7]" />
            )}
          </button>
          <button
            onClick={() => go('profile')}
            className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-amber-300 text-sm font-extrabold text-amber-950"
            aria-label="Profile"
          >
            {user?.image ? (
              <img src={user.image} alt={`${user.name} profile`} className="h-full w-full object-cover" />
            ) : (
              initialsOf(user?.name || 'U')
            )}
          </button>
          <button onClick={() => go('profile')} aria-label="Open profile" className="text-xl leading-none">
            ›
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav className="absolute left-3 top-[60px] z-50 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          {nav.map(([view, label]) => (
            <button
              key={view}
              onClick={() => {
                go(view)
                setMenuOpen(false)
              }}
              className="block w-full rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-lime-50 hover:text-slate-950"
            >
              {label}
            </button>
          ))}
        </nav>
      )}
    </header>
  )
}

export async function markAllNotificationsRead() {
  await apiPost('/api/notifications', {}).catch(() => {})
}
