'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { apiGet, apiPost } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { formatZAR } from '@/lib/format'
import type { CompareResult } from '@/lib/server/compare'
import { Button } from '@/components/ui/button'
import {
  SplitSquareHorizontal, Car, Save, CheckCircle2, Store, ShoppingBasket, TrendingDown,
} from 'lucide-react'

export function SplitView() {
  const activeListId = useApp((s) => s.activeListId)
  const activeListName = useApp((s) => s.activeListName)
  const go = useApp((s) => s.go)
  const [result, setResult] = useState<CompareResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!activeListId) return
    let storeIds: string[] = []
    try {
      const raw = sessionStorage.getItem('gh_compare_stores')
      if (raw) storeIds = JSON.parse(raw)
    } catch { /* ignore */ }
    const fetchStores = storeIds.length
      ? Promise.resolve(storeIds)
      : apiGet<{ stores: { id: string }[] }>('/api/stores').then((d) => d.stores.map((s) => s.id))

    fetchStores
      .then((ids) => apiGet<{ result: CompareResult }>(`/api/lists/${activeListId}/compare?stores=${ids.join(',')}`))
      .then((d) => setResult(d.result))
      .catch((e) => toast({ title: 'Could not analyse split', description: (e as Error).message, variant: 'destructive' }))
      .finally(() => setLoading(false))
  }, [activeListId])

  const savePlan = async (choice: 'cheapest' | 'preferred' | 'split', storeIds: string[], total: number, savings: number, details: unknown) => {
    if (!activeListId) return
    try {
      await apiPost(`/api/lists/${activeListId}/plan`, { choice, storeIds, totalCost: total, savings, details })
      setSaved(true)
      toast({
        title: 'Shopping plan saved ✅',
        description: 'Find it any time under My Lists → Compare again.',
      })
    } catch (e) {
      toast({ title: 'Could not save plan', description: (e as Error).message, variant: 'destructive' })
    }
  }

  if (!activeListId) {
    return (
      <div className="px-4 pt-10 max-w-xl mx-auto text-center text-zinc-400">
        <p className="text-sm">Open a list and compare stores first.</p>
        <Button onClick={() => go('lists')} className="mt-4 bg-blue-600 hover:bg-blue-700">Go to My Lists</Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="px-4 pt-10 max-w-xl mx-auto text-center text-zinc-400">
        <p className="text-sm">Analysing which items are cheaper where…</p>
      </div>
    )
  }

  const split = result?.split
  if (!split) {
    return (
      <div className="px-4 pt-10 max-w-xl mx-auto text-center text-zinc-400">
        <p className="text-4xl mb-3">🤔</p>
        <p className="text-sm">We couldn&apos;t build a split plan for this list.</p>
        <p className="text-xs mt-1">Make sure your items are available at more than one store.</p>
        <Button onClick={() => go('compare')} className="mt-4 bg-blue-600 hover:bg-blue-700">Back to comparison</Button>
      </div>
    )
  }

  const { store1, store2 } = split
  const cheapestStore = result?.cheapest

  return (
    <div className="px-4 pt-4 max-w-xl mx-auto pb-4">
      <h1 className="text-xl font-extrabold text-zinc-900 flex items-center gap-2">
        <SplitSquareHorizontal className="h-5 w-5 text-lime-600" /> Split My Shopping
      </h1>
      <p className="text-xs text-zinc-400 mt-0.5">{activeListName} • smart item-by-item analysis</p>

      {/* Headline result */}
      <div className={`mt-4 rounded-2xl border-2 p-4 ${split.worthIt ? 'bg-lime-50 border-lime-300' : 'bg-zinc-50 border-zinc-200'}`}>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Split across 2 stores</p>
            <p className="text-2xl font-extrabold text-lime-700 mt-1">{formatZAR(split.splitTotal)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
              Cheapest single store
            </p>
            <p className="text-2xl font-extrabold text-lime-700 mt-1">{formatZAR(split.cheapestSingleTotal)}</p>
            <p className="text-[10px] text-zinc-400">{cheapestStore?.name}</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-lime-300/60 text-center">
          {split.worthIt ? (
            <p className="text-sm text-lime-800 font-semibold leading-relaxed">
              <TrendingDown className="h-4 w-4 inline mr-1 -mt-0.5" />
              Splitting saves you <span className="font-extrabold">{formatZAR(split.saving)}</span> vs one store.
            </p>
          ) : (
            <p className="text-sm text-zinc-600 font-semibold">
              Splitting doesn&apos;t save anything here — one trip is better.
            </p>
          )}
          {split.travelWarning && (
            <p className="text-xs text-red-600 mt-2 leading-relaxed flex items-start gap-1.5 text-left">
              <Car className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <span className="font-bold">Careful:</span> travelling to two stores usually costs R30–R50 in
                petrol and time. The {formatZAR(split.saving)} saving may be cancelled out by the second trip.
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Store 1 */}
      <SplitStoreCard
        label="Store 1"
        name={store1.name}
        color={store1.color}
        cost={store1.cost}
        items={store1.items}
      />
      {/* Store 2 */}
      <SplitStoreCard
        label="Store 2"
        name={store2.name}
        color={store2.color}
        cost={store2.cost}
        items={store2.items}
      />

      {/* Choose your plan */}
      <h2 className="font-bold text-zinc-900 mt-5 mb-2">Choose your shopping plan</h2>
      <div className="space-y-2">
        <button
          onClick={() => savePlan('cheapest', cheapestStore ? [cheapestStore.storeId] : [], split.cheapestSingleTotal, 0, { mode: 'single-cheapest', store: cheapestStore?.name })}
          className="w-full bg-blue-600 text-white rounded-2xl p-3.5 text-left flex items-center justify-between active:scale-[0.98] transition"
        >
          <span>
            <span className="block font-bold text-sm">Buy everything from the cheapest store</span>
            <span className="block text-xs text-sky-100 mt-0.5">
              {cheapestStore?.name} — {formatZAR(split.cheapestSingleTotal)} • one trip
            </span>
          </span>
          <ShoppingBasket className="h-5 w-5 shrink-0" />
        </button>

        <button
          onClick={() => savePlan('split', [store1.storeId, store2.storeId], split.splitTotal, split.saving, { mode: 'split', split })}
          disabled={!split.worthIt}
          className="w-full bg-lime-600 text-black rounded-2xl p-3.5 text-left flex items-center justify-between active:scale-[0.98] transition disabled:opacity-40"
        >
          <span>
            <span className="block font-bold text-sm">Split between {store1.name} & {store2.name}</span>
            <span className="block text-xs text-black/70 mt-0.5">
              {formatZAR(split.splitTotal)} total
              {split.worthIt ? ` • saves ${formatZAR(split.saving)}` : ' • no saving'}
            </span>
          </span>
          <SplitSquareHorizontal className="h-5 w-5 shrink-0" />
        </button>

        <button
          onClick={() => {
            const pref = sessionStorage.getItem('gh_preferred_store')
            const prefStore = result?.stores.find((s) => s.storeId === pref)
            savePlan(
              'preferred',
              prefStore ? [prefStore.storeId] : [],
              prefStore?.total ?? split.cheapestSingleTotal,
              prefStore?.savings ?? 0,
              { mode: 'single-preferred', store: prefStore?.name ?? null }
            )
          }}
          className="w-full bg-white border-2 border-zinc-200 text-zinc-700 rounded-2xl p-3.5 text-left flex items-center justify-between active:scale-[0.98] transition"
        >
          <span>
            <span className="block font-bold text-sm">Buy everything from my preferred store</span>
            <span className="block text-xs text-zinc-400 mt-0.5">
              {result?.stores.find((s) => s.preferred)?.name ?? 'Set your preferred store on the comparison screen'}
            </span>
          </span>
          <Store className="h-5 w-5 shrink-0" />
        </button>

        {saved && (
          <div className="rounded-2xl bg-sky-50 border border-sky-200 p-3.5 flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0" />
            <p className="text-sm text-sky-900 font-medium">
              Plan saved! Open Shop Mode when you hit the stores.
            </p>
          </div>
        )}

        <Button
          onClick={() => go('shop')}
          variant="outline"
          className="w-full mt-2 h-12 border-blue-300 text-blue-700 hover:bg-blue-50 font-semibold"
        >
          Start shopping with this plan → Shop Mode
        </Button>
      </div>

      <p className="text-[11px] text-zinc-400 text-center mt-4 leading-relaxed">
        Split totals are estimates based on latest promo and shelf data. Some items may be missing at
        one store — always confirm in-store.
      </p>
    </div>
  )
}

function SplitStoreCard({
  label,
  name,
  color,
  cost,
  items,
}: {
  label: string
  name: string
  color: string
  cost: number
  items: { itemId: string; name: string; quantity: number; unit: string | null; price: number }[]
}) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm mt-3 overflow-hidden">
      <div className="flex items-center justify-between p-3.5 pb-2">
        <div className="flex items-center gap-2.5">
          <span
            className="h-9 w-9 rounded-xl flex items-center justify-center text-white text-xs font-extrabold"
            style={{ background: color }}
          >
            {name.slice(0, 2)}
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">{label}</p>
            <p className="font-bold text-sm text-zinc-900">
              {items.length} item{items.length !== 1 ? 's' : ''} cheaper here
            </p>
          </div>
        </div>
        <p className="font-extrabold text-zinc-900">{formatZAR(cost)}</p>
      </div>
      <ul className="px-3.5 pb-3.5 space-y-1">
        {items.map((i) => (
          <li key={i.itemId} className="flex items-center justify-between text-xs text-zinc-600">
            <span className="truncate">
              {i.quantity}× {i.name}
              {i.unit ? ` (${i.unit})` : ''}
            </span>
            <span className="font-semibold shrink-0 ml-2">{formatZAR(i.price)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
