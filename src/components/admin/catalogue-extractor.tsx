'use client'

import { useMemo, useState } from 'react'
import { FileSearch, FileUp, Download, Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

type DraftRow = { id: string; name: string; unit: string; normalPrice: string; promoPrice: string; startDate: string; endDate: string; category: string; page: string; sourceText: string; reviewed: boolean }
type OcrWorker = { recognize: (source: HTMLCanvasElement) => Promise<{ data: { text: string } }>; terminate: () => Promise<void> }
const PRICE_RE = /(?:R\s*\d{1,4}(?:[.,]\d{2})?|\b\d{1,4}[.,]\d{2})/gi
const NON_PRODUCT = /\b(save|was|now|each|per|special|deal|offer|valid|limited|while|stocks|last|from|only|buy|get|free|off|ends|until|boxer|superstores|gauteng|national|selected|terms|conditions)\b/i

function money(raw: string) { const n = Number(raw.replace(/[Rr\s]/g, '').replace(',', '.')); return Number.isFinite(n) ? n.toFixed(2) : '' }

function readableProductName(value: string) {
  const name = value.replace(/\s+/g, ' ').trim()
  const words = name.match(/[A-Za-z][A-Za-z0-9&'’-]*/g) ?? []
  const noise = (name.match(/[^A-Za-z0-9\s&'’().,-]/g) ?? []).length
  return name.length >= 5 && name.length <= 80 && words.length >= 2 && noise <= 1
}

function rowsFromTile(text: string, page: number, tile: number, startDate: string, endDate: string): DraftRow[] {
  const lines = text.split(/\r?\n/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const output: DraftRow[] = []
  for (let i = 0; i < lines.length; i++) {
    const matches = [...lines[i].matchAll(PRICE_RE)]
    if (!matches.length) continue
    const nameParts = lines.slice(Math.max(0, i - 3), i + 1).map(x => x.replace(PRICE_RE, ' ').replace(/\b(?:R|WAS|NOW)\b/gi, ' ').replace(/[|•:]/g, ' ').trim())
      .filter(x => readableProductName(x) && !NON_PRODUCT.test(x))
    const name = [...nameParts].reverse()[0] || ''
    if (!name) continue
    const prices = matches.map(m => money(m[0])).filter(Boolean)
    if (!prices.length) continue
    const hasWas = /\bwas\b/i.test(lines[i])
    const hasNow = /\bnow\b/i.test(lines[i])
    if (prices.length > 1 && !hasNow) continue
    output.push({ id: 'p' + page + '-t' + tile + '-l' + i + '-' + output.length, name, unit: '',
      normalPrice: hasWas && prices.length > 1 ? prices[0] : '',
      promoPrice: prices[prices.length - 1],
      startDate, endDate, category: '', page: 'Page ' + page + ', section ' + tile, sourceText: lines[i], reviewed: false })
  }
  return output
}

function loadTesseract(): Promise<{ createWorker: (language: string) => Promise<OcrWorker> }> {
  return new Promise((resolve, reject) => {
    const w = window as Window & { Tesseract?: { createWorker: (language: string) => Promise<OcrWorker> } }
    if (w.Tesseract) return resolve(w.Tesseract)
    const existing = document.querySelector<HTMLScriptElement>('script[data-gh-catalogue-ocr="true"]')
    if (existing) { existing.addEventListener('load', () => w.Tesseract ? resolve(w.Tesseract) : reject(new Error('OCR library did not initialise.')), { once: true }); existing.addEventListener('error', () => reject(new Error('Could not load the free OCR library.')), { once: true }); return }
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js'; script.async = true; script.dataset.ghCatalogueOcr = 'true'
    script.onload = () => w.Tesseract ? resolve(w.Tesseract) : reject(new Error('OCR library did not initialise.'))
    script.onerror = () => reject(new Error('Could not load the free OCR library. Check your internet connection.'))
    document.head.appendChild(script)
  })
}

async function imageCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file), scale = Math.min(1, 2600 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Could not prepare the image for reading.')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); return canvas
}

async function pdfCanvases(file: File, progress: (s: string) => void): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true }).promise
  const pages: HTMLCanvasElement[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    progress('Preparing PDF page ' + n + ' of ' + pdf.numPages + '…')
    const page = await pdf.getPage(n), base = page.getViewport({ scale: 2.2 })
    const scale = Math.min(1, 2600 / Math.max(base.width, base.height)), viewport = page.getViewport({ scale: 2.2 * scale })
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Could not render PDF page ' + n + '.')
    await page.render({ canvas, canvasContext: ctx, viewport }).promise; pages.push(canvas)
  }
  return pages
}

function cropTiles(source: HTMLCanvasElement): HTMLCanvasElement[] {
  const tiles: HTMLCanvasElement[] = [], columns = 3, rows = 3, gutter = Math.round(Math.min(source.width, source.height) * .006)
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const x = Math.round(c * source.width / columns), y = Math.round(r * source.height / rows)
    const width = Math.min(source.width - x, Math.round(source.width / columns) - gutter), height = Math.min(source.height - y, Math.round(source.height / rows) - gutter)
    if (width < 80 || height < 80) continue
    const tile = document.createElement('canvas'); tile.width = width; tile.height = height
    const ctx = tile.getContext('2d'); if (ctx) { ctx.drawImage(source, x, y, width, height, 0, 0, width, height); tiles.push(tile) }
  }
  return tiles
}

function downloadCsv(rows: DraftRow[]) {
  const headers = ['name','store','unit','normalPrice','promoPrice','startDate','endDate','category','barcode','brand']
  const esc = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
  const lines = rows.map(r => [r.name,'Boxer',r.unit,r.normalPrice,r.promoPrice,r.startDate,r.endDate,r.category,'',''].map(esc).join(','))
  const blob = new Blob(['\uFEFF', [headers.map(esc).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'boxer-reviewed-catalogue-' + new Date().toISOString().slice(0,10) + '.csv'; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function CatalogueExtractor() {
  const [files, setFiles] = useState<File[]>([]), [startDate, setStartDate] = useState(''), [endDate, setEndDate] = useState('')
  const [rows, setRows] = useState<DraftRow[]>([]), [hasRun, setHasRun] = useState(false), [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('')
  const readyRows = useMemo(() => rows.filter(r => r.reviewed && r.name.trim() && r.promoPrice.trim()), [rows])
  const unreviewed = rows.length - rows.filter(r => r.reviewed).length
  const updateRow = (id: string, patch: Partial<DraftRow>) => setRows(current => current.map(r => r.id === id ? { ...r, ...patch, reviewed: patch.reviewed ?? false } : r))
  const run = async () => {
    if (!files.length) { setError('Choose a PDF or catalogue images first.'); return }
    if (!startDate || !endDate || startDate > endDate) { setError('Enter valid promotion dates.'); return }
    setBusy(true); setError(''); setRows([]); setHasRun(false)
    try {
      setStatus('Loading free browser OCR…')
      const tesseract = await loadTesseract(), worker = await tesseract.createWorker('eng'), extracted: DraftRow[] = []
      try {
        for (const file of files) {
          const pages = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? await pdfCanvases(file, setStatus) : file.type.startsWith('image/') ? [await imageCanvas(file)] : (() => { throw new Error(file.name + ' is not a PDF or supported image.') })()
          for (let p = 0; p < pages.length; p++) {
            const tiles = cropTiles(pages[p])
            for (let t = 0; t < tiles.length; t++) {
              setStatus('Reading ' + file.name + ': page ' + (p + 1) + ', section ' + (t + 1) + ' of ' + tiles.length + '…')
              const result = await worker.recognize(tiles[t])
              extracted.push(...rowsFromTile(result.data.text, p + 1, t + 1, startDate, endDate))
            }
          }
        }
      } finally { await worker.terminate() }
      const unique = new Map<string, DraftRow>()
      for (const row of extracted) { const key = row.name.toLowerCase() + '|' + row.promoPrice + '|' + row.page; if (!unique.has(key)) unique.set(key, row) }
      const candidates = [...unique.values()]; setRows(candidates); setHasRun(true)
      setStatus(candidates.length ? 'Found ' + candidates.length + ' possible rows. Check every row against the original catalogue.' : 'No reliable product/price pairs found. Try clearer page images.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Extraction failed.'); setStatus('') }
    finally { setBusy(false) }
  }

  return <div className="space-y-4">
    <section className="rounded-2xl border border-sky-800 bg-zinc-900 p-5 space-y-3">
      <div className="flex items-center gap-2"><FileSearch className="h-5 w-5 text-sky-400" /><h2 className="font-bold text-sm">Boxer-first reusable catalogue extractor</h2></div>
      <p className="text-xs leading-relaxed text-zinc-300">Free browser-based extraction for PDF catalogues and multiple page images. Pages are split into sections to reduce product/price mixing.</p>
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-3 text-xs text-zinc-300"><b className="text-white">Safeguards</b><ul className="mt-1 list-disc space-y-1 pl-4"><li>Files are processed in this browser; they are not uploaded.</li><li>No paid AI or retailer API. OCR code and English language data download when needed.</li><li>Nothing is saved to the live catalogue. Only checked rows can be exported.</li></ul></div>
      <label className="block text-[10px] font-bold uppercase text-zinc-400">Retailer<input value="Boxer" readOnly className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 p-2.5 text-sm text-white" /></label>
      <label className="block text-[10px] font-bold uppercase text-zinc-400">Promotion valid from<input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 p-2.5 text-sm text-white" /></label>
      <label className="block text-[10px] font-bold uppercase text-zinc-400">Promotion valid until<input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 p-2.5 text-sm text-white" /></label>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-700 p-5 text-sm text-zinc-300 hover:border-sky-400"><FileUp className="h-5 w-5" /> Choose PDF and/or multiple catalogue images<input type="file" accept=".pdf,application/pdf,image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => { setFiles(Array.from(e.target.files || [])); setRows([]); setHasRun(false); setError(''); e.currentTarget.value = '' }} /></label>
      {files.length > 0 && <div className="rounded-lg bg-zinc-800 p-3 text-xs text-zinc-300"><b className="text-white">{files.length} file(s) selected</b><ul className="mt-1 list-disc pl-4">{files.map((f,i) => <li key={i}>{f.name} · {(f.size/1024/1024).toFixed(1)} MB</li>)}</ul></div>}
      <Button onClick={run} disabled={busy || !files.length} className="w-full bg-sky-600 hover:bg-sky-700">{busy ? 'Extracting…' : 'Extract catalogue products'}</Button>
      {status && <p role="status" className="text-xs text-sky-300">{status}</p>}{error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </section>
    {hasRun && <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
      <div><h3 className="font-bold text-sm">Review extracted rows</h3><p className="text-xs text-zinc-400 mt-1">{rows.length} candidates · {unreviewed} still need review · {readyRows.length} approved</p></div>
      {rows.length === 0 && <p className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-3 text-xs text-zinc-300">No candidates remain in this review. Choose the catalogue files and run extraction again to start a fresh review.</p>}
      {rows.map(row => <div key={row.id} className="rounded-xl border border-zinc-700 p-3 space-y-2">
        <div className="flex items-center justify-between"><p className="text-[10px] uppercase text-zinc-500">{row.page}</p><button type="button" onClick={() => setRows(current => current.filter(r => r.id !== row.id))} aria-label="Remove row" className="text-zinc-500 hover:text-red-300"><Trash2 className="h-4 w-4" /></button></div>
        <label className="block text-[10px] uppercase text-zinc-400">Product name<input value={row.name} onChange={e => updateRow(row.id,{name:e.target.value})} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 p-2 text-sm text-white" /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] uppercase text-zinc-400">Pack / size<input value={row.unit} onChange={e => updateRow(row.id,{unit:e.target.value})} placeholder="e.g. 5kg" className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 p-2 text-sm text-white" /></label>
          <label className="text-[10px] uppercase text-zinc-400">Category<input value={row.category} onChange={e => updateRow(row.id,{category:e.target.value})} placeholder="Optional" className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 p-2 text-sm text-white" /></label>
          <label className="text-[10px] uppercase text-zinc-400">Normal price (if shown)<input value={row.normalPrice} onChange={e => updateRow(row.id,{normalPrice:e.target.value})} placeholder="R 0.00" className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 p-2 text-sm text-white" /></label>
          <label className="text-[10px] uppercase text-zinc-400">Special price<input value={row.promoPrice} onChange={e => updateRow(row.id,{promoPrice:e.target.value})} placeholder="R 0.00" className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 p-2 text-sm text-white" /></label>
        </div>
        <p className="text-[10px] text-zinc-500">OCR text: {row.sourceText}</p>
        <label className="flex items-center gap-2 text-xs text-zinc-200"><input type="checkbox" checked={row.reviewed} onChange={e => updateRow(row.id,{reviewed:e.target.checked})} /> I checked this product and price against the original flyer</label>
      </div>)}
      <div className="rounded-lg border border-amber-800/70 bg-amber-950/20 p-3 text-xs text-amber-200"><div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Normal price warning</div><p className="mt-1">The extractor will not invent a normal price. If the flyer shows only a special price, that field stays blank and must be completed before importing a promotion into the existing catalogue.</p></div>
      <Button onClick={() => downloadCsv(readyRows)} disabled={!readyRows.length} className="w-full bg-lime-600 hover:bg-lime-700"><Download className="mr-2 h-4 w-4" /> Download reviewed CSV ({readyRows.length})</Button>
      <p className="text-[10px] text-zinc-500">Only checked rows are exported. CSV download does not import or publish anything.</p>
    </section>}
  </div>
}
