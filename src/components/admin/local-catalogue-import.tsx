'use client'

import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { autoMap, buildReviewRows, rowHasError, reviewSummary, type ImportReviewRow } from '@/lib/import-review'
import { applyLocalCatalogueImport, exportLocalCatalogueSnapshot } from '@/lib/static-data'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'

type Store = { id: string; name: string; color?: string }
type Category = { id: string; name: string; icon?: string }
type ParsedFile = { headers: string[]; records: Record<string, unknown>[]; name: string }

const fields = [
  ['name', 'Product name *'], ['store', 'Store (optional if default selected)'],
  ['unit', 'Size / pack'], ['normalPrice', 'Normal price'], ['promoPrice', 'Promo price'],
  ['startDate', 'Promotion start'], ['endDate', 'Promotion end'],
  ['category', 'Category'], ['barcode', 'Barcode'], ['brand', 'Brand'],
] as const

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function LocalCatalogueImport() {
  const [stores, setStores] = useState<Store[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [defaultStore, setDefaultStore] = useState('')
  const [file, setFile] = useState<ParsedFile | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [rows, setRows] = useState<ImportReviewRow[]>([])
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof applyLocalCatalogueImport>> | null>(null)

  useEffect(() => {
    fetch('/data/stores.json').then(r => r.json()).then(d => {
      const list = Array.isArray(d.stores) ? d.stores : []
      setStores(list)
      if (list.length) setDefaultStore(list[0].id)
    }).catch(() => toast({ title: 'Could not load stores', description: 'The local store catalogue could not be read.', variant: 'destructive' }))
    fetch('/data/categories.json').then(r => r.json()).then(d => setCategories(Array.isArray(d.categories) ? d.categories : []))
      .catch(() => toast({ title: 'Could not load categories', variant: 'destructive' }))
  }, [])

  const counts = reviewSummary(rows)
  const approved = rows.filter(row => !rowHasError(row))
  const hasPromoWithoutDates = approved.some(row => row.promoPrice != null && (!row.startDate || !row.endDate))
  const canImport = Boolean(file && rows.length && approved.length && !hasPromoWithoutDates && !busy)

  const parseFile = async (selected: File) => {
    setFile(null); setRows([]); setSummary(null)
    try {
      const bytes = await selected.arrayBuffer()
      const workbook = XLSX.read(bytes, { type: 'array', cellDates: false })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!sheet) throw new Error('The workbook has no readable worksheet.')
      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
      if (!records.length) throw new Error('No data rows were found in the first worksheet.')
      const headers = Object.keys(records[0])
      if (!headers.length) throw new Error('No column headings were found.')
      const guessed = autoMap(headers) as Record<string, string | undefined>
      const extra = (key: string, patterns: RegExp[]) => headers.find(h => patterns.some(p => p.test(h.toLowerCase().replace(/[^a-z0-9]/g, ''))))
      const auto: Record<string, string> = {}
      Object.entries(guessed).forEach(([k, v]) => { if (v) auto[k] = v })
      for (const [key, patterns] of [
        ['category', [/^category(name)?$/, /^department$/]],
        ['barcode', [/^barcode$/, /^ean$/, /^gtin$/]],
        ['brand', [/^brand$/, /^manufacturer$/]],
      ] as [string, RegExp[]][]) {
        const found = extra(key, patterns)
        if (found) auto[key] = found
      }
      setFile({ headers, records, name: selected.name })
      setMapping(auto)
      toast({ title: 'File read successfully', description: `${records.length} data rows found in ${selected.name}.` })
    } catch (error) {
      toast({ title: 'Could not read file', description: error instanceof Error ? error.message : 'Unsupported or damaged file.', variant: 'destructive' })
    }
  }

  const review = () => {
    if (!file) return
    const coreMap = {
      name: mapping.name, store: mapping.store, unit: mapping.unit,
      normalPrice: mapping.normalPrice, promoPrice: mapping.promoPrice,
      startDate: mapping.startDate, endDate: mapping.endDate,
    }
    const storeName = stores.find(s => s.id === defaultStore)?.name
    const built = buildReviewRows(file.records, coreMap, { defaultStoreName: storeName })
    const checked = built.map(row => {
      const issues = [...row.issues]
      if (!row.storeName || !stores.some(s => s.name.toLowerCase() === row.storeName.toLowerCase())) {
        issues.push({ code: 'unknown-store', message: `Store “${row.storeName || '(blank)'}” is not in the store catalogue`, severity: 'error' as const })
      }
      if (row.promoPrice != null && row.normalPrice == null) {
        issues.push({ code: 'promo-normal-required', message: 'Promotion rows need a normal price as well as the promo price', severity: 'error' as const })
      }
      if (row.promoPrice != null && (!row.startDate || !row.endDate)) {
        issues.push({ code: 'promo-dates-required', message: 'Promotion rows need valid start and end dates', severity: 'error' as const })
      }
      const categoryValue = mapping.category ? String(row.raw[mapping.category] || '').trim() : ''
      if (categoryValue && !categories.some(c => c.name.toLowerCase() === categoryValue.toLowerCase())) {
        issues.push({ code: 'unknown-category', message: `Category “${categoryValue}” was not found; choose a valid category in the source file`, severity: 'error' as const })
      }
      return { ...row, issues }
    })
    setRows(checked)
    setSummary(null)
  }

  const importApproved = async () => {
    setBusy(true)
    try {
      const payload = approved.map(row => {
        const store = stores.find(s => s.name.toLowerCase() === row.storeName.toLowerCase())!
        const categoryName = mapping.category ? String(row.raw[mapping.category] || '').trim() : ''
        const category = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase())
        return {
          name: row.name, storeId: store.id, unit: row.unit,
          barcode: mapping.barcode ? String(row.raw[mapping.barcode] || '').trim() : '',
          brand: mapping.brand ? String(row.raw[mapping.brand] || '').trim() : '',
          categoryId: category?.id, normalPrice: row.normalPrice, promoPrice: row.promoPrice,
          startDate: row.startDate, endDate: row.endDate,
        }
      })
      const result = await applyLocalCatalogueImport(payload)
      setSummary(result)
      toast({ title: 'Local catalogue updated', description: `${result.rowsProcessed} approved rows saved in this browser.` })
    } catch (error) {
      toast({ title: 'Import not saved', description: error instanceof Error ? error.message : 'Please review the file and try again.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const exportCatalogueFile = async (kind: 'products' | 'promos') => {
    try {
      const snapshot = await exportLocalCatalogueSnapshot()
      if (kind === 'products') downloadJson('products.json', { products: snapshot.products })
      else downloadJson('promos.json', { promos: snapshot.promos })
      toast({ title: 'Catalogue file exported', description: `${kind}.json downloaded. Review it before publishing.` })
    } catch (error) {
      toast({ title: 'Export failed', description: error instanceof Error ? error.message : 'Could not export catalogue.', variant: 'destructive' })
    }
  }

  return <div className="space-y-4">
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
      <div className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-sky-400" /><h2 className="font-bold text-sm">Local catalogue import</h2></div>
      <p className="text-xs leading-relaxed text-zinc-400">CSV and Excel files are read inside this browser. Nothing is uploaded and nothing changes in the live catalogue. Choose a default retailer for rows without a store column.</p>
      <label className="block text-[10px] font-bold uppercase text-zinc-400">Default retailer</label>
      <select value={defaultStore} onChange={e => setDefaultStore(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-2.5 text-sm text-white">
        {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-700 p-5 text-sm text-zinc-300 hover:border-sky-400">
        <Upload className="h-5 w-5" /> Choose CSV / Excel file
        <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void parseFile(f); e.currentTarget.value = '' }} />
      </label>
      {file && <p className="text-xs text-sky-300">{file.name} · {file.records.length} rows</p>}
    </section>

    {file && <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
      <h3 className="font-bold text-sm">Map columns</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {fields.map(([key, label]) => <label key={key} className="text-[10px] font-bold uppercase text-zinc-400">{label}
          <select value={mapping[key] || ''} onChange={e => setMapping(m => ({ ...m, [key]: e.target.value }))} className="mt-1 h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 text-xs normal-case text-white">
            <option value="">— skip —</option>{file.headers.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </label>)}
      </div>
      <Button onClick={review} disabled={!mapping.name || (!mapping.normalPrice && !mapping.promoPrice)} className="bg-sky-600 hover:bg-sky-700">Review rows</Button>
    </section>}

    {rows.length > 0 && <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
      <div><h3 className="font-bold text-sm">Import review</h3><p className="mt-1 text-xs text-zinc-400">{counts.total} rows · {counts.errors} errors · {counts.warnings} warnings · {approved.length} ready</p></div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-zinc-800 p-2"><b>{counts.promoRows}</b><p className="text-zinc-400">Promotions</p></div>
        <div className="rounded-lg bg-zinc-800 p-2"><b>{counts.priceOnly}</b><p className="text-zinc-400">Price updates</p></div>
        <div className="rounded-lg bg-zinc-800 p-2"><b>{counts.errors}</b><p className="text-zinc-400">Errors</p></div>
      </div>
      <div className="max-h-80 space-y-2 overflow-auto">
        {rows.map(row => <div key={row.sourceIndex} className="rounded-lg border border-zinc-800 p-3 text-xs">
          <div className="flex items-start justify-between gap-2"><b>{row.name || '(missing product name)'}</b><span className={rowHasError(row) ? 'text-red-400' : 'text-lime-400'}>{rowHasError(row) ? 'Needs correction' : 'Ready'}</span></div>
          <p className="mt-1 text-zinc-400">{row.storeName} · Normal {row.normalPrice == null ? '—' : `R${row.normalPrice.toFixed(2)}`} · Promo {row.promoPrice == null ? '—' : `R${row.promoPrice.toFixed(2)}`}</p>
          {row.issues.map((issue, i) => <p key={i} className={issue.severity === 'error' ? 'mt-1 text-red-400' : 'mt-1 text-amber-300'}>{issue.severity.toUpperCase()}: {issue.message}</p>)}
        </div>)}
      </div>
      <Button onClick={importApproved} disabled={!canImport} className="bg-lime-600 hover:bg-lime-700">{busy ? 'Saving locally…' : `Save ${approved.length} approved rows to this browser`}</Button>
      {counts.errors > 0 && <p className="text-xs text-amber-300">Correct the source file and review it again. Rows with errors are never imported.</p>}
    </section>}

    {summary && <section className="rounded-2xl border border-lime-800 bg-lime-950/30 p-4 text-sm">
      <h3 className="font-bold text-lime-300">Saved in this browser</h3>
      <p className="mt-2 text-xs text-zinc-300">{summary.rowsProcessed} rows · {summary.productsCreated} new products · {summary.productsUpdated} existing products updated · {summary.pricesUpserted} store prices · {summary.promosCreated} new promotions</p>
    </section>}

    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-2">
      <h3 className="font-bold text-sm">Export approved catalogue</h3>
      <p className="text-xs text-zinc-400">Download the merged catalogue snapshots after importing. These files are for a separate, reviewed repository update; this button does not deploy or publish anything.</p>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => exportCatalogueFile('products')} className="border-zinc-700 text-zinc-200"><Download className="mr-2 h-4 w-4" /> Export products.json</Button><Button variant="outline" onClick={() => exportCatalogueFile('promos')} className="border-zinc-700 text-zinc-200"><Download className="mr-2 h-4 w-4" /> Export promos.json</Button></div>
    </section>
  </div>
}
