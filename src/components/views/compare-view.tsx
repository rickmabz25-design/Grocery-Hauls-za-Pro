'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { apiGet } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { formatZAR } from '@/lib/format'
import type { CompareResult, StoreCompare } from '@/lib/server/compare'
import { Button } from '@/components/ui/button'
import { BadgeCheck, TrendingDown, SplitSquareHorizontal, ArrowRight, Info } from 'lucide-react'

export function CompareView() {
  const activeListId = useApp((s) => s.activeListId)
  const activeListName = useApp((s) => s.activeListName)
  const go = useApp((s) => s.go)
  const openSplit = useApp((s) => s.openSplit)
  const [result, setResult] = useState<CompareResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [preferred, setPreferred] = useState('')
  const [listContext, setListContext] = useState<{ province?: string; shoppingMode?: string; preferredStoreLabel?: string } | null>(null)

  useEffect(() => {
    if (!activeListId) return
    // Always request every retailer. A previous partial selection in sessionStorage
    // must not make other stores disappear from the results.
    apiGet<{ stores: { id: string }[] }>('/api/stores')
      .then((d) => {
        let savedPreferred = ''
        let context: { province?: string; shoppingMode?: string; preferredStoreLabel?: string } | null = null
        try {
          savedPreferred = localStorage.getItem('gh_preferred_store') || ''
          const contexts = JSON.parse(localStorage.getItem('gh_list_context') || '{}')
          context = contexts[activeListId] || null
        } catch { /* ignore */ }
        setListContext(context)
        const comparablePreferred = d.stores.some((s) => s.id === savedPreferred) ? savedPreferred : ''
        setPreferred(comparablePreferred)
        runCompare(d.stores.map((s) => s.id), comparablePreferred)
      })
      .catch(() => setLoading(false))
  }, [activeListId])

  const runCompare = async (storeIds: string[], preferredId = preferred) => {
    if (!activeListId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ stores: storeIds.join(',') })
      if (preferredId) params.set('preferred', preferredId)
      const data = await apiGet<{ result: CompareResult }>(`/api/lists/${activeListId}/compare?${params}`)
      setResult(data.result)
    } catch (e) {
      toast({ title: 'Comparison failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  if (!activeListId) {
    return (
      <div className="px-4 pt-10 max-w-xl mx-auto text-center text-zinc-400">
        <p className="text-4xl mb-3">🛒</p>
        <p className="text-sm">Open a list first, then compare stores.</p>
        <Button onClick={() => go('lists')} className="mt-4 bg-blue-600 hover:bg-blue-700">Go to My Lists</Button>
      </div>
    )
  }

  const changePreferred = (id: string) => {
    setPreferred(id)
    try {
      localStorage.setItem('gh_preferred_store', id)
    } catch { /* ignore */ }
    // Re-run across every retailer, changing only the preferred-store tie-break.
    setLoading(true)
    apiGet<{ stores: { id: string }[] }>('/api/stores')
      .then((d) => {
        const params = new URLSearchParams({ stores: d.stores.map((s) => s.id).join(',') })
        if (id) params.set('preferred', id)
        return apiGet<{ result: CompareResult }>(`/api/lists/${activeListId}/compare?${params}`)
      })
      .then((d) => setResult(d.result))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const orderedStores = result ? [...result.stores].sort((a, b) => {
    if (a.storeId === preferred) return -1
    if (b.storeId === preferred) return 1
    if ((a.missing === 0) !== (b.missing === 0)) return a.missing === 0 ? -1 : 1
    if (a.available !== b.available) return b.available - a.available
    return a.total - b.total
  }) : []
  const featuredStores = orderedStores.slice(0, 3)
  const otherStores = orderedStores.slice(3)

  return (
    <div className="px-4 pt-4 max-w-xl mx-auto pb-4">
      <h1 className="text-xl font-extrabold text-zinc-900">🛒 Basket Comparison</h1>
      <p className="text-xs text-zinc-400 mt-0.5">
        {result ? `${result.listName} • ${result.itemCount} products compared` : 'Calculating your basket at every store…'}
      </p>
      {listContext && (
        <div className="mt-3 rounded-xl bg-sky-50 border border-sky-100 p-3 text-xs text-sky-900">
          <p className="font-bold">{listContext.shoppingMode === 'online' ? '🌐 Online shopping' : '🏬 In-store shopping'}{listContext.province ? ` • ${listContext.province}` : ''}</p>
          {listContext.shoppingMode === 'online' && listContext.preferredStoreLabel && (
            <p className="mt-1">Preferred online retailer: <strong>{listContext.preferredStoreLabel}</strong>. Online prices are not yet available for every retailer, so the comparison below uses prices currently in the catalogue.</p>
          )}
        </div>
      )}

      {/* Preferred store */}
      <div className="mt-3 bg-white rounded-2xl border border-zinc-100 p-3">
        <label className="text-xs font-semibold text-zinc-500" htmlFor="preferred-store">
          Your preferred store (used to break ties)
        </label>
        <select
          id="preferred-store"
          value={preferred}
          onChange={(e) => changePreferred(e.target.value)}
          className="w-full h-10 mt-1 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
        >
          <option value="">No preference</option>
          {result?.stores.map((s) => (
            <option key={s.storeId} value={s.storeId}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-sm text-zinc-400 text-center py-10">Comparing prices at every store…</p>}

      {result && (
        <>
          <div className="space-y-2.5 mt-3">
            {featuredStores.map((s) => (
              <StoreCard key={s.storeId} s={s} itemCount={result.itemCount} />
            ))}
          </div>

          {otherStores.length > 0 && (
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-3">
              <h2 className="text-sm font-extrabold text-zinc-800">Other stores — price check</h2>
              <ul className="mt-2 space-y-2">
                {otherStores.map((s) => (
                  <li key={s.storeId} className="text-xs leading-relaxed text-zinc-700 border-t border-zinc-100 pt-2 first:border-0 first:pt-0">
                    <span className="font-bold">{s.name}:</span> {s.missing === 0 ? `basket total ${formatZAR(s.total)}` : `priced items subtotal ${formatZAR(s.total)}`} — {s.available}/{result.itemCount} items priced{ s.missing > 0 ? `; missing ${s.missing}: ${s.missingNames.slice(0, 3).join(', ')}${s.missingNames.length > 3 ? '…' : ''}` : ''}.
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.cheapest && result.overallCheaperBy > 0 && (
            <div className="mt-4 rounded-2xl bg-sky-50 border border-sky-200 p-4 flex items-start gap-3">
              <TrendingDown className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-sm text-sky-900 leading-relaxed">
                <span className="font-bold">{result.cheapest.name}</span> is the cheapest for this list —
                <span className="font-extrabold"> {formatZAR(result.overallCheaperBy)}</span> cheaper than{' '}
                {result.mostExpensive?.name}.
              </p>
            </div>
          )}

          <Button
            onClick={() => openSplit(activeListId, activeListName)}
            className="w-full mt-4 py-6 h-13 bg-lime-600 hover:bg-lime-700 text-black font-bold text-base"
          >
            <SplitSquareHorizontal className="h-5 w-5 mr-2" /> Split My Shopping
          </Button>
          <p className="text-xs text-zinc-400 text-center mt-2 flex items-center justify-center gap-1">
            <Info className="h-3 w-3" /> See if buying at two stores saves even more
          </p>

          <button
            onClick={() => go('shop')}
            className="w-full mt-4 rounded-2xl bg-zinc-900 text-white p-4 text-left flex items-center justify-between active:scale-[0.98] transition"
          >
            <div>
              <p className="font-extrabold">Off to the store? Open Shop Mode</p>
              <p className="text-xs text-sky-300 mt-0.5">Scan barcodes and track your live total</p>
            </div>
            <ArrowRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  )
}

function StoreCard({ s, itemCount }: { s: StoreCompare; itemCount: number }) {
  const missingPct = itemCount > 0 ? Math.round((s.missing / itemCount) * 100) : 0
  return (
    <div
      className={`bg-white rounded-2xl border-2 shadow-sm p-3.5 ${
        s.cheapest ? 'border-blue-500' : s.mostExpensive ? 'border-red-200' : 'border-zinc-100'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="h-10 w-10 rounded-xl flex items-center justify-center text-white text-xs font-extrabold shrink-0"
            style={{ background: s.color }}
          >
            {s.name.slice(0, 2)}
          </span>
          <div className="min-w-0">
            <p className="font-bold text-sm text-zinc-900 flex items-center gap-1.5">
              {s.name}
              {s.cheapest && (
                <span className="bg-blue-600 text-white text-[9px] font-extrabold rounded-full px-2 py-0.5 flex items-center gap-0.5">
                  <BadgeCheck className="h-3 w-3" /> CHEAPEST
                </span>
              )}
              {s.mostExpensive && (
                <span className="bg-red-100 text-red-600 text-[9px] font-extrabold rounded-full px-2 py-0.5">
                  MOST EXPENSIVE
                </span>
              )}
              {s.preferred && (
                <span className="bg-zinc-100 text-zinc-500 text-[9px] font-bold rounded-full px-2 py-0.5">
                  ⭐ YOURS
                </span>
              )}
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {s.available}/{itemCount} items available
              {s.missing > 0 && ` • ${s.missing} not stocked here`}
              {` • ${s.onPromo} on promo`}
              {s.notOnPromo > 0 && ` • ${s.notOnPromo} not on promotion`}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-extrabold text-zinc-900">{formatZAR(s.total)}</p>
          {s.savings > 0 && (
            <p className="text-[10px] font-bold text-lime-700">promo savings {formatZAR(s.savings)}</p>
          )}
        </div>
      </div>
      {s.missing > 0 && (
        <>
          <div className="h-1.5 bg-zinc-100 rounded-full mt-2.5 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${100 - missingPct}%`, background: s.color }} />
          </div>
          <p className="text-[10px] text-zinc-400 mt-1 leading-snug">
            Missing: {s.missingNames.slice(0, 4).join(', ')}
            {s.missingNames.length > 4 ? ` +${s.missingNames.length - 4} more` : ''}
          </p>
        </>
      )}
    </div>
  )
}
