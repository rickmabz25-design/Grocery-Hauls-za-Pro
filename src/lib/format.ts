// Shared formatting + constant helpers (client & server safe)

export function formatZAR(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return 'R0.00'
  return 'R' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function discountPct(promoPrice: number, normalPrice: number): number {
  if (!normalPrice) return 0
  return Math.max(0, Math.round((1 - promoPrice / normalPrice) * 100))
}

export function savedAmount(normalPrice: number, promoPrice: number): number {
  return Math.max(0, normalPrice - promoPrice)
}

export function formatShortDate(d: string | Date | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function daysUntil(d: string | Date): number {
  const date = typeof d === 'string' ? new Date(d) : d
  const diff = date.getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function endDateLabel(d: string | Date): string {
  const days = daysUntil(d)
  if (days < 0) return 'Expired'
  if (days === 0) return 'Ends today'
  if (days === 1) return 'Ends tomorrow'
  if (days <= 3) return `Ends in ${days} days`
  return `Ends ${formatShortDate(d)}`
}

export function isEndingSoon(d: string | Date): boolean {
  const days = daysUntil(d)
  return days >= 0 && days <= 3
}

export function timeAgo(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatShortDate(date)
}

export function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// Validates South African mobile numbers: 0[6-8]XXXXXXXX or +27[6-8]XXXXXXXX
export function isValidSAMobile(raw: string): boolean {
  const cleaned = raw.replace(/[\s\-()]/g, '')
  const local = cleaned.replace(/^\+27/, '0')
  if (cleaned.startsWith('+') && !cleaned.startsWith('+27')) return false
  return /^0[6-8]\d{8}$/.test(local)
}

export function normalizeSAMobile(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-()]/g, '')
  const local = cleaned.replace(/^\+27/, '0')
  if (!/^0[6-8]\d{8}$/.test(local)) return null
  return '+27' + local.slice(1)
}

export const DISCLAIMER_MANUAL =
  'This price is user-entered or web-sourced and is not verified. Actual in-store pricing may differ.'

export const DISCLAIMER_PRICES =
  'Prices and promotions are estimates and may change in-store. Always confirm the shelf price in-store.'

export const WHATSAPP_BANNER =
  'Add your WhatsApp number to receive alerts when items on your wish list go on special.'

export const NOT_ON_PROMO = 'Not on promotion.'

export const TRAVEL_WARNING_THRESHOLD = 30 // Rands — typical travel cost between stores

export const TAG_LABELS: Record<string, string> = {
  'black-friday': 'Black Friday',
  festive: 'Festive Season',
  'back-to-school': 'Back to School',
  bulk: 'Bulk Buy',
  campaign: 'Store Campaign',
  new: 'New Products',
}
