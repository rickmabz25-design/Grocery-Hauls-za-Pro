import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const bad = await db.store.findFirst({ where: { name: 'Pick N Pay' } })
console.log('bad store:', bad)
if (bad) {
  const promos = await db.promotion.findMany({ where: { storeId: bad.id }, include: { product: true } })
  for (const p of promos) console.log('BAD PROMO:', p.product.name, '| promo', p.promoPrice, '| normal', p.normalPrice, '|', p.status, '| ends', p.endDate.toISOString().slice(0, 10), '| source', p.source)
  const sessions = await db.shopSession.count({ where: { storeId: bad.id } })
  const prices = await db.storePrice.count({ where: { storeId: bad.id } })
  console.log({ sessions, prices })
}
await db.$disconnect()
