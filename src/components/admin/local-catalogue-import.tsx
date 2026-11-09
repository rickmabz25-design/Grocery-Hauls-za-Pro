'use client'

import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { autoMap, buildReviewRows, rowHasError, reviewSummary, isLikelyUnstructuredFlyer, type ImportReviewRow } from '@/lib/import-review'
import { applyLocalCatalogueImport, exportLocalCatalogueSnapshot } from '@/lib/static-data'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'

type Store = { id: string; name: string; color?: string }
type Category = { id: string; name: string; icon?: string }
type ParsedFile = { headers: string[]; records: Record<string, unknown>[]; name: string; defaultStart?: string; defaultEnd?: string }
type FlyerCandidate = { id: number; name: string; normalPrice: string; promoPrice: string; sourceLine: string }

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
  const [fileNotice, setFileNotice] = useState('')
  const [flyerUrl, setFlyerUrl] = useState('')
  const [flyerPreviewUrl, setFlyerPreviewUrl] = useState('')
  const [flyerImageError, setFlyerImageError] = useState(false)
  const [flyerStartDate, setFlyerStartDate] = useState('2026-10-22')
  const [flyerEndDate, setFlyerEndDate] = useState('2026-11-08')
  const [flyerOcrBusy, setFlyerOcrBusy] = useState(false)
  const [flyerOcrStatus, setFlyerOcrStatus] = useState('')
  const [flyerOcrText, setFlyerOcrText] = useState('')
  const [flyerCandidates, setFlyerCandidates] = useState<FlyerCandidate[]>([])
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
    setFile(null); setRows([]); setSummary(null); setFileNotice('')
    try {
      const bytes = await selected.arrayBuffer()
      const workbook = XLSX.read(bytes, { type: 'array', cellDates: false })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!sheet) throw new Error('The workbook has no readable worksheet.')
      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
      if (!records.length) throw new Error('No data rows were found in the first worksheet.')
      const headers = Object.keys(records[0])
      if (!headers.length) throw new Error('No column headings were found.')
      if (isLikelyUnstructuredFlyer(headers, records)) {
        setFileNotice('This file appears to contain a whole flyer as one block of OCR text, not a product table. The importer cannot safely tell which price belongs to which product, so it has stopped the import rather than create incorrect catalogue prices. Open the original Boxer catalogue, then use a properly structured spreadsheet with one product per row. Flyer image/PDF OCR extraction is not yet implemented.')
        return
      }
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

  const runFlyerOcr = async () => {
    if (!flyerPreviewUrl) return
    if (!flyerStartDate || !flyerEndDate) {
      toast({ title: 'Flyer dates required', description: 'Enter the promotion start and end dates before extracting products.', variant: 'destructive' })
      return
    }
    if (flyerStartDate > flyerEndDate) {
      toast({ title: 'Check flyer dates', description: 'The end date must be on or after the start date.', variant: 'destructive' })
      return
    }
    setFlyerOcrBusy(true); setFlyerOcrStatus('Loading browser OCR…'); setFlyerCandidates([]); setFlyerOcrText('')
    try {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.src = flyerPreviewUrl
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('The image host blocked the image from being read. Try downloading the flyer page and choosing it as a local image file.')) })
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Your browser could not prepare the flyer image for text recognition.')
      context.drawImage(image, 0, 0)
      await new Promise<void>((resolve, reject) => canvas.toBlob(blob => blob ? resolve() : reject(new Error('Could not prepare flyer image.')), 'image/png'))
      const w = window as Window & { Tesseract?: { createWorker: (lang: string, oem?: number) => Promise<{ recognize: (source: HTMLCanvasElement) => Promise<{ data: { text: string; lines?: Array<{ text: string }>; words?: Array<{ text: string; confidence?: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> } }>; terminate: () => Promise<void> }> } }
      if (!w.Tesseract) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector<HTMLScriptElement>('script[data-flyer-ocr="tesseract"]')
          if (existing) { existing.addEventListener('load', () => resolve(), { once: true }); existing.addEventListener('error', () => reject(new Error('Could not load the browser OCR library.')), { once: true }); return }
          const script = document.createElement('script')
          script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js'
          script.async = true; script.dataset.flyerOcr = 'tesseract'
          script.onload = () => resolve(); script.onerror = () => reject(new Error('Could not load the browser OCR library. Check your internet connection and try again.'))
          document.head.appendChild(script)
        })
      }
      if (!w.Tesseract) throw new Error('Browser OCR library did not initialise.')
      setFlyerOcrStatus('Reading flyer text locally in this browser…')
      const worker = await w.Tesseract.createWorker('eng', 1)
      try {
        const result = await worker.recognize(canvas)
        const lines = (result.data.lines || result.data.text.split(/\r?\n/).map(text => ({ text }))).map(line => line.text.trim()).filter(Boolean)
        setFlyerOcrText(lines.join('\n'))

        // Use Tesseract word coordinates rather than requiring product and price
        // to appear on the same OCR line. Flyer layouts commonly put prices below
        // product descriptions or in a separate nearby price panel.
        type OcrWord = { text: string; confidence?: number; bbox: { x0: number; y0: number; x1: number; y1: number } }
        type OcrDataWithBlocks = typeof result.data & {
          blocks?: Array<{ paragraphs?: Array<{ lines?: Array<{ words?: OcrWord[] }> }> }>
        }
        const ocrData = result.data as OcrDataWithBlocks
        // Tesseract.js v6 nests positioned words inside blocks > paragraphs > lines.
        // Keep the top-level fallback for engines/builds that expose data.words.
        const topLevelWords = (ocrData.words || []) as OcrWord[]
        const blockWords = (ocrData.blocks || []).flatMap(block =>
          (block.paragraphs || []).flatMap(paragraph =>
            (paragraph.lines || []).flatMap(line => line.words || []),
          ),
        )
        const words = topLevelWords.length ? topLevelWords : blockWords
        const usableWords = words.filter(word =>
          word.text.trim() &&
          Number.isFinite(word.bbox?.x0) &&
          Number.isFinite(word.bbox?.y0) &&
          Number.isFinite(word.bbox?.x1) &&
          Number.isFinite(word.bbox?.y1) &&
          (word.confidence == null || word.confidence >= 20),
        )
        const heights = usableWords.map(word => Math.max(1, word.bbox.y1 - word.bbox.y0)).sort((a, b) => a - b)
        const medianHeight = heights.length ? heights[Math.floor(heights.length / 2)]! : 16
        const grouped: Array<{ words: OcrWord[]; y: number; x0: number; x1: number; text: string }> = []
        for (const word of [...usableWords].sort((a, b) => (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2 || a.bbox.x0 - b.bbox.x0)) {
          const cy = (word.bbox.y0 + word.bbox.y1) / 2
          let line = grouped.find(item => Math.abs(item.y - cy) <= Math.max(9, medianHeight * 0.7) && word.bbox.x0 <= item.x1 + medianHeight * 8 && word.bbox.x1 >= item.x0 - medianHeight * 8)
          if (!line) {
            line = { words: [], y: cy, x0: word.bbox.x0, x1: word.bbox.x1, text: '' }
            grouped.push(line)
          }
          line.words.push(word)
          line.y = line.words.reduce((sum, item) => sum + (item.bbox.y0 + item.bbox.y1) / 2, 0) / line.words.length
          line.x0 = Math.min(line.x0, word.bbox.x0)
          line.x1 = Math.max(line.x1, word.bbox.x1)
        }
        grouped.forEach(line => {
          line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0)
          line.text = line.words.map(word => word.text).join(' ').trim()
        })
        const pricePattern = /^(?:R\s*)?\d{1,4}(?:[.,]\d{2})?$/i
        const priceLines = grouped.flatMap(line => {
          const found = line.words.map(word => {
            const cleaned = word.text.replace(/^[^\dRr]+|[^\d.,]+$/g, '').replace(/^R(?=\d)/i, 'R')
            return pricePattern.test(cleaned) ? cleaned.replace(/^R\s*/i, '') : ''
          }).filter(Boolean)
          return found.map(price => ({ line, price }))
        }).filter(item => {
          const value = Number(item.price.replace(',', '.'))
          return Number.isFinite(value) && value >= 10 && value <= 9999
        })
        const productLines = grouped.filter(line => /[\p{L}]{3}/u.test(line.text) && line.text.replace(/[^\p{L}]/gu, '').length >= 4)
        const candidates = priceLines.map((item, index) => {
          const nearest = productLines
            .filter(line => line.y <= item.line.y + medianHeight * 1.5)
            .map(line => {
              const overlap = Math.max(0, Math.min(line.x1, item.line.x1) - Math.max(line.x0, item.line.x0))
              const width = Math.max(1, Math.min(line.x1 - line.x0, item.line.x1 - item.line.x0))
              const horizontalPenalty = 1 - overlap / width
              const verticalDistance = Math.abs(item.line.y - line.y)
              return { line, score: verticalDistance + horizontalPenalty * medianHeight * 5 }
            })
            .sort((a, b) => a.score - b.score)[0]
          if (!nearest || nearest.score > medianHeight * 14) return null
          const name = nearest.line.text.replace(/\b(?:special|save|was|now|each|per|combo)\b/gi, ' ').replace(/\s+/g, ' ').trim()
          if (name.length < 4) return null
          return {
            id: index + 1, name, normalPrice: '', promoPrice: item.price,
            sourceLine: `${nearest.line.text}  →  ${item.line.text}`,
          }
        }).filter((row): row is NonNullable<typeof row> => row !== null)
        setFlyerCandidates(candidates)
        setFlyerOcrStatus(`Recognised ${lines.length} text lines and ${usableWords.length} positioned words; ${candidates.length} nearby product/price suggestions found. Whole-number prices are included, but every match needs manual checking.`)
        if (!candidates.length) toast({ title: 'Text recognised, no safe product rows found', description: 'Use the recognised text below to check the flyer manually.', variant: 'destructive' })
      } finally { await worker.terminate() }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Flyer text recognition failed.'
      setFlyerOcrStatus(message)
      toast({ title: 'Could not read flyer', description: message, variant: 'destructive' })
    } finally { setFlyerOcrBusy(false) }
  }

  const useFlyerCandidates = () => {
    const usable = flyerCandidates.filter(row => row.name.trim() && (row.normalPrice.trim() || row.promoPrice.trim()))
    if (!usable.length) { toast({ title: 'No product rows ready', description: 'Check the OCR results and enter product names and prices first.', variant: 'destructive' }); return }
    const headers = ['Product name', 'Normal price', 'Promo price']
    const records = usable.map(row => ({ 'Product name': row.name.trim(), 'Normal price': row.normalPrice.trim(), 'Promo price': row.promoPrice.trim() }))
    setFile({ headers, records, name: 'Flyer OCR review', defaultStart: flyerStartDate, defaultEnd: flyerEndDate })
    setMapping({ name: 'Product name', normalPrice: 'Normal price', promoPrice: 'Promo price' })
    setRows([]); setSummary(null)
    toast({ title: 'Flyer rows ready for mapping', description: `${usable.length} possible rows added. Review and correct them before saving.` })
  }

  const review = () => {
    if (!file) return
    const coreMap = {
      name: mapping.name, store: mapping.store, unit: mapping.unit,
      normalPrice: mapping.normalPrice, promoPrice: mapping.promoPrice,
      startDate: mapping.startDate, endDate: mapping.endDate,
    }
    const storeName = stores.find(s => s.id === defaultStore)?.name
    const built = buildReviewRows(file.records, coreMap, { defaultStoreName: storeName, defaultStart: file.defaultStart, defaultEnd: file.defaultEnd })
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
      <div className="space-y-2 rounded-xl border border-zinc-700 bg-zinc-800/60 p-3">
        <label htmlFor="flyer-image-url" className="block text-[10px] font-bold uppercase text-zinc-400">Or paste a direct flyer page image link</label>
        <input
          id="flyer-image-url"
          type="url"
          value={flyerUrl}
          onChange={e => { setFlyerUrl(e.target.value); setFlyerImageError(false) }}
          placeholder="https://example.co.za/flyer-page.jpg"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2.5 text-xs text-white"
        />
        <Button
          type="button"
          variant="outline"
          disabled={!flyerUrl.trim()}
          onClick={() => {
            try {
              const parsed = new URL(flyerUrl.trim())
              if (parsed.protocol !== 'https:' || !/\.(jpe?g|png|webp)(?:$|[?#])/i.test(parsed.href)) {
                throw new Error('Use a secure HTTPS link ending in JPG, PNG or WEBP.')
              }
              setFlyerPreviewUrl(parsed.href)
              setFlyerImageError(false)
            } catch (error) {
              setFlyerPreviewUrl('')
              setFlyerImageError(true)
              toast({ title: 'Flyer image link not accepted', description: error instanceof Error ? error.message : 'Check the link and try again.', variant: 'destructive' })
            }
          }}
          className="border-zinc-600 text-zinc-200"
        >Preview flyer page</Button>
        {flyerImageError && <p role="alert" className="text-xs text-amber-300">The link could not be loaded. Check that it is a direct HTTPS image link.</p>}
        <label className="block text-xs text-zinc-300">If the image host blocks OCR, choose the same flyer page from your computer:
          <input type="file" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full text-xs text-zinc-400" onChange={e => { const selected = e.target.files?.[0]; if (selected) { const localUrl = URL.createObjectURL(selected); setFlyerUrl(''); setFlyerPreviewUrl(localUrl); setFlyerImageError(false) } e.currentTarget.value = '' }} />
        </label>
        {flyerPreviewUrl && <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-[10px] font-bold uppercase text-zinc-400">Promotion valid from
              <input type="date" value={flyerStartDate} onChange={e => setFlyerStartDate(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-xs text-white" />
            </label>
            <label className="text-[10px] font-bold uppercase text-zinc-400">Promotion valid until
              <input type="date" value={flyerEndDate} onChange={e => setFlyerEndDate(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-xs text-white" />
            </label>
          </div>
          <Button type="button" onClick={runFlyerOcr} disabled={flyerOcrBusy || !flyerStartDate || !flyerEndDate} className="bg-sky-600 hover:bg-sky-700">{flyerOcrBusy ? 'Reading flyer…' : 'Read flyer text in browser'}</Button>
          {flyerOcrStatus && <p role="status" className="text-xs text-sky-300">{flyerOcrStatus}</p>}
          {flyerCandidates.length > 0 && <div className="space-y-2 rounded-lg border border-zinc-700 p-3">
            <p className="text-xs font-semibold text-white">Check the OCR suggestions — these may contain mistakes</p>
            <div className="max-h-72 space-y-2 overflow-auto">
              {flyerCandidates.map(row => <div key={row.id} className="grid grid-cols-1 gap-1 rounded-md bg-zinc-800 p-2 sm:grid-cols-[2fr_1fr_1fr]">
                <input aria-label={`Product name ${row.id}`} value={row.name} onChange={e => setFlyerCandidates(list => list.map(item => item.id === row.id ? { ...item, name: e.target.value } : item))} className="rounded border border-zinc-700 bg-zinc-900 p-2 text-xs text-white" placeholder="Product name" />
                <input aria-label={`Normal price ${row.id}`} value={row.normalPrice} onChange={e => setFlyerCandidates(list => list.map(item => item.id === row.id ? { ...item, normalPrice: e.target.value } : item))} className="rounded border border-zinc-700 bg-zinc-900 p-2 text-xs text-white" placeholder="Normal price" />
                <input aria-label={`Promo price ${row.id}`} value={row.promoPrice} onChange={e => setFlyerCandidates(list => list.map(item => item.id === row.id ? { ...item, promoPrice: e.target.value } : item))} className="rounded border border-zinc-700 bg-zinc-900 p-2 text-xs text-white" placeholder="Promo price" />
                <p className="text-[10px] text-zinc-500 sm:col-span-3">OCR: {row.sourceLine}</p>
              </div>)}
            </div>
            <Button type="button" onClick={useFlyerCandidates} className="bg-lime-600 hover:bg-lime-700">Use checked rows for column mapping</Button>
          </div>}
          {flyerOcrText && <details className="rounded-lg border border-zinc-700 p-2"><summary className="cursor-pointer text-xs text-zinc-300">Show all recognised flyer text</summary><textarea readOnly value={flyerOcrText} rows={8} className="mt-2 w-full rounded bg-zinc-950 p-2 text-xs text-zinc-300" /></details>}
          <p className="text-xs text-sky-300">Flyer page preview — enter the promotion dates, then run browser OCR. OCR suggestions must be checked manually.</p>
          <div className="max-h-96 overflow-auto rounded-lg border border-zinc-700 bg-zinc-950 p-2">
            <img
              src={flyerPreviewUrl}
              alt="Preview of the pasted retailer flyer page"
              className="mx-auto h-auto max-w-full"
              onError={() => setFlyerImageError(true)}
            />
          </div>
          {flyerImageError && <p role="alert" className="text-xs text-amber-300">This image host did not allow the browser to display the image. Try a direct image link from another source.</p>}
        </div>}
      </div>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-700 p-5 text-sm text-zinc-300 hover:border-sky-400">
        <Upload className="h-5 w-5" /> Choose CSV / Excel file
        <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void parseFile(f); e.currentTarget.value = '' }} />
      </label>
      {file && <p className="text-xs text-sky-300">{file.name} · {file.records.length} rows</p>}
      {fileNotice && <div role="alert" className="rounded-lg border border-amber-700/70 bg-amber-950/30 p-3 text-xs leading-relaxed text-amber-200">
        <b className="block mb-1">Flyer format detected — import stopped safely</b>
        {fileNotice}
        <a className="mt-2 inline-block underline text-sky-300" href="https://online.flippingbook.com/view/298605390/" target="_blank" rel="noreferrer">Open the original Boxer GP October flyer</a>
      </div>}
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
