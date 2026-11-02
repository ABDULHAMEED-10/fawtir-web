import type { PosTodayDto, PosTodaySaleRow, PosTodayTab } from '../api/pos/pos'
import { omr, toBaisa } from './pos'

/**
 * The day so far (Figma 143:20498), from `GET /v1/pos/sales` and `GET /v1/pos/today`.
 *
 * Every sale of the day, newest first, grouped by whose shift it was. A row carries enough to
 * find a sale from a customer's receipt: the time, the invoice number, what was in it, how it was
 * paid (only what the cashier entered: "Card · approval 898498", never a card name the till
 * cannot know) and where it stands with the Tax Authority.
 */

/** The tabs over the day's sales, counted by the server (`tabs`). */
export const TODAY_TABS: {
  id: string
  labelKey: string
  api: PosTodayTab
  count: keyof PosTodayDto['tabs']
}[] = [
  { id: 'all', labelKey: 'pos.today.tab.everything', api: 'ALL', count: 'all' },
  { id: 'company', labelKey: 'pos.today.tab.onTheCompany', api: 'COMPANY', count: 'company' },
  { id: 'cash', labelKey: 'pos.today.tab.cash', api: 'CASH', count: 'cash' },
  { id: 'refunded', labelKey: 'pos.today.tab.refunded', api: 'REFUNDED', count: 'refunded' },
  { id: 'mine', labelKey: 'pos.today.tab.mineOnly', api: 'MINE', count: 'mine' },
]

export type TodayTabId = string

export type ShiftGroup = {
  shiftId: string
  cashier: string
  tillNumber: number
  sales: PosTodaySaleRow[]
  /** In baisa. */
  total: number
}

/** Consecutive sales of one shift, in the order the server sent them (newest first). */
export function groupByShift(rows: PosTodaySaleRow[]): ShiftGroup[] {
  const groups: ShiftGroup[] = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last && last.shiftId === row.shiftId) {
      last.sales.push(row)
      // An unattributed sale (V530) names nobody; the shift is still its cashier's.
      if (!last.cashier && row.cashier?.name) last.cashier = row.cashier.name
      last.total += toBaisa(row.total)
    } else {
      groups.push({
        shiftId: row.shiftId,
        cashier: row.cashier?.name ?? '',
        tillNumber: row.tillNumber,
        sales: [row],
        total: toBaisa(row.total),
      })
    }
  }
  return groups
}

export function groupTotal(sales: PosTodaySaleRow[]): number {
  return sales.reduce((sum, sale) => sum + toBaisa(sale.total), 0)
}

const METHOD_KEY = {
  CASH: 'pos.pay.cash',
  CARD: 'pos.pay.card',
  TRANSFER: 'pos.pay.transfer',
  ON_ACCOUNT: 'pos.today.onAccount',
  MIXED: 'pos.today.mixed',
} as const

export function payMethodKey(sale: PosTodaySaleRow): string {
  const methods = new Set(sale.payments.map((payment) => payment.method))
  if (
    sale.payMethod === 'MIXED' &&
    methods.size === 2 &&
    methods.has('CARD') &&
    methods.has('CASH')
  ) {
    return 'pos.today.cardAndCash'
  }
  return METHOD_KEY[sale.payMethod]
}

/** The line under the method: what was entered, nothing more. */
export function payDetail(
  sale: PosTodaySaleRow,
): { key?: string; values?: Record<string, string>; text?: string } | null {
  if (sale.payMethod === 'MIXED') {
    return { text: sale.payments.map((payment) => omr(toBaisa(payment.amount))).join(' / ') }
  }
  const payment = sale.payments[0]
  if (!payment) return null
  if (payment.method === 'CARD') {
    return payment.cardApprovalCode
      ? { key: 'pos.today.approval', values: { code: payment.cardApprovalCode } }
      : null
  }
  if (payment.method === 'CASH') {
    return payment.tendered != null && toBaisa(payment.tendered) !== toBaisa(payment.amount)
      ? { key: 'pos.today.given', values: { amount: omr(toBaisa(payment.tendered)) } }
      : { key: 'pos.today.exact' }
  }
  if (payment.method === 'TRANSFER') return payment.reference ? { text: payment.reference } : null
  return sale.customer.name ? { text: sale.customer.name } : null
}

export type TodaySaleState = PosTodaySaleRow['displayState']

/**
 * The badge on a sale. Backend #810 answers `waiting` and `failed` itself; an older server reads
 * "filed" for every walk-in sale and "peppol" for every company sale, also while the filing still
 * waits in the queue (`filing.dispatchState: QUEUED`), so for either the till says "Waiting" until
 * it has gone (E2E 29 Oct 2026, F-7; retest N-9).
 */
export function saleState(sale: PosTodaySaleRow): TodaySaleState {
  if (
    (sale.displayState === 'filed' || sale.displayState === 'peppol') &&
    sale.filing &&
    !sale.filing.acceptedAt &&
    sale.filing.dispatchState === 'QUEUED'
  ) {
    return 'waiting'
  }
  return sale.displayState
}

/** A second line under the amount: credited, a tip, change given, or who it was billed to. */
export function amountNote(
  sale: PosTodaySaleRow,
): { key: string; values?: Record<string, string> } | null {
  if (sale.credit.state === 'FULLY') return { key: 'pos.today.fullyCredited' }
  if (sale.credit.state === 'PARTLY') {
    return {
      key: 'pos.today.partlyCredited',
      values: { amount: omr(toBaisa(sale.credit.credited)) },
    }
  }
  // The total is the invoice's; the tip was paid on top of it, outside the invoice (F-7).
  if (sale.tip > 0) return { key: 'pos.today.plusTip', values: { amount: omr(toBaisa(sale.tip)) } }
  if (sale.changeGiven > 0) {
    return { key: 'pos.today.change', values: { amount: omr(toBaisa(sale.changeGiven)) } }
  }
  if (sale.customer.kind === 'BUSINESS' || sale.customer.kind === 'GOVERNMENT') {
    return sale.customer.name
      ? { key: 'pos.today.billedTo', values: { name: sale.customer.name } }
      : null
  }
  return null
}

/** The calendar day before a `YYYY-MM-DD`. */
export function dayBefore(date: string): string {
  const day = new Date(`${date}T12:00:00Z`)
  day.setUTCDate(day.getUTCDate() - 1)
  return day.toISOString().slice(0, 10)
}
