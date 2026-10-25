'use client'

import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/api'
import { formatZAR, timeAgo, TAG_LABELS } from '@/lib/format'
import { ProductTile } from '@/components/shared/product-tile'
import { AddToListDialog } from '@/components/shared/add-to-list-dialog'
import { Plus } from 'lucide-react'

type FeedPromo = {
  id: string
  productId: string
  name: string
  unit: string | null
  storeName: string
  storeColor: string
  promoPrice: number
  normalPrice: number
  discount: number
}

type FeedPost = {
  id: string
  title: string
  description: string
  imageUrl: string | null
  tag: string
  datePosted: string
  storeName: string | null
  storeColor: string | null
  promos: FeedPromo[]
}

const tagColors: Record<string, string> = {
  'black-friday': 'bg-black text-white',
  festive: 'bg-red-500 text-white',
  'back-to-school': 'bg-sky-500 text-white',
  bulk: 'bg-zinc-900 text-white',
  campaign: 'bg-blue-600 text-white',
  new: 'bg-lime-500 text-black',
}

export function WhatsNewView() {
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [addTarget, setAddTarget] = useState<{ productId: string; name: string } | null>(null)

  useEffect(() => {
    apiGet<{ posts: FeedPost[] }>('/api/whats-new')
      .then((d) => setPosts(d.posts))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="px-4 pt-4 max-w-xl mx-auto pb-4">
      <h1 className="text-xl font-extrabold text-zinc-900">✨ What&apos;s New</h1>
      <p className="text-xs text-zinc-400 mt-0.5">
        Fresh promotions, campaigns and new products — posted by the Grocery Hauls team
      </p>

      <div className="space-y-4 mt-4">
        {loading && <p className="text-sm text-zinc-400 text-center py-10">Loading the feed…</p>}
        {!loading && posts.length === 0 && (
          <div className="text-center py-14 text-zinc-400">
            <p className="text-4xl mb-3">📣</p>
            <p className="text-sm">Nothing new right now — check back soon!</p>
          </div>
        )}
        {posts.map((post) => (
          <article key={post.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
            {/* Banner */}
            <div className="h-24 bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 relative flex items-center px-4">
              {post.imageUrl ? (
                <img src={post.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : null}
              <div className="relative z-10 flex items-center justify-between w-full">
                <div>
                  <span className={`text-[9px] font-extrabold uppercase tracking-wide rounded-full px-2 py-1 ${tagColors[post.tag] || tagColors.campaign}`}>
                    {TAG_LABELS[post.tag] || post.tag}
                  </span>
                  <h2 className="text-white font-extrabold text-lg leading-tight mt-1 drop-shadow-sm">
                    {post.title}
                  </h2>
                </div>
              </div>
            </div>

            <div className="p-4">
              <p className="text-sm text-zinc-600 leading-relaxed">{post.description}</p>
              <div className="flex items-center gap-2 mt-2 text-[11px] text-zinc-400">
                {post.storeName && (
                  <span
                    className="text-white rounded px-1.5 py-0.5 font-bold"
                    style={{ background: post.storeColor || '#4b5563' }}
                  >
                    {post.storeName}
                  </span>
                )}
                <span>posted {timeAgo(post.datePosted)}</span>
              </div>

              {post.promos.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                    Relevant promo products
                  </p>
                  {post.promos.map((p) => (
                    <div key={p.id} className="flex items-center gap-2.5 rounded-xl border border-zinc-100 p-2">
                      <ProductTile icon="🛍️" size="sm" alt={p.name} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-zinc-700 truncate">{p.name}</p>
                        <p className="text-[11px]">
                          <span className="font-extrabold text-lime-700">{formatZAR(p.promoPrice)}</span>{' '}
                          <span className="line-through text-zinc-400">{formatZAR(p.normalPrice)}</span>{' '}
                          <span className="text-[9px] text-white rounded px-1 py-0.5 font-bold" style={{ background: p.storeColor }}>
                            {p.storeName}
                          </span>
                        </p>
                      </div>
                      <button
                        onClick={() => setAddTarget({ productId: p.productId, name: p.name })}
                        className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 active:scale-90 transition"
                        aria-label={`Add ${p.name} to list`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {addTarget && (
        <AddToListDialog
          open={Boolean(addTarget)}
          onOpenChange={(v) => !v && setAddTarget(null)}
          productId={addTarget.productId}
          productName={addTarget.name}
        />
      )}
    </div>
  )
}
