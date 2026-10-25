'use client'

import { useApp, View } from '@/lib/store'
import { STATIC_MODE } from '@/lib/api'
import { Home, Tag, Plus, ClipboardList, ScanLine } from 'lucide-react'

const items = [
  { view: 'home', label: 'Home', icon: Home },
  { view: 'specials', label: 'Specials', icon: Tag },
  { view: 'create', label: 'Create', icon: Plus, primary: true },
  { view: 'lists', label: 'My Lists', icon: ClipboardList },
  { view: 'shop', label: 'Shop Mode', icon: ScanLine },
] as const

// Spark static build: tabs whose features write user data are hidden —
// they return with Firestore sync in Spark Pass 2.
const STATIC_HIDDEN_VIEWS = new Set<string>(['create', 'lists', 'shop'])
const visibleItems = STATIC_MODE
  ? items.filter((i) => !STATIC_HIDDEN_VIEWS.has(i.view))
  : items

export function BottomNav() {
  const view = useApp((s) => s.view)
  const go = useApp((s) => s.go)

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-sky-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main navigation"
    >
      <div className="max-w-xl mx-auto grid" style={{ gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}>
        {visibleItems.map((item) => {
          const Icon = item.icon
          const active = view === item.view
          if (item.primary) {
            return (
              <button
                key={item.view}
                onClick={() => go(item.view)}
                className="relative -top-3 flex flex-col items-center justify-center"
                aria-label="Create list"
              >
                <span
                  className={`h-14 w-14 rounded-full shadow-lg flex items-center justify-center transition-transform active:scale-95 ${
                    active ? 'bg-blue-700' : 'bg-blue-600'
                  } text-white`}
                >
                  <Icon className="h-7 w-7" strokeWidth={2.5} />
                </span>
                <span className="text-[10px] font-semibold text-blue-700 mt-0.5">Create</span>
              </button>
            )
          }
          return (
            <button
              key={item.view}
              onClick={() => go(item.view)}
              className={`flex flex-col items-center justify-center py-2.5 gap-0.5 min-h-[44px] transition-colors ${
                active ? 'text-blue-600' : 'text-zinc-400 hover:text-zinc-600'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
