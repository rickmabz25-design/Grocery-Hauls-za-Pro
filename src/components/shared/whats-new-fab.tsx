'use client'

import { Sparkles } from 'lucide-react'
import { useApp } from '@/lib/store'

export function WhatsNewFab() {
  const go = useApp((s) => s.go)
  return (
    <button
      onClick={() => go('whatsnew')}
      className="whats-new-pulse fixed bottom-24 right-4 z-40 flex items-center gap-1.5 rounded-full bg-lime-300 text-slate-950 pl-3 pr-4 py-3 shadow-xl shadow-lime-500/40 ring-2 ring-lime-100 active:scale-95 transition-transform"
      aria-label="What's New — latest promotions and campaigns"
    >
      <Sparkles className="h-4 w-4" />
      <span className="text-xs font-bold">What&apos;s New</span>
    </button>
  )
}
