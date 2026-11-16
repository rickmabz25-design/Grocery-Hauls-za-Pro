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
  notes: string
  multiBuyOffer: boolean
  multiBuyQuantity: number | null
  multiBuyPrice: number | null
  singleItemPrice: number | null
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
  notes?: string
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

export function parseDate(value: unknown, dateOrder: 'day-first' | 'month-first' = 'day-first'): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  // Excel stores dates as day counts from 1899-12-30. Accept these when a
  // worksheet parser supplies numeric date cells instead of formatted text.
  if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 100000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000)
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null
  }
  const raw = text(value)
  if (!raw) return null
  // CSV/XLSX readers may return ISO dates with a time suffix or use
  // slash-separated year-first dates. Validate calendar parts explicitly.
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/)
  if (iso) {
    const year = Number(iso[1]), month = Number(iso[2]), day = Number(iso[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null
  }
  // Some CSV/XLSX parsers stringify Excel serial dates instead of returning numbers.
  if (/^\d{4,5}(?:\.0+)?$/.test(raw)) {
    const serial = Number(raw)
    if (serial > 0 && serial < 100000) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000)
      return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null
    }
  }
  // Slash/dash dates can be day-first (D/M/YYYY) or month-first (M/D/YYYY).
  // Keep the existing South African day-first default, but let a whole import
  // select month-first when its rows provide an unambiguous clue (e.g. 11/22/2026).
  const local = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/)
  if (local) {
    const first = Number(local[1]), second = Number(local[2])
    const yearPart = Number(local[3])
    const year = local[3].length === 2 ? (yearPart <= 69 ? 2000 + yearPart : 1900 + yearPart) : yearPart
    const month = dateOrder === 'month-first' ? first : second
    const day = dateOrder === 'month-first' ? second : first
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
  // Retailer CSVs use many variations of the same headings. Match the
  // common exact forms first, then use conservative token-based fallbacks.
  const pickFallback = (test: (key: string) => boolean, exclude: (key: string) => boolean = () => false) =>
    normalized.find(({ key }) => test(key) && !exclude(key))?.original

  const name = pick([/^product(name|description)?$/, /^item(name|description)?$/, /^description$/, /^name$/]) ||
    pickFallback(key => /product|item|description|stockitem/.test(key) && !/category|brand|barcode/.test(key))
  const store = pick([/^store(name)?$/, /^retailer$/, /^merchant$/]) ||
    pickFallback(key => /store|retailer|merchant/.test(key))
  const startDate = pick([/^start(date)?$/, /^(?:promo|promotion|offer|flyer)start(date)?$/, /^valid(from|fromdate)?$/, /^validity(start|from)$/, /^from(date)?$/, /^datefrom$/, /^offerstart(date)?$/]) ||
    pickFallback(key => /(start|from|validfrom|validitystart)/.test(key) && /date|valid|start|from/.test(key), key => /end|until|expiry|expire|to$/.test(key))
  const endDate = pick([/^end(date)?$/, /^(?:promo|promotion|offer|flyer)end(date)?$/, /^valid(until|untildate|to|todate)?$/, /^validity(end|until|to)$/, /^to(date)?$/, /^dateto$/, /^expiry(date)?$/, /^offerend(date)?$/, /^expires?(on|date)?$/]) ||
    pickFallback(key => /(end|until|validto|validuntil|expiry|expires|expiration|validityend)/.test(key) && /date|valid|end|until|expiry|expire|to/.test(key), key => /start|from/.test(key))

  return {
    name,
    store,
    unit: pick([/^unit$/, /^size$/, /^pack(age)?$/, /^weight$/, /^volume$/]) || pickFallback(key => /size|packsize|packaging|weight|volume/.test(key)),
    normalPrice: pick([/^normal(price)?$/, /^regular(price)?$/, /^was(price)?$/, /^old(price)?$/, /^rrp$/, /^shelfprice$/]) || pickFallback(key => /(normal|regular|shelf|was|old|rrp).*price|price.*(normal|regular|shelf|was|old|rrp)/.test(key)),
    promoPrice: pick([/^promo(price)?$/, /^special(price)?$/, /^selling(price)?$/, /^now(price)?$/, /^deal(price)?$/, /^promotionprice$/]) || pickFallback(key => /(promo|special|selling|current|deal|offer).*price|price.*(promo|special|selling|current|deal|offer)/.test(key), key => /normal|regular|was|old|rrp/.test(key)),
    promoOffer: pick([/^(?:price)?offer$/, /^promotionoffer$/, /^dealdescription$/, /^offertext$/, /^specialoffer$/, /^multibuyoffer$/]) ||
      pickFallback(key => /(offer|multibuy|dealdescription|promotiondetails|specialdetails)/.test(key), key => /price$/.test(key)),
    notes: pick([/^notes?$/, /^remarks?$/, /^additionalinfo$/, /^flyerdetails$/, /^comments?$/]) || pickFallback(key => /notes|remarks|additionalinfo|flyerdetails|comments/.test(key)),
    startDate,
    endDate,
  }
}

const numberWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

export function parseMultiBuyOffer(value: unknown): { quantity: number; bundlePrice: number } | null {
  const raw = text(value)
  const quantityOf = (value: string) => Number(value) || numberWords[value.toLowerCase()] || 0
  const priceOf = (value: string) => parsePrice(value.replace(/,/g, ''))
  // Prefer the explicit final total in flyer annotations; earlier amounts may
  // be savings or pack sizes rather than the bundle price.
  const mustBuy = raw.match(/must\s+buy\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+to\s+get\s+R?\s*([\d,]+(?:\.\d{1,2})?)/i)
  if (mustBuy) {
    const quantity = quantityOf(mustBuy[1])
    const bundlePrice = priceOf(mustBuy[2])
    return quantity > 0 && bundlePrice != null ? { quantity, bundlePrice } : null
  }
  const bothFor = raw.match(/\bboth\s+for\s+R?\s*([\d,]+(?:\.\d{1,2})?)/i)
  if (bothFor) {
    const bundlePrice = priceOf(bothFor[1])
    return bundlePrice != null ? { quantity: 2, bundlePrice } : null
  }
  const buyCount = raw.match(/\bbuy\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i)
  const quantityFor = raw.match(/\b(?:any\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+for\s+R?\s*([\d,]+(?:\.\d{1,2})?)/i)
  const packCountFor = raw.match(/\b(\d+)\s*[x×]\s*.*?\bfor\s+R?\s*([\d,]+(?:\.\d{1,2})?)/i)
  const match = quantityFor || packCountFor
  if (match) {
    const quantity = quantityOf(buyCount?.[1] || match[1])
    const bundlePrice = priceOf(match[2])
    return quantity > 0 && bundlePrice != null ? { quantity, bundlePrice } : null
  }
  return null
}

export function parseSingleItemPrice(value: unknown): number | null {
  const raw = text(value)
  const match = raw.match(/\bsingle(?:\s+item)?(?:\s+price)?\s*[:=-]?\s*R?\s*(\d+(?:[.,]\d{1,2})?)/i)
  return match ? parsePrice(match[1]) : null
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
  // Infer the date order once for the entire file using unambiguous dates.
  // If any date has a second component > 12, the file is month-first;
  // if any first component > 12, it is day-first. Ambiguous-only files retain
  // the South African day-first default rather than silently changing meaning.
  const dateValues = records.flatMap((raw) => [
    mapping.startDate ? raw[mapping.startDate] : null,
    mapping.endDate ? raw[mapping.endDate] : null,
  ]).map(text)
  const dateParts = dateValues.map((value) => value.match(/^(\\d{1,2})[/.-](\\d{1,2})[/.-](?:\\d{2}|\\d{4})$/)).filter(Boolean)
  const dateOrder: 'day-first' | 'month-first' =
    dateParts.some((match) => Number(match![2]) > 12 && Number(match![1]) <= 12)
      ? 'month-first'
      : 'day-first'
  return records.map((raw, index) => {
    const name = text(mapping.name ? raw[mapping.name] : '')
    const storeName = text(mapping.store ? raw[mapping.store] : '') || text(context.defaultStoreName)
    const unit = text(mapping.unit ? raw[mapping.unit] : '')
    const normalPrice = parsePrice(mapping.normalPrice ? raw[mapping.normalPrice] : null)
    const promoOffer = text(mapping.promoOffer ? raw[mapping.promoOffer] : '')
    const notes = text(mapping.notes ? raw[mapping.notes] : '')
    const multiBuy = parseMultiBuyOffer(promoOffer)
    const multiBuyOffer = /\bBUY\s+(?:\d+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)\b|\bMUST\s+BUY\s+\d+\b|\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+FOR\s+R?\s*\d|\bBOTH\s+FOR\b|\b\d+\s*[x×].*?\bFOR\s+R/i.test(promoOffer)
    const singleItemPrice = parseSingleItemPrice(notes)
    const explicitPromoPrice = parsePrice(mapping.promoPrice ? raw[mapping.promoPrice] : null)
    const promoPrice = explicitPromoPrice ?? (multiBuyOffer ? null : (promoOffer ? parsePrice(promoOffer) : null))
    const startDate = parseDate(mapping.startDate ? raw[mapping.startDate] : null, dateOrder) || context.defaultStart || null
    const endDate = parseDate(mapping.endDate ? raw[mapping.endDate] : null, dateOrder) || context.defaultEnd || null
    const issues: ImportIssue[] = []
    const add = (code: string, message: string, severity: 'error' | 'warning' = 'error') => issues.push({ code, message, severity })

    if (!name) add('missing-name', 'Product name is required')
    if (normalPrice == null && promoPrice == null && !multiBuy) add('missing-price', 'Enter a normal price, a single-item promotion price, or a complete multi-buy offer')
    if (multiBuyOffer && !multiBuy) add('multi-buy-details', 'Multi-buy wording was found, but its quantity or bundle price could not be read. Correct the offer before saving')
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
    return { sourceIndex: index, name, storeName, unit, normalPrice, promoPrice, promoOffer, notes, multiBuyOffer, multiBuyQuantity: multiBuy?.quantity ?? null, multiBuyPrice: multiBuy?.bundlePrice ?? null, singleItemPrice, startDate, endDate, issues, raw }
  })
}

export function reviewSummary(rows: ImportReviewRow[]) {
  return {
    total: rows.length,
    promoRows: rows.filter((row) => !rowHasError(row) && row.promoPrice != null).length,
    multiBuyRows: rows.filter((row) => !rowHasError(row) && row.multiBuyQuantity != null && row.multiBuyPrice != null).length,
    priceOnly: rows.filter((row) => !rowHasError(row) && row.promoPrice == null && (row.normalPrice != null || row.singleItemPrice != null)).length,
    errors: rows.filter(rowHasError).length,
    warnings: rows.filter((row) => !rowHasError(row) && row.issues.some((issue) => issue.severity === 'warning')).length,
  }
}
