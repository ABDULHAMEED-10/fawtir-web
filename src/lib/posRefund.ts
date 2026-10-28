import type {
  PosRefundLookupDto,
  PosRefundLookupLine,
  PosRefundReason,
  PosRefundRequest,
} from '../api/pos/pos'
import { BAISA, toBaisa, toRials } from './pos'

/**
 * Putting something right (Figma 143:20983), on the sale the refund lookup found
 * (`GET /v1/pos/refund-lookup?invoiceNumber=`, company-wide: a refund may be made at another
 * branch's till, Abdul 13).
 *
 * A filed invoice cannot be edited, so anything given back is a credit note against it, filed
 * the same way (`POST /v1/pos/sales/{id}/refunds`). The customer takes back what they actually
 * paid for the returned lines: their discounts come off again and VAT is worked out on what is
 * left. A line's priced add-ons come back with it, in the same proportion; a tip never does.
 * The figures here are the screen's estimate; the server works the credit note out and refuses
 * money back that does not match it (`POS_REFUND_MONEY_DOES_NOT_MATCH`, with `expected`).
 */

/** How many of each refundable line are going back. */
export type ReturnLine = { lineNumber: number; qty: number }

/** Whether returned stock goes back on the shelf. */
export type StockChoice = 'backInStock' | 'thrownAway'

/** Money back now, or the same thing again: a swap is a refund and then a new sale. */
export type PutRightChoice = 'moneyBack' | 'makeAnother'

export const WHY_OPTIONS = [
  'madeWrong',
  'rungUpWrong',
  'changedMind',
  'somethingOff',
  'waitedTooLong',
  'other',
] as const

export type WhyId = (typeof WHY_OPTIONS)[number]

export const REASON_CODE: Record<WhyId, PosRefundReason> = {
  madeWrong: 'MADE_WRONG',
  rungUpWrong: 'RUNG_UP_WRONG',
  changedMind: 'CHANGED_MIND',
  somethingOff: 'SOMETHING_OFF',
  waitedTooLong: 'WAITED_TOO_LONG',
  other: 'OTHER',
}

export type CreditTotals = {
  /** The returned lines at their price. */
  items: number
  /** Their discounts, line and whole-sale, that come off with them. */
  discount: number
  beforeVat: number
  vat: number
  /** What the customer gets back. */
  back: number
}

/** What is left of a line to return. */
export function remaining(line: PosRefundLookupLine): number {
  return Math.max(0, line.quantitySold - line.quantityRefunded)
}

/** The add-on lines that belong to an item line: those after it, up to the next item. */
export function addOnsOf(lines: PosRefundLookupLine[], lineNumber: number): PosRefundLookupLine[] {
  const sorted = [...lines].sort((a, b) => a.lineNumber - b.lineNumber)
  const start = sorted.findIndex((line) => line.lineNumber === lineNumber)
  const found: PosRefundLookupLine[] = []
  for (let i = start + 1; i < sorted.length && sorted[i].role === 'ADD_ON'; i++)
    found.push(sorted[i])
  return found
}

function lineFigures(
  line: PosRefundLookupLine,
  qty: number,
  header: PosRefundLookupDto['headerDiscount'],
  saleNet: number,
) {
  const gross = toBaisa(line.unitPrice) * qty
  let off = 0
  if (line.discount && line.discount.value > 0) {
    off =
      line.discount.type === 'PERCENTAGE'
        ? Math.round((gross * line.discount.value) / 100)
        : Math.round((toBaisa(line.discount.value) * qty) / (line.quantitySold || 1))
  }
  const net = gross - off
  let headerOff = 0
  if (header && header.value > 0) {
    headerOff =
      header.type === 'PERCENTAGE'
        ? Math.round((net * header.value) / 100)
        : saleNet > 0
          ? Math.round((toBaisa(header.value) * net) / saleNet)
          : 0
  }
  const beforeVat = net - headerOff
  const vat = Math.round((beforeVat * (line.vatRate ?? 0)) / 100)
  return { gross, discount: off + headerOff, beforeVat, vat }
}

export function creditFor(sale: PosRefundLookupDto, returning: ReturnLine[]): CreditTotals {
  const saleNet = sale.lines.reduce((sum, line) => {
    const gross = toBaisa(line.unitPrice) * line.quantitySold
    const off =
      line.discount && line.discount.value > 0
        ? line.discount.type === 'PERCENTAGE'
          ? Math.round((gross * line.discount.value) / 100)
          : toBaisa(line.discount.value)
        : 0
    return sum + gross - off
  }, 0)
  const totals = { items: 0, discount: 0, beforeVat: 0, vat: 0 }
  const add = (line: PosRefundLookupLine, qty: number) => {
    const figures = lineFigures(line, qty, sale.headerDiscount, saleNet)
    totals.items += figures.gross
    totals.discount += figures.discount
    totals.beforeVat += figures.beforeVat
    totals.vat += figures.vat
  }
  for (const entry of returning) {
    if (entry.qty <= 0) continue
    const line = sale.lines.find((l) => l.lineNumber === entry.lineNumber)
    if (!line) continue
    add(line, entry.qty)
    const share = line.quantitySold ? entry.qty / line.quantitySold : 0
    for (const addOn of addOnsOf(sale.lines, line.lineNumber)) {
      add(addOn, Math.round(addOn.quantitySold * share * BAISA) / BAISA)
    }
  }
  return { ...totals, back: totals.beforeVat + totals.vat }
}

/** Back the way it was paid: on account lowers what the company owes, else cash, card, transfer. */
export function moneyBackMethod(
  sale: PosRefundLookupDto,
): 'CASH' | 'CARD' | 'TRANSFER' | 'REDUCE_BALANCE' {
  if (sale.owed > 0 && toBaisa(sale.paid.total) === 0) return 'REDUCE_BALANCE'
  const paid = sale.paid.byMethod.filter((entry) => entry.amount > 0).map((entry) => entry.method)
  if (paid.includes('CASH')) return 'CASH'
  if (paid.includes('CARD')) return 'CARD'
  if (paid.includes('TRANSFER')) return 'TRANSFER'
  return 'REDUCE_BALANCE'
}

export function refundRequest(input: {
  tillId: string
  why: WhyId
  note: string
  returning: ReturnLine[]
  backOnShelf: boolean
  method: 'CASH' | 'CARD' | 'TRANSFER' | 'REDUCE_BALANCE'
  amount: number
}): PosRefundRequest {
  return {
    tillId: input.tillId,
    reason: REASON_CODE[input.why],
    reasonNote: input.note.trim() || null,
    lines: input.returning
      .filter((entry) => entry.qty > 0)
      .map((entry) => ({
        lineNumber: entry.lineNumber,
        quantity: entry.qty,
        backOnShelf: input.backOnShelf,
      })),
    moneyBack: [{ method: input.method, amount: toRials(input.amount) }],
  }
}

/** What the original invoice is worth once the credit note is filed against it. */
export function standsAt(was: number, credited: number, back: number): number {
  return was - credited - back
}
