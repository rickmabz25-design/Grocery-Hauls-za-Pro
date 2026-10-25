import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import {
  STORES, CATEGORIES, PRODUCTS, PROMO_PICKS, WHATS_NEW_SEED,
  SEARCH_TERMS_SEED, ADMIN_SEED, DEMO_USER_SEED,
} from './seed-data'

const prisma = new PrismaClient()

const round99 = (p: number) => Math.max(4.99, Math.round(p) - 0.01)

function daysFromNow(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

async function main() {
  console.log('🌱 Seeding Grocery Hauls Pro za...')

  // 1. Stores
  const storeMap = new Map<string, string>()
  for (const s of STORES) {
    const store = await prisma.store.upsert({
      where: { name: s.name },
      update: { color: s.color, emoji: s.emoji },
      create: { name: s.name, color: s.color, emoji: s.emoji },
    })
    storeMap.set(s.name, store.id)
  }
  console.log(`✅ Stores: ${storeMap.size}`)

  // 2. Categories
  const catMap = new Map<string, string>()
  for (const c of CATEGORIES) {
    const cat = await prisma.category.upsert({
      where: { name: c.name },
      update: { icon: c.icon, sortOrder: c.sortOrder },
      create: { name: c.name, icon: c.icon, sortOrder: c.sortOrder },
    })
    catMap.set(c.name, cat.id)
  }
  console.log(`✅ Categories: ${catMap.size}`)

  // 3. Products + store prices
  const prodMap = new Map<string, string>()
  const mults = new Map(STORES.map(s => [s.name, s.mult]))
  for (const p of PRODUCTS) {
    const existing = await prisma.product.findFirst({ where: { name: p.name } })
    const product = existing
      ? await prisma.product.update({ where: { id: existing.id }, data: { categoryId: catMap.get(p.category)!, unit: p.unit, brand: p.brand, barcode: p.barcode, description: p.description } })
      : await prisma.product.create({
          data: {
            name: p.name, categoryId: catMap.get(p.category)!, unit: p.unit, brand: p.brand,
            barcode: p.barcode, description: p.description,
          },
        })
    prodMap.set(p.name, product.id)

    const priceCount = await prisma.storePrice.count({ where: { productId: product.id } })
    if (priceCount === 0) {
      await prisma.storePrice.createMany({
        data: STORES.map(s => ({
          storeId: storeMap.get(s.name)!,
          productId: product.id,
          price: round99(p.base * (mults.get(s.name) ?? 1)),
        })),
      })
    }
  }
  console.log(`✅ Products: ${prodMap.size}`)

  // 4. Promotions (only if none exist yet — keeps admin-created promos on re-seed)
  const promoCount = await prisma.promotion.count()
  if (promoCount === 0) {
    let created = 0
    for (const [productName, storeName, disc] of PROMO_PICKS) {
      const productId = prodMap.get(productName)
      const storeId = storeMap.get(storeName)
      if (!productId || !storeId) continue
      const sp = await prisma.storePrice.findUnique({
        where: { storeId_productId: { storeId, productId } },
      })
      if (!sp) continue
      const normal = sp.price
      const promo = round99(normal * (1 - disc))
      const startOffset = -(1 + (created % 12))
      const endOffset = 4 + (created % 32)
      await prisma.promotion.create({
        data: {
          productId, storeId,
          promoPrice: promo,
          normalPrice: normal,
          startDate: daysFromNow(startOffset),
          endDate: daysFromNow(endOffset),
          status: 'published',
        },
      })
      created++
    }
    console.log(`✅ Promotions: ${created}`)
  } else {
    console.log(`ℹ️ Promotions already exist (${promoCount}), skipping`)
  }

  // 5. What's New posts (skip if any exist)
  const postCount = await prisma.whatsNewPost.count()
  if (postCount === 0) {
    for (const post of WHATS_NEW_SEED) {
      const promoIds: string[] = []
      for (const productName of post.promoProducts) {
        const productId = prodMap.get(productName)
        if (!productId) continue
        const promos = await prisma.promotion.findMany({
          where: {
            productId,
            status: 'published',
            ...(post.storeName ? { store: { name: post.storeName } } : {}),
          },
          take: 2,
        })
        promoIds.push(...promos.map(p => p.id))
      }
      await prisma.whatsNewPost.create({
        data: {
          title: post.title,
          description: post.description,
          storeId: post.storeName ? storeMap.get(post.storeName) ?? null : null,
          tag: post.tag,
          promoIds,
          datePosted: daysFromNow(-Math.floor(Math.random() * 10)),
        },
      })
    }
    console.log(`✅ What's New posts: ${WHATS_NEW_SEED.length}`)
  } else {
    console.log(`ℹ️ What's New posts already exist, skipping`)
  }

  // 6. Admin account
  const adminHash = await bcrypt.hash(ADMIN_SEED.password, 10)
  await prisma.adminAccount.upsert({
    where: { email: ADMIN_SEED.email },
    update: {},
    create: { email: ADMIN_SEED.email, passwordHash: adminHash, addedBy: 'system' },
  })
  await prisma.user.upsert({
    where: { email: ADMIN_SEED.email },
    update: { role: 'admin' },
    create: { email: ADMIN_SEED.email, name: 'Administrator', role: 'admin', googleId: 'admin-' + ADMIN_SEED.email },
  })
  console.log(`✅ Admin: ${ADMIN_SEED.email}`)

  // 7. Demo user with sample data
  const demo = await prisma.user.upsert({
    where: { email: DEMO_USER_SEED.email },
    update: {},
    create: {
      email: DEMO_USER_SEED.email,
      name: DEMO_USER_SEED.name,
      googleId: 'demo-' + DEMO_USER_SEED.email,
      isDemo: true,
      image: null,
    },
  })
  const demoListCount = await prisma.shoppingList.count({ where: { userId: demo.id } })
  if (demoListCount === 0) {
    const list = await prisma.shoppingList.create({
      data: { userId: demo.id, name: 'Monthly Groceries', lastTotal: 1049.87, lastSavings: 92.36 },
    })
    const demoItems: [string, number][] = [
      ['White Star Maize Meal', 2], ['Albany Superior White Bread', 2],
      ['Clover Full Cream Milk', 2], ['Nulaid Large Eggs', 1],
      ['Coca-Cola', 2], ['Chicken Braai Pack', 2], ['Sunfoil Cooking Oil', 1],
      ['Selati White Sugar', 1], ['Potatoes', 1], ['Omo Hand Washing Powder', 1],
      ['Simba Chips', 3], ['Colgate Toothpaste', 1],
    ]
    for (const [name, qty] of demoItems) {
      const productId = prodMap.get(name)
      if (!productId) continue
      await prisma.listItem.create({ data: { listId: list.id, productId, quantity: qty, source: 'catalogue' } })
    }
    // Wish list
    const simbaId = prodMap.get('Simba Chips')
    const cokeId = prodMap.get('Coca-Cola')
    if (simbaId) {
      await prisma.wishListItem.create({
        data: { userId: demo.id, productId: simbaId, targetPrice: 15, preferredStoreIds: [] },
      }).catch(() => {})
    }
    if (cokeId) {
      await prisma.wishListItem.create({
        data: { userId: demo.id, productId: cokeId, targetPrice: 25, preferredStoreIds: [] },
      }).catch(() => {})
    }
    await prisma.notification.createMany({
      data: [
        {
          userId: demo.id, type: 'info', title: 'Welcome to Grocery Hauls Pro za! 🛒',
          body: 'Compare grocery baskets across Boxer, Shoprite, Checkers, Pick n Pay, Woolworths, SPAR and Clicks. Start by creating your first list!',
        },
        {
          userId: demo.id, type: 'price-drop', title: 'Price drop: Simba Chips 125g',
          body: 'Now R14.99 at Boxer (was R19.99). It is below your target price of R15.00!',
        },
      ],
    })
    console.log('✅ Demo user with sample list, wish list & notifications')
  } else {
    console.log('ℹ️ Demo user data already exists, skipping')
  }

  // 8. Search logs (for analytics)
  const searchCount = await prisma.searchLog.count()
  if (searchCount === 0) {
    const logs: { term: string; userId?: string }[] = []
    for (const [term, count] of SEARCH_TERMS_SEED) {
      for (let i = 0; i < count; i++) {
        logs.push({ term, ...(i % 2 === 0 ? { userId: demo.id } : {}) })
      }
    }
    await prisma.searchLog.createMany({ data: logs })
    console.log(`✅ Search logs: ${logs.length}`)
  }

  console.log('🎉 Seeding complete!')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
