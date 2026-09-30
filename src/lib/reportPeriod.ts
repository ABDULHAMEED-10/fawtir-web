/**
 * The calendar every Reports screen is drawn on (Figma 154:105574).
 *
 * The frames share one shape: four figures for the period the header pill names (Yearly,
 * Quarterly, Monthly) with a change against the period before, a trailing twelve-month chart
 * ending on the current month, and quarter or year views around it. The report endpoints answer
 * buckets over a window, so each page asks for enough history once and this module cuts it into
 * those shapes. Buckets are keyed by the month of their `periodStart`, never by the `period`
 * label, whose format differs per granularity.
 */

export type ReportPeriod = 'yearly' | 'quarterly' | 'monthly'

export const REPORT_PERIODS: ReportPeriod[] = ['yearly', 'quarterly', 'monthly']

/**
 * Months in each period: the pill's window and the one it is compared with. Quarterly is the
 * tax period instead (`periodWindows`); its 3 here is only the calendar-quarter stand-in.
 */
const SPAN: Record<ReportPeriod, number> = { yearly: 12, quarterly: 3, monthly: 1 }

/** i18n ids under `reports.months` / `reports.monthsLong`, January first. */
export const MONTH_IDS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const

const pad = (value: number) => String(value).padStart(2, '0')

/** A calendar date as the API takes it, in the reader's own day (not UTC). */
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `YYYY-MM` for a year and a month index that may run past either end of the year. */
function keyOf(year: number, monthIndex: number): string {
  const normalised = new Date(year, monthIndex, 1)
  return `${normalised.getFullYear()}-${pad(normalised.getMonth() + 1)}`
}

export function addMonths(key: string, count: number): string {
  const [year, month] = key.split('-').map(Number)
  return keyOf(year, month - 1 + count)
}

export function currentMonth(today: Date): string {
  return keyOf(today.getFullYear(), today.getMonth())
}

/** Zero-based month index of a `YYYY-MM` key. */
export function monthIndexOf(key: string): number {
  return Number(key.slice(5, 7)) - 1
}

export function monthStart(key: string): string {
  return `${key}-01`
}

export function monthEnd(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return `${key}-${pad(new Date(year, month, 0).getDate())}`
}

/** `count` months ending with the current one, oldest first. */
export function trailingMonths(today: Date, count = 12): string[] {
  const last = currentMonth(today)
  return Array.from({ length: count }, (_, index) => addMonths(last, index - count + 1))
}

export type ReportWindow = { from: string; to: string; months: string[] }

/**
 * A company's VAT tax period: the months one return covers, first month first.
 *
 * The OTA sets a company's tax periods when it registers, so they are the company's, not the
 * calendar's. TODO(backend): REPORTS.md row 1.24, the company tax period. Until the API states
 * it, calendar quarters (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec) stand in, which is the common case.
 */
export type TaxPeriod = { months: string[] }

/** The tax period that holds `today`, or the company's own when the API provides one. */
export function taxPeriodOf(today: Date, companyPeriod?: TaxPeriod | null): TaxPeriod {
  if (companyPeriod && companyPeriod.months.length > 0) return companyPeriod
  return { months: quarterOf(currentMonth(today)).months }
}

/**
 * The pill's window (ending today) and the window just before it, which is what every
 * "vs the year before" pill compares with.
 *
 * "Quarterly" is the company's current tax period to date against the whole tax period before
 * it, never the last three months: a VAT figure over a window no return covers matches nothing
 * the reader files. Yearly and Monthly stay the trailing twelve months and the current month.
 */
export function periodWindows(
  period: ReportPeriod,
  today: Date,
  companyPeriod?: TaxPeriod | null,
): { current: ReportWindow; previous: ReportWindow } {
  if (period === 'quarterly') {
    const tax = taxPeriodOf(today, companyPeriod)
    const now = currentMonth(today)
    const months = tax.months.filter((key) => key <= now)
    const length = tax.months.length
    const before = tax.months.map((key) => addMonths(key, -length))
    return {
      current: { from: monthStart(tax.months[0]), to: isoDate(today), months },
      previous: {
        from: monthStart(before[0]),
        to: monthEnd(before[before.length - 1]),
        months: before,
      },
    }
  }
  const span = SPAN[period]
  const months = trailingMonths(today, span)
  const before = months.map((key) => addMonths(key, -span))
  return {
    current: { from: monthStart(months[0]), to: isoDate(today), months },
    previous: {
      from: monthStart(before[0]),
      to: monthEnd(before[before.length - 1]),
      months: before,
    },
  }
}

/**
 * The history each report page asks for once: from 1 January two years back to today. It covers
 * the annual line (three years), last year's quarters and the twelve months before the trailing
 * twelve, so no chart needs a call of its own.
 */
export function historyWindow(today: Date): { from: string; to: string } {
  return { from: `${today.getFullYear() - 2}-01-01`, to: isoDate(today) }
}

/** The month a bucket belongs to. */
export function rowMonth(row: { periodStart: string }): string {
  return row.periodStart.slice(0, 7)
}

export function sumByMonth<T extends { periodStart: string }>(
  rows: T[],
  pick: (row: T) => number,
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const row of rows) totals.set(rowMonth(row), (totals.get(rowMonth(row)) ?? 0) + pick(row))
  return totals
}

export function seriesOver(totals: Map<string, number>, months: string[]): number[] {
  return months.map((key) => totals.get(key) ?? 0)
}

export function sumOver(totals: Map<string, number>, months: string[]): number {
  return seriesOver(totals, months).reduce((sum, value) => sum + value, 0)
}

/** Percentage change, or null when there is nothing to compare with. */
export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

export function indexOfMax(values: number[]): number {
  return values.reduce((best, value, index) => (value > values[best] ? index : best), 0)
}

/* ------------------------------------------------------------------ quarters */

export type Quarter = { year: number; quarter: number; months: string[] }

export function quarterOf(key: string): Quarter {
  const year = Number(key.slice(0, 4))
  const quarter = Math.floor(monthIndexOf(key) / 3) + 1
  const first = keyOf(year, (quarter - 1) * 3)
  return { year, quarter, months: [first, addMonths(first, 1), addMonths(first, 2)] }
}

/** `count` calendar quarters ending with the current one, oldest first. */
export function lastQuarters(today: Date, count: number): Quarter[] {
  const first = quarterOf(currentMonth(today)).months[0]
  return Array.from({ length: count }, (_, index) =>
    quarterOf(addMonths(first, (index - count + 1) * 3)),
  )
}

/** The four quarters of one calendar year. */
export function quartersOfYear(year: number): Quarter[] {
  return [0, 1, 2, 3].map((index) => quarterOf(keyOf(year, index * 3)))
}

/** How far through the calendar year today is, 0 to 1. */
export function yearProgress(today: Date): number {
  const start = new Date(today.getFullYear(), 0, 1).getTime()
  const end = new Date(today.getFullYear() + 1, 0, 1).getTime()
  return (today.getTime() - start) / (end - start)
}

/**
 * The next VAT return and where the reader stands in its quarter.
 *
 * Oman's returns are quarterly and due within 30 days of the quarter's end. Until that date has
 * passed the closed quarter's return is the next one due; after it, the current quarter's.
 * TODO(backend): REPORTS.md rows 1.13 and 1.24. A company's own tax periods are set by the OTA
 * from its registration and may not be calendar quarters; the platform holds no filing
 * calendar, so this assumes the common case, as `taxPeriodOf` does.
 */
export function nextVatReturn(today: Date): {
  due: Date
  quarter: number
  monthsIn: number
  closed: boolean
} {
  const current = quarterOf(currentMonth(today))
  const previous = quarterOf(addMonths(current.months[0], -1))
  const dueAfter = (quarter: Quarter) => {
    const [year, month] = quarter.months[2].split('-').map(Number)
    return new Date(year, month, 30)
  }
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const previousDue = dueAfter(previous)
  if (day <= previousDue) {
    return { due: previousDue, quarter: previous.quarter, monthsIn: 3, closed: true }
  }
  return {
    due: dueAfter(current),
    quarter: current.quarter,
    monthsIn: current.months.indexOf(currentMonth(today)) + 1,
    closed: false,
  }
}

/* -------------------------------------------------------------------- shares */

/**
 * Whole percentages that add up to exactly 100 (largest remainder), for the stacked rows. All
 * zeros stay zeros, and a negative part counts as nothing.
 */
export function roundShares(values: number[]): number[] {
  const clean = values.map((value) => Math.max(0, value))
  const total = clean.reduce((sum, value) => sum + value, 0)
  if (total === 0) return clean.map(() => 0)
  const exact = clean.map((value) => (value / total) * 100)
  const floors = exact.map(Math.floor)
  let left = 100 - floors.reduce((sum, value) => sum + value, 0)
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder)
  for (const { index } of order) {
    if (left <= 0) break
    floors[index] += 1
    left -= 1
  }
  return floors
}

/** The share of a part in a whole, as a whole percentage; 0 when the whole is nothing. */
export function shareOfTotal(part: number, total: number): number {
  if (total <= 0) return 0
  const share = Math.round((part / total) * 100)
  // 100 is kept for actually being the whole.
  return share === 100 && part < total ? 99 : share
}

export type RankedRow = { key: string | null; label: string; value: number }

/**
 * The largest `keep` rows, with everything after them folded into one closing row, which is how
 * the frames' ranked cards end ("Others", "Everything else").
 */
export function topWithRest(rows: RankedRow[], keep: number, restLabel: string): RankedRow[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value)
  if (sorted.length <= keep + 1) return sorted
  const rest = sorted.slice(keep).reduce((sum, row) => sum + row.value, 0)
  return [...sorted.slice(0, keep), { key: null, label: restLabel, value: rest }]
}
