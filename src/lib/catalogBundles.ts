/**
 * Catalog › Bundles (Figma 135:48699) and one bundle in full (135:48138).
 *
 * A bundle is priced as one thing but made of several, so two figures matter and neither is
 * typed: what it saves the customer against buying the parts, and how many can be made from
 * what is actually on the shelf. Both fall out of the parts.
 *
 * Two of the design's numbers could not both be true. It showed the starter bundle held back by
 * the hand grinder at eleven, while its own stock screen holds fourteen packs of filters against
 * two per bundle — which caps it at seven. The shelf is what the stock screen counts, so the cap
 * is taken from there and the limiting part is whichever one actually binds.
 */

import { ITEMS, omr, groupName, kindName, type Item } from './catalog'
import { STOCK_ROWS } from './catalogStock'

export const VAT_RATE = 0.05

/** One line inside a bundle: an item you already sell, and how many of it go in. */
export type Part = { itemId: string; quantity: number; free?: boolean }

export type Bundle = {
  id: string
  name: string
  code: string
  group: string
  kind: string
  parts: Part[]
  /** What the customer pays, including VAT. */
  price: number
  onSale: boolean
  sold90: number
  /** A bundle with nothing counted in it can be made for ever. */
  unlimited?: boolean
  windowKey?: string
  windowValues?: Record<string, string | number>
  noteKey?: string
  noteValues?: Record<string, string | number>
  offSince?: string
  /** Set where the design says the saving is nil and the point is convenience. */
  noSaving?: boolean
  seasonal?: boolean
}

export const BUNDLES: Bundle[] = [
  {
    id: 'home-brewing-kit',
    name: 'Home brewing kit',
    code: 'PKG-0005',
    group: 'Equipment',
    kind: 'Bundles',
    parts: [
      { itemId: 'house-blend-1kg', quantity: 1 },
      { itemId: 'hand-grinder', quantity: 1 },
      { itemId: 'paper-filters-100', quantity: 1 },
      { itemId: 'kraft-bags-500g', quantity: 2 },
      { itemId: 'barista-training', quantity: 1, free: true },
    ],
    price: 52.5,
    onSale: true,
    sold90: 14,
    noteKey: 'bundles.hasRunOut',
  },
  {
    id: 'starter-bundle',
    name: 'Starter bundle',
    code: 'PKG-0003',
    group: 'Equipment',
    kind: 'Bundles',
    parts: [
      { itemId: 'house-blend-250g', quantity: 1 },
      { itemId: 'hand-grinder', quantity: 1 },
      { itemId: 'paper-filters-100', quantity: 2 },
      { itemId: 'barista-training', quantity: 1, free: true },
    ],
    price: 38,
    onSale: true,
    sold90: 22,
    noteKey: 'bundles.thrownInFree',
    noteValues: { count: 1 },
  },
  {
    id: 'morning-deal',
    name: 'Morning deal',
    code: 'PKG-0007',
    group: 'Brewed drinks',
    kind: 'Bundles',
    parts: [
      { itemId: 'flat-white', quantity: 1 },
      { itemId: 'pastry', quantity: 1 },
    ],
    price: 2.3,
    onSale: true,
    sold90: 68,
    unlimited: true,
    windowKey: 'bundles.timeWindow',
    windowValues: { from: '06:00', to: '10:00' },
  },
  {
    id: 'taste-of-ethiopia',
    name: 'Taste of Ethiopia — three bags',
    code: 'PKG-0002',
    group: 'Green beans',
    kind: 'Bundles',
    parts: [
      { itemId: 'yirgacheffe-1kg', quantity: 1 },
      { itemId: 'sidamo-1kg', quantity: 1 },
      { itemId: 'house-blend-1kg', quantity: 1 },
    ],
    price: 8.4,
    onSale: true,
    sold90: 41,
    noteKey: 'bundles.gramsOfEach',
    noteValues: { grams: 250 },
  },
  {
    id: 'office-refill',
    name: 'Office refill — 5 kg and filters',
    code: 'PKG-0006',
    group: 'Green beans',
    kind: 'Bundles',
    parts: [
      { itemId: 'house-blend-1kg', quantity: 5 },
      { itemId: 'paper-filters-100', quantity: 1 },
    ],
    price: 46,
    onSale: true,
    sold90: 0,
    noSaving: true,
    noteKey: 'bundles.forWholesaleCustomers',
  },
  {
    id: 'ramadan-gift-box',
    name: 'Ramadan gift box',
    code: 'PKG-0004',
    group: 'Green beans',
    kind: 'Bundles',
    parts: [
      { itemId: 'house-blend-250g', quantity: 1 },
      { itemId: 'yirgacheffe-1kg', quantity: 1 },
      { itemId: 'sidamo-1kg', quantity: 1 },
      { itemId: 'kraft-bags-500g', quantity: 1 },
      { itemId: 'paper-filters-100', quantity: 1 },
    ],
    price: 24,
    onSale: false,
    sold90: 96,
    offSince: '2 Apr',
    seasonal: true,
  },
]

/** Two parts the bundles use that are not among the rows the list screen draws. */
const EXTRA_PARTS: Record<string, { name: string; price: number; onHand: number | null }> = {
  'house-blend-250g': { name: 'House Blend 250 g bag', price: 2.7, onHand: 142 },
  pastry: { name: 'Pastry', price: 0.9, onHand: null },
}

export function partOf(itemId: string) {
  const item = ITEMS.find((entry) => entry.id === itemId) as Item | undefined
  if (item) {
    const stock = STOCK_ROWS.find((row) => row.id === itemId)
    return {
      id: itemId,
      name: item.name,
      code: item.code,
      group: groupName(item.group),
      kind: kindName(item.group, item.kind),
      /** A short handle for a sentence — "Filters allow 48" rather than "Paper allow 48". */
      shortName: kindName(item.group, item.kind),
      price: item.price ?? 0,
      onHand: stock?.onHand ?? item.onHand,
      unitKey: item.stockUnitKey,
    }
  }
  const extra = EXTRA_PARTS[itemId]
  return {
    id: itemId,
    name: extra?.name ?? itemId,
    shortName: extra?.name ?? itemId,
    code: '',
    group: '',
    kind: '',
    price: extra?.price ?? 0,
    onHand: extra?.onHand ?? null,
    unitKey: undefined,
  }
}

/** What the parts come to if bought one by one, including VAT. */
export const partsTotal = (bundle: Bundle) =>
  Math.round(
    bundle.parts.reduce(
      (total, part) => total + (part.free ? 0 : partOf(part.itemId).price * part.quantity),
      0,
    ) * 1000,
  ) / 1000

/** What the customer saves, and the share of the parts price that represents. */
export function saving(bundle: Bundle) {
  const parts = partsTotal(bundle)
  const amount = Math.round((parts - bundle.price) * 1000) / 1000
  return { parts, amount, percent: parts > 0 ? Math.round((amount / parts) * 1000) / 10 : 0 }
}

/** The price before VAT, worked out backwards from what the customer pays. */
export const beforeVat = (price: number) => Math.round((price / (1 + VAT_RATE)) * 1000) / 1000

export const vatOn = (price: number) => Math.round((price - beforeVat(price)) * 1000) / 1000

/**
 * How many can be made, and which part is the limit.
 *
 * A bundle can only go as far as its scarcest part; a part nobody counts never limits anything.
 */
export function canMake(bundle: Bundle) {
  if (bundle.unlimited) return { count: null, limitedBy: null as string | null }
  let count: number | null = null
  let limitedBy: string | null = null
  for (const part of bundle.parts) {
    const info = partOf(part.itemId)
    if (info.onHand === null || info.onHand === undefined) continue
    const possible = Math.floor(info.onHand / part.quantity)
    if (count === null || possible < count) {
      count = possible
      limitedBy = info.name
    }
  }
  return { count, limitedBy }
}

export const revenueOf = (bundle: Bundle) => Math.round(bundle.sold90 * bundle.price * 1000) / 1000

export const discountGivenBy = (bundle: Bundle) =>
  Math.round(bundle.sold90 * saving(bundle).amount * 1000) / 1000

/* ------------------------------------------------------------------ the list */

export const ON_SALE_BUNDLES = BUNDLES.filter((bundle) => bundle.onSale)
export const OFF_BUNDLES = BUNDLES.filter((bundle) => !bundle.onSale)

export const CANT_BE_MADE = ON_SALE_BUNDLES.filter((bundle) => canMake(bundle).count === 0)
export const NOT_SELLING = ON_SALE_BUNDLES.filter((bundle) => bundle.sold90 === 0)

export const BUNDLE_TABS = [
  { id: 'all', labelKey: 'bundles.tab.all' },
  { id: 'onSale', labelKey: 'bundles.tab.onSale' },
  { id: 'cantBeMade', labelKey: 'bundles.tab.cantBeMade' },
  { id: 'notSelling', labelKey: 'bundles.tab.notSelling' },
  { id: 'switchedOff', labelKey: 'bundles.tab.switchedOff' },
] as const

export type BundleTab = (typeof BUNDLE_TABS)[number]['id']

export function matchesBundleTab(bundle: Bundle, tab: BundleTab) {
  if (tab === 'all') return true
  if (tab === 'onSale') return bundle.onSale
  if (tab === 'cantBeMade') return bundle.onSale && canMake(bundle).count === 0
  if (tab === 'notSelling') return bundle.onSale && bundle.sold90 === 0
  return !bundle.onSale
}

export const countBundleTab = (tab: BundleTab) =>
  BUNDLES.filter((bundle) => matchesBundleTab(bundle, tab)).length

export const BUNDLE_SUMMARY = () => ({
  count: BUNDLES.length,
  onSale: ON_SALE_BUNDLES.length,
  off: OFF_BUNDLES.length,
  broughtIn: Math.round(BUNDLES.reduce((total, b) => total + revenueOf(b), 0) * 1000) / 1000,
  givenAway:
    Math.round(BUNDLES.reduce((total, b) => total + Math.max(0, discountGivenBy(b)), 0) * 1000) /
    1000,
  cantBeMade: CANT_BE_MADE.length,
})

/** Bundle sales as a share of everything sold, which the card prints. */
export const SHARE_OF_SALES = 4.2

export const BUNDLE_SORTS = [
  { id: 'name', labelKey: 'bundles.sort.name' },
  { id: 'bestSelling', labelKey: 'bundles.sort.bestSelling' },
  { id: 'saving', labelKey: 'bundles.sort.saving' },
]

/* --------------------------------------------------------------- one bundle */

export const BUNDLE_PRICING = [
  { id: 'onePrice', labelKey: 'bundle.onePrice', noteKey: 'bundle.onePriceNote' },
  { id: 'percentage', labelKey: 'bundle.percentage', noteKey: 'bundle.percentageNote' },
]

export const BUNDLE_BEHAVIOUR = [
  { id: 'showParts', on: true },
  { id: 'takeFromStock', on: true },
  { id: 'staffCanSwap', on: false },
]

/** What the starter bundle's grinder sales are worth against all grinder sales. */
export const GRINDERS_SOLD_THIS_WAY = { throughBundle: 22, total: 31 }

export { omr }
