/**
 * Catalog › Stock (Figma 135:49263) and one item's shelf in full (135:49825), read from
 * `/v1/stock` (`src/api/stock/stock.ts`, INCOME.md P.10).
 *
 * Only things that are counted appear here: a drink made to order and a service have no shelf.
 * The safer reorder level is worked out from how fast an item sells and how long its supplier
 * takes, so the screen cannot advise a level its own sales rate contradicts.
 *
 * The sample block at the top (`STOCK_ROWS`, `STOCK_BOOK`, `SUPPLIER`) is no longer drawn by the
 * stock screens; it stays only for the bundle and notification prototypes that still run on
 * sample data under the Demo ribbon.
 */

import type { TFunction } from 'i18next'
import { ApiError } from '../api'
import type {
  StockMovementDto,
  StockRowDto,
  StockSortDto,
  StockStatusFilter,
  StockSummaryDto,
} from '../api/stock/stock'
import { omr } from './catalog'

/** Sample only (bundle prototype): what a counted item costs to buy, against what it sells for. */
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
  /** The weekday it ran out, 0 for Sunday; named in the reader's language by `weekdayName`. */
  ranOutOn?: number
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
    ranOutOn: 1,
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
    lastsNoteValues: { rate: 3 },
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

/**
 * A weekday (0 for Sunday) in the interface language, so an Arabic screen says الاثنين rather
 * than Monday. 18 October 2026 is a Sunday; any week would do.
 */
export function weekdayName(
  sundayIndex: number,
  language: string,
  width: 'long' | 'short' = 'long',
) {
  const day = new Date(2026, 9, 18 + (((sundayIndex % 7) + 7) % 7))
  return day.toLocaleDateString(language, { weekday: width })
}

/**
 * Sample only (notification prototype). The whole shelf, not just the six rows the screen draws.
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

/** Sample only (notification prototype): the supplier the sample low-stock notice names. */
export const SUPPLIER = { name: 'Muscat Roastery' }

/* ------------------------------------------------------------------ the live list */

export const STOCK_TABS = [
  { id: 'all', labelKey: 'stock.tab.all' },
  { id: 'needsOrdering', labelKey: 'stock.tab.needsOrdering' },
  { id: 'counted', labelKey: 'stock.tab.counted' },
  { id: 'nothingLeft', labelKey: 'stock.tab.nothingLeft' },
  { id: 'sittingStill', labelKey: 'stock.tab.sittingStill' },
  { id: 'notCounted', labelKey: 'stock.tab.notCounted' },
] as const

export type StockTab = (typeof STOCK_TABS)[number]['id']

/** The server's `status` for each tab. */
export const TAB_STATUS: Record<StockTab, StockStatusFilter> = {
  all: 'ALL',
  needsOrdering: 'NEEDS_ORDERING',
  counted: 'COUNTED',
  nothingLeft: 'OUT',
  sittingStill: 'SITTING_STILL',
  notCounted: 'NOT_COUNTED',
}

/** A tab's count from `GET /v1/stock/summary`; null while it has not answered. */
export function countStockTab(summary: StockSummaryDto | null, tab: StockTab): number | null {
  if (!summary) return null
  if (tab === 'all') return summary.counted + summary.notCounted
  if (tab === 'needsOrdering') return summary.needsOrdering
  if (tab === 'counted') return summary.counted
  if (tab === 'nothingLeft') return summary.nothingLeft
  if (tab === 'sittingStill') return summary.sittingStill
  return summary.notCounted
}

/** "This week" is the last seven days: sold, received and written off, as the card's note says. */
export function movedThisWeek(summary: StockSummaryDto): number {
  const week = summary.lastSevenDays
  return week.sold + week.received + week.writtenOff
}

export const STOCK_SORTS = [
  { id: 'lowestFirst', labelKey: 'stock.sort.lowestFirst' },
  { id: 'worthMost', labelKey: 'stock.sort.worthMost' },
  { id: 'name', labelKey: 'stock.sort.name' },
] as const

export type StockSort = (typeof STOCK_SORTS)[number]['id']

export const SERVER_STOCK_SORT: Record<StockSort, StockSortDto> = {
  lowestFirst: 'LOWEST_FIRST',
  worthMost: 'WORTH_MOST',
  name: 'NAME',
}

/** Out of stock, or sold below zero: nothing left either way. */
export const isOut = (row: Pick<StockRowDto, 'state'>) =>
  row.state === 'OUT' || row.state === 'BELOW_ZERO'

export const isRunningLow = (row: Pick<StockRowDto, 'state'>) => row.state === 'LOW'

/** How far through its reorder level a row sits, for the bar the row draws. */
export function coverShare(row: Pick<StockRowDto, 'onHand' | 'reorderLevel'>): number {
  if (row.onHand === null || row.onHand <= 0) return 0
  if (row.reorderLevel === null || row.reorderLevel <= 0) return 1
  return Math.min(1, row.onHand / row.reorderLevel)
}

/** The item's name in the reader's language, with its size or option. */
export function stockItemName(
  row: Pick<StockRowDto, 'name' | 'nameAr' | 'variantName' | 'variantNameAr'>,
  language: string,
): string {
  const ar = language.startsWith('ar')
  const name = ar && row.nameAr ? row.nameAr : row.name
  // The Arabic size and option come from backend #808; an older server sends English only.
  const variant = ar && row.variantNameAr ? row.variantNameAr : row.variantName
  return variant ? `${name} · ${variant}` : name
}

/**
 * Where the item sits in the catalogue, "group › kind", in the reader's language (backend #808,
 * INCOME.md P.19). Null when the row carries neither (an older server, or an item with no kind).
 */
export function stockItemPlace(
  row: Pick<StockRowDto, 'groupName' | 'groupNameAr' | 'kindName' | 'kindNameAr'>,
  language: string,
): string | null {
  const ar = language.startsWith('ar')
  const group = (ar && row.groupNameAr) || row.groupName || null
  const kind = (ar && row.kindNameAr) || row.kindName || null
  const parts = [group, kind].filter((part): part is string => Boolean(part))
  return parts.length ? parts.join(' › ') : null
}

/** The item's page: the product, and its size or option when it is counted per variant. */
export function stockItemHref(row: Pick<StockRowDto, 'productId' | 'variantId'>): string {
  const base = `/stock/${encodeURIComponent(row.productId)}`
  return row.variantId ? `${base}?variant=${encodeURIComponent(row.variantId)}` : base
}

/** The row's identity: a product, or one of its variants. */
export const stockKey = (row: Pick<StockRowDto, 'productId' | 'variantId'>) =>
  `${row.productId}:${row.variantId ?? ''}`

/**
 * A unit as the stock screens print it beside a figure: English in the plural ("bags",
 * "kilograms"), Arabic by the unit's name. Falls back to the code.
 */
export function stockUnitName(t: TFunction, unitCode: string, language: string): string {
  const name = t(`createInvoice.units.${unitCode}`, {
    defaultValue: t(`reference.unitShort.${unitCode}`, { defaultValue: unitCode }),
  })
  return language.startsWith('en')
    ? t(`invoiceForm.unitLock.unitName.${unitCode}`, {
        defaultValue: name.toLocaleLowerCase('en'),
      })
    : name
}

/** A quantity at up to three decimals, without trailing zeros: 12, 2.5, 0.125. */
export function quantityText(value: number, language: string): string {
  return new Intl.NumberFormat(language.startsWith('ar') ? 'ar-OM-u-nu-latn' : 'en-US', {
    maximumFractionDigits: 3,
  }).format(value)
}

/* -------------------------------------------------------------- one item's shelf */

export const margin = (cost: number, sells: number) =>
  sells <= 0 ? 0 : Math.round(((sells - cost) / sells) * 1000) / 10

/** Enough to cover the wait for a delivery: what the level ought to be. */
export const saferLevel = (perDay: number, leadDays: number) => Math.ceil(perDay * leadDays)

/** How many days a delivery of a given size lasts at the current rate. */
export const deliveryLasts = (quantity: number, perDay: number) =>
  perDay <= 0 ? null : Math.floor(quantity / perDay)

/** A delivery big enough to hold the level until the next one. */
export const deliveryThatHolds = (perDay: number, everyDays: number) =>
  Math.ceil(perDay * everyDays)

/** The days between deliveries the chart's advice plans for. */
export const DELIVERY_EVERY_DAYS = 14

const MUSCAT_TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Muscat',
})
const MUSCAT_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' })

/**
 * The time a movement is listed at, in Muscat. A delivery is recorded against the day it came in,
 * so it happened "at" midnight, which is not a time anyone saw (E2E 29 Oct 2026, F-10): it shows
 * the time it was recorded when that was the same day, and no time otherwise.
 */
export function movementTime(
  movement: Pick<StockMovementDto, 'type' | 'occurredAt' | 'recordedAt'>,
): string {
  const when = new Date(movement.occurredAt)
  if (Number.isNaN(when.getTime())) return ''
  const time = MUSCAT_TIME.format(when)
  if (movement.type !== 'RECEIPT' || time !== '00:00') return time
  const recorded = new Date(movement.recordedAt)
  if (Number.isNaN(recorded.getTime())) return ''
  return MUSCAT_DAY.format(recorded) === MUSCAT_DAY.format(when) ? MUSCAT_TIME.format(recorded) : ''
}

export type MovementKind = 'sold' | 'writtenOff' | 'returned' | 'delivered' | 'corrected'

export function movementKind(
  movement: Pick<StockMovementDto, 'type' | 'quantityChange'>,
): MovementKind {
  switch (movement.type) {
    case 'SALE':
      return 'sold'
    case 'WRITE_OFF':
      return 'writtenOff'
    case 'REFUND_RETURN':
      return 'returned'
    case 'RECEIPT':
      return 'delivered'
    case 'CANCEL_REVERSAL':
      return movement.quantityChange > 0 ? 'returned' : 'sold'
    default:
      return 'corrected'
  }
}

/** The movement's title in words. */
export function movementTitleKey(
  movement: Pick<StockMovementDto, 'type' | 'source' | 'quantityChange'>,
): string {
  switch (movement.type) {
    case 'SALE':
      return movement.source.type === 'POS_SALE'
        ? 'stockItem.soldAtTheTill'
        : 'stockItem.soldOnAnInvoice'
    case 'WRITE_OFF':
      return 'stockItem.writtenOff'
    case 'REFUND_RETURN':
      return 'stockItem.live.backOnShelf'
    case 'RECEIPT':
      return movement.source.type === 'DELIVERY'
        ? 'stockItem.live.deliveryRecorded'
        : 'stockItem.deliveryCheckedIn'
    case 'CANCEL_REVERSAL':
      return movement.quantityChange > 0
        ? 'stockItem.live.cancelSaleBack'
        : 'stockItem.live.cancelReturnOff'
    default:
      return 'stockItem.countCorrected'
  }
}

/** Where a movement's document opens, when the web has a page for it. */
export function movementLink(movement: StockMovementDto): { label: string; to: string } | null {
  const link = movement.source.link
  const label = movement.source.number
  if (!link || !label) return null
  const id = encodeURIComponent(link.id)
  if (link.kind === 'INVOICE') return { label, to: `/invoices/${id}` }
  if (link.kind === 'CREDIT_NOTE') return { label, to: `/income/credit-notes/${id}` }
  if (link.kind === 'PURCHASE_ORDER' || link.kind === 'GOODS_RECEIPT')
    return { label, to: `/expenditure/purchase-orders/${id}` }
  return null
}

/** The line under a movement's title, in words, never the server's own text. */
export function movementNote(t: TFunction, movement: StockMovementDto, language: string): string {
  const who = movement.by.name ?? ''
  const parts: string[] = []
  if (movement.type === 'WRITE_OFF' && movement.reasonCode) {
    parts.push(t(`stock.writeOff.reasons.${movement.reasonCode}`, { defaultValue: '' }))
  }
  if (movement.type === 'COUNT_CORRECTION' && movement.countedQuantity !== null) {
    parts.push(
      t('stockItem.live.countedAs', { count: quantityText(movement.countedQuantity, language) }),
    )
  }
  if (movement.type === 'RECEIPT') {
    if (movement.supplier)
      parts.push(t('stockItem.live.from', { supplier: movement.supplier.name }))
    if (movement.unitCost !== null)
      parts.push(t('stockItem.live.atEach', { amount: `OMR ${omr(movement.unitCost)}` }))
    // Backend #815: the supplier's own reference on a delivery; isolated, as codes read LTR.
    if (movement.supplierReference)
      parts.push(
        t('stockItem.live.supplierRef', { reference: `\u2066${movement.supplierReference}\u2069` }),
      )
  }
  if (movement.note) parts.push(movement.note)
  if (who) parts.push(who)
  return parts.filter(Boolean).join(' · ')
}

/* ------------------------------------------------------------------- the forms */

/** A count, quantity or level as typed: a number of zero or more with at most three decimals. */
export function readQuantity(text: string, { positive }: { positive: boolean }): number | null {
  const trimmed = text.trim()
  if (!/^\d+(\.\d{1,3})?$/.test(trimmed)) return null
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return null
  if (positive && value <= 0) return null
  return value
}

const STOCK_REFUSALS: Record<string, string> = {
  STOCK_QUANTITY_INVALID: 'stock.refused.quantityInvalid',
  STOCK_QUANTITY_NOT_WHOLE: 'stock.refused.quantityNotWhole',
  STOCK_VARIANT_REQUIRED: 'stock.refused.variantRequired',
  STOCK_VARIANT_NOT_ON_PRODUCT: 'stock.refused.variantNotOnProduct',
  STOCK_LINE_DUPLICATE: 'stock.refused.lineDuplicate',
  STOCK_COUNTED_AT_INVALID: 'stock.refused.countedAtInvalid',
  STOCK_UNIT_COST_INVALID: 'stock.refused.unitCostInvalid',
  STOCK_RECEIVED_ON_INVALID: 'stock.refused.receivedOnInvalid',
  STOCK_WRITE_OFF_NOTE_REQUIRED: 'stock.refused.noteRequired',
  STOCK_REORDER_LEVEL_INVALID: 'stock.refused.reorderLevelInvalid',
  STOCK_ITEM_NOT_FOUND: 'stock.refused.itemNotFound',
  STOCK_NOT_COUNTED_PRODUCT: 'stock.refused.notCountedProduct',
  STOCK_ADJUSTMENT_KEY_REUSED: 'stock.refused.keyReused',
  STOCK_LEVEL_VERSION_CONFLICT: 'stock.refused.levelVersionConflict',
  SUPPLIER_NOT_FOUND: 'stock.refused.supplierNotFound',
  SUPPLIER_ARCHIVED: 'stock.refused.supplierArchived',
  BRANCH_NOT_FOUND: 'stock.refused.branchNotFound',
}

/** The stock routes' own refusals in words; null for anything else (the shared wording). */
export function stockRefusalKey(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code === null) return null
  return STOCK_REFUSALS[error.code] ?? null
}
