'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { useApp } from '@/lib/store'
import { formatZAR, discountPct, endDateLabel, isEndingSoon } from '@/lib/format'
import { ProductTile } from '@/components/shared/product-tile'
import { AddToListDialog } from '@/components/shared/add-to-list-dialog'
import { Input } from '@/components/ui/input'
import { Search, Heart, Plus, Filter } from 'lucide-react'

type PromoCard = {
  id: string
  productId: string
  name: string
  unit: string | null
  category: { id: string; name: string; icon: string }
  storeId: string
  storeName: string
  storeColor: string
  promoPrice: number
  normalPrice: number
  discount: number
  saved: number
  endDate: string
}

type StoreT = { id: string; name: string; color: string }
type CategoryT = { id: string; name: string; icon: string }

const sorts = [
  { key: 'discount', label: 'Biggest discount' },
  { key: 'price', label: 'Lowest price' },
  { key: 'ending', label: 'Ending soon' },
  { key: 'new', label: 'Newly added' },
] as const

export function SpecialsView() {
  const [promos, setPromos] = useState<PromoCard[]>([])
  const [stores, setStores] = useState<StoreT[]>([])
  const [categories, setCategories] = useState<CategoryT[]>([])
  const [store, setStore] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<string>('discount')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [filterOpen, setFilterOpen] = useState(false)
  const [addTarget, setAddTarget] = useState<{ productId: string; name: string } | null>(null)
  const go = useApp((s) => s.go)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (store) params.set('store', store)
      if (category) params.set('category', category)
      params.set('sort', sort)
      const data = await apiGet<{ promos: PromoCard[] }>(`/api/promos?${params}`)
      setPromos(
        q.trim()
          ? data.promos.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()))
          : data.promos
      )
    } catch {
      setPromos([])
    } finally {
      setLoading(false)
    }
  }, [store, category, sort, q])

  useEffect(() => {
    apiGet<{ stores: StoreT[] }>('/api/stores').then((d) => setStores(d.stores)).catch(() => {})
    apiGet<{ categories: CategoryT[] }>('/api/categories').then((d) => setCategories(d.categories)).catch(() => {})
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const addToWishList = async (productId: string, name: string) => {
    try {
      await apiPost('/api/wishlist', { productId, preferredStoreIds: [] })
      toast({ title: 'Added to Wish List ❤️', description: `We'll watch ${name} for price drops.` })
    } catch (e) {
      toast({ title: 'Could not add', description: (e as Error).message, variant: 'destructive' })
    }
  }

  return (
    <div className="px-4 pt-4 max-w-xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-900">🏷️ Specials & Promotions</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Current deals uploaded by the Grocery Hauls team</p>
        </div>
        <button
          onClick={() => setFilterOpen(!filterOpen)}
          className="h-10 w-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center shrink-0"
          aria-label="Toggle filters"
        >
          <Filter className={`h-4 w-4 ${filterOpen ? 'text-blue-600' : 'text-zinc-500'}`} />
        </button>
      </div>

      <div className="relative mt-3">
        <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter specials by name…"
          className="pl-9 h-11 rounded-xl bg-white"
        />
      </div>

      {filterOpen && (
        <div className="mt-3 space-y-2">
          <select
            value={store}
            onChange={(e) => setStore(e.target.value)}
            className="w-full h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
            aria-label="Filter by store"
          >
            <option value="">All stores</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
          <div className="flex gap-1.5 flex-wrap">
            {sorts.map((s) => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold border min-h-[32px] ${
                  sort === s.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-zinc-600 border-zinc-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2.5 mt-4 pb-4">
        {loading && <p className="text-sm text-zinc-400 text-center py-8">Loading specials…</p>}
        {!loading && promos.length === 0 && (
          <div className="text-center py-12 text-zinc-400">
            <p className="text-3xl mb-2">🏷️</p>
            <p className="text-sm">No specials match your filters right now.</p>
          </div>
        )}
        {promos.map((p) => (
          <div key={p.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
            <div className="flex items-stretch">
              <div
                className="w-1.5 shrink-0"
                style={{ background: p.storeColor }}
                aria-hidden
              />
              <div className="flex-1 p-3 flex gap-3">
                <ProductTile icon={p.category.icon} alt={p.name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-zinc-900 leading-tight">{p.name}</p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        {p.unit ? p.unit + ' • ' : ''}{p.category.name}
                      </p>
                    </div>
                    <span className="shrink-0 bg-lime-600 text-black text-[10px] font-extrabold rounded-full px-2 py-1">
                      {p.discount}% OFF
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-1.5">
                    <span className="text-lg font-extrabold text-lime-700">{formatZAR(p.promoPrice)}</span>
                    <span className="text-xs line-through text-zinc-400">{formatZAR(p.normalPrice)}</span>
                    <span className="text-[10px] font-bold text-lime-600">Save {formatZAR(p.saved)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 gap-2">
                    <span
                      className="text-[10px] text-white rounded px-1.5 py-0.5 font-bold"
                      style={{ background: p.storeColor }}
                    >
                      {p.storeName}
                    </span>
                    <span
                      className={`text-[10px] font-semibold ${
                        isEndingSoon(p.endDate) ? 'text-red-600' : 'text-zinc-400'
                      }`}
                    >
                      {endDateLabel(p.endDate)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 border-t border-zinc-100">
              <button
                onClick={() => setAddTarget({ productId: p.productId, name: p.name })}
                className="flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 transition min-h-[44px]"
              >
                <Plus className="h-4 w-4" /> Add to List
              </button>
              <button
                onClick={() => addToWishList(p.productId, p.name)}
                className="flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-sky-700 hover:bg-sky-50 border-l border-zinc-100 transition min-h-[44px]"
              >
                <Heart className="h-4 w-4" /> Add to Wish List
              </button>
            </div>
          </div>
        ))}
      </div>

      {addTarget && (
        <AddToListDialog
          open={Boolean(addTarget)}
          onOpenChange={(v) => !v && setAddTarget(null)}
          productId={addTarget.productId}
          productName={addTarget.name}
          onAddedToWishList={() => addToWishList(addTarget.productId, addTarget.name)}
        />
      )}
    </div>
  )
}
