'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '@/lib/store'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { formatZAR, discountPct, DISCLAIMER_MANUAL } from '@/lib/format'
import { ProductTile } from '@/components/shared/product-tile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Search, Plus, Minus, Trash2, Store, Globe, ShoppingBasket, ArrowRight, FilePlus, Check,
} from 'lucide-react'

type StoreT = { id: string; name: string; color: string; emoji: string }
type CategoryT = { id: string; name: string; icon: string }
type ProductResult = {
  id: string
  name: string
  unit: string | null
  category: { name: string; icon: string }
  inPromo: boolean
  promo: { promoPrice: number; normalPrice: number; storeName: string; storeColor: string } | null
  price: number | null
  lowestStoreName: string | null
}
type ListItemT = {
  id: string
  productId: string | null
  name: string
  unit: string | null
  categoryIcon: string
  quantity: number
  source: string
  manualStoreId: string | null
  manualPrice: number | null
  lowestPrice: number | null
  lowestStoreName: string | null
  promo: { promoPrice: number; normalPrice: number; storeName: string; storeColor: string } | null
  notOnPromo: boolean
}
type LookupSuggestion = { title: string; snippet: string; url: string; price: number | null }

export function CreateListView() {
  const activeListId = useApp((s) => s.activeListId)
  const preAddPromoIds = useApp((s) => s.preAddPromoIds)
  const setPreAdd = useApp((s) => s.setPreAddPromoIds)
  const openCompare = useApp((s) => s.openCompare)

  const [listId, setListId] = useState<string | null>(activeListId)
  const [listName, setListName] = useState('')
  const [items, setItems] = useState<ListItemT[]>([])
  const [stores, setStores] = useState<StoreT[]>([])
  const [categories, setCategories] = useState<CategoryT[]>([])

  const [search, setSearch] = useState('')
  const [results, setResults] = useState<ProductResult[]>([])
  const [searching, setSearching] = useState(false)
  const [activeCat, setActiveCat] = useState<string | null>(null)

  const [storeSheetOpen, setStoreSheetOpen] = useState(false)
  const [selectedStores, setSelectedStores] = useState<string[]>([])
  const [manualOpen, setManualOpen] = useState(false)
  const [manualStore, setManualStore] = useState<string>('')
  const [manualSearch, setManualSearch] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualPrice, setManualPrice] = useState('')
  const [lookup, setLookup] = useState<LookupSuggestion[] | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const manualSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadList = useCallback(async (id: string) => {
    try {
      const data = await apiGet<{ list: { name: string }; items: ListItemT[] }>(`/api/lists/${id}`)
      setListName(data.list.name)
      setItems(data.items)
    } catch {
      /* list may have been deleted */
    }
  }, [])

  // Boot: stores, categories, handle pre-add promo products
  useEffect(() => {
    apiGet<{ stores: StoreT[] }>('/api/stores')
      .then((d) => {
        setStores(d.stores)
        setSelectedStores(d.stores.map((s) => s.id))
      })
      .catch(() => {})
    apiGet<{ categories: CategoryT[] }>('/api/categories')
      .then((d) => setCategories(d.categories))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (listId) loadList(listId)
  }, [listId, loadList])

  // Auto-create list when arriving with promo products to pre-add
  useEffect(() => {
    const boot = async () => {
      if (preAddPromoIds.length > 0 && !listId) {
        try {
          const { list } = await apiPost<{ list: { id: string } }>('/api/lists', { name: 'New List' })
          for (const pid of preAddPromoIds) {
            await apiPost(`/api/lists/${list.id}/items`, { productId: pid, quantity: 1, source: 'promo' })
          }
          setPreAdd([])
          setListId(list.id)
        } catch (e) {
          toast({ title: 'Could not start list', description: (e as Error).message, variant: 'destructive' })
        }
      }
    }
    boot()
  }, [preAddPromoIds, listId, setPreAdd])

  // Search with debounce; category browse
  useEffect(() => {
    if (manualSearchTimer.current) clearTimeout(manualSearchTimer.current)
    manualSearchTimer.current = setTimeout(async () => {
      if (!search.trim() && !activeCat) {
        setResults([])
        return
      }
      setSearching(true)
      try {
        const params = new URLSearchParams()
        if (search.trim()) params.set('q', search.trim())
        if (activeCat) params.set('categoryId', activeCat)
        const data = await apiGet<{ results: ProductResult[] }>(`/api/products?${params}`)
        setResults(data.results)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => {
      if (manualSearchTimer.current) clearTimeout(manualSearchTimer.current)
    }
  }, [search, activeCat])

  const ensureList = async (): Promise<string | null> => {
    if (listId) return listId
    const name = listName.trim() || 'My Grocery List'
    try {
      const { list } = await apiPost<{ list: { id: string; name: string } }>('/api/lists', { name })
      setListId(list.id)
      setListName(list.name)
      return list.id
    } catch (e) {
      toast({ title: 'Could not create list', description: (e as Error).message, variant: 'destructive' })
      return null
    }
  }

  const addProduct = async (p: ProductResult) => {
    const id = await ensureList()
    if (!id) return
    try {
      const { merged } = await apiPost<{ merged?: boolean }>(`/api/lists/${id}/items`, { productId: p.id, quantity: 1 })
      toast({ title: merged ? 'Quantity increased' : 'Added to list 🛒', description: p.name })
      await loadList(id)
    } catch (e) {
      toast({ title: 'Could not add', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const addManual = async () => {
    const price = parseFloat(manualPrice)
    if (!manualName.trim()) {
      toast({ title: 'Enter the product name', variant: 'destructive' })
      return
    }
    if (Number.isNaN(price) || price <= 0) {
      toast({ title: 'Enter the shelf price', description: 'Check the price tag in-store.', variant: 'destructive' })
      return
    }
    const id = await ensureList()
    if (!id) return
    try {
      await apiPost(`/api/lists/${id}/items`, {
        name: manualName.trim(),
        price,
        storeId: manualStore || null,
        source: 'manual',
      })
      toast({ title: 'Added to list 🛒', description: manualName.trim() })
      setManualOpen(false)
      setManualName('')
      setManualPrice('')
      setManualSearch('')
      setLookup(null)
      await loadList(id)
    } catch (e) {
      toast({ title: 'Could not add', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const changeQty = async (item: ListItemT, delta: number) => {
    const q = Math.max(1, item.quantity + delta)
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity: q } : i)))
    if (!listId) return
    try {
      await apiPatch(`/api/lists/${listId}/items`, { itemId: item.id, quantity: q })
    } catch {
      await loadList(listId)
    }
  }

  const removeItem = async (item: ListItemT) => {
    if (!listId) return
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    try {
      await apiDelete(`/api/lists/${listId}/items?itemId=${item.id}`)
    } catch {
      await loadList(listId)
    }
  }

  const renameList = async (name: string) => {
    setListName(name)
    if (listId && name.trim()) {
      await apiPatch(`/api/lists/${listId}`, { name: name.trim() }).catch(() => {})
    }
  }

  const runLookup = async () => {
    if (!manualName.trim() || manualName.trim().length < 3) return
    setLookupLoading(true)
    try {
      const data = await apiGet<{ suggestions: LookupSuggestion[] }>(
        `/api/lookup?q=${encodeURIComponent(manualName.trim())}`
      )
      setLookup(data.suggestions)
    } catch {
      setLookup([])
    } finally {
      setLookupLoading(false)
    }
  }

  const totalItems = items.reduce((a, i) => a + i.quantity, 0)

  const openStoreSelection = () => {
    if (items.length === 0) {
      toast({ title: 'Your list is empty', description: 'Add a few products first.', variant: 'destructive' })
      return
    }
    setStoreSheetOpen(true)
  }

  const goCompare = () => {
    if (!listId) return
    // remember chosen stores for the compare view
    try {
      sessionStorage.setItem('gh_compare_stores', JSON.stringify(selectedStores))
    } catch {
      /* ignore */
    }
    setStoreSheetOpen(false)
    openCompare(listId, listName || 'My Grocery List')
  }

  // web-sourced suggestions filtered by the user's search term
  const showManualAddHint =
    search.trim().length >= 2 && !searching && results.length === 0 && !activeCat

  return (
    <div className="px-4 pt-4 max-w-xl mx-auto">
      {/* List name */}
      <div className="flex items-center gap-2">
        <Input
          value={listName}
          onChange={(e) => renameList(e.target.value)}
          placeholder="List name, e.g. Monthly Groceries"
          className="h-12 text-base font-semibold"
          aria-label="List name"
        />
        <Button
          onClick={openStoreSelection}
          className="bg-blue-600 hover:bg-blue-700 h-12 px-4 shrink-0 font-semibold"
        >
          Compare <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
      <p className="text-xs text-zinc-400 mt-1.5">
        {items.length === 0
          ? 'Search or browse categories to add products.'
          : `${items.length} product${items.length > 1 ? 's' : ''} • ${totalItems} unit${totalItems > 1 ? 's' : ''} on the list`}
      </p>

      {/* Current items */}
      {items.length > 0 && (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-2xl border border-zinc-100 p-3 flex items-center gap-3 shadow-sm">
              <ProductTile icon={item.categoryIcon} size="sm" alt={item.name} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-zinc-900 truncate">{item.name}</p>
                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                  {item.unit && <span className="text-[10px] text-zinc-400">{item.unit}</span>}
                  {item.source === 'manual' && (
                    <span className="text-[9px] bg-zinc-100 text-zinc-500 rounded px-1 py-0.5 font-medium">
                      user-entered
                    </span>
                  )}
                  {item.promo ? (
                    <span
                      className="text-[9px] text-white rounded px-1.5 py-0.5 font-bold"
                      style={{ background: item.promo.storeColor }}
                    >
                      {discountPct(item.promo.promoPrice, item.promo.normalPrice)}% off at {item.promo.storeName}
                    </span>
                  ) : item.lowestPrice != null ? (
                    <span className="text-[9px] text-zinc-500">
                      {formatZAR(item.lowestPrice)} from {item.lowestStoreName} • not on promotion
                    </span>
                  ) : (
                    <span className="text-[9px] text-zinc-500">manual item — {formatZAR(item.manualPrice ?? 0)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => changeQty(item, -1)}
                  className="h-8 w-8 rounded-lg bg-zinc-100 flex items-center justify-center active:scale-90"
                  aria-label={`Decrease quantity of ${item.name}`}
                >
                  <Minus className="h-4 w-4 text-zinc-600" />
                </button>
                <span className="w-6 text-center font-bold text-sm">{item.quantity}</span>
                <button
                  onClick={() => changeQty(item, 1)}
                  className="h-8 w-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center active:scale-90"
                  aria-label={`Increase quantity of ${item.name}`}
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => removeItem(item)}
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-300 hover:text-red-500 ml-1"
                  aria-label={`Remove ${item.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="sticky top-[60px] z-20 bg-sky-50 pt-3 pb-2 mt-4">
        <div className="relative">
          <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setActiveCat(null)
            }}
            placeholder="Search products — promo items show first"
            className="pl-9 h-11 rounded-xl bg-white"
            aria-label="Search products"
          />
        </div>
        {/* Quick-add categories */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 mt-2 -mx-1 px-1" role="listbox" aria-label="Quick-add categories">
          <button
            onClick={() => {
              setActiveCat(null)
              setSearch('')
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border transition min-h-[32px] ${
              !activeCat && !search ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-zinc-600 border-zinc-200'
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setActiveCat(c.id)
                setSearch('')
              }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border transition min-h-[32px] ${
                activeCat === c.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-zinc-600 border-zinc-200'
              }`}
            >
              {c.icon} {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="space-y-2 mt-2">
        {searching && <p className="text-sm text-zinc-400 text-center py-4">Searching…</p>}
        {results.map((p) => (
          <button
            key={p.id}
            onClick={() => addProduct(p)}
            className="w-full bg-white rounded-2xl border border-zinc-100 p-3 flex items-center gap-3 text-left shadow-sm active:scale-[0.99] hover:border-blue-300 transition"
          >
            <ProductTile icon={p.category.icon} alt={p.name} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-zinc-900">{p.name}</p>
              <p className="text-[11px] text-zinc-400">
                {p.unit ? p.unit + ' • ' : ''}
                {p.category.name}
              </p>
              {p.inPromo && p.promo ? (
                <p className="text-xs mt-1">
                  <span className="font-extrabold text-lime-700">{formatZAR(p.promo.promoPrice)}</span>{' '}
                  <span className="line-through text-zinc-400 text-[11px]">{formatZAR(p.promo.normalPrice)}</span>{' '}
                  <span
                    className="text-[9px] text-white rounded px-1.5 py-0.5 font-bold"
                    style={{ background: p.promo.storeColor }}
                  >
                    {p.promo.storeName}
                  </span>
                </p>
              ) : (
                <p className="text-xs mt-1 text-zinc-500">
                  from {formatZAR(p.price ?? 0)} at {p.lowestStoreName} • <span className="italic">Not on promotion.</span>
                </p>
              )}
            </div>
            <span className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Plus className="h-5 w-5" />
            </span>
          </button>
        ))}

        {showManualAddHint && (
          <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
            <p className="text-sm font-semibold text-sky-900">
              No catalogue match for “{search.trim()}”
            </p>
            <p className="text-xs text-sky-700 mt-1 leading-relaxed">
              You can still add it! Choose the store, then enter the name and the shelf price from
              the price tag. We&apos;ll also try to find it on the web for you.
            </p>
            <Button
              className="mt-3 bg-blue-600 hover:bg-blue-700 text-white w-full font-semibold"
              onClick={() => {
                setManualName(search.trim())
                setManualSearch(search.trim())
                setManualOpen(true)
              }}
            >
              <FilePlus className="h-4 w-4 mr-1" /> Add manually
            </Button>
          </div>
        )}

        {!search && !activeCat && results.length === 0 && !searching && (
          <button
            onClick={() => setManualOpen(true)}
            className="w-full border-2 border-dashed border-zinc-200 rounded-2xl p-4 text-sm text-zinc-500 hover:border-blue-300 hover:text-blue-600 transition flex items-center justify-center gap-2 min-h-[56px]"
          >
            <Plus className="h-4 w-4" /> Can&apos;t find a product? Add it manually
          </button>
        )}
      </div>

      {/* Store selection sheet */}
      <Sheet open={storeSheetOpen} onOpenChange={setStoreSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh]">
          <SheetHeader>
            <SheetTitle className="text-left flex items-center gap-2">
              <Store className="h-5 w-5 text-blue-600" /> Choose your stores
            </SheetTitle>
            <SheetDescription className="text-left">
              We&apos;ll compare your basket at these stores and find the cheapest option — or split
              your shopping between two stores.
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="max-h-[40vh] mt-2">
            <div className="space-y-1.5 px-1">
              {stores.map((s) => {
                const checked = selectedStores.includes(s.id)
                return (
                  <button
                    key={s.id}
                    onClick={() =>
                      setSelectedStores((prev) =>
                        prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]
                      )
                    }
                    className={`w-full flex items-center justify-between rounded-xl border px-3 py-3 text-left transition min-h-[48px] ${
                      checked ? 'border-blue-400 bg-blue-50' : 'border-zinc-200 bg-white'
                    }`}
                    aria-pressed={checked}
                  >
                    <span className="flex items-center gap-2.5 font-semibold text-sm text-zinc-700">
                      <span
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-extrabold"
                        style={{ background: s.color }}
                      >
                        {s.name.slice(0, 2)}
                      </span>
                      {s.name}
                    </span>
                    <span
                      className={`h-5 w-5 rounded-md border flex items-center justify-center ${
                        checked ? 'bg-blue-600 border-blue-600' : 'border-zinc-300'
                      }`}
                    >
                      {checked && <Check className="h-3.5 w-3.5 text-white" />}
                    </span>
                  </button>
                )
              })}
            </div>
          </ScrollArea>
          <Button
            onClick={goCompare}
            disabled={selectedStores.length < 1}
            className="w-full mt-3 mb-4 h-12 bg-blue-600 hover:bg-blue-700 font-bold text-base"
          >
            <ShoppingBasket className="h-5 w-5 mr-2" /> Compare basket prices ({selectedStores.length} store
            {selectedStores.length > 1 ? 's' : ''})
          </Button>
        </SheetContent>
      </Sheet>

      {/* Manual add dialog */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-sm rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-left">Add a product manually</DialogTitle>
            <DialogDescription className="text-left">
              Step 1: choose the store where you saw it. Step 2: enter the name and shelf price.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-zinc-500" htmlFor="manual-store">
                Store
              </label>
              <select
                id="manual-store"
                value={manualStore}
                onChange={(e) => setManualStore(e.target.value)}
                className="w-full h-11 mt-1 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
              >
                <option value="">Choose a store…</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500" htmlFor="manual-name">
                Product name
              </label>
              <Input
                id="manual-name"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="e.g. Jungle Oats 1kg"
                className="h-11 mt-1"
              />
            </div>
            <Button
              variant="outline"
              onClick={runLookup}
              disabled={lookupLoading || manualName.trim().length < 3}
              className="w-full h-10 border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              <Globe className="h-4 w-4 mr-1.5" />
              {lookupLoading ? 'Searching the web…' : 'Find price on the web (Google Search)'}
            </Button>
            {lookup && (
              <div className="space-y-1.5">
                {lookup.length === 0 && (
                  <p className="text-xs text-zinc-400">No web results found — enter the price manually.</p>
                )}
                {lookup.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (s.price != null) setManualPrice(String(s.price))
                    }}
                    className="w-full text-left rounded-lg border border-zinc-200 p-2 hover:border-blue-300 transition"
                  >
                    <p className="text-xs font-semibold text-zinc-700 line-clamp-1">{s.title}</p>
                    <p className="text-[11px] text-zinc-400 line-clamp-2">{s.snippet}</p>
                    {s.price != null && (
                      <p className="text-[11px] text-lime-700 font-bold mt-0.5">
                        Possible price: {formatZAR(s.price)} — tap to use
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-zinc-500" htmlFor="manual-price">
                Shelf price (ZAR)
              </label>
              <Input
                id="manual-price"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
                placeholder="e.g. 44.99"
                className="h-11 mt-1"
              />
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">{DISCLAIMER_MANUAL}</p>
            <Button onClick={addManual} className="w-full h-11 bg-blue-600 hover:bg-blue-700 font-semibold">
              Add to list
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
