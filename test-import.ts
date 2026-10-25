// Unit tests for the Phase 2 import pipeline (run: bun scripts/test-import.ts)
import { parsePrice, parseDate, buildReviewRows, reviewSummary, rowHasError, autoMap, normName, pubKey } from '../src/lib/import-review'

let pass = 0
let fail = 0
const ok = (cond: boolean, name: string) => {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ FAIL: ${name}`)
  }
}

console.log('--- parsePrice ---')
ok(parsePrice('R49.99') === 49.99, 'R49.99 -> 49.99')
ok(parsePrice('R 1,299.00') === 1299, 'R 1,299.00 -> 1299 (thousands comma)')
ok(parsePrice('12,99') === 12.99, '12,99 -> 12.99 (SA decimal comma)')
ok(parsePrice('') === null, 'empty -> null')
ok(parsePrice('n/a') === null, 'n/a -> null')
ok(parsePrice('-5') === null, 'negative rejected (non-finite check via >= 0)') // -5 is < 0 -> null
ok(parsePrice('84.97') === 84.97, 'plain number')

console.log('--- parseDate ---')
ok(parseDate('15/10/2026') === '2026-10-15', 'dd/mm/yyyy (SA style)')
ok(parseDate('2026-10-15') === '2026-10-15', 'ISO stays ISO')
ok(parseDate('2026-10-15T00:00:00.000Z') === '2026-10-15', 'ISO datetime -> date')
ok(parseDate('') === null, 'empty -> null')
ok(parseDate('not a date') === null, 'garbage -> null (falls through)')

console.log('--- normName / pubKey ---')
ok(normName('  Clover  Full-Cream Milk 2L ') === 'clover full cream milk 2l', 'name normalised')
ok(pubKey('Milk 2L', 'Pick n Pay') === pubKey('milk  2L!', 'picknpay'), 'dup key matches across formats')

console.log('--- autoMap ---')
const headers = ['Product Description', 'Selling Price', 'Was Price', 'Pack', 'Valid To', 'Store']
const m = autoMap(headers)
ok(m.name === 'Product Description', 'name -> Product Description')
ok(m.promoPrice === 'Selling Price', 'promoPrice -> Selling Price (startsWith "selling"? no — includes check) ')
ok(m.unit === 'Pack', 'unit -> Pack')
ok(m.endDate === 'Valid To', 'endDate -> Valid To')

console.log('--- buildReviewRows flags ---')
const ctx = {
  defaultStoreName: 'Boxer',
  defaultStart: '2026-10-21',
  defaultEnd: '2026-11-20',
  publishedKeys: new Set([pubKey('Existing Promo Product', 'Boxer')]),
}
const rows = buildReviewRows(
  [
    { Name: 'Rice 5kg', Was: 'R99.99', Now: 'R79.99' },
    { Name: 'Rice 5kg', Was: 'R99.99', Now: 'R79.99' }, // duplicate in import
    { Name: 'Existing Promo Product', Was: 'R50', Now: 'R40' }, // duplicate published (warn)
    { Name: '', Was: 'R10', Now: 'R5' }, // missing name
    { Name: 'No prices item' }, // missing price
    { Name: 'Bad promo', Was: 'R50', Now: 'R60' }, // promo >= normal
    { Name: 'Price only', Was: 'R30' }, // no promo (warn, price-only)
  ],
  { name: 'Name', normalPrice: 'Was', promoPrice: 'Now' },
  ctx,
)
ok(rows.length === 7, '7 rows built')
ok(rows[0].issues.length === 0, 'row 1 clean')
ok(rows[1].issues.some((i) => i.code === 'duplicate-in-import'), 'row 2 flagged duplicate-in-import')
ok(rows[2].issues.some((i) => i.code === 'duplicate-published'), 'row 3 flagged duplicate-published (warn)')
ok(rows[3].issues.some((i) => i.code === 'missing-name'), 'row 4 flagged missing-name')
ok(rows[4].issues.some((i) => i.code === 'missing-price'), 'row 5 flagged missing-price')
ok(rows[5].issues.some((i) => i.code === 'promo-not-lower'), 'row 6 flagged promo-not-lower')
ok(rows[6].issues.some((i) => i.code === 'no-promo') && !rowHasError(rows[6]), 'row 7 price-only warn, no error')

const sum = reviewSummary(rows)
ok(sum.promoRows === 2, `2 publishable promos (got ${sum.promoRows})`)
ok(sum.priceOnly === 1, `1 price-only row (got ${sum.priceOnly})`)
ok(sum.errors === 4, `4 error rows (got ${sum.errors})`)

console.log('--- default store/date fallback ---')
const rows2 = buildReviewRows([{ Name: 'Fallback item', Was: 'R10', Now: 'R8' }], { name: 'Name', normalPrice: 'Was', promoPrice: 'Now' }, ctx)
ok(rows2[0].storeName === 'Boxer', 'store defaults to selected supermarket')
ok(rows2[0].startDate === '2026-10-21' && rows2[0].endDate === '2026-11-20', 'dates default to selected period')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
