'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { apiGet, apiPost } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ClipboardList, Plus } from 'lucide-react'

type ListSummary = { id: string; name: string; itemCount: number }

// Dialog that adds a catalogue product to one of the user's lists
// (or a new list). Used by Specials, What's New and product search.
export function AddToListDialog({
  open,
  onOpenChange,
  productId,
  productName,
  onAddedToWishList,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  productId: string
  productName: string
  onAddedToWishList?: () => void
}) {
  const [lists, setLists] = useState<ListSummary[]>([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(false)
  const setPreAdd = useApp((s) => s.setPreAddPromoIds)

  useEffect(() => {
    if (!open) return
    apiGet<{ lists: ListSummary[] }>('/api/lists')
      .then((d) => setLists(d.lists))
      .catch(() => setLists([]))
  }, [open])

  const add = async (listId: string, listName: string) => {
    setLoading(true)
    try {
      await apiPost(`/api/lists/${listId}/items`, { productId, quantity: 1, source: 'promo' })
      toast({
        title: 'Added to list 🛒',
        description: `${productName} was added to "${listName}".`,
      })
      onOpenChange(false)
    } catch (e) {
      toast({ title: 'Could not add item', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const createAndAdd = async () => {
    if (!newName.trim()) return
    setLoading(true)
    try {
      const { list } = await apiPost<{ list: { id: string; name: string } }>('/api/lists', { name: newName.trim() })
      await apiPost(`/api/lists/${list.id}/items`, { productId, quantity: 1, source: 'promo' })
      toast({ title: 'List created 🎉', description: `"${list.name}" created with ${productName}.` })
      setNewName('')
      onOpenChange(false)
    } catch (e) {
      toast({ title: 'Could not create list', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-left">Add to list</DialogTitle>
          <DialogDescription className="text-left">
            Choose a list for <span className="font-semibold text-zinc-700">{productName}</span>
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-52 -mx-2 px-2">
          <div className="space-y-1.5">
            {lists.map((l) => (
              <button
                key={l.id}
                disabled={loading}
                onClick={() => add(l.id, l.name)}
                className="w-full flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2.5 hover:bg-blue-50 hover:border-blue-300 transition-colors text-left min-h-[44px]"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <ClipboardList className="h-4 w-4 text-blue-600" />
                  {l.name}
                </span>
                <span className="text-xs text-zinc-400">{l.itemCount} items</span>
              </button>
            ))}
            {lists.length === 0 && (
              <p className="text-sm text-zinc-500 py-2">No lists yet — create your first one below.</p>
            )}
          </div>
        </ScrollArea>
        <div className="flex gap-2 pt-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New list name, e.g. Monthly Groceries"
            className="h-10"
          />
          <Button onClick={createAndAdd} disabled={loading || !newName.trim()} className="bg-blue-600 hover:bg-blue-700 h-10 px-3">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {onAddedToWishList && (
          <Button
            variant="outline"
            className="w-full border-sky-300 text-sky-700 hover:bg-sky-50"
            onClick={() => {
              onAddedToWishList()
              onOpenChange(false)
            }}
          >
            ❤️ Add to Wish List instead
          </Button>
        )}
        <button
          className="text-xs text-zinc-400 hover:text-blue-600 text-center pb-1"
          onClick={() => {
            setPreAdd([productId])
            onOpenChange(false)
            useApp.getState().go('create')
          }}
        >
          Start a brand new list with this product →
        </button>
      </DialogContent>
    </Dialog>
  )
}
