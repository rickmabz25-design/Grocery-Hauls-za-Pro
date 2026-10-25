/**
 * Import REAL uploaded promotions into Grocery Hauls Pro za
 * Sources (uploaded by user):
 *   - Pick_n_Pay_Promotions.xlsx  → Pick n Pay catalogue, valid 7–22 Oct 2026 (Smart Shopper)
 *   - page0001.pdf                → Boxer "SHOP NOW! 4 Days Only" flyer, 15–18 Oct 2026, Gauteng stores
 *
 * Also stages the original files (pdf / jpeg / xlsx) as Upload records so they
 * are showcased in Admin → Files, and creates two What's New posts with the
 * actual flyer images as banners.
 *
 * Note: Boxer flyer deals expired 18 Oct (real window). For demo visibility the
 * promotion end dates are extended to 25 Oct 2026 23:59 SAST; the real window is
 * preserved in each product description and in the What's New post.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const round99 = (p: number) => Math.max(4.99, Math.round(p) - 0.01)
const SAST = '+02:00'
const pnpStart = new Date(`2026-10-07T00:00:00${SAST}`)
const pnpEnd = new Date(`2026-10-22T23:59:00${SAST}`)
const bxStart = new Date(`2026-10-15T00:00:00${SAST}`)
const bxDemoEnd = new Date(`2026-10-25T23:59:00${SAST}`)
const ADMIN = 'rick@endintcap.online'

const MULTS: Record<string, number> = {
  Boxer: 0.93, Shoprite: 1.0, Checkers: 1.05, 'Pick n Pay': 1.06,
  Woolworths: 1.18, SPAR: 1.1, Clicks: 1.08,
}

type NewProd = {
  name: string; category: string; unit: string; brand?: string
  base: number; description: string
}

// ---- New products introduced by the two real catalogues --------------------
const NEW_PRODUCTS: NewProd[] = [
  // Pick n Pay catalogue items not yet in catalogue
  { name: 'PnP Fresh Chicken Drumsticks & Thighs', category: 'Meat & Chicken', unit: 'per kg', brand: 'PnP Fresh', base: 84.99, description: 'Fresh chicken portions, price per kg (4 drumsticks & 4 thighs tray). From the Pick n Pay catalogue 7–22 Oct 2026.' },
  { name: 'Flora / Rama Spread Tub', category: 'Cooking Oil & Staples', unit: 'assorted', brand: 'Flora / Rama', base: 66.99, description: 'Flora Spread 1kg, Flora ProActiv 500g or Rama Original Tub 1kg. From the Pick n Pay catalogue 7–22 Oct 2026.' },
  { name: 'Doritos Flavoured Corn Chips', category: 'Snacks', unit: '145g', brand: 'Doritos', base: 24.99, description: 'Assorted flavours. Buy any 2 for R36 (R18 per pack). From the Pick n Pay catalogue 7–22 Oct 2026.' },
  { name: 'Nescafé Cappuccino Sachets', category: 'Drinks', unit: '7–10s', brand: 'Nescafé', base: 51.99, description: 'Assorted cappuccino sachets. Any 3 for 2. From the Pick n Pay catalogue 7–22 Oct 2026.' },
  { name: 'PnP no name 2-Ply Toilet Tissue', category: 'Cleaning Products', unit: '18 rolls', brand: 'PnP no name', base: 113.99, description: '350 sheets per roll, dermatologically tested. From the Pick n Pay catalogue 7–22 Oct 2026.' },
  { name: 'Defy 7.6L Digital XXL Air Fryer', category: 'Home & Appliances', unit: '7.6 litre', brand: 'Defy', base: 949.99, description: 'Digital XXL air fryer with window for easy viewing. From the Pick n Pay catalogue 7–22 Oct 2026.' },
  { name: 'Bread + Milk + Eggs Family Bundle', category: 'Bread & Bakery', unit: '3 items', brand: 'Blue Ribbon / PnP', base: 79.99, description: 'Blue Ribbon Classic White Sliced Bread 700g + PnP Full Cream or Low Fat Fresh Milk 2L + PnP no name Large Eggs 6s. Bundle price R49.99. From the Pick n Pay catalogue 7–22 Oct 2026.' },
  // Boxer flyer items not yet in catalogue
  { name: "MAMA'S Frozen Chilli Russians", category: 'Meat & Chicken', unit: '4kg', brand: "MAMA'S", base: 179.99, description: 'Frozen Russians assorted 4kg pack. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: 'Fresh Beef T-Bone / Club / Rump Steak', category: 'Meat & Chicken', unit: 'per kg', base: 139.99, description: 'T-Bone / Club / Rump on bone steak, Class A, loose serve per kg. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: 'Boxer Fresh Classic Boerewors', category: 'Meat & Chicken', unit: 'per kg', brand: 'Boxer', base: 119.99, description: 'Fresh classic boerewors, loose serve per kg. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: 'Fresh Bulk Pork Packs', category: 'Meat & Chicken', unit: 'per kg', base: 89.99, description: 'Fresh bulk pork packs, pre-packed, per kg. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: "MAMA'S IQF Mixed Chicken Portions", category: 'Meat & Chicken', unit: '4kg', brand: "MAMA'S", base: 199.99, description: 'IQF mixed chicken portions with brine-based mixture, 4kg. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: 'Frozen Chicken Wings', category: 'Meat & Chicken', unit: 'per kg', base: 84.99, description: 'Frozen chicken wings, loose serve per kg. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: 'Fresh Ground Beef (Flavoured)', category: 'Meat & Chicken', unit: 'per kg', base: 99.99, description: 'Fresh flavoured ground beef, loose serve per kg. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: 'Frozen Hake', category: 'Meat & Chicken', unit: 'per kg', base: 79.99, description: 'Frozen hake, loose serve per kg. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: 'GO Meal Chicken Bucket', category: 'Meat & Chicken', unit: '15 piece', brand: 'GO Meal', base: 179.99, description: 'Crumbed / grilled chicken bucket, 15 pieces. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: 'Chicken Sizzler / Plain Russian Roll', category: 'Meat & Chicken', unit: 'each', base: 14.99, description: 'Chicken sizzler or plain Russian roll. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: 'Best Cook French / Chicken Polony', category: 'Meat & Chicken', unit: '2kg', brand: 'Best Cook', base: 54.99, description: 'French or chicken polony, 2kg. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: 'Imitation Cream Ready Made Cake', category: 'Bread & Bakery', unit: 'each', base: 134.99, description: 'Imitation cream ready-made cake. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: 'Traditional / Chocolate Queen Cakes', category: 'Bread & Bakery', unit: "10s", base: 26.99, description: 'Traditional or chocolate queen cakes, pack of 10. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: 'Clover Medium Cream Maas', category: 'Eggs & Dairy', unit: '2L', brand: 'Clover', base: 38.99, description: 'Medium cream maas 2L. Buy two for R55 (R27.50 each). Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: 'Albany Superior Sliced Brown Bread', category: 'Bread & Bakery', unit: '700g', brand: 'Albany', base: 20.99, description: 'Superior sliced brown bread 700g. Buy 3 for R39. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: 'Jam, Peanut Butter & Spread Combo', category: 'Cooking Oil & Staples', unit: '3 items', base: 129.99, description: 'All Gold Smooth Apricot Jam 900g + Black Cat Creamia Smooth Peanut Butter 400g + Sunshine D Original 60% Fat Spread 1kg. Buy all 3 for R99. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: 'Jam Tomatoes & Green Pepper Combo', category: 'Fruit & Vegetables', unit: 'combo', base: 39.99, description: 'Jam tomatoes 1kg + green pepper count bag. Buy both for R32 per combo. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: 'Carrots', category: 'Fruit & Vegetables', unit: '1kg', base: 14.99, description: 'Carrots 1kg. Buy two for R18. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: 'Potatoes Family Bag', category: 'Fruit & Vegetables', unit: '7kg', base: 69.99, description: 'Potatoes family bag 7kg. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: 'Onions Bulk Bag', category: 'Fruit & Vegetables', unit: '7kg', base: 114.99, description: 'Onions bulk bag 7kg. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
  { name: 'Butternut Family Pocket', category: 'Fruit & Vegetables', unit: 'pocket', base: 69.99, description: 'Butternut family pocket. Boxer 4-Day flyer deal (15–18 Oct 2026, Gauteng stores).' },
]

// Multi-buy promos explained in the description; prices are per selling unit
type PromoDef = {
  product: string; store: string
  promoPrice: number; normalPrice?: number // normalPrice: printed regular if given, else store shelf price
}

const PNP_PROMOS: PromoDef[] = [
  { product: 'PnP Fresh Chicken Drumsticks & Thighs', store: 'Pick n Pay', promoPrice: 76.99 },
  { product: 'Flora / Rama Spread Tub', store: 'Pick n Pay', promoPrice: 54.99, normalPrice: 69.99 },
  { product: 'Doritos Flavoured Corn Chips', store: 'Pick n Pay', promoPrice: 18.0, normalPrice: 25.99 },
  { product: 'Nescafé Cappuccino Sachets', store: 'Pick n Pay', promoPrice: 36.66 },
  { product: 'PnP no name 2-Ply Toilet Tissue', store: 'Pick n Pay', promoPrice: 109.99, normalPrice: 119.99 },
  { product: 'PnP no name 2-Ply Toilet Tissue', store: 'Pick n Pay', promoPrice: 100.0, normalPrice: 119.99 },
  { product: 'Defy 7.6L Digital XXL Air Fryer', store: 'Pick n Pay', promoPrice: 899.0, normalPrice: 999.0 },
  { product: 'Bread + Milk + Eggs Family Bundle', store: 'Pick n Pay', promoPrice: 49.99, normalPrice: 84.97 },
]

const BOXER_PROMOS: PromoDef[] = [
  { product: "MAMA'S Frozen Chilli Russians", store: 'Boxer', promoPrice: 149.99 },
  { product: 'Fresh Beef T-Bone / Club / Rump Steak', store: 'Boxer', promoPrice: 99.99 },
  { product: 'Boxer Fresh Classic Boerewors', store: 'Boxer', promoPrice: 89.99 },
  { product: 'Fresh Bulk Pork Packs', store: 'Boxer', promoPrice: 59.99 },
  { product: "MAMA'S IQF Mixed Chicken Portions", store: 'Boxer', promoPrice: 159.99 },
  { product: 'Frozen Chicken Wings', store: 'Boxer', promoPrice: 69.99 },
  { product: 'Fresh Ground Beef (Flavoured)', store: 'Boxer', promoPrice: 69.99 },
  { product: 'Frozen Hake', store: 'Boxer', promoPrice: 59.99 },
  { product: 'GO Meal Chicken Bucket', store: 'Boxer', promoPrice: 149.0 },
  { product: 'Chicken Sizzler / Plain Russian Roll', store: 'Boxer', promoPrice: 9.99 },
  { product: 'Best Cook French / Chicken Polony', store: 'Boxer', promoPrice: 44.99 },
  { product: 'Imitation Cream Ready Made Cake', store: 'Boxer', promoPrice: 114.99 },
  { product: 'Traditional / Chocolate Queen Cakes', store: 'Boxer', promoPrice: 21.99 },
  { product: 'Clover Medium Cream Maas', store: 'Boxer', promoPrice: 27.5 },
  { product: 'Albany Superior Sliced Brown Bread', store: 'Boxer', promoPrice: 13.99 },
  { product: 'Jam, Peanut Butter & Spread Combo', store: 'Boxer', promoPrice: 99.0 },
  { product: 'Nulaid Large Eggs', store: 'Boxer', promoPrice: 59.99 }, // matches existing product (30's)
  { product: 'Jam Tomatoes & Green Pepper Combo', store: 'Boxer', promoPrice: 32.0 },
  { product: 'Carrots', store: 'Boxer', promoPrice: 9.0 },
  { product: 'Potatoes Family Bag', store: 'Boxer', promoPrice: 59.99 },
  { product: 'Onions Bulk Bag', store: 'Boxer', promoPrice: 99.99 },
  { product: 'Butternut Family Pocket', store: 'Boxer', promoPrice: 59.99 },
]

const UPLOADS = [
  { filename: 'boxer-4day-flyer-15-18-oct2026.pdf', fileType: 'pdf', fileSize: 825068, relatedStore: 'Boxer', url: '/uploads/boxer-4day-flyer-15-18-oct2026.pdf' },
  { filename: 'boxer-flyer-oct2026.png', fileType: 'png', fileSize: 4382898, relatedStore: 'Boxer', url: '/uploads/boxer-flyer-oct2026.png' },
  { filename: 'pnp-catalogue-7-22-oct2026.jpeg', fileType: 'jpeg', fileSize: 658880, relatedStore: 'Pick n Pay', url: '/uploads/pnp-catalogue-7-22-oct2026.jpeg' },
  { filename: 'pick-n-pay-promotions-oct2026.xlsx', fileType: 'xlsx', fileSize: 667806, relatedStore: 'Pick n Pay', url: '/uploads/pick-n-pay-promotions-oct2026.xlsx' },
]

async function main() {
  console.log('📥 Importing real uploaded promotions...')

  // 0. Clean stale upload records from earlier test runs
  const stale = await prisma.upload.deleteMany({ where: { filename: { contains: 'test-import' } } })
  if (stale.count) console.log(`🧹 Removed ${stale.count} stale test upload records`)

  // 1. Extra category for the air fryer
  const ha = await prisma.category.upsert({
    where: { name: 'Home & Appliances' },
    update: {},
    create: { name: 'Home & Appliances', icon: '🔌', sortOrder: 13 },
  })
  console.log('✅ Category ready: Home & Appliances')

  const stores = await prisma.store.findMany()
  const storeByName = new Map(stores.map((s) => [s.name, s]))
  const cats = await prisma.category.findMany()
  const catByName = new Map(cats.map((c) => [c.name, c]))

  // 2. Products + store prices for all 7 stores (same model as seed)
  const prodIds = new Map<string, string>()
  let created = 0
  for (const p of NEW_PRODUCTS) {
    const existing = await prisma.product.findFirst({ where: { name: p.name } })
    if (existing) { prodIds.set(p.name, existing.id); continue }
    const catId = catByName.get(p.category)?.id ?? ha.id
    const product = await prisma.product.create({
      data: { name: p.name, categoryId: catId, unit: p.unit, brand: p.brand, description: p.description },
    })
    prodIds.set(p.name, product.id)
    await prisma.storePrice.createMany({
      data: stores.map((s) => ({
        storeId: s.id,
        productId: product.id,
        price: round99(p.base * (MULTS[s.name] ?? 1)),
      })),
    })
    created++
  }
  console.log(`✅ Products created: ${created} (matched existing for the rest)`)

  // 3. Promotions
  let promoCount = 0
  const promosByStore: Record<string, string[]> = { 'Pick n Pay': [], Boxer: [] }
  for (const batch of [
    { defs: PNP_PROMOS, start: pnpStart, end: pnpEnd },
    { defs: BOXER_PROMOS, start: bxStart, end: bxDemoEnd },
  ]) {
    for (const d of batch.defs) {
      const productId = prodIds.get(d.product)
        ?? (await prisma.product.findFirst({ where: { name: d.product } }))?.id
      const store = storeByName.get(d.store)
      if (!productId || !store) { console.warn(`⚠️ skip ${d.product} @ ${d.store}`); continue }
      const dup = await prisma.promotion.findFirst({
        where: { productId, storeId: store.id, promoPrice: d.promoPrice, endDate: { gte: new Date() } },
      })
      if (dup) { promosByStore[d.store].push(dup.id); continue }
      let normal = d.normalPrice
      if (normal == null) {
        const sp = await prisma.storePrice.findUnique({
          where: { storeId_productId: { storeId: store.id, productId } },
        })
        normal = sp?.price ?? d.promoPrice
      }
      const promo = await prisma.promotion.create({
        data: {
          productId, storeId: store.id,
          promoPrice: d.promoPrice, normalPrice: normal,
          startDate: batch.start, endDate: batch.end,
          status: 'published', source: 'import',
        },
      })
      promosByStore[d.store].push(promo.id)
      promoCount++
    }
  }
  console.log(`✅ Promotions created: ${promoCount} (PnP ${promosByStore['Pick n Pay'].length} live, Boxer ${promosByStore['Boxer'].length} live)`)

  // 4. Upload records for the original files (showcased in Admin → Files)
  for (const u of UPLOADS) {
    const exists = await prisma.upload.findFirst({ where: { filename: u.filename } })
    if (!exists) await prisma.upload.create({ data: { ...u, uploadedBy: ADMIN } })
  }
  console.log(`✅ Upload records: ${UPLOADS.length} files on file`)

  // 5. What's New posts with the real flyer images as banners
  const pnpStore = storeByName.get('Pick n Pay')!
  const bxStore = storeByName.get('Boxer')!
  const posts = [
    {
      title: '🛒 New: Pick n Pay "Save Like a Champion" Catalogue',
      description:
        'The latest Pick n Pay catalogue (valid 7–22 October 2026) has landed — fresh chicken portions at R76.99/kg, Flora or Rama spread for R54.99, Doritos any 2 for R36, Nescafé Cappuccino any 3 for 2, PnP no name toilet tissue from R100 per pack, the Defy 7.6L Digital XXL Air Fryer at R899 (save R100) and the R49.99 bread + milk + eggs family bundle. Smart Shopper prices. The original catalogue photo and transcribed spreadsheet are on file — tap a related deal below to add it to your list.',
      imageUrl: '/uploads/pnp-catalogue-7-22-oct2026.jpeg',
      storeId: pnpStore.id, tag: 'new',
      promoIds: promosByStore['Pick n Pay'],
    },
    {
      title: '⚡ Boxer SHOP NOW! — 4 Days Only Flash Deals (Gauteng)',
      description:
        "Boxer's 4-day flash flyer (15–18 October 2026, Gauteng stores, 2 deals per customer, while stocks last) is stacked with meat and fresh produce savings: T-Bone/Club/Rump steak R99.99/kg, fresh boerewors R89.99/kg, MAMA'S IQF chicken 4kg R159.99, large eggs 30's R59.99, Albany brown bread 3 for R39, Clover maas 2 for R55, potatoes 7kg R59.99, butternut pockets R59.99 and more. See the full flyer below and tap a related deal to add it to your list.",
      imageUrl: '/uploads/boxer-flyer-oct2026.png',
      storeId: bxStore.id, tag: 'campaign',
      promoIds: promosByStore['Boxer'],
    },
  ]
  for (const p of posts) {
    const exists = await prisma.whatsNewPost.findFirst({ where: { title: p.title } })
    if (!exists) {
      await prisma.whatsNewPost.create({ data: p })
      console.log(`📰 What's New post: ${p.title}`)
    } else {
      await prisma.whatsNewPost.update({ where: { id: exists.id }, data: { description: p.description, imageUrl: p.imageUrl, promoIds: p.promoIds, active: true } })
      console.log(`📰 What's New post updated: ${p.title}`)
    }
  }

  // 6. Summary
  const totals = {
    products: await prisma.product.count(),
    promos: await prisma.promotion.count({ where: { status: 'published', endDate: { gte: new Date() } } }),
    uploads: await prisma.upload.count(),
    posts: await prisma.whatsNewPost.count({ where: { active: true } }),
  }
  console.log('📊 Catalogue now:', totals)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
