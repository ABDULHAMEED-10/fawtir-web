/**
 * Catalog › Stock (Figma 135:49263) and one item's shelf in full (135:49825).
 *
 * Only things that are counted appear here — a drink made to order and a service have no shelf.
 * Worth, days of cover and the safer reorder level are all worked out from what is held and how
 * fast it moves, so the screen cannot advise a level its own sales rate contradicts.
 */

import { ITEMS, omr, type Item } from './catalog'

/** What a counted item costs to buy, against what it sells for. */
export type StockRow = {
  id: string
  /** Null while nobody has counted it yet. */
  onHand: number | null
  unitKey: string
  cost: number
  reorderAt: number
  /** How many go out on an average day. */
  perDay: number
  onOrder?: { reference: string; quantity: number; dueOn: string }
  supplier: string
  /** A note the row prints instead of a plain "days left". */
  lastsNoteKey?: string
  lastsNoteValues?: Record<string, string | number>
  ranOutOn?: string
}

export const STOCK_ROWS: StockRow[] = [
  {
    id: 'kraft-bags-500g',
    onHand: 0,
    unitKey: 'catalog.unit.bags',
    cost: 0.06,
    reorderAt: 120,
    perDay: 7.1,
    supplier: 'Muscat Roastery',
    lastsNoteKey: 'stock.usingBiggerInstead',
    lastsNoteValues: { amount: '0.090' },
    ranOutOn: 'Monday',
  },
  {
    id: 'yirgacheffe-1kg',
    onHand: 6,
    unitKey: 'catalog.unit.bags',
    cost: 7.4,
    reorderAt: 15,
    perDay: 3.1,
    supplier: 'Muscat Roastery',
    lastsNoteKey: 'stock.sellingAbout',
    lastsNoteValues: { rate: '3 a day' },
  },
  {
    id: 'sidamo-1kg',
    onHand: 9,
    unitKey: 'catalog.unit.bags',
    cost: 8.5,
    reorderAt: 15,
    perDay: 2.2,
    supplier: 'Muscat Roastery',
    lastsNoteKey: 'stock.theDayTheyDeliver',
  },
  {
    id: 'paper-filters-100',
    onHand: 14,
    unitKey: 'catalog.unit.packs',
    cost: 1.85,
    reorderAt: 24,
    perDay: 2.8,
    supplier: 'Gulf Packaging',
    lastsNoteKey: 'stock.heldForTheBundle',
    lastsNoteValues: { count: 6 },
  },
  {
    id: 'hand-grinder',
    onHand: 11,
    unitKey: 'catalog.unit.units',
    cost: 24,
    reorderAt: 8,
    perDay: 0.32,
    onOrder: { reference: 'PO-0029', quantity: 12, dueOn: '6 Aug' },
    supplier: 'Barista Supply Co',
    lastsNoteKey: 'stock.capsTheBundle',
    lastsNoteValues: { count: 11 },
  },
  {
    id: 'house-blend-1kg',
    onHand: 84,
    unitKey: 'catalog.unit.bags',
    cost: 7.6,
    reorderAt: 30,
    perDay: 3.9,
    supplier: 'Muscat Roastery',
    lastsNoteKey: 'stock.yourSteadiestSeller',
  },
]

export const itemOf = (id: string) => ITEMS.find((item) => item.id === id) as Item

/** What a row is worth on the shelf, at what it cost rather than what it sells for. */
export const rowWorth = (row: StockRow) => Math.round((row.onHand ?? 0) * row.cost * 1000) / 1000

/** Days of cover left, from what is held and how fast it goes. */
export const daysLeft = (row: StockRow) =>
  row.perDay <= 0 || row.onHand === null ? null : Math.round(row.onHand / row.perDay)

/** How far through its reorder level a row sits, for the bar the row draws. */
export const coverShare = (row: StockRow) =>
  row.onHand === null ? 0 : Math.min(1, row.onHand / Math.max(1, row.reorderAt))

export const isRunningLow = (row: StockRow) =>
  row.onHand !== null && row.onHand > 0 && row.onHand < row.reorderAt

export const isOut = (row: StockRow) => row.onHand === 0

/**
 * The whole shelf, not just the six rows the screen draws.
 *
 * Sixty-one of the hundred and eighteen items are counted; the rest are services, made-to-order
 * drinks and anything nobody has counted yet.
 */
export const STOCK_BOOK = {
  counted: 61,
  notCounted: 57,
  worth: 8_412.6,
  sittingStill: 9,
  /** Below the level set for them, across the whole shelf. */
  runningLow: 4,
  /** Nothing at all left, which is a subset of nobody's comfort. */
  nothingLeft: 1,
  movedThisWeek: { sold: 164, received: 48, writtenOff: 6 },
}

export const STOCK_TOTAL = STOCK_BOOK.counted + STOCK_BOOK.notCounted

export const MOVED_THIS_WEEK =
  STOCK_BOOK.movedThisWeek.sold +
  STOCK_BOOK.movedThisWeek.received +
  STOCK_BOOK.movedThisWeek.writtenOff

export const RUNNING_LOW = STOCK_BOOK.runningLow
export const NOTHING_LEFT = STOCK_BOOK.nothingLeft
export const NEEDS_ORDERING = RUNNING_LOW + NOTHING_LEFT

/** The same two states among the rows the table actually draws. */
export const DRAWN_LOW = STOCK_ROWS.filter(isRunningLow).length
export const DRAWN_OUT = STOCK_ROWS.filter(isOut).length

export const STOCK_TABS = [
  { id: 'all', labelKey: 'stock.tab.all' },
  { id: 'needsOrdering', labelKey: 'stock.tab.needsOrdering' },
  { id: 'counted', labelKey: 'stock.tab.counted' },
  { id: 'nothingLeft', labelKey: 'stock.tab.nothingLeft' },
  { id: 'sittingStill', labelKey: 'stock.tab.sittingStill' },
  { id: 'notCounted', labelKey: 'stock.tab.notCounted' },
] as const

export type StockTab = (typeof STOCK_TABS)[number]['id']

export function countStockTab(tab: StockTab) {
  if (tab === 'all') return STOCK_TOTAL
  if (tab === 'needsOrdering') return NEEDS_ORDERING
  if (tab === 'counted') return STOCK_BOOK.counted
  if (tab === 'nothingLeft') return NOTHING_LEFT
  if (tab === 'sittingStill') return STOCK_BOOK.sittingStill
  return STOCK_BOOK.notCounted
}

export function matchesStockTab(row: StockRow, tab: StockTab) {
  if (tab === 'all' || tab === 'counted') return true
  if (tab === 'needsOrdering') return isRunningLow(row) || isOut(row)
  if (tab === 'nothingLeft') return isOut(row)
  if (tab === 'sittingStill') return row.perDay < 0.5
  return false
}

export const STOCK_SORTS = [
  { id: 'lowestFirst', labelKey: 'stock.sort.lowestFirst' },
  { id: 'worthMost', labelKey: 'stock.sort.worthMost' },
  { id: 'name', labelKey: 'stock.sort.name' },
]

/* ------------------------------------------------------------- one item's shelf */

export const STOCK_ITEM_ID = 'yirgacheffe-1kg'

export const stockRowOf = (id: string) => STOCK_ROWS.find((row) => row.id === id) as StockRow

/** Days a supplier takes, so the safer warning level can be worked out rather than guessed. */
export const SUPPLIER = {
  name: 'Muscat Roastery',
  leadDays: 6,
  delivers: 'Sundays',
  cost: 7.4,
  sells: 11.4,
  lastPriceChange: { from: '7.100', to: '7.400', month: 'March' },
  usuallyOrder: 25,
}

export const margin = (cost: number, sells: number) =>
  Math.round(((sells - cost) / sells) * 1000) / 10

/** Enough to cover the wait for a delivery — what the level ought to be. */
export const saferLevel = (perDay: number, leadDays: number) => Math.ceil(perDay * leadDays)

/** How many days a delivery of a given size would last at the current rate. */
export const deliveryLasts = (quantity: number, perDay: number) => Math.floor(quantity / perDay)

/** A delivery big enough to hold the level until the next one. */
export const deliveryThatHolds = (perDay: number, everyDays: number) =>
  Math.ceil(perDay * everyDays)

export type Movement = {
  id: string
  date: string
  at: string
  kind: 'sold' | 'writtenOff' | 'held' | 'delivered' | 'corrected'
  titleKey: string
  noteKey: string
  noteValues?: Record<string, string | number>
  link?: { label: string; to: string }
  change: number
  leftAfter: number
}

export const MOVEMENTS: Movement[] = [
  {
    id: 'm1',
    date: '30 Jul',
    at: '14:22',
    kind: 'sold',
    titleKey: 'stockItem.soldAtTheTill',
    noteKey: 'stockItem.receiptWalkIn',
    noteValues: { receipt: '8841' },
    change: -1,
    leftAfter: 6,
  },
  {
    id: 'm2',
    date: '30 Jul',
    at: '09:05',
    kind: 'sold',
    titleKey: 'stockItem.soldOnAnInvoice',
    noteKey: 'stockItem.invoiceBags',
    noteValues: { count: 2 },
    link: { label: 'INV-2046', to: '/invoices/INV-2046' },
    change: -2,
    leftAfter: 7,
  },
  {
    id: 'm3',
    date: '29 Jul',
    at: '16:40',
    kind: 'writtenOff',
    titleKey: 'stockItem.writtenOff',
    noteKey: 'stockItem.splitBag',
    change: -1,
    leftAfter: 9,
  },
  {
    id: 'm4',
    date: '29 Jul',
    at: '11:18',
    kind: 'sold',
    titleKey: 'stockItem.soldAtTheTill',
    noteKey: 'stockItem.receiptsBags',
    noteValues: { from: '8823', to: '8829', count: 3 },
    change: -3,
    leftAfter: 10,
  },
  {
    id: 'm5',
    date: '28 Jul',
    at: '08:30',
    kind: 'held',
    titleKey: 'stockItem.heldForABundle',
    noteKey: 'stockItem.bundleSold',
    noteValues: { count: 2 },
    link: { label: 'PKG-0002', to: '/catalog/bundles' },
    change: -2,
    leftAfter: 13,
  },
  {
    id: 'm6',
    date: '24 Jul',
    at: '07:15',
    kind: 'delivered',
    titleKey: 'stockItem.deliveryCheckedIn',
    noteKey: 'stockItem.grnAgainst',
    noteValues: { grn: 'GRN-0091', supplier: 'Muscat Roastery' },
    link: { label: 'PO-0033', to: '/purchase-orders' },
    change: 25,
    leftAfter: 40,
  },
  {
    id: 'm7',
    date: '23 Jul',
    at: '17:02',
    kind: 'corrected',
    titleKey: 'stockItem.countCorrected',
    noteKey: 'stockItem.shelfCountFound',
    noteValues: { who: 'Hafidh Saif' },
    change: -1,
    leftAfter: 15,
  },
]

/** The thirty-day line the chart draws, oldest first. */
export const THIRTY_DAYS = [
  28, 26, 24, 22, 20, 18, 16, 40, 38, 36, 34, 32, 30, 28, 26, 24, 22, 20, 19, 18, 17, 16, 15, 14,
  13, 12, 10, 9, 7, 6,
]

/** The day the delivery landed, as an index into the line above. */
export const DELIVERY_AT = 7

export const DELIVERY_SIZE = 25

/** What else would stop if this ran out. */
export const DEPENDS_ON_IT = {
  bundle: 'Taste of Ethiopia',
  cappedAt: 6,
  quotations: 0,
  recurring: 0,
}

export { omr }
