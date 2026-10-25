'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { apiGet, apiPatch, apiDelete } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { formatZAR, discountPct } from '@/lib/format'
import { ProductTile } from '@/components/shared/product-tile'
import { Button } from '@/components/ui/button'
import { ArrowRight, BarChart3, Minus, Plus, Trash2, Pencil, Edit3 } from 'lucide-react'

type ListItemT = {
  id: string
  productId: string | null
  name: string
  unit: string | null
  categoryIcon: string
  quantity: number
  source: string
  manualPrice: number | null
  lowestPrice: number | null
  lowestStoreName: string | null
  promo: { promoPrice: number; normalPrice: number; storeName: string; storeColor: string } | null
  notOnPromo: boolean
}

export function ListDetailView() {
  const activeListId = useApp((s) => s.activeListId)
  const activeListName = useApp((s) => s.activeListName)
  const go = useApp((s) => s.go)
  const openCompare = useApp((s) => s.openCompare)
  const [items, setItems] = useState<ListItemT[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeListId) return
    apiGet<{ items: ListItemT[] }>(`/api/lists/${activeListId}`)
      .then((d) => setItems(d.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [activeListId])

  const changeQty = async (item: ListItemT, delta: number) => {
    const q = Math.max(1, item.quantity + delta)
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity: q } : i)))
    if (!activeListId) return
    try {
      await apiPatch(`/api/lists/${activeListId}/items`, { itemId: item.id, quantity: q })
    } catch {
      toast({ title: 'Could not update quantity', variant: 'destructive' })
    }
  }

  const removeItem = async (item: ListItemT) => {
    if (!activeListId) return
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    try {
      await apiDelete(`/api/lists/${activeListId}/items?itemId=${item.id}`)
    } catch {
      toast({ title: 'Could not remove item', variant: 'destructive' })
    }
  }

  if (!activeListId) {
    return (
      <div className="px-4 pt-10 max-w-xl mx-auto text-center text-zinc-400">
        <p className="text-4xl mb-3">📋</p>
        <p className="text-sm">Open a list from “My Lists” first.</p>
        <Button onClick={() => go('lists')} className="mt-4 bg-blue-600 hover:bg-blue-700">
          Go to My Lists
        </Button>
      </div>
    )
  }

  const totalUnits = items.reduce((a, i) => a + i.quantity, 0)
  const promoCount = items.filter((i) => i.promo).length

  return (
    <div className="px-4 pt-4 max-w-xl mx-auto pb-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-900 flex items-center gap-2">
            <Pencil className="h-5 w-5 text-blue-600" /> {activeListName || 'List'}
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            {items.length} products • {totalUnits} units • {promoCount} on promotion
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-blue-300 text-blue-700 hover:bg-blue-50 shrink-0"
          onClick={() => go('create')}
        >
          <Edit3 className="h-4 w-4 mr-1" /> Add items
        </Button>
      </div>

      <div className="space-y-2 mt-4">
        {loading && <p className="text-sm text-zinc-400 text-center py-8">Loading list…</p>}
        {!loading && items.length === 0 && (
          <div className="text-center py-12 text-zinc-400">
            <p className="text-3xl mb-2">🛒</p>
            <p className="text-sm">This list is empty. Add some products!</p>
            <Button onClick={() => go('create')} className="mt-4 bg-blue-600 hover:bg-blue-700">
              Add products
            </Button>
          </div>
        )}
        {items.map((item) => (
          <div key={item.id} className="bg-white rounded-2xl border border-zinc-100 p-3 flex items-center gap-3 shadow-sm">
            <ProductTile icon={item.categoryIcon} size="sm" alt={item.name} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-zinc-900 truncate">{item.name}</p>
              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                {item.unit && <span className="text-[10px] text-zinc-400">{item.unit}</span>}
                {item.promo ? (
                  <span
                    className="text-[9px] text-white rounded px-1.5 py-0.5 font-bold"
                    style={{ background: item.promo.storeColor }}
                  >
                    {discountPct(item.promo.promoPrice, item.promo.normalPrice)}% off at {item.promo.storeName}
                  </span>
                ) : item.notOnPromo ? (
                  <span className="text-[9px] italic text-zinc-400">Not on promotion.</span>
                ) : item.source === 'manual' ? (
                  <span className="text-[9px] text-zinc-400">user-entered price</span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => changeQty(item, -1)} className="h-8 w-8 rounded-lg bg-zinc-100 flex items-center justify-center active:scale-90" aria-label={`Decrease ${item.name}`}>
                <Minus className="h-4 w-4 text-zinc-600" />
              </button>
              <span className="w-6 text-center font-bold text-sm">{item.quantity}</span>
              <button onClick={() => changeQty(item, 1)} className="h-8 w-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center active:scale-90" aria-label={`Increase ${item.name}`}>
                <Plus className="h-4 w-4" />
              </button>
              <button onClick={() => removeItem(item)} className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-300 hover:text-red-500 ml-1" aria-label={`Remove ${item.name}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <Button
          onClick={() => openCompare(activeListId, activeListName)}
          className="w-full mt-5 h-13 bg-blue-600 hover:bg-blue-700 font-bold text-base py-6"
        >
          <BarChart3 className="h-5 w-5 mr-2" /> Compare stores & find savings <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      )}
    </div>
  )
}
