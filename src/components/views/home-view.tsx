'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { apiGet } from '@/lib/api'
import { formatZAR, DISCLAIMER_PRICES } from '@/lib/format'
import {
  Plus, Tag, ClipboardList, Heart, ScanLine, User, ArrowRight, Bell, Sparkles,
} from 'lucide-react'

type HomeStats = {
  lists: number
  unreadNotifications: number
  wishCount: number
  activePromos: number
}

const actions = [
  { view: 'create', label: 'Create List', desc: 'Build a new grocery list', icon: Plus, bg: 'bg-blue-600', emoji: '📝' },
  { view: 'specials', label: 'Specials / Promos', desc: 'See current deals', icon: Tag, bg: 'bg-sky-500', emoji: '🏷️' },
  { view: 'lists', label: 'My Lists', desc: 'Saved shopping lists', icon: ClipboardList, bg: 'bg-blue-500', emoji: '📋' },
  { view: 'wishlist', label: 'Wish List', desc: 'Wait for price drops', icon: Heart, bg: 'bg-sky-600', emoji: '❤️' },
  { view: 'shop', label: 'Shop Mode', desc: 'Scan & track in-store', icon: ScanLine, bg: 'bg-zinc-900', emoji: '📡' },
  { view: 'profile', label: 'Profile', desc: 'Account & alerts', icon: User, bg: 'bg-zinc-700', emoji: '👤' },
] as const

export function HomeView() {
  const user = useApp((s) => s.user)
  const go = useApp((s) => s.go)
  const [stats, setStats] = useState<HomeStats | null>(null)
  const firstName = (user?.name || 'there').split(' ')[0]

  useEffect(() => {
    Promise.all([
      apiGet<{ lists: unknown[] }>('/api/lists'),
      apiGet<{ unread: number }>('/api/notifications'),
      apiGet<{ items: unknown[] }>('/api/wishlist'),
      apiGet<{ promos: unknown[] }>('/api/promos'),
    ])
      .then(([l, n, w, p]) => {
        setStats({
          lists: l.lists.length,
          unreadNotifications: n.unread,
          wishCount: w.items.length,
          activePromos: p.promos.length,
        })
      })
      .catch(() => setStats(null))
  }, [])

  return (
    <div className="px-4 pt-4 max-w-xl mx-auto">
      {/* Greeting card */}
      <div className="rounded-3xl bg-gradient-to-br from-blue-700 to-sky-500 text-white p-5 shadow-md">
        <p className="text-sky-100 text-sm">Welcome back 👋</p>
        <h1 className="text-2xl font-extrabold mt-0.5">{firstName}!</h1>
        <p className="text-sm text-sky-50 mt-2 leading-relaxed">
          Create a list, compare specials at South Africa&apos;s biggest supermarkets, and let
          <span className="font-bold"> super intelligence</span> find your cheapest basket.
        </p>
        {stats && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-white/15 rounded-xl px-2 py-2 text-center">
              <p className="text-lg font-extrabold">{stats.activePromos}</p>
              <p className="text-[10px] text-sky-100">live specials</p>
            </div>
            <div className="bg-white/15 rounded-xl px-2 py-2 text-center">
              <p className="text-lg font-extrabold">{stats.lists}</p>
              <p className="text-[10px] text-sky-100">my lists</p>
            </div>
            <button className="bg-white/15 rounded-xl px-2 py-2 text-center hover:bg-white/25 transition" onClick={() => go('notifications')}>
              <p className="text-lg font-extrabold">{stats.unreadNotifications}</p>
              <p className="text-[10px] text-sky-100">new alerts</p>
            </button>
          </div>
        )}
      </div>

      {/* Main action grid */}
      <h2 className="font-bold text-zinc-900 mt-6 mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-sky-500" /> Everything you need
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((a) => {
          const Icon = a.icon
          return (
            <button
              key={a.view}
              onClick={() => go(a.view)}
              className="bg-white rounded-2xl p-4 text-left shadow-sm border border-zinc-100 active:scale-[0.97] hover:shadow-md transition-all min-h-[96px]"
            >
              <span className={`${a.bg} text-white h-9 w-9 rounded-xl flex items-center justify-center mb-2`}>
                <Icon className="h-5 w-5" />
              </span>
              <p className="font-bold text-sm text-zinc-900">{a.label}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5 leading-tight">{a.desc}</p>
            </button>
          )
        })}
      </div>

      {/* Shop Mode hero CTA */}
      <button
        onClick={() => go('shop')}
        className="w-full mt-4 rounded-3xl bg-gradient-to-r from-zinc-900 to-sky-700 text-white p-5 text-left shadow-lg active:scale-[0.98] transition flex items-center justify-between"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">In the store right now?</p>
          <p className="text-xl font-extrabold mt-0.5">Open Shop Mode 📡</p>
          <p className="text-xs text-sky-300 mt-1">Scan barcodes • live running total • promo savings</p>
        </div>
        <ArrowRight className="h-6 w-6 shrink-0" />
      </button>

      {/* Notifications hint */}
      {stats && stats.unreadNotifications > 0 && (
        <button
          onClick={() => go('notifications')}
          className="w-full mt-3 rounded-2xl bg-red-50 border border-red-200 p-4 flex items-center gap-3 text-left active:scale-[0.98] transition"
        >
          <Bell className="h-5 w-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-800">
            <span className="font-bold">{stats.unreadNotifications} new notification{stats.unreadNotifications > 1 ? 's' : ''}</span> — check wish list price drops!
          </p>
        </button>
      )}

      <p className="text-[11px] text-zinc-500 text-center mt-6 leading-relaxed px-2">{DISCLAIMER_PRICES}</p>
    </div>
  )
}
