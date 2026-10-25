'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost, apiPatch, apiDelete, apiUpload } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { formatZAR, formatShortDate } from '@/lib/format'
import { ADMIN_EMAIL_PRIMARY } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  LayoutDashboard, Users, Upload, Tag, FolderOpen, FileSpreadsheet, ShieldCheck,
  LogOut, Search, ArrowLeft, Trash2, Pause, Play, Plus, Download, UserPlus, Sparkles,
} from 'lucide-react'

type AdminTab = 'overview' | 'users' | 'import' | 'promotions' | 'whatsnew' | 'files' | 'admins'

const tabs: { key: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'import', label: 'Upload Data', icon: Upload },
  { key: 'promotions', label: 'Promotions', icon: Tag },
  { key: 'whatsnew', label: "What's New", icon: Sparkles },
  { key: 'files', label: 'Files', icon: FolderOpen },
  { key: 'admins', label: 'Admins', icon: ShieldCheck },
]

export function AdminView() {
  const [admin, setAdmin] = useState<{ email: string } | null>(null)
  const [checking, setChecking] = useState(true)
  const [tab, setTab] = useState<AdminTab>('overview')

  useEffect(() => {
    apiGet<{ admin: { email: string } | null }>('/api/admin/login')
      .then((d) => setAdmin(d.admin))
      .catch(() => setAdmin(null))
      .finally(() => setChecking(false))
  }, [])

  const exitAdmin = () => {
    window.location.hash = ''
    useApp.setState({ isAdminArea: false })
  }

  if (checking) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400 text-sm">Checking admin session…</div>
  }

  if (!admin) {
    return <AdminLogin onLogin={(email) => setAdmin({ email })} onExit={exitAdmin} />
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Admin header */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <img
            src="/brand/logo-tile.png"
            alt="Grocery Hauls Pro za logo"
            className="h-9 w-9 rounded-[10px] shadow-sm shrink-0"
          />
          <div>
            <p className="font-extrabold text-sm leading-tight">Grocery Hauls Pro za — Admin</p>
            <p className="text-[10px] text-zinc-400">{admin.email}</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={exitAdmin}>
            <ArrowLeft className="h-4 w-4 mr-1" /> App
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            onClick={async () => {
              await apiDelete('/api/admin/login').catch(() => {})
              setAdmin(null)
            }}
          >
            <LogOut className="h-4 w-4 mr-1" /> Exit
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-zinc-900/60 border-b border-zinc-800 px-3 py-2 sticky top-[57px] z-20">
        <div className="max-w-5xl mx-auto flex gap-1.5 overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition min-h-[36px] ${
                  tab === t.key ? 'bg-sky-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-5">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'import' && <ImportTab />}
        {tab === 'promotions' && <PromotionsTab />}
        {tab === 'whatsnew' && <WhatsNewTab />}
        {tab === 'files' && <FilesTab />}
        {tab === 'admins' && <AdminsTab currentEmail={admin.email} />}
      </main>
    </div>
  )
}

// ---------------- Login ----------------
function AdminLogin({ onLogin, onExit }: { onLogin: (email: string) => void; onExit: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiPost<{ admin: { email: string } }>('/api/admin/login', { email, password })
      onLogin(data.admin.email)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
        <div className="text-center mb-5">
          <img
            src="/brand/logo-tile.png"
            alt="Grocery Hauls Pro za logo"
            className="h-16 w-16 rounded-2xl shadow-md mx-auto mb-3"
          />
          <h1 className="text-xl font-extrabold text-white">Admin Dashboard</h1>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Restricted access — only approved admin email accounts with a password may sign in.
          </p>
        </div>
        <div className="space-y-3">
          <Input
            type="email"
            placeholder="Admin email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          {error && <p className="text-xs text-red-400 font-medium">{error}</p>}
          <Button onClick={submit} disabled={loading || !email || !password} className="w-full h-11 bg-blue-600 hover:bg-blue-700 font-bold">
            {loading ? 'Signing in…' : 'Sign in to dashboard'}
          </Button>
          <button onClick={onExit} className="w-full text-xs text-zinc-400 hover:text-zinc-200 py-1.5">
            ← Back to the app
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------- Overview / Analytics ----------------
type Stats = {
  stats: {
    totalUsers: number; newUsersWeek: number; activeUsers: number; totalLists: number
    completedLists: number; totalProducts: number; totalPromotions: number; totalWishItems: number
    whatsappUsers: number; shopSessions: number; estimatedSavings: number
  }
  topSearches: { term: string; count: number }[]
  topPromoProducts: { name: string; count: number }[]
  topStores: { name: string; count: number }[]
}

function OverviewTab() {
  const [data, setData] = useState<Stats | null>(null)
  useEffect(() => {
    apiGet<Stats>('/api/admin/stats').then(setData).catch(() => {})
  }, [])

  if (!data) return <p className="text-sm text-zinc-400 py-8 text-center">Loading analytics…</p>
  const s = data.stats

  const cards = [
    { label: 'Total users', value: s.totalUsers },
    { label: 'New this week', value: s.newUsersWeek },
    { label: 'Active (30d)', value: s.activeUsers },
    { label: 'Lists created', value: s.totalLists },
    { label: 'Lists completed', value: s.completedLists },
    { label: 'Products', value: s.totalProducts },
    { label: 'Promotions live', value: s.totalPromotions },
    { label: 'Wish list items', value: s.totalWishItems },
    { label: 'Users with WhatsApp', value: s.whatsappUsers },
    { label: 'Shop Mode sessions', value: s.shopSessions },
  ]

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-r from-blue-700 to-sky-500 p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-100">Estimated user savings</p>
        <p className="text-4xl font-extrabold mt-1">{formatZAR(s.estimatedSavings)}</p>
        <p className="text-xs text-sky-100 mt-1">Total promo savings across saved plans and lists</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {cards.map((c) => (
          <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3.5">
            <p className="text-2xl font-extrabold">{c.value}</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <RankList title="Most searched products" rows={data.topSearches.map((t) => ({ name: t.term, count: t.count }))} />
        <RankList title="Most added promo products" rows={data.topPromoProducts} />
        <RankList title="Most popular stores" rows={data.topStores} />
      </div>
    </div>
  )
}

function RankList({ title, rows }: { title: string; rows: { name: string; count: number }[] }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-400">{title}</h3>
      <div className="mt-3 space-y-1.5">
        {rows.length === 0 && <p className="text-xs text-zinc-500">No data yet</p>}
        {rows.slice(0, 6).map((r, i) => (
          <div key={r.name + i} className="flex items-center justify-between text-sm">
            <span className="text-zinc-200 truncate capitalize">{r.name}</span>
            <span className="text-sky-400 font-bold shrink-0 ml-2">{r.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------- Users ----------------
type AdminUser = {
  id: string; name: string; email: string; whatsappNumber: string | null
  whatsappOptIn: boolean; role: string; isDemo: boolean
  createdAt: string; lastLoginAt: string
  listCount: number; wishCount: number; sessionCount: number; planCount: number
}

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [q, setQ] = useState('')
  useEffect(() => {
    const t = setTimeout(() => {
      apiGet<{ users: AdminUser[] }>(`/api/admin/users?q=${encodeURIComponent(q)}`)
        .then((d) => setUsers(d.users))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search users by name or email…"
            className="pl-9 h-10 bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>
        <a href="/api/admin/users?export=1" className="shrink-0">
          <Button className="bg-blue-600 hover:bg-blue-700 h-10">
            <Download className="h-4 w-4 mr-1.5" /> CSV
          </Button>
        </a>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <ScrollArea className="max-h-[65vh]">
          <table className="w-full text-xs">
            <thead className="bg-zinc-800/60 sticky top-0">
              <tr className="text-zinc-400 text-left">
                <th className="px-3 py-2.5 font-semibold">User</th>
                <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">WhatsApp</th>
                <th className="px-3 py-2.5 font-semibold hidden md:table-cell">Joined</th>
                <th className="px-3 py-2.5 font-semibold hidden md:table-cell">Last login</th>
                <th className="px-3 py-2.5 font-semibold">Lists</th>
                <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">Activity</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-zinc-800 hover:bg-zinc-800/40">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-zinc-100">{u.name} {u.isDemo && <span className="text-[9px] bg-sky-500/20 text-sky-300 rounded px-1">DEMO</span>}</p>
                    <p className="text-zinc-500">{u.email}</p>
                  </td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    {u.whatsappNumber ? (
                      <span className="text-lime-400">{u.whatsappNumber} {u.whatsappOptIn ? '✓' : ''}</span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell text-zinc-400">{formatShortDate(u.createdAt)}</td>
                  <td className="px-3 py-2.5 hidden md:table-cell text-zinc-400">{formatShortDate(u.lastLoginAt)}</td>
                  <td className="px-3 py-2.5 font-bold text-zinc-200">{u.listCount}</td>
                  <td className="px-3 py-2.5 hidden sm:table-cell text-zinc-400">
                    {u.wishCount} wishes • {u.sessionCount} shops • {u.planCount} plans
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </div>
    </div>
  )
}

// ---------------- Import (CSV/Excel) ----------------
type ImportPreview = { headers: string[]; rows: Record<string, unknown>[]; totalRows: number; storedName: string }
const FIELD_LABELS: Record<string, string> = {
  store: 'Store name *',
  name: 'Product name *',
  category: 'Category',
  barcode: 'Barcode',
  normalPrice: 'Normal price *',
  promoPrice: 'Promo price',
  discount: 'Discount %',
  startDate: 'Promo start',
  endDate: 'Promo end',
  imageUrl: 'Image URL',
  description: 'Description',
}

function ImportTab() {
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState<{ summary: { rowsProcessed: number; productsCreated: number; productsUpdated: number; pricesUpserted: number; promosCreated: number; errors: string[]; errorCount: number; usersNotified: number } } | null>(null)
  const [leaflets, setLeaflets] = useState(false)

  const onFile = async (file: File) => {
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('purpose', 'import')
      const data = await apiUpload<ImportPreview>('/api/admin/files', fd)
      setPreview(data)
      // auto-map obvious columns — process fields in priority order, each header used once
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
      const auto: Record<string, string> = {}
      const used = new Set<string>()
      const priority = ['store', 'name', 'normalPrice', 'promoPrice', 'category', 'barcode', 'discount', 'startDate', 'endDate', 'imageUrl', 'description']
      for (const key of priority) {
        const k = norm(key)
        const match =
          data.headers.find((h) => !used.has(h) && norm(h) === k) ??
          data.headers.find((h) => !used.has(h) && norm(h).startsWith(k)) ??
          data.headers.find((h) => !used.has(h) && norm(h).includes(k))
        if (match) {
          auto[key] = match
          used.add(match)
        }
      }
      setMapping(auto)
      toast({ title: 'File parsed ✅', description: `${data.totalRows} rows found. Map the columns, then import.` })
    } catch (e) {
      toast({ title: 'Could not read file', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const commit = async () => {
    if (!preview) return
    setCommitting(true)
    try {
      const data = await apiPost<{
        summary: {
          rowsProcessed: number; productsCreated: number; productsUpdated: number
          pricesUpserted: number; promosCreated: number; errors: string[]
          errorCount: number; usersNotified: number
        }
      }>('/api/admin/import/commit', { rows: preview.rows, mapping })
      setResult(data)
      setPreview(null)
      toast({
        title: 'Import complete 🎉',
        description: `${data.summary.productsCreated} new products • ${data.summary.promosCreated} promos • ${data.summary.errorCount} skipped`,
      })
    } catch (e) {
      toast({ title: 'Import failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setCommitting(false)
    }
  }

  const uploadAsset = async (file: File) => {
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('purpose', 'asset')
      await apiUpload('/api/admin/files', fd)
      toast({ title: 'File uploaded ✅', description: file.name })
      setLeaflets((v) => !v)
    } catch (e) {
      toast({ title: 'Upload failed', description: (e as Error).message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h2 className="font-bold text-sm flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-sky-400" /> Upload CSV / Excel promotions
        </h2>
        <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
          Supported columns: store, product name, category, barcode, normal price, promo price,
          discount, start date, end date, image URL, description. You&apos;ll map columns and preview
          before anything is saved.
        </p>
        <label className="block mt-3 border-2 border-dashed border-zinc-700 rounded-xl p-6 text-center cursor-pointer hover:border-sky-400 transition">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <Upload className="h-6 w-6 mx-auto text-zinc-500" />
          <p className="text-xs text-zinc-400 mt-2">Tap to choose a .csv, .xlsx or .xls file</p>
        </label>
      </div>

      {preview && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <h3 className="font-bold text-sm">Preview & map columns ({preview.totalRows} rows)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-3">
            {Object.entries(FIELD_LABELS).map(([key, label]) => (
              <div key={key}>
                <label className="text-[10px] font-bold uppercase text-zinc-400">{label}</label>
                <select
                  value={mapping[key] || ''}
                  onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                  className="w-full h-9 mt-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs px-2"
                >
                  <option value="">— skip —</option>
                  {preview.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <ScrollArea className="max-h-52 mt-4">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-zinc-500 text-left">
                  {preview.headers.map((h) => (
                    <th key={h} className="px-2 py-1.5 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 10).map((row, i) => (
                  <tr key={i} className="border-t border-zinc-800">
                    {preview.headers.map((h) => (
                      <td key={h} className="px-2 py-1.5 text-zinc-300 whitespace-nowrap max-w-32 truncate">
                        {String(row[h] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
          <Button onClick={commit} disabled={committing || !mapping.name || !mapping.store || !mapping.normalPrice} className="mt-4 bg-blue-600 hover:bg-blue-700">
            {committing ? 'Importing…' : `Import ${preview.totalRows} rows`}
          </Button>
        </div>
      )}

      {result && (
        <div className="bg-lime-900/20 border border-lime-800 rounded-2xl p-5 text-sm">
          <h3 className="font-bold text-lime-400">Import summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-xs">
            <p>Rows processed: <b>{result.summary.rowsProcessed}</b></p>
            <p>Products created: <b>{result.summary.productsCreated}</b></p>
            <p>Products updated: <b>{result.summary.productsUpdated}</b></p>
            <p>Prices upserted: <b>{result.summary.pricesUpserted}</b></p>
            <p>Promotions created: <b>{result.summary.promosCreated}</b></p>
            <p>Users notified: <b>{result.summary.usersNotified}</b></p>
          </div>
          {result.summary.errorCount > 0 && (
            <div className="mt-3 text-xs text-red-400">
              <p className="font-bold">{result.summary.errorCount} rows skipped:</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                {result.summary.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h2 className="font-bold text-sm">Upload images & PDF leaflets</h2>
        <p className="text-xs text-zinc-400 mt-1.5">Product JPEG/PNG images and promotional PDF leaflets are stored in cloud file storage.</p>
        <label className="block mt-3 border-2 border-dashed border-zinc-700 rounded-xl p-5 text-center cursor-pointer hover:border-sky-400 transition">
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadAsset(e.target.files[0])}
          />
          <Upload className="h-5 w-5 mx-auto text-zinc-500" />
          <p className="text-xs text-zinc-400 mt-2">Tap to upload a JPEG, PNG or PDF</p>
        </label>
        {leaflets && <p className="text-xs text-lime-400 mt-2">Uploaded — see the Files tab.</p>}
      </div>
    </div>
  )
}

// ---------------- Promotions ----------------
type AdminPromo = {
  id: string; productName: string; productId: string; category: string; storeName: string; storeId: string
  promoPrice: number; normalPrice: number; startDate: string; endDate: string; status: string; source: string
}

function PromotionsTab() {
  const [promos, setPromos] = useState<AdminPromo[]>([])
  const [products, setProducts] = useState<{ id: string; name: string }[]>([])
  const [stores, setStores] = useState<{ id: string; name: string }[]>([])
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ productId: '', storeId: '', normalPrice: '', promoPrice: '', endDate: '' })

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ promotions: AdminPromo[] }>('/api/admin/promotions')
      setPromos(d.promotions)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    apiGet<{ promotions: AdminPromo[] }>('/api/admin/promotions')
      .then((d) => setPromos(d.promotions))
      .catch(() => {})
    apiGet<{ results: { id: string; name: string }[] }>('/api/products').then((d) => setProducts(d.results)).catch(() => {})
    apiGet<{ stores: { id: string; name: string }[] }>('/api/stores').then((d) => setStores(d.stores)).catch(() => {})
  }, [])

  const toggleStatus = async (p: AdminPromo) => {
    await apiPatch('/api/admin/promotions', { id: p.id, status: p.status === 'published' ? 'paused' : 'published' }).catch(() => {})
    load()
  }

  const remove = async (p: AdminPromo) => {
    if (!window.confirm(`Delete promo for ${p.productName} at ${p.storeName}?`)) return
    await apiDelete(`/api/admin/promotions?id=${p.id}`).catch(() => {})
    load()
  }

  const create = async () => {
    try {
      await apiPost('/api/admin/promotions', {
        productId: form.productId,
        storeId: form.storeId,
        normalPrice: Number(form.normalPrice),
        promoPrice: Number(form.promoPrice),
        endDate: form.endDate || undefined,
      })
      toast({ title: 'Promotion published 🏷️' })
      setCreating(false)
      setForm({ productId: '', storeId: '', normalPrice: '', promoPrice: '', endDate: '' })
      load()
    } catch (e) {
      toast({ title: 'Could not create', description: (e as Error).message, variant: 'destructive' })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-sm">All promotions ({promos.length})</h2>
        <Button onClick={() => setCreating(!creating)} className="bg-lime-600 hover:bg-lime-700 text-zinc-950 h-9">
          <Plus className="h-4 w-4 mr-1" /> New promo
        </Button>
      </div>

      {creating && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
          <select value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))} className="h-10 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs px-2">
            <option value="">Choose product…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={form.storeId} onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value }))} className="h-10 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs px-2">
            <option value="">Choose store…</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Input type="number" step="0.01" placeholder="Normal price" value={form.normalPrice} onChange={(e) => setForm((f) => ({ ...f, normalPrice: e.target.value }))} className="h-10 bg-zinc-800 border-zinc-700 text-zinc-100 text-xs" />
          <Input type="number" step="0.01" placeholder="Promo price" value={form.promoPrice} onChange={(e) => setForm((f) => ({ ...f, promoPrice: e.target.value }))} className="h-10 bg-zinc-800 border-zinc-700 text-zinc-100 text-xs" />
          <Input type="date" placeholder="End date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className="h-10 bg-zinc-800 border-zinc-700 text-zinc-100 text-xs" />
          <Button onClick={create} disabled={!form.productId || !form.storeId || !form.normalPrice || !form.promoPrice} className="bg-blue-600 hover:bg-blue-700 h-10">
            Publish promo
          </Button>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <ScrollArea className="max-h-[65vh]">
          <table className="w-full text-xs">
            <thead className="bg-zinc-800/60 sticky top-0">
              <tr className="text-zinc-400 text-left">
                <th className="px-3 py-2.5 font-semibold">Product</th>
                <th className="px-3 py-2.5 font-semibold">Store</th>
                <th className="px-3 py-2.5 font-semibold">Prices</th>
                <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">Ends</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.id} className="border-t border-zinc-800 hover:bg-zinc-800/40">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-zinc-100">{p.productName}</p>
                    <p className="text-zinc-500">{p.category}</p>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-300">{p.storeName}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-bold text-lime-400">{formatZAR(p.promoPrice)}</span>{' '}
                    <span className="text-zinc-500 line-through">{formatZAR(p.normalPrice)}</span>
                  </td>
                  <td className="px-3 py-2.5 hidden sm:table-cell text-zinc-400">{formatShortDate(p.endDate)}</td>
                  <td className="px-3 py-2.5">
                    <Badge className={p.status === 'published' ? 'bg-lime-500/20 text-lime-400 border-0' : 'bg-red-500/20 text-red-400 border-0'}>
                      {p.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => toggleStatus(p)} className="h-7 w-7 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-300 hover:text-white" aria-label={p.status === 'published' ? 'Pause' : 'Publish'}>
                        {p.status === 'published' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => remove(p)} className="h-7 w-7 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-red-400" aria-label="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </div>
    </div>
  )
}

// ---------------- What's New posts ----------------
type AdminPost = {
  id: string; title: string; description: string; tag: string; storeName: string | null
  active: boolean; datePosted: string; promoCount: number; promoNames: string[]
}

function WhatsNewTab() {
  const [posts, setPosts] = useState<AdminPost[]>([])
  const [stores, setStores] = useState<{ id: string; name: string }[]>([])
  const [form, setForm] = useState({ title: '', description: '', tag: 'new', storeId: '' })

  const load = useCallback(async () => {
    apiGet<{ posts: AdminPost[] }>('/api/admin/whatsnew').then((d) => setPosts(d.posts)).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    apiGet<{ stores: { id: string; name: string }[] }>('/api/stores').then((d) => setStores(d.stores)).catch(() => {})
  }, [load])

  const create = async () => {
    try {
      await apiPost('/api/admin/whatsnew', { ...form, storeId: form.storeId || null })
      toast({ title: 'Post created ✨' })
      setForm({ title: '', description: '', tag: 'new', storeId: '' })
      load()
    } catch (e) {
      toast({ title: 'Could not create post', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const toggle = async (p: AdminPost) => {
    await apiPatch('/api/admin/whatsnew', { id: p.id, active: !p.active }).catch(() => {})
    load()
  }

  const remove = async (p: AdminPost) => {
    if (!window.confirm('Delete this post?')) return
    await apiDelete(`/api/admin/whatsnew?id=${p.id}`).catch(() => {})
    load()
  }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <h2 className="font-bold text-sm">Create a What&apos;s New post</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3">
          <Input placeholder="Title, e.g. Black Friday Early Deals" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="h-10 bg-zinc-800 border-zinc-700 text-zinc-100 text-xs" />
          <select value={form.tag} onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))} className="h-10 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs px-2">
            <option value="new">New products</option>
            <option value="black-friday">Black Friday</option>
            <option value="festive">Festive / December</option>
            <option value="back-to-school">Back to School</option>
            <option value="bulk">Bulk-buy promotion</option>
            <option value="campaign">Store campaign</option>
          </select>
          <select value={form.storeId} onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value }))} className="h-10 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs px-2">
            <option value="">No specific store</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Input placeholder="Short description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="h-10 bg-zinc-800 border-zinc-700 text-zinc-100 text-xs" />
        </div>
        <Button onClick={create} disabled={!form.title.trim() || !form.description.trim()} className="mt-3 bg-lime-600 hover:bg-lime-700 text-zinc-950 h-10">
          <Plus className="h-4 w-4 mr-1" /> Publish post
        </Button>
      </div>

      <div className="space-y-2">
        {posts.map((p) => (
          <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold text-sm text-zinc-100">{p.title}</p>
              <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{p.description}</p>
              <p className="text-[10px] text-zinc-500 mt-1">
                {p.tag} • {p.storeName ?? 'All stores'} • {p.promoCount} linked promos • {formatShortDate(p.datePosted)} • {p.active ? 'visible' : 'hidden'}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => toggle(p)} className="h-7 w-7 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-300 hover:text-white" aria-label="Toggle visibility">
                {p.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
              <button onClick={() => remove(p)} className="h-7 w-7 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-red-400" aria-label="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------- Files ----------------
type UploadRow = { id: string; filename: string; fileType: string; fileSize: number; uploadedBy: string; relatedStore: string | null; url: string | null; createdAt: string }

function FilesTab() {
  const [files, setFiles] = useState<UploadRow[]>([])
  const load = useCallback(() => {
    apiGet<{ files: UploadRow[] }>('/api/admin/files').then((d) => setFiles(d.files)).catch(() => {})
  }, [])
  useEffect(() => load(), [load])

  const remove = async (f: UploadRow) => {
    if (!window.confirm(`Delete ${f.filename}?`)) return
    await apiDelete(`/api/admin/files?id=${f.id}`).catch(() => {})
    load()
  }

  const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-zinc-800/60">
          <tr className="text-zinc-400 text-left">
            <th className="px-3 py-2.5 font-semibold">File</th>
            <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">Type</th>
            <th className="px-3 py-2.5 font-semibold">Size</th>
            <th className="px-3 py-2.5 font-semibold hidden md:table-cell">Uploaded by</th>
            <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">Date</th>
            <th className="px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {files.length === 0 && (
            <tr><td colSpan={6} className="px-3 py-8 text-center text-zinc-500">No files uploaded yet</td></tr>
          )}
          {files.map((f) => (
            <tr key={f.id} className="border-t border-zinc-800 hover:bg-zinc-800/40">
              <td className="px-3 py-2.5 max-w-48">
                <p className="font-semibold text-zinc-100 truncate">{f.filename}</p>
                {f.url && <a href={f.url} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">download</a>}
              </td>
              <td className="px-3 py-2.5 hidden sm:table-cell uppercase text-zinc-400">{f.fileType}</td>
              <td className="px-3 py-2.5 text-zinc-300">{fmtSize(f.fileSize)}</td>
              <td className="px-3 py-2.5 hidden md:table-cell text-zinc-400">{f.uploadedBy}</td>
              <td className="px-3 py-2.5 hidden sm:table-cell text-zinc-400">{formatShortDate(f.createdAt)}</td>
              <td className="px-3 py-2.5 text-right">
                <button onClick={() => remove(f)} className="h-7 w-7 rounded-lg bg-zinc-800 inline-flex items-center justify-center text-zinc-400 hover:text-red-400" aria-label="Delete file">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Admins ----------------
function AdminsTab({ currentEmail }: { currentEmail: string }) {
  const [admins, setAdmins] = useState<{ id: string; email: string; addedBy: string | null }[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const load = useCallback(() => {
    apiGet<{ admins: typeof admins }>('/api/admin/admins').then((d) => setAdmins(d.admins)).catch(() => {})
  }, [])
  useEffect(() => load(), [load])

  const add = async () => {
    try {
      await apiPost('/api/admin/admins', { email, password })
      toast({ title: 'Admin added ✅', description: `${email} can now sign in to the dashboard.` })
      setEmail('')
      setPassword('')
      load()
    } catch (e) {
      toast({ title: 'Could not add admin', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const remove = async (id: string, adminEmail: string) => {
    if (!window.confirm(`Remove admin access for ${adminEmail}?`)) return
    try {
      await apiDelete(`/api/admin/admins?id=${id}`)
      load()
    } catch (e) {
      toast({ title: 'Could not remove', description: (e as Error).message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <h2 className="font-bold text-sm flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-sky-400" /> Add an admin account
        </h2>
        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
          New admins get dashboard access with the email + password you set here. Primary account:{' '}
          <span className="text-zinc-300 font-semibold">{ADMIN_EMAIL_PRIMARY}</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3">
          <Input placeholder="new.admin@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 bg-zinc-800 border-zinc-700 text-zinc-100 text-xs" />
          <Input type="password" placeholder="Password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} className="h-10 bg-zinc-800 border-zinc-700 text-zinc-100 text-xs" />
          <Button onClick={add} disabled={!email || password.length < 8} className="bg-blue-600 hover:bg-blue-700 h-10">Add admin</Button>
        </div>
      </div>
      <div className="space-y-2">
        {admins.map((a) => (
          <div key={a.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3.5 flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm text-zinc-100">{a.email}</p>
              <p className="text-[11px] text-zinc-500">added by {a.addedBy ?? 'system'}</p>
            </div>
            {a.email !== ADMIN_EMAIL_PRIMARY && a.email !== currentEmail && (
              <button onClick={() => remove(a.id, a.email)} className="text-zinc-400 hover:text-red-400" aria-label={`Remove ${a.email}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
