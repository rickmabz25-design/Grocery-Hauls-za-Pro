'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPatch, apiDelete } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { useApp } from '@/lib/store'
import { formatZAR, endDateLabel, WHATSAPP_BANNER, DISCLAIMER_PRICES } from '@/lib/format'
import { ProductTile } from '@/components/shared/product-tile'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Heart, Target, Trash2, BellRing, Store } from 'lucide-react'

type WishItem = {
  id: string
  productId: string
  name: string
  unit: string | null
  categoryIcon: string
  targetPrice: number | null
  preferredStoreIds: string[]
  onPromo: boolean
  statusText: string
  bestPromo: {
    promoPrice: number
    normalPrice: number
    storeName: string
    storeColor: string
    endDate: string
    meetsTarget: boolean
  } | null
  normalFrom: number | null
}

type StoreT = { id: string; name: string }

export function WishListView() {
  const [items, setItems] = useState<WishItem[]>([])
  const [stores, setStores] = useState<StoreT[]>([])
  const [loading, setLoading] = useState(true)
  const user = useApp((s) => s.user)
  const go = useApp((s) => s.go)

  const load = useCallback(async () => {
    try {
      const data = await apiGet<{ items: WishItem[] }>('/api/wishlist')
      setItems(data.items)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    apiGet<{ stores: StoreT[] }>('/api/stores').then((d) => setStores(d.stores)).catch(() => {})
  }, [load])

  const setTarget = async (item: WishItem, value: string) => {
    const t = value === '' ? null : Number(value)
    try {
      await apiPatch(`/api/wishlist/${item.id}`, { targetPrice: t })
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, targetPrice: t } : i)))
      toast({
        title: t ? `Watching for ${formatZAR(t)} 🔔` : 'Target price removed',
        description: t
          ? `We'll alert you when ${item.name} drops to ${formatZAR(t)} or less.`
          : undefined,
      })
    } catch (e) {
      toast({ title: 'Could not set target', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const togglePreferredStore = async (item: WishItem, storeId: string) => {
    const current = item.preferredStoreIds || []
    const next = current.includes(storeId) ? current.filter((x) => x !== storeId) : [...current, storeId]
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, preferredStoreIds: next } : i)))
    try {
      await apiPatch(`/api/wishlist/${item.id}`, { preferredStoreIds: next })
    } catch {
      load()
    }
  }

  const remove = async (item: WishItem) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    try {
      await apiDelete(`/api/wishlist/${item.id}`)
    } catch {
      load()
    }
  }

  const hasWhatsApp = Boolean(user?.whatsappNumber)

  return (
    <div className="px-4 pt-4 max-w-xl mx-auto pb-4">
      <h1 className="text-xl font-extrabold text-zinc-900">❤️ Wish List</h1>
      <p className="text-xs text-zinc-400 mt-0.5">Save products and get alerted when they go on special</p>

      {/* WhatsApp banner */}
      <div className={`mt-3 rounded-2xl border p-3.5 ${hasWhatsApp ? 'bg-sky-50 border-sky-200' : 'bg-red-50 border-red-200'}`}>
        <p className={`text-xs leading-relaxed ${hasWhatsApp ? 'text-sky-900' : 'text-red-700'} flex items-start gap-2`}>
          <BellRing className="h-4 w-4 shrink-0 mt-0.5" />
          {WHATSAPP_BANNER}
        </p>
        {!hasWhatsApp && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 h-8 text-xs border-red-400 text-red-700 hover:bg-red-100"
            onClick={() => go('profile')}
          >
            Add WhatsApp number →
          </Button>
        )}
        {hasWhatsApp && (
          <p className="text-[11px] text-sky-700 font-semibold mt-1.5">
            ✓ {user?.whatsappNumber} — alerts ready (WhatsApp alerts come in a future update; in-app
            alerts are active now)
          </p>
        )}
      </div>

      <div className="space-y-2.5 mt-4">
        {loading && <p className="text-sm text-zinc-400 text-center py-8">Loading your wish list…</p>}
        {!loading && items.length === 0 && (
          <div className="text-center py-14 text-zinc-400">
            <p className="text-4xl mb-3">💝</p>
            <p className="text-sm font-medium">Nothing wished for yet</p>
            <p className="text-xs mt-1">Add products from Specials — we&apos;ll watch the price for you.</p>
            <Button onClick={() => go('specials')} className="mt-4 bg-blue-600 hover:bg-blue-700">
              Browse Specials
            </Button>
          </div>
        )}
        {items.map((item) => (
          <div key={item.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-3.5">
            <div className="flex items-start gap-3">
              <ProductTile icon={item.categoryIcon} alt={item.name} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-sm text-zinc-900">{item.name}</p>
                  <button
                    onClick={() => remove(item)}
                    className="text-zinc-300 hover:text-red-500 shrink-0"
                    aria-label={`Remove ${item.name} from wish list`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {item.unit && <p className="text-[11px] text-zinc-400">{item.unit}</p>}

                {item.onPromo && item.bestPromo ? (
                  <div className="mt-1.5">
                    <p className="text-sm">
                      <span className="font-extrabold text-lime-700">{formatZAR(item.bestPromo.promoPrice)}</span>{' '}
                      <span className="line-through text-zinc-400 text-xs">{formatZAR(item.bestPromo.normalPrice)}</span>{' '}
                      <span
                        className="text-[10px] text-white rounded px-1.5 py-0.5 font-bold"
                        style={{ background: item.bestPromo.storeColor }}
                      >
                        {item.bestPromo.storeName}
                      </span>
                    </p>
                    <p className={`text-[11px] font-semibold mt-0.5 ${item.bestPromo.meetsTarget ? 'text-lime-700' : 'text-zinc-500'}`}>
                      {item.bestPromo.meetsTarget
                        ? '🎯 Below your target — grab it now!'
                        : 'On special, but not at your target price yet'}{' '}
                      • {endDateLabel(item.bestPromo.endDate)}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs italic text-zinc-500 mt-1">
                    Not on promotion yet.
                    {item.normalFrom != null && (
                      <span className="not-italic text-zinc-400">
                        {' '}
                        Normal price from {formatZAR(item.normalFrom)}.
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* Target price + preferred stores */}
            <div className="mt-3 pt-3 border-t border-zinc-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-400 flex items-center gap-1" htmlFor={`target-${item.id}`}>
                  <Target className="h-3 w-3" /> Notify me below
                </label>
                <Input
                  id={`target-${item.id}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 50.00"
                  defaultValue={item.targetPrice ?? ''}
                  onBlur={(e) => setTarget(item, e.target.value)}
                  className="h-9 mt-1 text-sm"
                />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400 flex items-center gap-1">
                  <Store className="h-3 w-3" /> Preferred stores
                </p>
                <div className="flex gap-1 flex-wrap mt-1.5">
                  {stores.map((s) => {
                    const on = (item.preferredStoreIds || []).includes(s.id)
                    return (
                      <button
                        key={s.id}
                        onClick={() => togglePreferredStore(item, s.id)}
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold border transition min-h-[24px] ${
                          on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-zinc-500 border-zinc-200'
                        }`}
                        aria-pressed={on}
                      >
                        {s.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-zinc-400 text-center mt-5 leading-relaxed">{DISCLAIMER_PRICES}</p>
    </div>
  )
}
