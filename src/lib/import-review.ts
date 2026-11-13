/**
 * Browser-safe review helpers for catalogue/promotion imports.
 * Pure functions only: no network, filesystem, database, or server dependency.
 */

export type ImportIssue = {
  code: string
  message: string
  severity: 'error' | 'warning'
}

export type ImportReviewRow = {
  sourceIndex: number
  name: string
  storeName: string
  unit: string
  normalPrice: number | null
  promoPrice: number | null
  promoOffer: string
  multiBuyOffer: boolean
  startDate: string | null
  endDate: string | null
  issues: ImportIssue[]
  raw: Record<string, unknown>
}

export type ImportColumnMap = {
  name?: string
  store?: string
  unit?: string
  normalPrice?: string
  promoPrice?: string
  promoOffer?: string
  startDate?: string
  endDate?: string
}

export type ImportReviewContext = {
  defaultStoreName?: string
  defaultStart?: string
  defaultEnd?: string
  publishedKeys?: Set<string>
}

const text = (value: unknown): string => value == null ? '' : String(value).trim()

export function parsePrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null
  let raw = text(value)
  if (!raw || /^(n\/?a|na|null|none|-)$/i.test(raw)) return null
  raw = raw.replace(/[Rr]\s?/g, '').replace(/\s/g, '').replace(/[^\d,.-]/g, '')
  if (!raw || raw === '-' || raw.startsWith('-')) return null

  // SA decimal comma (12,99) versus thousands comma (1,299.00).
  if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/,/g, '')
  else if (raw.includes(',')) {
    const parts = raw.split(',')
    raw = parts.length === 2 && parts[1].length <= 2 ? parts[0] + '.' + parts[1] : parts.join('')
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null
}

export function parseDate(value: unknown): string | null {
  const raw = text(value)
  if (!raw) return null
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/)
  if (iso) {
    const [, y, m, d] = iso
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
    return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d)
      ? `${y}-${m}-${d}` : null
  }
  const local = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/)
  if (local) {
    const day = Number(local[1]), month = Number(local[2]), year = Number(local[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  return null
}

export function normName(value: unknown): string {
  return text(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

export function pubKey(name: unknown, store: unknown): string {
  return `${normName(name)}::${normName(store).replace(/\s/g, '')}`
}

/**
 * Detects a common flyer/OCR export shape: the whole flyer is stored as one
 * long first-row cell and becomes a fake column heading in SheetJS.
 * Such files must not be offered for normal column mapping.
 */
export function isLikelyUnstructuredFlyer(headers: string[], records: Array<Record<string, unknown>>): boolean {
  if (headers.length !== 1 || records.length > 3) return false
  const heading = headers[0]?.trim() ?? ''
  return heading.length >= 80 && !/^(product|item|description|name|store|price)/i.test(heading)
}

export function autoMap(headers: string[]): ImportColumnMap {
  const normalized = headers.map((h) => ({ original: h, key: h.toLowerCase().replace(/[^a-z0-9]/g, '') }))
  const pick = (patterns: RegExp[]): string | undefined =>
    normalized.find(({ key }) => patterns.some((p) => p.test(key)))?.original

  return {
    name: pick([/^product(name|description)?$/, /^item(name|description)?$/, /^description$/, /^name$/]),
    store: pick([/^store(name)?$/, /^retailer$/, /^merchant$/]),
    unit: pick([/^unit$/, /^size$/, /^pack(age)?$/, /^weight$/, /^volume$/, /^description$/]),
    normalPrice: pick([/^normal(price)?$/, /^regular(price)?$/, /^was(price)?$/, /^old(price)?$/, /^rrp$/]),
    promoPrice: pick([/^promo(price)?$/, /^special(price)?$/, /^selling(price)?$/, /^now(price)?$/, /^deal(price)?$/]),
    promoOffer: pick([/^(?:price)?offer$/, /^promotionoffer$/, /^dealdescription$/, /^offertext$/, /^specialoffer$/]),
    startDate: pick([/^start(date)?$/, /^valid(from|fromdate)?$/, /^from(date)?$/, /^datefrom$/]),
    endDate: pick([/^end(date)?$/, /^valid(to|todate)?$/, /^to(date)?$/, /^dateto$/, /^expiry(date)?$/]),
  }
}

export function rowHasError(row: Pick<ImportReviewRow, 'issues'>): boolean {
  return row.issues.some((issue) => issue.severity === 'error')
}

export function buildReviewRows(
  records: Array<Record<string, unknown>>,
  mapping: ImportColumnMap,
  context: ImportReviewContext = {},
): ImportReviewRow[] {
  const seen = new Set<string>()
  return records.map((raw, index) => {
    const name = text(mapping.name ? raw[mapping.name] : '')
    const storeName = text(mapping.store ? raw[mapping.store] : '') || text(context.defaultStoreName)
    const unit = text(mapping.unit ? raw[mapping.unit] : '')
    const normalPrice = parsePrice(mapping.normalPrice ? raw[mapping.normalPrice] : null)
    const promoOffer = text(mapping.promoOffer ? raw[mapping.promoOffer] : '')
    const multiBuyOffer = /\bBUY\s+(?:\d+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)\b|\b(?:\d+|two|three|four|five|six|seven|eight|nine|ten)\s+FOR\s+R?\s*\d/i.test(promoOffer)
    const promoPrice = parsePrice(mapping.promoPrice ? raw[mapping.promoPrice] : null) ?? (!multiBuyOffer && promoOffer ? parsePrice(promoOffer) : null)
    const startDate = parseDate(mapping.startDate ? raw[mapping.startDate] : null) || context.defaultStart || null
    const endDate = parseDate(mapping.endDate ? raw[mapping.endDate] : null) || context.defaultEnd || null
    const issues: ImportIssue[] = []
    const add = (code: string, message: string, severity: 'error' | 'warning' = 'error') => issues.push({ code, message, severity })

    if (!name) add('missing-name', 'Product name is required')
    if (normalPrice == null && promoPrice == null && !multiBuyOffer) add('missing-price', 'Enter a normal price or a single-item promotion price')
    if (multiBuyOffer) add('multi-buy-review', 'Multi-buy offer detected. It is preserved for review but must not be imported as a single-item price until multi-buy support is added.')
    if (normalPrice != null && promoPrice != null && promoPrice >= normalPrice)
      add('promo-not-lower', 'Promotion price must be lower than the normal price')
    if (promoPrice == null && normalPrice != null)
      add('no-promo', 'Price-only row: no promotion price supplied', 'warning')
    if (startDate && endDate && startDate > endDate)
      add('invalid-date-range', 'End date must be on or after start date')
    if (name && storeName) {
      const key = pubKey(name, storeName)
      if (seen.has(key)) add('duplicate-in-import', 'Duplicate product/store row in this import')
      else seen.add(key)
      if (context.publishedKeys?.has(key))
        add('duplicate-published', 'This product/store already exists in the published catalogue', 'warning')
    }
    return { sourceIndex: index, name, storeName, unit, normalPrice, promoPrice, promoOffer, multiBuyOffer, startDate, endDate, issues, raw }
  })
}

export function reviewSummary(rows: ImportReviewRow[]) {
  return {
    total: rows.length,
    promoRows: rows.filter((row) => !rowHasError(row) && row.promoPrice != null).length,
    priceOnly: rows.filter((row) => !rowHasError(row) && row.promoPrice == null && row.normalPrice != null).length,
    errors: rows.filter(rowHasError).length,
    warnings: rows.filter((row) => !rowHasError(row) && row.issues.some((issue) => issue.severity === 'warning')).length,
  }
}
