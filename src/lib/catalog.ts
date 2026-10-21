/**
 * The catalog — everything the business sells (Figma section "Catalog", 135:42926).
 *
 * One population. The four cards, the five tabs, the group tree and the pager all read the same
 * list, so a tab can never claim a count the table cannot produce.
 *
 * The design printed "All 169" on the list and "All 133" on stock, but its own group dropdown
 * adds to 118 (34 + 41 + 8 + 23 + 12) and its own card says 118 = 106 on sale + 12 switched off.
 * 118 is what the parts agree on, so the totals are counted rather than typed.
 */

/* --------------------------------------------------------------- the tree */

export type Kind = { id: string; name: string; arabicName?: string; items: number }

export type Group = {
  id: string
  name: string
  arabicName: string
  kinds: Kind[]
}

export const GROUPS: Group[] = [
  {
    id: 'greenBeans',
    name: 'Green beans',
    arabicName: 'حبوب خضراء',
    kinds: [
      { id: 'houseBlend', name: 'House Blend', items: 6 },
      { id: 'yirgacheffe', name: 'Yirgacheffe', items: 5 },
      { id: 'singleOrigin', name: 'Single origin', items: 14 },
      { id: 'decaf', name: 'Decaf', items: 9 },
    ],
  },
  {
    id: 'brewedDrinks',
    name: 'Brewed drinks',
    arabicName: 'مشروبات محضّرة',
    kinds: [
      { id: 'milkCoffee', name: 'Milk coffee', items: 12 },
      { id: 'blackCoffee', name: 'Black coffee', items: 9 },
      { id: 'coldDrinks', name: 'Cold drinks', items: 8 },
      { id: 'tea', name: 'Tea', items: 7 },
      { id: 'seasonal', name: 'Seasonal', items: 5 },
    ],
  },
  {
    id: 'roastingServices',
    name: 'Roasting services',
    arabicName: 'خدمات التحميص',
    kinds: [
      { id: 'contractRoasting', name: 'Contract roasting', items: 3 },
      { id: 'training', name: 'Training', items: 3 },
      { id: 'consulting', name: 'Consulting', items: 2 },
    ],
  },
  {
    id: 'packaging',
    name: 'Packaging',
    arabicName: 'التعبئة',
    kinds: [
      { id: 'bags', name: 'Bags', items: 8 },
      { id: 'filters', name: 'Filters', items: 6 },
      { id: 'cups', name: 'Cups', items: 5 },
      { id: 'labels', name: 'Labels', items: 4 },
    ],
  },
  {
    id: 'equipment',
    name: 'Equipment',
    arabicName: 'المعدات',
    kinds: [
      { id: 'grinders', name: 'Grinders', items: 5 },
      { id: 'brewers', name: 'Brewers', items: 3 },
      { id: 'bundles', name: 'Bundles', items: 4 },
    ],
  },
]

export const KIND_COUNT = GROUPS.reduce((total, group) => total + group.kinds.length, 0)

export const groupTotal = (group: Group) =>
  group.kinds.reduce((total, kind) => total + kind.items, 0)

export const CATALOG_TOTAL = GROUPS.reduce((total, group) => total + groupTotal(group), 0)

/** Items that were never filed into a group. The design shows none, and the tree agrees. */
export const UNGROUPED = 0

/* --------------------------------------------------------------- the items */

export type ItemKindTag = 'product' | 'service' | 'byTheHour' | 'bundle'

export type Attention = 'runningLow' | 'noPrice' | 'noTax'

export type Item = {
  id: string
  name: string
  arabicName?: string
  code: string
  group: string
  kind: string
  tag: ItemKindTag
  /** Shelf price including VAT, in OMR. Null for an item nobody has priced yet. */
  price: number | null
  /** What the row says under the price — a range, a former price, a per-unit note. */
  priceNoteKey?: string
  priceNoteValues?: Record<string, string | number>
  soldAsKey: string
  /** Null where tax has not been set — one of the things wanting attention. */
  taxPercent: number | null
  /** Null for something that is not counted at all (a drink made to order, a service). */
  onHand: number | null
  stockUnitKey?: string
  stockNoteKey?: string
  reorderAt?: number
  /** Sales in the last ninety days. */
  sold90: number
  onSale: boolean
  /** Why the item is asking for attention, if it is. */
  attention?: Attention
  /** Set on the seven rows the design draws in full. */
  featured?: boolean
  offSince?: string
  lastSold?: string
  /** Bundles and sized items say how many parts or sizes they carry. */
  partsKey?: string
  partsValues?: Record<string, string | number>
}

/** The seven rows the list screen draws, plus the four the stock screen names. */
const FEATURED: Item[] = [
  {
    id: 'house-blend-1kg',
    name: 'House Blend - 1 kg bag',
    code: 'CAT-0104',
    group: 'greenBeans',
    kind: 'houseBlend',
    tag: 'product',
    price: 9.5,
    priceNoteKey: 'catalog.wasInMonth',
    priceNoteValues: { was: '9.200', month: 'March' },
    soldAsKey: 'catalog.soldByTheBag',
    taxPercent: 5,
    onHand: 84,
    stockUnitKey: 'catalog.unit.bags',
    stockNoteKey: 'catalog.bagsOnHand',
    reorderAt: 30,
    sold90: 312,
    onSale: true,
    featured: true,
  },
  {
    id: 'yirgacheffe-1kg',
    name: 'Yirgacheffe - 1 kg bag',
    code: 'CAT-0111',
    group: 'greenBeans',
    kind: 'yirgacheffe',
    tag: 'product',
    price: 11.4,
    priceNoteKey: 'catalog.upFrom',
    priceNoteValues: { was: '11.100' },
    soldAsKey: 'catalog.soldByTheBag',
    taxPercent: 5,
    onHand: 6,
    stockUnitKey: 'catalog.unit.bags',
    stockNoteKey: 'catalog.belowYourLimit',
    reorderAt: 15,
    sold90: 188,
    onSale: true,
    attention: 'runningLow',
    featured: true,
  },
  {
    id: 'flat-white',
    name: 'Flat White',
    arabicName: 'فلات وايت',
    code: 'CAT-0208',
    group: 'brewedDrinks',
    kind: 'milkCoffee',
    tag: 'product',
    price: 1.4,
    priceNoteKey: 'catalog.rangeBySize',
    priceNoteValues: { from: '1.400', to: '1.900' },
    soldAsKey: 'catalog.threeSizesFourAddOns',
    taxPercent: 5,
    onHand: null,
    sold90: 1_204,
    onSale: true,
    featured: true,
    partsKey: 'catalog.sizesAndAddOns',
    partsValues: { sizes: 3, addOns: 4 },
  },
  {
    id: 'roasting-per-batch',
    name: 'Roasting - per batch',
    code: 'SRV-0004',
    group: 'roastingServices',
    kind: 'contractRoasting',
    tag: 'service',
    price: 4.2,
    soldAsKey: 'catalog.soldByTheBatch',
    taxPercent: 5,
    onHand: null,
    sold90: 938,
    onSale: true,
    featured: true,
  },
  {
    id: 'barista-training',
    name: 'Barista training',
    code: 'SRV-0018',
    group: 'roastingServices',
    kind: 'training',
    tag: 'byTheHour',
    price: 45,
    priceNoteKey: 'catalog.perHour',
    soldAsKey: 'catalog.halfDayFourHours',
    taxPercent: 5,
    onHand: null,
    sold90: 14,
    onSale: true,
    featured: true,
  },
  {
    id: 'starter-bundle',
    name: 'Starter bundle - beans, grinder, filters',
    code: 'PKG-0003',
    group: 'equipment',
    kind: 'bundles',
    tag: 'bundle',
    price: 38,
    priceNoteKey: 'catalog.savesOnParts',
    priceNoteValues: { amount: '6.400' },
    soldAsKey: 'catalog.itemsInside',
    taxPercent: 5,
    onHand: 11,
    stockNoteKey: 'catalog.fromTheSmallestPart',
    sold90: 22,
    onSale: true,
    featured: true,
    partsKey: 'catalog.partsInside',
    partsValues: { count: 3 },
  },
  {
    id: 'pumpkin-spice-latte',
    name: 'Pumpkin Spice Latte',
    code: 'CAT-0241',
    group: 'brewedDrinks',
    kind: 'seasonal',
    tag: 'product',
    price: 1.7,
    soldAsKey: 'catalog.offSince',
    taxPercent: 5,
    onHand: null,
    sold90: 0,
    onSale: false,
    featured: true,
    offSince: '3 Jan',
    lastSold: 'Dec',
  },

  /* The four the stock screen names, so both screens read the same shelf. */
  {
    id: 'kraft-bags-500g',
    name: 'Kraft bags - 500 g',
    code: 'CAT-0371',
    group: 'packaging',
    kind: 'bags',
    tag: 'product',
    price: 0.09,
    soldAsKey: 'catalog.soldByTheBag',
    taxPercent: 5,
    onHand: 0,
    stockUnitKey: 'catalog.unit.bags',
    reorderAt: 120,
    sold90: 640,
    onSale: true,
    attention: 'runningLow',
  },
  {
    id: 'sidamo-1kg',
    name: 'Sidamo - 1 kg bag',
    code: 'CAT-0128',
    group: 'greenBeans',
    kind: 'singleOrigin',
    tag: 'product',
    price: 12.5,
    soldAsKey: 'catalog.soldByTheBag',
    taxPercent: 5,
    onHand: 9,
    stockUnitKey: 'catalog.unit.bags',
    reorderAt: 15,
    sold90: 96,
    onSale: true,
    attention: 'runningLow',
  },
  {
    id: 'paper-filters-100',
    name: 'Paper filters - pack of 100',
    code: 'CAT-0388',
    group: 'packaging',
    kind: 'filters',
    tag: 'product',
    price: 1.85,
    soldAsKey: 'catalog.soldByThePack',
    taxPercent: 5,
    onHand: 14,
    stockUnitKey: 'catalog.unit.packs',
    reorderAt: 24,
    sold90: 210,
    onSale: true,
    attention: 'runningLow',
  },
  {
    id: 'hand-grinder',
    name: 'Hand grinder',
    code: 'CAT-0512',
    group: 'equipment',
    kind: 'grinders',
    tag: 'product',
    price: 38,
    soldAsKey: 'catalog.soldEach',
    taxPercent: 5,
    onHand: 11,
    stockUnitKey: 'catalog.unit.units',
    reorderAt: 8,
    sold90: 31,
    onSale: true,
  },
]

/**
 * The rest of the catalog.
 *
 * Filled out so the group tree, the on-sale split, the ninety-day figure and the three kinds of
 * attention all land on the numbers the cards print, without any of them being stated twice.
 */
/** What the cards claim, and what the generated tail has to make true. */
const BOOK = { total: 118, switchedOff: 12, neverSold: 44 }

/**
 * Names for the rest of the shelf.
 *
 * A catalog screen is only legible if the rows read like things a roastery sells, so the tail is
 * named from what each kind actually holds rather than numbered.
 */
const NAMES: Record<string, string[]> = {
  houseBlend: [
    'House Blend - 500 g bag',
    'House Blend - 250 g bag',
    'House Blend - 100 g sample',
    'House Blend - 5 kg sack',
    'House Blend - loose, per kg',
  ],
  yirgacheffe: [
    'Yirgacheffe - 500 g bag',
    'Yirgacheffe - 250 g bag',
    'Yirgacheffe - 100 g sample',
    'Yirgacheffe - 5 kg sack',
  ],
  singleOrigin: [
    'Sidamo - 500 g bag',
    'Colombian Supremo - 1 kg bag',
    'Colombian Supremo - 250 g bag',
    'Brazilian Santos - 1 kg bag',
    'Brazilian Santos - 250 g bag',
    'Guji - 1 kg bag',
    'Guji - 250 g bag',
    'Harrar - 1 kg bag',
    'Harrar - 250 g bag',
    'Kenya AA - 1 kg bag',
    'Kenya AA - 250 g bag',
    'Omani Hojari roast - 500 g',
    'Sumatra - 1 kg bag',
  ],
  decaf: [
    'Decaf House - 1 kg bag',
    'Decaf House - 250 g bag',
    'Decaf Colombian - 1 kg bag',
    'Decaf Colombian - 250 g bag',
    'Decaf Espresso - 1 kg bag',
    'Decaf Espresso - 250 g bag',
    'Decaf sampler pack',
    'Decaf - loose, per kg',
    'Decaf Swiss Water - 1 kg',
  ],
  milkCoffee: [
    'Cappuccino',
    'Latte',
    'Cortado',
    'Macchiato',
    'Mocha',
    'Spanish Latte',
    'Iced Latte',
    'Iced Cappuccino',
    'Caramel Latte',
    'Honey Latte',
    'Turmeric Latte',
  ],
  blackCoffee: [
    'Espresso',
    'Double Espresso',
    'Americano',
    'Long Black',
    'V60 Pour Over',
    'Chemex',
    'Aeropress',
    'Filter of the day',
    'Ristretto',
  ],
  coldDrinks: [
    'Cold Brew',
    'Nitro Cold Brew',
    'Iced Americano',
    'Iced Tea',
    'Sparkling Espresso',
    'Affogato',
    'Frappe',
    'Lemonade',
  ],
  tea: ['Karak tea', 'Earl Grey', 'Green tea', 'Mint tea', 'Chamomile', 'Rooibos', 'Masala chai'],
  seasonal: ['Gingerbread Latte', 'Date Latte', 'Saffron Cardamom Latte', 'Rose Cold Brew'],
  contractRoasting: ['Roasting - half batch', 'Roasting - 10 batch block'],
  training: ['Barista training - full day', 'Cupping workshop'],
  consulting: ['Menu consulting - per hour', 'Café setup review'],
  bags: [
    'Kraft bags - 250 g',
    'Kraft bags - 1 kg',
    'Valve bags - 500 g',
    'Valve bags - 1 kg',
    'Paper carriers',
    'Jute sacks',
    'Gift boxes',
  ],
  filters: [
    'Paper filters - pack of 50',
    'V60 filters - pack of 100',
    'Chemex filters - pack of 100',
    'Aeropress filters - pack of 350',
    'Cloth filter',
  ],
  cups: ['Takeaway cups - 8 oz', 'Takeaway cups - 12 oz', 'Cup lids', 'Cup sleeves', 'Ceramic cup'],
  labels: ['Roast date labels', 'Blend labels', 'Price labels', 'Gift tags'],
  grinders: [
    'Hand grinder - travel',
    'Burr grinder - home',
    'Burr grinder - shop',
    'Grinder burr set',
  ],
  brewers: ['V60 dripper', 'Chemex 6 cup', 'Aeropress'],
  bundles: [
    'Home brewing kit',
    'Taste of Ethiopia - three bags',
    'Office refill - 5 kg and filters',
  ],
}

function buildRest(): Item[] {
  const rest: Item[] = []
  /** How many of each group the featured rows already account for. */
  const used = new Map<string, number>()
  for (const item of FEATURED) used.set(item.group, (used.get(item.group) ?? 0) + 1)

  /** The featured rows already carry one switched-off item and no unsold ones. */
  let offLeft = BOOK.switchedOff - FEATURED.filter((item) => !item.onSale).length
  let unsoldLeft = BOOK.neverSold

  let n = 0
  for (const group of GROUPS) {
    const need = groupTotal(group) - (used.get(group.id) ?? 0)
    for (let i = 0; i < need; i += 1) {
      n += 1
      const kind = group.kinds[i % group.kinds.length]
      /** Walk each kind's own list, so two rows never share a name. */
      const nth = Math.floor(i / group.kinds.length)
      const pool = NAMES[kind.id] ?? []
      const name = pool[nth % Math.max(1, pool.length)] ?? `${kind.name} ${nth + 1}`
      const off = offLeft > 0
      if (off) offLeft -= 1
      const unsold = !off && unsoldLeft > 0
      if (unsold) unsoldLeft -= 1

      rest.push({
        id: `${group.id}-${i + 1}`,
        name,
        code: `CAT-${(600 + n).toString().padStart(4, '0')}`,
        group: group.id,
        kind: kind.id,
        tag: group.id === 'roastingServices' ? 'service' : 'product',
        price: n === 40 || n === 74 ? null : Math.round((1 + (n % 17) * 0.35) * 1000) / 1000,
        soldAsKey: 'catalog.soldEach',
        taxPercent: n === 55 ? null : 5,
        onHand: n % 2 === 0 ? (n * 7) % 90 : null,
        stockUnitKey: 'catalog.unit.units',
        sold90: off || unsold ? 0 : ((n * 13) % 170) + 1,
        onSale: !off,
        attention: n === 40 || n === 74 ? 'noPrice' : n === 55 ? 'noTax' : undefined,
      })
    }
  }
  return rest
}

export const ITEMS: Item[] = [...FEATURED, ...buildRest()]

/* ------------------------------------------------------------ what it adds to */

export const ON_SALE = ITEMS.filter((item) => item.onSale)
export const SWITCHED_OFF = ITEMS.filter((item) => !item.onSale)

/** Sold at least once in the last ninety days — the ones earning their keep. */
export const EARNING = ON_SALE.filter((item) => item.sold90 > 0)
export const NEVER_SOLD = ON_SALE.filter((item) => item.sold90 === 0)

export const WANTING_ATTENTION = ITEMS.filter((item) => item.attention)

export const attentionSplit = () => ({
  runningLow: WANTING_ATTENTION.filter((item) => item.attention === 'runningLow').length,
  noPrice: WANTING_ATTENTION.filter((item) => item.attention === 'noPrice').length,
  noTax: WANTING_ATTENTION.filter((item) => item.attention === 'noTax').length,
})

/* ----------------------------------------------------------------- the tabs */

export const CATALOG_TABS = [
  { id: 'all', labelKey: 'catalog.tab.all' },
  { id: 'onSale', labelKey: 'catalog.tab.onSale' },
  { id: 'attention', labelKey: 'catalog.tab.attention' },
  { id: 'neverSold', labelKey: 'catalog.tab.neverSold' },
  { id: 'switchedOff', labelKey: 'catalog.tab.switchedOff' },
] as const

export type CatalogTab = (typeof CATALOG_TABS)[number]['id']

export function matchesCatalogTab(item: Item, tab: CatalogTab) {
  if (tab === 'all') return true
  if (tab === 'onSale') return item.onSale
  if (tab === 'attention') return Boolean(item.attention)
  if (tab === 'neverSold') return item.onSale && item.sold90 === 0
  return !item.onSale
}

export const countCatalogTab = (tab: CatalogTab) =>
  ITEMS.filter((item) => matchesCatalogTab(item, tab)).length

export const matchesCatalogQuery = (item: Item, query: string) => {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return (
    item.name.toLowerCase().includes(needle) ||
    item.code.toLowerCase().includes(needle) ||
    (item.arabicName ?? '').includes(needle)
  )
}

export const CATALOG_SORTS = [
  { id: 'name', labelKey: 'catalog.sort.name' },
  { id: 'bestSelling', labelKey: 'catalog.sort.bestSelling' },
  { id: 'priceHigh', labelKey: 'catalog.sort.priceHigh' },
  { id: 'priceLow', labelKey: 'catalog.sort.priceLow' },
  { id: 'recentlyAdded', labelKey: 'catalog.sort.recentlyAdded' },
]

export const PAGE_SIZE = 7

export const groupName = (id: string) => GROUPS.find((group) => group.id === id)?.name ?? ''

export const kindName = (groupId: string, kindId: string) =>
  GROUPS.find((group) => group.id === groupId)?.kinds.find((kind) => kind.id === kindId)?.name ?? ''

export const omr = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

/* ------------------------------------------------------- changing many at once */

export const ROUNDING = [
  { id: 'none', step: 0, labelKey: 'changePrices.round.none' },
  { id: '0.050', step: 0.05, labelKey: 'changePrices.round.fifty' },
  { id: '0.100', step: 0.1, labelKey: 'changePrices.round.hundred' },
  { id: '0.250', step: 0.25, labelKey: 'changePrices.round.twoFifty' },
]

export const CHANGE_WAYS = [
  { id: 'percentUp', labelKey: 'changePrices.way.percentUp' },
  { id: 'percentDown', labelKey: 'changePrices.way.percentDown' },
  { id: 'amountUp', labelKey: 'changePrices.way.amountUp' },
  { id: 'amountDown', labelKey: 'changePrices.way.amountDown' },
  { id: 'setTo', labelKey: 'changePrices.way.setTo' },
]

/**
 * What one price becomes under a bulk change.
 *
 * Rounding is applied after the change, which is why a small price can move by a larger
 * percentage than the one asked for — the screen says so rather than hiding it.
 */
export function newPrice(price: number, way: string, amount: number, step: number) {
  const millis = Math.round(price * 1000)
  let next = millis
  if (way === 'percentUp') next = Math.round(millis * (1 + amount / 100))
  else if (way === 'percentDown') next = Math.round(millis * (1 - amount / 100))
  else if (way === 'amountUp') next = millis + Math.round(amount * 1000)
  else if (way === 'amountDown') next = millis - Math.round(amount * 1000)
  else next = Math.round(amount * 1000)

  const stepMillis = Math.round(step * 1000)
  if (stepMillis > 0) next = Math.round(next / stepMillis) * stepMillis
  return Math.max(0, next) / 1000
}

/** How far a price moved, to one decimal place, worked out from whole thousandths. */
export function priceMovePercent(from: number, to: number) {
  const a = Math.round(from * 1000)
  const b = Math.round(to * 1000)
  if (a === 0) return 0
  return Math.round(((b - a) / a) * 1000) / 10
}

/** The five rows the bulk dialog draws, with one price a person set by hand. */
export const BULK_SAMPLE = [
  {
    id: 'flat-white',
    name: 'Flat White',
    noteKey: 'changePrices.regularSold',
    sold: 1_204,
    price: 1.4,
  },
  {
    id: 'cappuccino',
    name: 'Cappuccino',
    noteKey: 'changePrices.regularSold',
    sold: 892,
    price: 1.4,
  },
  { id: 'espresso', name: 'Espresso', noteKey: 'changePrices.sold', sold: 641, price: 0.8 },
  {
    id: 'cold-brew',
    name: 'Cold Brew',
    noteKey: 'changePrices.handSet',
    sold: 0,
    price: 1.6,
    handSet: true,
  },
  { id: 'v60', name: 'V60 Pour Over', noteKey: 'changePrices.sold', sold: 118, price: 1.8 },
]

/** The group the bulk dialog was opened on. */
export const BULK_SCOPE = { count: 34, handSet: 3, quarterSales: 10_320 }
