import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const bad = await db.store.findFirst({ where: { name: 'Pick N Pay' } })
const good = await db.store.findFirst({ where: { name: 'Pick n Pay' } })
if (!bad || !good) { console.log('nothing to fix'); process.exit(0) }

// 1. Move promos
const promos = await db.promotion.findMany({ where: { storeId: bad.id } })
for (const p of promos) {
  const dup = await db.promotion.findFirst({ where: { storeId: good.id, productId: p.productId, promoPrice: p.promoPrice } })
  if (dup) await db.promotion.delete({ where: { id: p.id } })
  else await db.promotion.update({ where: { id: p.id }, data: { storeId: good.id } })
}

// 2. Move store prices (keep good-store value when both exist)
const prices = await db.storePrice.findMany({ where: { storeId: bad.id } })
let moved = 0, dropped = 0
for (const sp of prices) {
  const dup = await db.storePrice.findUnique({
    where: { storeId_productId: { storeId: good.id, productId: sp.productId } },
  })
  if (dup) { await db.storePrice.delete({ where: { id: sp.id } }); dropped++ }
  else { await db.storePrice.update({ where: { id: sp.id }, data: { storeId: good.id } }); moved++ }
}

// 3. Safety: reassign any other references, then delete
await db.shopSession.updateMany({ where: { storeId: bad.id }, data: { storeId: good.id } })
await db.whatsNewPost.updateMany({ where: { storeId: bad.id }, data: { storeId: good.id } })
await db.store.delete({ where: { id: bad.id } })
console.log(`Fixed: promos merged, prices moved=${moved} dropped=${dropped}, duplicate store deleted`)

const check = await db.store.findMany({ select: { name: true } })
console.log('Stores now:', check.map((s) => s.name).join(', '))
await db.$disconnect()
