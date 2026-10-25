'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '@/lib/store'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { formatZAR, DISCLAIMER_PRICES, NOT_ON_PROMO } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  ScanLine, Camera, CheckCircle2, Minus, Plus, Trash2, ShoppingBasket, PiggyBank, ListChecks, Keyboard,
} from 'lucide-react'

type StoreT = { id: string; name: string; color: string; emoji: string }
type ListSummary = { id: string; name: string; itemCount: number }
type SessionItem = {
  id: string
  productId: string | null
  name: string
  price: number
  promoPrice: number | null
  quantity: number
  bought: boolean
  source: string
}
type SessionData = {
  session: {
    id: string
    status: string
    store: { id: string; name: string; color: string; emoji: string }
    listId: string | null
    listName: string | null
  }
  items: SessionItem[]
  summary: {
    itemsScanned: number
    itemsInBasket: number
    itemsBought: number
    listTotal: number | null
    listRemaining: number | null
    subtotal: number
    promoSavings: number
    estimatedTotal: number
  }
}

// Lazy-load the barcode reader only when the camera opens
async function getBarcodeReader() {
  const { BrowserMultiFormatReader } = await import('@zxing/library')
  return new BrowserMultiFormatReader()
}

export function ShopModeView() {
  const go = useApp((s) => s.go)
  const [stores, setStores] = useState<StoreT[]>([])
  const [lists, setLists] = useState<ListSummary[]>([])
  const [storeId, setStoreId] = useState('')
  const [listId, setListId] = useState('')
  const [session, setSession] = useState<SessionData | null>(null)
  const [scanning, setScanning] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualPrice, setManualPrice] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const readerRef = useRef<{ reset: () => void } | null>(null)

  useEffect(() => {
    apiGet<{ stores: StoreT[] }>('/api/stores').then((d) => setStores(d.stores)).catch(() => {})
    apiGet<{ lists: ListSummary[] }>('/api/lists').then((d) => setLists(d.lists)).catch(() => {})
  }, [])

  const refresh = useCallback(async (id: string) => {
    try {
      const data = await apiGet<SessionData>(`/api/shop/sessions/${id}`)
      setSession(data)
    } catch {
      /* ignore */
    }
  }, [])

  const startSession = async () => {
    if (!storeId) {
      toast({ title: 'Choose the store you are shopping at', variant: 'destructive' })
      return
    }
    try {
      const data = await apiPost<{ session: { id: string } }>('/api/shop/sessions', {
        storeId,
        listId: listId || undefined,
      })
      await refresh(data.session.id)
      toast({ title: 'Shop Mode started 📡', description: 'Scan products as you shop!' })
    } catch (e) {
      toast({ title: 'Could not start', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const stopScanning = useCallback(() => {
    if (readerRef.current) {
      try {
        readerRef.current.reset()
      } catch { /* ignore */ }
      readerRef.current = null
    }
    setScanning(false)
  }, [])

  const handleScanResult = useCallback(
    async (barcode: string) => {
      if (!session) return
      stopScanning()
      try {
        const res = await apiPost<{ onPromo: boolean; message?: string; item: { name: string } }>(
          `/api/shop/sessions/${session.session.id}/items`,
          { barcode, source: 'scan' }
        )
        toast({
          title: `Scanned: ${res.item.name}`,
          description: res.onPromo ? '🏷️ On promotion — saving!' : res.message || NOT_ON_PROMO,
        })
        await refresh(session.session.id)
      } catch (e) {
        // Unknown barcode — offer manual entry
        toast({
          title: 'Barcode not recognised',
          description: `${(e as Error).message} — enter the product manually instead.`,
          variant: 'destructive',
        })
        setManualName('')
        setManualOpen(true)
      }
    },
    [session, refresh, stopScanning]
  )

  const openCamera = async () => {
    setScanning(true)
    try {
      const reader = await getBarcodeReader()
      readerRef.current = reader
      if (videoRef.current) {
        await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result) {
            const text = result.getText()
            if (text) handleScanResult(text)
          }
        })
      }
    } catch (e) {
      toast({
        title: 'Camera not available',
        description: (e as Error).message || 'Allow camera access, or add products manually below.',
        variant: 'destructive',
      })
      stopScanning()
    }
  }

  useEffect(() => () => stopScanning(), [stopScanning])

  const addManual = async () => {
    if (!session) return
    try {
      await apiPost(`/api/shop/sessions/${session.session.id}/items`, {
        name: manualName.trim(),
        price: manualPrice ? Number(manualPrice) : undefined,
        source: 'manual',
      })
      toast({ title: 'Added to basket 🧺', description: manualName.trim() })
      setManualOpen(false)
      setManualName('')
      setManualPrice('')
      await refresh(session.session.id)
    } catch (e) {
      toast({ title: 'Could not add', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const updateItem = async (item: SessionItem, patch: Partial<{ quantity: number; bought: boolean; price: number }>) => {
    if (!session) return
    try {
      await apiPatch(`/api/shop/sessions/${session.session.id}/items`, { itemId: item.id, ...patch })
      await refresh(session.session.id)
    } catch {
      await refresh(session.session.id)
    }
  }

  const removeItem = async (item: SessionItem) => {
    if (!session) return
    try {
      await apiDelete(`/api/shop/sessions/${session.session.id}/items?itemId=${item.id}`)
      await refresh(session.session.id)
    } catch {
      /* ignore */
    }
  }

  const endSession = async () => {
    if (!session) return
    await apiPatch(`/api/shop/sessions/${session.session.id}`, { status: 'completed' }).catch(() => {})
    toast({
      title: 'Shopping done! 🎉',
      description: `Basket total ${formatZAR(session.summary.estimatedTotal)} • saved ${formatZAR(session.summary.promoSavings)}`,
    })
    setSession(null)
  }

  // ---------- No session yet: start screen ----------
  if (!session) {
    return (
      <div className="px-4 pt-4 max-w-xl mx-auto pb-4">
        <div className="rounded-3xl bg-gradient-to-br from-zinc-900 to-sky-700 text-white p-6 text-center">
          <ScanLine className="h-10 w-10 mx-auto" />
          <h1 className="text-2xl font-extrabold mt-2">Shop Mode</h1>
          <p className="text-sm text-sky-300 mt-1 leading-relaxed">
            Scan barcodes with your camera while you shop. See live promo savings and a running total —
            never guess your budget again.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 mt-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-zinc-500" htmlFor="shop-store">
              Which store are you in?
            </label>
            <select
              id="shop-store"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full h-12 mt-1 rounded-lg border border-zinc-200 bg-white px-3 text-base"
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
            <label className="text-xs font-semibold text-zinc-500" htmlFor="shop-list">
              Load a saved list (optional)
            </label>
            <select
              id="shop-list"
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              className="w-full h-12 mt-1 rounded-lg border border-zinc-200 bg-white px-3 text-base"
            >
              <option value="">No list — just scanning</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.itemCount} products)
                </option>
              ))}
            </select>
          </div>
          <Button onClick={startSession} className="w-full h-13 bg-blue-600 hover:bg-blue-700 font-bold text-base py-6">
            Start shopping →
          </Button>
          <p className="text-[10px] text-zinc-400 text-center leading-relaxed">{DISCLAIMER_PRICES}</p>
        </div>
      </div>
    )
  }

  // ---------- Active session ----------
  const { summary, items, session: s } = session

  return (
    <div className="pb-40">
      {/* Store header */}
      <div className="px-4 pt-3 max-w-xl mx-auto">
        <div className="rounded-2xl p-3.5 text-white flex items-center justify-between" style={{ background: s.store.color }}>
          <div className="flex items-center gap-2.5">
            <span className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center text-lg">
              {s.store.emoji}
            </span>
            <div>
              <p className="font-extrabold text-sm leading-tight">{s.store.name}</p>
              {s.listName && <p className="text-[11px] text-white/80">List: {s.listName}</p>}
            </div>
          </div>
          <Button variant="outline" size="sm" className="bg-white/15 border-white/40 text-white hover:bg-white/25" onClick={endSession}>
            Finish
          </Button>
        </div>

        {/* Scanner controls */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          {scanning ? (
            <Button onClick={stopScanning} variant="outline" className="h-12 border-red-300 text-red-600 hover:bg-red-50 font-semibold">
              Stop camera
            </Button>
          ) : (
            <Button onClick={openCamera} className="h-12 bg-blue-600 hover:bg-blue-700 font-bold">
              <Camera className="h-5 w-5 mr-1.5" /> Scan barcode
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setManualOpen(true)}
            className="h-12 border-zinc-300 text-zinc-700 hover:bg-zinc-50 font-semibold"
          >
            <Keyboard className="h-5 w-5 mr-1.5" /> Add manually
          </Button>
        </div>

        {scanning && (
          <div className="mt-3 rounded-2xl overflow-hidden border-2 border-sky-400 bg-black relative">
            <video ref={videoRef} className="w-full h-56 object-cover" muted playsInline aria-label="Barcode scanner camera" />
            <div className="absolute inset-x-8 top-1/2 h-0.5 bg-red-500/80 animate-pulse" />
            <p className="absolute bottom-2 inset-x-0 text-center text-xs text-white/80">
              Point the camera at the product barcode
            </p>
          </div>
        )}

        {/* List progress */}
        {summary.listTotal != null && summary.listTotal > 0 && (
          <div className="mt-3 rounded-2xl bg-sky-50 border border-sky-200 p-3 flex items-center gap-2.5">
            <ListChecks className="h-5 w-5 text-blue-600 shrink-0" />
            <p className="text-sm text-sky-900">
              <span className="font-extrabold">{summary.listRemaining ?? 0}</span> item
              {(summary.listRemaining ?? 0) !== 1 ? 's' : ''} remaining on “{s.listName}” •{' '}
              {summary.itemsBought} marked as bought
            </p>
          </div>
        )}

        {/* Basket items */}
        <div className="space-y-2 mt-3">
          {items.length === 0 && (
            <div className="text-center py-8 text-zinc-400 bg-white rounded-2xl border border-dashed border-zinc-200">
              <p className="text-3xl mb-2">🧺</p>
              <p className="text-sm">Basket is empty — scan your first product!</p>
            </div>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              className={`bg-white rounded-2xl border p-3 flex items-center gap-2.5 ${
                item.bought ? 'border-blue-300 bg-blue-50/50' : 'border-zinc-100'
              }`}
            >
              <button
                onClick={() => updateItem(item, { bought: !item.bought })}
                className={`h-7 w-7 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
                  item.bought ? 'bg-blue-500 border-blue-500 text-white' : 'border-zinc-300 text-transparent'
                }`}
                aria-label={item.bought ? `Mark ${item.name} as not bought` : `Mark ${item.name} as bought`}
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${item.bought ? 'line-through text-zinc-400' : 'text-zinc-900'}`}>
                  {item.name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {item.source === 'list' && (
                    <span className="text-[9px] bg-sky-100 text-sky-700 rounded px-1 py-0.5 font-bold">LIST</span>
                  )}
                  {item.promoPrice != null ? (
                    <span className="text-[9px] bg-lime-100 text-lime-800 rounded px-1 py-0.5 font-bold">
                      PROMO — saving {formatZAR(Math.max(0, item.price - item.promoPrice))}
                    </span>
                  ) : (
                    <span className="text-[9px] italic text-zinc-400">{NOT_ON_PROMO}</span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-extrabold text-zinc-900">
                  {formatZAR(item.price * item.quantity)}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <button
                    onClick={() => updateItem(item, { quantity: item.quantity - 1 })}
                    className="h-6 w-6 rounded bg-zinc-100 flex items-center justify-center"
                    aria-label={`Decrease ${item.name}`}
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-5 text-center text-xs font-bold">{item.quantity}</span>
                  <button
                    onClick={() => updateItem(item, { quantity: item.quantity + 1 })}
                    className="h-6 w-6 rounded bg-zinc-100 flex items-center justify-center"
                    aria-label={`Increase ${item.name}`}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => removeItem(item)}
                    className="h-6 w-6 rounded flex items-center justify-center text-zinc-300 hover:text-red-500"
                    aria-label={`Remove ${item.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sticky summary bar */}
      <div className="fixed bottom-[68px] inset-x-0 z-40 px-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) * 0.5)' }}>
        <div className="max-w-xl mx-auto bg-zinc-900 text-white rounded-2xl shadow-2xl p-3">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-sm font-extrabold">{summary.itemsScanned}</p>
              <p className="text-[9px] text-zinc-400">scanned</p>
            </div>
            <div>
              <p className="text-sm font-extrabold">{summary.listRemaining ?? '—'}</p>
              <p className="text-[9px] text-zinc-400">list remaining</p>
            </div>
            <div>
              <p className="text-sm font-extrabold text-lime-400">{formatZAR(summary.promoSavings)}</p>
              <p className="text-[9px] text-zinc-400">promo savings</p>
            </div>
            <div>
              <p className="text-sm font-extrabold text-sky-400">{formatZAR(summary.estimatedTotal)}</p>
              <p className="text-[9px] text-zinc-400">est. total</p>
            </div>
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-700 text-[11px]">
            <span className="text-zinc-300 flex items-center gap-1">
              <ShoppingBasket className="h-3.5 w-3.5" /> {summary.itemsInBasket} in basket
            </span>
            <span className="text-zinc-300 flex items-center gap-1">
              <PiggyBank className="h-3.5 w-3.5" /> subtotal {formatZAR(summary.subtotal)}
            </span>
          </div>
        </div>
      </div>

      {/* Manual add dialog */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-left">Add product manually</DialogTitle>
            <DialogDescription className="text-left">
              Enter the name and the shelf price from the price tag.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Product name"
              className="h-11"
            />
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
              placeholder="Shelf price, e.g. 29.99"
              className="h-11"
            />
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              This price is user-entered or web-sourced and is not verified. Actual in-store pricing may
              differ.
            </p>
            <Button onClick={addManual} disabled={!manualName.trim() || !manualPrice} className="w-full h-11 bg-blue-600 hover:bg-blue-700 font-semibold">
              Add to basket
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
