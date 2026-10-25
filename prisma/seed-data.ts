// Seed data for Grocery Hauls Pro za — South African grocery market
// Prices are realistic estimates in ZAR (base price = cheapest typical shelf price)

export const STORES = [
  { name: 'Boxer', color: '#00539F', emoji: '🟦', mult: 0.93 },
  { name: 'Shoprite', color: '#E4002B', emoji: '🟥', mult: 1.0 },
  { name: 'Checkers', color: '#0E5C42', emoji: '🟩', mult: 1.05 },
  { name: 'Pick n Pay', color: '#2E5FA3', emoji: '🔵', mult: 1.06 },
  { name: 'Woolworths', color: '#178841', emoji: '🟢', mult: 1.18 },
  { name: 'SPAR', color: '#6CB33F', emoji: '🟨', mult: 1.1 },
  { name: 'Clicks', color: '#7B2D8E', emoji: '🟪', mult: 1.08 },
]

export const CATEGORIES = [
  { name: 'Bread & Bakery', icon: '🍞', sortOrder: 1 },
  { name: 'Eggs & Dairy', icon: '🥛', sortOrder: 2 },
  { name: 'Maize, Rice & Grains', icon: '🌾', sortOrder: 3 },
  { name: 'Cooking Oil & Staples', icon: '🛢️', sortOrder: 4 },
  { name: 'Meat & Chicken', icon: '🍗', sortOrder: 5 },
  { name: 'Fruit & Vegetables', icon: '🍎', sortOrder: 6 },
  { name: 'Drinks', icon: '🥤', sortOrder: 7 },
  { name: 'Snacks', icon: '🍿', sortOrder: 8 },
  { name: 'Cleaning Products', icon: '🧼', sortOrder: 9 },
  { name: 'Toiletries', icon: '🧴', sortOrder: 10 },
  { name: 'Baby Products', icon: '🍼', sortOrder: 11 },
  { name: 'Pet Food', icon: '🐾', sortOrder: 12 },
]

export type SeedProduct = {
  name: string
  category: string
  unit?: string
  brand?: string
  barcode?: string
  base: number // typical cheapest shelf price in ZAR
  description?: string
}

export const PRODUCTS: SeedProduct[] = [
  // Bread & Bakery
  { name: 'Albany Superior White Bread', category: 'Bread & Bakery', unit: '700g', brand: 'Albany', barcode: '6001068000012', base: 21.99, description: 'Classic soft white sandwich loaf' },
  { name: 'Blue Ribbon Brown Bread', category: 'Bread & Bakery', unit: '700g', brand: 'Blue Ribbon', barcode: '6001068000029', base: 19.99 },
  { name: 'Sasko Cake Flour', category: 'Bread & Bakery', unit: '2.5kg', brand: 'Sasko', barcode: '6001068000036', base: 54.99 },
  { name: 'Sunbake Sliced Brown Bread', category: 'Bread & Bakery', unit: '700g', brand: 'Sunbake', barcode: '6001068000043', base: 20.49 },
  { name: 'Snowflake Scone Mix', category: 'Bread & Bakery', unit: '500g', brand: 'Snowflake', barcode: '6001068000050', base: 18.99 },
  { name: 'Hot Dog Rolls 6-Pack', category: 'Bread & Bakery', unit: '6s', barcode: '6001068000067', base: 17.99 },
  // Eggs & Dairy
  { name: 'Nulaid Large Eggs', category: 'Eggs & Dairy', unit: '30s', brand: 'Nulaid', barcode: '6001068000074', base: 68.99 },
  { name: 'Clover Full Cream Milk', category: 'Eggs & Dairy', unit: '2L', brand: 'Clover', barcode: '6001068000081', base: 41.99 },
  { name: 'Premier UHT Milk', category: 'Eggs & Dairy', unit: '1L', brand: 'Premier', barcode: '6001068000098', base: 21.99 },
  { name: 'Clover Cheddar Cheese', category: 'Eggs & Dairy', unit: '750g', brand: 'Clover', barcode: '6001068000104', base: 89.99 },
  { name: 'Parmalat Plain Yoghurt', category: 'Eggs & Dairy', unit: '1kg', brand: 'Parmalat', barcode: '6001068000111', base: 44.99 },
  { name: 'Butter Block', category: 'Eggs & Dairy', unit: '500g', brand: 'Simonsberg', barcode: '6001068000128', base: 62.99 },
  // Maize, Rice & Grains
  { name: 'White Star Maize Meal', category: 'Maize, Rice & Grains', unit: '5kg', brand: 'White Star', barcode: '6001068000135', base: 94.99, description: 'South Africa\u2019s favourite super maize meal' },
  { name: 'Iwisa Maize Meal', category: 'Maize, Rice & Grains', unit: '5kg', brand: 'Iwisa', barcode: '6001068000142', base: 87.99 },
  { name: 'Tastic Rice', category: 'Maize, Rice & Grains', unit: '2kg', brand: 'Tastic', barcode: '6001068000159', base: 61.99 },
  { name: 'Spekko Long Grain Rice', category: 'Maize, Rice & Grains', unit: '2kg', brand: 'Spekko', barcode: '6001068000166', base: 52.99 },
  { name: 'Fattis & Monis Spaghetti', category: 'Maize, Rice & Grains', unit: '500g', brand: 'Fattis & Monis', barcode: '6001068000173', base: 22.99 },
  { name: 'Penne Pasta', category: 'Maize, Rice & Grains', unit: '500g', barcode: '6001068000180', base: 19.99 },
  // Cooking Oil & Staples
  { name: 'Sunfoil Cooking Oil', category: 'Cooking Oil & Staples', unit: '2L', brand: 'Sunfoil', barcode: '6001068000197', base: 67.99 },
  { name: 'Selati White Sugar', category: 'Cooking Oil & Staples', unit: '2.5kg', brand: 'Selati', barcode: '6001068000203', base: 67.99 },
  { name: 'Cerebos Salt', category: 'Cooking Oil & Staples', unit: '1kg', brand: 'Cerebos', barcode: '6001068000210', base: 14.99 },
  { name: 'Mrs Ball\u2019s Original Chutney', category: 'Cooking Oil & Staples', unit: '470g', brand: 'Mrs Ball\u2019s', barcode: '6001068000227', base: 39.99 },
  { name: 'Royal Baking Powder', category: 'Cooking Oil & Staples', unit: '200g', brand: 'Royal', barcode: '6001068000234', base: 21.99 },
  { name: 'Tomato & Onion Mix', category: 'Cooking Oil & Staples', unit: '410g', barcode: '6001068000241', base: 17.99 },
  // Meat & Chicken
  { name: 'Chicken Braai Pack', category: 'Meat & Chicken', unit: '2kg', barcode: '6001068000258', base: 94.99, description: 'Frozen mixed chicken portions' },
  { name: 'Beef Mince', category: 'Meat & Chicken', unit: '500g', barcode: '6001068000265', base: 64.99 },
  { name: 'Boerewors', category: 'Meat & Chicken', unit: '500g', barcode: '6001068000272', base: 69.99, description: 'Traditional South African sausage' },
  { name: 'Beef Rump Steak', category: 'Meat & Chicken', unit: '1kg', barcode: '6001068000289', base: 149.99 },
  { name: 'Pork Chops', category: 'Meat & Chicken', unit: '1kg', barcode: '6001068000296', base: 109.99 },
  { name: 'Chicken Viennas', category: 'Meat & Chicken', unit: '500g', barcode: '6001068000302', base: 39.99 },
  // Fruit & Vegetables
  { name: 'Potatoes', category: 'Fruit & Vegetables', unit: '10kg bag', barcode: '6001068000319', base: 74.99 },
  { name: 'Onions', category: 'Fruit & Vegetables', unit: '2kg', barcode: '6001068000326', base: 27.99 },
  { name: 'Tomatoes', category: 'Fruit & Vegetables', unit: '1kg', barcode: '6001068000333', base: 21.99 },
  { name: 'Bananas', category: 'Fruit & Vegetables', unit: '1kg', barcode: '6001068000340', base: 24.99 },
  { name: 'Granny Smith Apples', category: 'Fruit & Vegetables', unit: '1.5kg', barcode: '6001068000357', base: 32.99 },
  { name: 'Oranges', category: 'Fruit & Vegetables', unit: '2kg', barcode: '6001068000364', base: 29.99 },
  // Drinks
  { name: 'Coca-Cola', category: 'Drinks', unit: '2L', brand: 'Coca-Cola', barcode: '6001068000371', base: 27.99 },
  { name: 'Stoney Ginger Beer', category: 'Drinks', unit: '2L', brand: 'Stoney', barcode: '6001068000388', base: 26.99 },
  { name: 'Oros Orange', category: 'Drinks', unit: '2L', brand: 'Oros', barcode: '6001068000395', base: 32.99 },
  { name: 'Mageu Original', category: 'Drinks', unit: '1L', brand: 'Maas', barcode: '6001068000401', base: 16.99 },
  { name: 'Liqui-Fruit Apple Juice', category: 'Drinks', unit: '1L', brand: 'Liqui-Fruit', barcode: '6001068000418', base: 29.99 },
  { name: 'Ricoffy Instant Coffee', category: 'Drinks', unit: '250g', brand: 'Ricoffy', barcode: '6001068000425', base: 59.99 },
  { name: 'Five Roses Tea Bags', category: 'Drinks', unit: '80s', brand: 'Five Roses', barcode: '6001068000432', base: 44.99 },
  { name: 'Still Water', category: 'Drinks', unit: '5L', barcode: '6001068000449', base: 27.99 },
  // Snacks
  { name: 'Simba Chips', category: 'Snacks', unit: '125g', brand: 'Simba', barcode: '6001068000456', base: 19.99, description: 'Mrs H.S. Ball\u2019s chutney flavour' },
  { name: 'NikNaks', category: 'Snacks', unit: '100g', brand: 'NikNaks', barcode: '6001068000463', base: 14.99 },
  { name: 'Bakers Tennis Biscuits', category: 'Snacks', unit: '200g', brand: 'Bakers', barcode: '6001068000470', base: 24.99 },
  { name: 'Lunch Bar', category: 'Snacks', unit: '48g', brand: 'Cadbury', barcode: '6001068000487', base: 14.99 },
  { name: 'Chappies Bubble Gum', category: 'Snacks', unit: '40s', brand: 'Chappies', barcode: '6001068000494', base: 17.99 },
  { name: 'Salt & Vinegar Crisps', category: 'Snacks', unit: '150g', barcode: '6001068000500', base: 21.99 },
  // Cleaning Products
  { name: 'Omo Hand Washing Powder', category: 'Cleaning Products', unit: '2kg', brand: 'Omo', barcode: '6001068000517', base: 84.99 },
  { name: 'Sunlight Dishwashing Liquid', category: 'Cleaning Products', unit: '750ml', brand: 'Sunlight', barcode: '6001068000524', base: 27.99 },
  { name: 'Handy Andy Cream Cleaner', category: 'Cleaning Products', unit: '750ml', brand: 'Handy Andy', barcode: '6001068000531', base: 25.99 },
  { name: 'Jik Bleach', category: 'Cleaning Products', unit: '1.5L', brand: 'Jik', barcode: '6001068000548', base: 32.99 },
  { name: 'Bin Liners', category: 'Cleaning Products', unit: '20s', barcode: '6001068000555', base: 24.99 },
  { name: 'Dish Cloths 3-Pack', category: 'Cleaning Products', unit: '3s', barcode: '6001068000562', base: 19.99 },
  // Toiletries
  { name: 'Colgate Toothpaste', category: 'Toiletries', unit: '100ml', brand: 'Colgate', barcode: '6001068000579', base: 21.99 },
  { name: 'Protex Bar Soap', category: 'Toiletries', unit: '175g', brand: 'Protex', barcode: '6001068000586', base: 15.99 },
  { name: 'Vaseline Petroleum Jelly', category: 'Toiletries', unit: '250ml', brand: 'Vaseline', barcode: '6001068000593', base: 26.99 },
  { name: 'Dettol Antiseptic', category: 'Toiletries', unit: '250ml', brand: 'Dettol', barcode: '6001068000609', base: 39.99 },
  { name: 'Always Sanitary Pads', category: 'Toiletries', unit: '9s', brand: 'Always', barcode: '6001068000616', base: 27.99 },
  { name: 'Shampoo 2-in-1', category: 'Toiletries', unit: '400ml', barcode: '6001068000623', base: 34.99 },
  // Baby Products
  { name: 'Pampers Nappies', category: 'Baby Products', unit: 'Jumbo 62s', brand: 'Pampers', barcode: '6001068000630', base: 249.99 },
  { name: 'Huggies Pants', category: 'Baby Products', unit: 'Mega 50s', brand: 'Huggies', barcode: '6001068000647', base: 229.99 },
  { name: 'NAN Infant Formula', category: 'Baby Products', unit: '400g', brand: 'NAN', barcode: '6001068000654', base: 119.99 },
  { name: 'Purity Baby Food', category: 'Baby Products', unit: '125ml', brand: 'Purity', barcode: '6001068000661', base: 14.99 },
  { name: 'Baby Wipes', category: 'Baby Products', unit: '80s', barcode: '6001068000678', base: 24.99 },
  { name: 'Baby Bath Wash', category: 'Baby Products', unit: '500ml', barcode: '6001068000685', base: 29.99 },
  // Pet Food
  { name: 'Bobtail Dog Food', category: 'Pet Food', unit: '8kg', brand: 'Bobtail', barcode: '6001068000692', base: 189.99 },
  { name: 'Whiskas Cat Food', category: 'Pet Food', unit: '2kg', brand: 'Whiskas', barcode: '6001068000708', base: 129.99 },
  { name: 'Montego Karoo Dog Food', category: 'Pet Food', unit: '8kg', brand: 'Montego', barcode: '6001068000715', base: 219.99 },
  { name: 'Dog Treats Biltong Style', category: 'Pet Food', unit: '500g', barcode: '6001068000722', base: 44.99 },
  { name: 'Cat Litter', category: 'Pet Food', unit: '5kg', barcode: '6001068000739', base: 54.99 },
  { name: 'Canned Cat Food', category: 'Pet Food', unit: '12s', barcode: '6001068000746', base: 84.99 },
]

// [productName, storeName, discountPercent(0.10-0.40)]
export const PROMO_PICKS: [string, string, number][] = [
  ['White Star Maize Meal', 'Boxer', 0.22],
  ['Iwisa Maize Meal', 'Shoprite', 0.18],
  ['Selati White Sugar', 'Boxer', 0.15],
  ['Sunfoil Cooking Oil', 'Shoprite', 0.2],
  ['Nulaid Large Eggs', 'Pick n Pay', 0.25],
  ['Clover Full Cream Milk', 'Checkers', 0.12],
  ['Albany Superior White Bread', 'SPAR', 0.1],
  ['Chicken Braai Pack', 'Shoprite', 0.28],
  ['Beef Mince', 'Checkers', 0.2],
  ['Boerewors', 'Woolworths', 0.15],
  ['Coca-Cola', 'Pick n Pay', 0.18],
  ['Stoney Ginger Beer', 'Boxer', 0.14],
  ['Oros Orange', 'Shoprite', 0.16],
  ['Ricoffy Instant Coffee', 'Checkers', 0.22],
  ['Simba Chips', 'Pick n Pay', 0.25],
  ['NikNaks', 'Boxer', 0.3],
  ['Bakers Tennis Biscuits', 'SPAR', 0.2],
  ['Omo Hand Washing Powder', 'Shoprite', 0.19],
  ['Sunlight Dishwashing Liquid', 'Boxer', 0.21],
  ['Jik Bleach', 'Checkers', 0.17],
  ['Colgate Toothpaste', 'Clicks', 0.3],
  ['Protex Bar Soap', 'Clicks', 0.25],
  ['Dettol Antiseptic', 'Clicks', 0.18],
  ['Pampers Nappies', 'Pick n Pay', 0.14],
  ['Huggies Pants', 'Clicks', 0.12],
  ['NAN Infant Formula', 'Checkers', 0.1],
  ['Bobtail Dog Food', 'Boxer', 0.16],
  ['Whiskas Cat Food', 'SPAR', 0.13],
  ['Potatoes', 'Boxer', 0.24],
  ['Onions', 'SPAR', 0.18],
  ['Tomatoes', 'Pick n Pay', 0.15],
  ['Bananas', 'Shoprite', 0.12],
  ['Granny Smith Apples', 'Woolworths', 0.2],
  ['Tastic Rice', 'Boxer', 0.17],
  ['Fattis & Monis Spaghetti', 'Shoprite', 0.26],
  ['Penne Pasta', 'Checkers', 0.22],
  ['Cerebos Salt', 'Boxer', 0.1],
  ['Mrs Ball\u2019s Original Chutney', 'SPAR', 0.19],
  ['Chicken Viennas', 'Pick n Pay', 0.23],
  ['Still Water', 'Clicks', 0.15],
  ['Shampoo 2-in-1', 'Clicks', 0.28],
  ['Always Sanitary Pads', 'Shoprite', 0.2],
  ['Vaseline Petroleum Jelly', 'Woolworths', 0.1],
  ['Baby Wipes', 'Checkers', 0.18],
  ['Five Roses Tea Bags', 'SPAR', 0.21],
  ['Butter Block', 'Woolworths', 0.12],
]

export const WHATS_NEW_SEED = [
  {
    title: '🔥 Black Friday Early Deals Are Live',
    description: 'Beat the rush! Massive early Black Friday savings on maize meal, cooking oil, washing powder and more. New door-crasher deals drop every Friday.',
    storeName: 'Shoprite',
    tag: 'black-friday',
    promoProducts: ['Iwisa Maize Meal', 'Sunfoil Cooking Oil', 'Omo Hand Washing Powder', 'NikNaks'],
  },
  {
    title: '🎄 Festive Season Savings Countdown',
    description: 'December is coming. Stock up on festive favourites — cold drinks, biscuits, boerewors for the braai, and baking essentials at holiday prices.',
    storeName: 'Checkers',
    tag: 'festive',
    promoProducts: ['Coca-Cola', 'Bakers Tennis Biscuits', 'Boerewors', 'Butter Block'],
  },
  {
    title: '🎒 Back to School Bulk Buys',
    description: 'Lunchbox fillers and school snacks at rock-bottom prices. Buy in bulk and save more on juice, water, biscuits and soap.',
    storeName: 'Pick n Pay',
    tag: 'back-to-school',
    promoProducts: ['Liqui-Fruit Apple Juice', 'Simba Chips', 'Chappies Bubble Gum', 'Still Water'],
  },
  {
    title: '📦 Boxer Bulk-Buy & Save',
    description: 'Big packs, bigger savings. Buy the 10kg potatoes, 5kg maize meal and 8kg dog food bundles and pay less per kilo.',
    storeName: 'Boxer',
    tag: 'bulk',
    promoProducts: ['Potatoes', 'White Star Maize Meal', 'Bobtail Dog Food', 'Tastic Rice'],
  },
  {
    title: '🛒 Clicks Health & Beauty Sale',
    description: 'Up to 30% off toiletries, baby care and household health essentials. Perfect time to stock the medicine cabinet.',
    storeName: 'Clicks',
    tag: 'campaign',
    promoProducts: ['Colgate Toothpaste', 'Dettol Antiseptic', 'Shampoo 2-in-1', 'Huggies Pants'],
  },
  {
    title: '🥬 Fresh Produce Price Crash',
    description: 'Winter harvest gluts mean super-low veggie prices this week. Grab potatoes, onions and tomatoes before the weekend.',
    storeName: 'SPAR',
    tag: 'campaign',
    promoProducts: ['Potatoes', 'Onions', 'Tomatoes'],
  },
  {
    title: '✨ New in the Catalogue',
    description: 'We have added more pantry staples and baby care lines to the catalogue. Search for them by name — more stores and prices coming soon.',
    storeName: null,
    tag: 'new',
    promoProducts: ['Montego Karoo Dog Food', 'Baby Bath Wash', 'Salt & Vinegar Crisps'],
  },
  {
    title: '🥩 Braai Weekend Specials',
    description: 'Fire up the braai! Specials on boerewors, mince, chicken packs and charcoal-friendly sides across major stores.',
    storeName: 'Woolworths',
    tag: 'campaign',
    promoProducts: ['Boerewors', 'Beef Mince', 'Chicken Braai Pack'],
  },
]

export const SEARCH_TERMS_SEED: [string, number][] = [
  ['maize meal', 14], ['bread', 11], ['milk', 10], ['eggs', 9], ['coke', 8],
  ['cooking oil', 7], ['sugar', 6], ['chicken', 6], ['rice', 5], ['pampers', 4],
  ['boerewors', 3], ['dog food', 3], ['sunlight', 2], ['simba', 2], ['flour', 2],
]

export const ADMIN_SEED = { email: 'rick@endintcap.online', password: 'GroceryPro2026!' }
export const DEMO_USER_SEED = { email: 'demo.shopper@gmail.com', name: 'Demo Shopper' }
