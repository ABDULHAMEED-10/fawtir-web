/**
 * The arithmetic behind the item pages (how it sells, where it is used, its history) and the
 * bundle screens. Every figure here is worked out from what the API answered; nothing is sampled.
 */
import type {
  ProductHistoryChange,
  ProductSalesBucket,
  ProductSalesDto,
  ProductUsageRow,
} from '../api/catalog/insights'
import type { BundlePartDto } from '../api/catalog/bundles'

/** The locale dates and weekdays are written in: day-month as the app writes them, Latin digits. */
export const dateLocale = (language: string) =>
  language.startsWith('ar') ? 'ar-u-nu-latn' : 'en-GB'

export const round3 = (value: number) => Math.round(value * 1000) / 1000

/** The period picker's three windows, each read day by day (the API allows 366 days by DAY). */
export const SALES_WINDOWS = {
  yearly: { days: 365, bucket: 'month' },
  quarterly: { days: 90, bucket: 'week' },
  monthly: { days: 30, bucket: 'day' },
} as const

export type SalesWindow = keyof typeof SALES_WINDOWS

const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** `from` and `to` of a window ending today (both inclusive). */
export function salesPeriod(window: SalesWindow, today = new Date()): { from: string; to: string } {
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  from.setDate(from.getDate() - (SALES_WINDOWS[window].days - 1))
  return { from: isoDay(from), to: isoDay(today) }
}

const dayOf = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Monday of the week holding the day (ISO weeks, as the API's WEEK buckets). */
const mondayOf = (date: Date) => {
  const monday = new Date(date)
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return monday
}

export type SalesBar = { start: string; units: number }

/** The daily series rolled into months, ISO weeks or left as days, oldest first. */
export function rollSeries(
  series: readonly ProductSalesBucket[],
  bucket: 'month' | 'week' | 'day',
) {
  const bars = new Map<string, number>()
  for (const row of series) {
    const day = dayOf(row.start)
    const key =
      bucket === 'month'
        ? `${isoDay(day).slice(0, 7)}-01`
        : bucket === 'week'
          ? isoDay(mondayOf(day))
          : isoDay(day)
    bars.set(key, (bars.get(key) ?? 0) + row.units)
  }
  return [...bars.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, units]): SalesBar => ({ start, units: round3(units) }))
}

/** The bar with the most units (the first of equals), or null when nothing sold. */
export function bestBar(bars: readonly SalesBar[]): SalesBar | null {
  let best: SalesBar | null = null
  for (const bar of bars) if (bar.units > 0 && (!best || bar.units > best.units)) best = bar
  return best
}

/**
 * The busiest and quietest weekday over a daily series (0 Sunday … 6 Saturday), by units. Null
 * when nothing sold.
 */
export function weekdays(series: readonly ProductSalesBucket[]) {
  const totals = [0, 0, 0, 0, 0, 0, 0]
  for (const row of series) totals[dayOf(row.start).getDay()] += row.units
  if (totals.every((value) => value === 0)) return null
  let busiest = 0
  let quietest = 0
  totals.forEach((value, day) => {
    if (value > totals[busiest]) busiest = day
    if (value < totals[quietest]) quietest = day
  })
  return { busiest, quietest }
}

/** A share as a whole percent, 0 when there is nothing to share. */
export const percentOf = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0

/** What the item brought in, its add-ons included (the API keeps add-on lines apart). */
export const broughtIn = (sales: ProductSalesDto) =>
  round3(sales.total.revenue + sales.addOns.reduce((sum, row) => sum + row.revenue, 0))

/** The size or option sold most, with its share of the units; null when nothing sold. */
export function mostPopularVariant(sales: ProductSalesDto) {
  const total = sales.variants.reduce((sum, row) => sum + row.units, 0)
  const top = [...sales.variants].sort((a, b) => b.units - a.units)[0]
  if (!top || total <= 0 || top.units <= 0) return null
  return { ...top, share: Math.round((top.units / total) * 1000) / 10 }
}

/** The add-on that brought in most, and roughly one sale in how many takes the most taken one. */
export function addOnFacts(sales: ProductSalesDto) {
  const earner = [...sales.addOns].sort((a, b) => b.revenue - a.revenue)[0]
  const taken = [...sales.addOns].sort((a, b) => b.quantity - a.quantity)[0]
  if (!earner || !taken || taken.quantity <= 0) return null
  return {
    earner,
    taken,
    oneIn:
      sales.total.units > 0 ? Math.max(1, Math.round(sales.total.units / taken.quantity)) : null,
  }
}

/** Till sales come one row each; the page rolls the rows it read into one line. */
export function rollUpTill(rows: readonly ProductUsageRow[]) {
  const till = rows.filter((row) => row.kind === 'TILL_SALE')
  if (till.length === 0) return null
  const dates = till.map((row) => row.date).sort()
  return {
    read: till.length,
    quantity: round3(till.reduce((sum, row) => sum + row.quantity, 0)),
    lineValue: round3(till.reduce((sum, row) => sum + row.lineValue, 0)),
    first: dates[0],
    last: dates[dates.length - 1],
  }
}

/** Whole days between a date and today (never negative). */
export function daysAgo(iso: string, today = new Date()) {
  const start = dayOf(iso)
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000))
}

/* --------------------------------------------------------------------- history */

/** Fields whose values are money before VAT. */
const MONEY_FIELDS = new Set(['defaultUnitPrice', 'branchPrice'])
const BOOLEAN_FIELDS = new Set([
  'priceEntryIncludesVat',
  'staffCanChangePrice',
  'keepCount',
  'chosenBranch',
  'onSale',
])

/** How a history value is shown: the API's raw value, only put in the house's number and words. */
export type HistoryValue =
  | { kind: 'money'; value: string }
  | { kind: 'percent'; value: string }
  | { kind: 'key'; key: string; fallback: string }
  | { kind: 'text'; value: string }

const ITEM_KIND_KEY: Record<string, string> = {
  HAND_OVER: 'item.kind.handOver',
  DO: 'item.kind.youDo',
  BY_TIME: 'item.kind.byTime',
  BUNDLE: 'item.kind.several',
}

export function historyValue(field: string, raw: string): HistoryValue {
  const number = Number(raw)
  if (MONEY_FIELDS.has(field) && raw.trim() !== '' && Number.isFinite(number)) {
    return { kind: 'money', value: number.toFixed(3) }
  }
  if (field === 'defaultTaxRate' && Number.isFinite(number)) {
    return { kind: 'percent', value: `${number}` }
  }
  if (BOOLEAN_FIELDS.has(field) && (raw === 'true' || raw === 'false')) {
    return {
      kind: 'key',
      key: raw === 'true' ? 'itemHistory.yes' : 'itemHistory.no',
      fallback: raw,
    }
  }
  if (field === 'active' && (raw === 'true' || raw === 'false')) {
    return {
      kind: 'key',
      key: raw === 'true' ? 'item.onSale' : 'itemHistory.offSale',
      fallback: raw,
    }
  }
  if (field === 'defaultTaxCategory') {
    return { kind: 'key', key: `catalogReal.category.${raw}`, fallback: raw }
  }
  if (field === 'availability') {
    return {
      kind: 'key',
      key: raw === 'ALL_BRANCHES' ? 'item.branches.all' : 'item.branches.chosen',
      fallback: raw,
    }
  }
  if (field === 'itemKind' && ITEM_KIND_KEY[raw]) {
    return { kind: 'key', key: ITEM_KIND_KEY[raw], fallback: raw }
  }
  if (field === 'goodsOrService' && (raw === 'G' || raw === 'S')) {
    return {
      kind: 'key',
      key: raw === 'G' ? 'catalogReal.kind.goods' : 'catalogReal.kind.service',
      fallback: raw,
    }
  }
  return { kind: 'text', value: raw }
}

/** The label of a field, as the history names it (`itemHistory.field.<field>`). */
export const historyFieldKey = (change: Pick<ProductHistoryChange, 'field'>) =>
  `itemHistory.field.${change.field}`

/* --------------------------------------------------------------------- bundles */

/** What the parts cost one by one, before VAT; free parts count nothing. */
export const partsValue = (
  parts: readonly { unitPrice: number; quantity: number; free?: boolean }[],
) => round3(parts.reduce((sum, part) => sum + (part.free ? 0 : part.unitPrice * part.quantity), 0))

/**
 * The VAT on a bundle at a price before VAT. One rate when every part shares it; otherwise the
 * price is shared out by what each part sells for on its own (free parts included), as the
 * invoice lines split it (VAT Executive Regulations Art. 12, Art. 57's fair basis).
 */
export function bundleVat(
  price: number,
  parts: readonly { unitPrice: number; quantity: number; taxRate: number | null }[],
) {
  if (parts.length === 0) return { vat: 0, rate: null as number | null }
  const rates = new Set(parts.map((part) => part.taxRate ?? 0))
  if (rates.size === 1) {
    const rate = [...rates][0]
    return { vat: round3((price * rate) / 100), rate }
  }
  const weight = parts.reduce((sum, part) => sum + part.unitPrice * part.quantity, 0)
  const vat =
    weight > 0
      ? parts.reduce(
          (sum, part) =>
            sum + ((price * part.unitPrice * part.quantity) / weight) * ((part.taxRate ?? 0) / 100),
          0,
        )
      : 0
  return { vat: round3(vat), rate: null }
}

/** Parts of a saved bundle that are counted and hold nothing in the branch. */
export const partsRunOut = (parts: readonly BundlePartDto[]) =>
  parts.filter((part) => part.counted && (part.onHand ?? 0) < part.quantity).length
