'use client'

import { useCallback, useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { formatZAR, formatShortDate } from '@/lib/format'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Plus, Copy, Trash2, Pencil, CheckCircle, RotateCcw, BarChart3, CheckCheck, History,
} from 'lucide-react'

type StoreOption = { id: string; name: string }
const SOUTH_AFRICAN_PROVINCES = ["Eastern Cape","Free State","Gauteng","KwaZulu-Natal","Limpopo","Mpumalanga","Northern Cape","North West","Western Cape"]
const ONLINE_RETAILERS = [{"id":"online:amazon","name":"Amazon"},{"id":"online:takealot","name":"Takealot"},{"id":"online:dash","name":"Dash"},{"id":"cmvf8db6b0002nd5yu29vuj15","name":"Checkers Sixty60"},{"id":"cmvf8db6c0003nd5yerbaoig6","name":"Pick n Pay Online"},{"id":"online:dischem","name":"Dis-Chem"},{"id":"cmvf8db6f0006nd5ybzpjvxyf","name":"Clicks"},{"id":"cmvf8db6d0004nd5yhj2qxzd9","name":"Woolworths Online"},{"id":"online:makro","name":"Makro"},{"id":"cmvf8db690000nd5yglrgwp22","name":"Boxer Online"},{"id":"cmvf8db6e0005nd5yna5eu2rf","name":"SPAR Online"},{"id":"cmvf8db6b0001nd5ygpc2qkt0","name":"Shoprite Online"}]

type ListSummary = {
  id: string
  name: string
  status: string
  itemCount: number
  totalQuantity: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
  lastTotal: number | null
  lastSavings: number | null
}

export function MyListsView() {
  const [lists, setLists] = useState<ListSummary[]>([])
  const [stores, setStores] = useState<StoreOption[]>([])
  const [preferredStoreId, setPreferredStoreId] = useState('')
  const [province, setProvince] = useState('')
  const [shoppingMode, setShoppingMode] = useState<'in-store' | 'online'>('in-store')
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [renameTarget, setRenameTarget] = useState<ListSummary | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const openList = useApp((s) => s.openList)
  const openCompare = useApp((s) => s.openCompare)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<{ lists: ListSummary[] }>('/api/lists')
      setLists(data.lists)
    } catch {
      setLists([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    apiGet<{ stores: StoreOption[] }>('/api/stores').then((d) => {
      setStores(d.stores)
      try {
        const saved = localStorage.getItem('gh_preferred_store') || ''
        const savedProvince = localStorage.getItem('gh_province') || ''
        const savedMode = localStorage.getItem('gh_shopping_mode')
        setProvince(SOUTH_AFRICAN_PROVINCES.includes(savedProvince) ? savedProvince : '')
        setShoppingMode(savedMode === 'online' ? 'online' : 'in-store')
        setPreferredStoreId(d.stores.some((s) => s.id === saved) || ONLINE_RETAILERS.some((s) => s.id === saved) ? saved : '')
      } catch { /* ignore */ }
    }).catch(() => {})
  }, [load])

  const create = async () => {
    if (!newName.trim()) return
    if (!province) {
      toast({ title: 'Choose your province first', variant: 'destructive' })
      return
    }
    if (!preferredStoreId) {
      toast({ title: 'Choose your preferred store first', variant: 'destructive' })
      return
    }
    try {
      try {
        localStorage.setItem('gh_preferred_store', preferredStoreId)
        localStorage.setItem('gh_preferred_store_label', (shoppingMode === 'online' ? ONLINE_RETAILERS : stores).find((s) => s.id === preferredStoreId)?.name || '')
        localStorage.setItem('gh_province', province)
        localStorage.setItem('gh_shopping_mode', shoppingMode)
      } catch { /* ignore */ }
      const { list } = await apiPost<{ list: { id: string; name: string } }>('/api/lists', { name: newName.trim() })
      setCreateOpen(false)
      setNewName('')
      openList(list.id, list.name)
    } catch (e) {
      toast({ title: 'Could not create list', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const rename = async () => {
    if (!renameTarget || !renameValue.trim()) return
    try {
      await apiPatch(`/api/lists/${renameTarget.id}`, { name: renameValue.trim() })
      toast({ title: 'List renamed ✏️' })
      setRenameTarget(null)
      load()
    } catch (e) {
      toast({ title: 'Could not rename', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const duplicate = async (l: ListSummary) => {
    try {
      await apiPost(`/api/lists/${l.id}/duplicate`)
      toast({ title: 'List duplicated 📋', description: `"${l.name} (copy)" created.` })
      load()
    } catch (e) {
      toast({ title: 'Could not duplicate', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const remove = async (l: ListSummary) => {
    if (!window.confirm(`Delete "${l.name}"? This cannot be undone.`)) return
    try {
      await apiDelete(`/api/lists/${l.id}`)
      toast({ title: 'List deleted' })
      load()
    } catch (e) {
      toast({ title: 'Could not delete', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const toggleComplete = async (l: ListSummary) => {
    try {
      await apiPatch(`/api/lists/${l.id}`, { status: l.status === 'completed' ? 'active' : 'completed' })
      load()
    } catch (e) {
      toast({ title: 'Could not update', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const active = lists.filter((l) => l.status === 'active')
  const completed = lists.filter((l) => l.status === 'completed')

  return (
    <div className="px-4 pt-4 max-w-xl mx-auto pb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-900">📋 My Lists</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Saved lists, shopping history and totals</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-blue-600 hover:bg-blue-700 h-10 font-semibold">
          <Plus className="h-4 w-4 mr-1" /> New
        </Button>
      </div>

      {loading && <p className="text-sm text-zinc-400 text-center py-10">Loading your lists…</p>}

      {!loading && lists.length === 0 && (
        <div className="text-center py-14 text-zinc-400">
          <p className="text-4xl mb-3">🛒</p>
          <p className="text-sm font-medium">No lists yet</p>
          <p className="text-xs mt-1">Tap “New” to create your first grocery list.</p>
        </div>
      )}

      {[
        { title: 'Active lists', data: active },
        { title: 'Completed', data: completed },
      ].map((group) =>
        group.data.length > 0 ? (
          <div key={group.title} className="mt-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-400 mb-2">{group.title}</h2>
            <div className="space-y-2">
              {group.data.map((l) => (
                <div key={l.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-3.5">
                  <button className="w-full text-left" onClick={() => openList(l.id, l.name)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-zinc-900 truncate">{l.name}</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          {l.itemCount} product{l.itemCount !== 1 ? 's' : ''} • {l.totalQuantity} units • updated{' '}
                          {formatShortDate(l.updatedAt)}
                        </p>
                      </div>
                      {l.status === 'completed' && (
                        <span className="shrink-0 bg-sky-100 text-sky-700 text-[9px] font-bold rounded-full px-2 py-1">
                          COMPLETED
                        </span>
                      )}
                    </div>
                    {(l.lastTotal != null || l.lastSavings != null) && (
                      <div className="flex gap-3 mt-2 text-[11px]">
                        {l.lastTotal != null && (
                          <span className="bg-zinc-50 rounded-lg px-2 py-1 text-zinc-600 font-semibold">
                            <History className="h-3 w-3 inline mr-0.5 -mt-0.5" />
                            Basket total: {formatZAR(l.lastTotal)}
                          </span>
                        )}
                        {l.lastSavings != null && l.lastSavings > 0 && (
                          <span className="bg-lime-50 rounded-lg px-2 py-1 text-lime-700 font-semibold">
                            Saved {formatZAR(l.lastSavings)}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                  <div className="flex gap-1 mt-2.5 pt-2.5 border-t border-zinc-100 overflow-x-auto">
                    <ActionButton icon={BarChart3} label="Compare" onClick={() => openCompare(l.id, l.name)} />
                    <ActionButton icon={Pencil} label="Rename" onClick={() => { setRenameTarget(l); setRenameValue(l.name) }} />
                    <ActionButton icon={Copy} label="Duplicate" onClick={() => duplicate(l)} />
                    <ActionButton
                      icon={l.status === 'completed' ? RotateCcw : CheckCircle}
                      label={l.status === 'completed' ? 'Reopen' : 'Complete'}
                      onClick={() => toggleComplete(l)}
                    />
                    <ActionButton icon={Trash2} label="Delete" danger onClick={() => remove(l)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-left">New grocery list</DialogTitle>
            <DialogDescription className="text-left">Choose your province, shopping method and preferred retailer before naming your list.</DialogDescription>
          </DialogHeader>
          <label className="block text-xs font-semibold text-zinc-600" htmlFor="my-list-province">1. Province</label>
          <select id="my-list-province" value={province} onChange={(e) => { setProvince(e.target.value); try { localStorage.setItem('gh_province', e.target.value) } catch { /* ignore */ } }} className="w-full h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm">
            <option value="">Choose your province…</option>
            {SOUTH_AFRICAN_PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <label className="block text-xs font-semibold text-zinc-600">2. Shopping method</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setShoppingMode('in-store'); setPreferredStoreId(''); try { localStorage.setItem('gh_shopping_mode', 'in-store'); localStorage.removeItem('gh_preferred_store') } catch { /* ignore */ } }} className={`h-10 rounded-lg border text-sm font-semibold ${shoppingMode === 'in-store' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-zinc-200 bg-white text-zinc-600'}`}>🏬 In-store</button>
            <button type="button" onClick={() => { setShoppingMode('online'); setPreferredStoreId(''); try { localStorage.setItem('gh_shopping_mode', 'online'); localStorage.removeItem('gh_preferred_store') } catch { /* ignore */ } }} className={`h-10 rounded-lg border text-sm font-semibold ${shoppingMode === 'online' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-zinc-200 bg-white text-zinc-600'}`}>🌐 Online</button>
          </div>
          <label className="block text-xs font-semibold text-zinc-600" htmlFor="my-list-preferred-store">3. Preferred {shoppingMode === 'online' ? 'online retailer' : 'store'}</label>
          <select id="my-list-preferred-store" value={preferredStoreId} onChange={(e) => { setPreferredStoreId(e.target.value); try { localStorage.setItem('gh_preferred_store', e.target.value) } catch { /* ignore */ } }} className="w-full h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm">
            <option value="">Choose your preferred {shoppingMode === 'online' ? 'online retailer' : 'store'}…</option>
            {(shoppingMode === 'online' ? ONLINE_RETAILERS : stores).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {shoppingMode === 'online' && <p className="text-[11px] text-zinc-500">Online retailer prices are included only where catalogue prices are available.</p>}
          <label className="block text-xs font-semibold text-zinc-600" htmlFor="my-list-name">4. List name</label>
          <Input
            id="my-list-name"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Monthly Groceries, Student Groceries, Black Friday Haul"
            className="h-11"
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <Button onClick={create} disabled={!province || !newName.trim() || !preferredStoreId} className="w-full h-11 bg-blue-600 hover:bg-blue-700 font-semibold">
            <CheckCheck className="h-4 w-4 mr-1" /> Create list
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(renameTarget)} onOpenChange={(v) => !v && setRenameTarget(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-left">Rename list</DialogTitle>
            <DialogDescription className="text-left">Current name: {renameTarget?.name}</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="h-11"
            onKeyDown={(e) => e.key === 'Enter' && rename()}
          />
          <Button onClick={rename} disabled={!renameValue.trim()} className="w-full h-11 bg-blue-600 hover:bg-blue-700 font-semibold">
            Save name
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-[11px] font-semibold rounded-lg px-2.5 py-1.5 whitespace-nowrap transition min-h-[32px] ${
        danger ? 'text-zinc-400 hover:text-red-600 hover:bg-red-50' : 'text-zinc-500 hover:text-blue-700 hover:bg-blue-50'
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}
