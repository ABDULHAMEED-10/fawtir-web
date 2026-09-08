import { LULL, OPEN_SALE, VAT_RATE, itemById, lullApplies, unitPrice, type SaleLine } from './pos'

/**
 * Putting something right (Figma 143:20983).
 *
 * A filed invoice cannot be edited — the Tax Authority has already accepted it — so anything
 * given back is a credit note against it, filed the same way. The customer takes back what they
 * actually paid for the returned lines, which means the discount that was applied comes off
 * again and VAT is worked out on what is left.
 */

export const CREDITED_INVOICE = {
  id: 'INV-2048',
  number: 'CN-0184',
  whoKey: 'pos.refund.walkIn',
  when: '4 September 14:32',
  paidKey: 'pos.refund.cardAndCash',
  paidValues: { card: '3.000', cash: '3.000', total: '6.000' },
  /** In baisa — what the sale was worth before any of it came back. */
  was: 6000,
  soldMinutesAgo: 6,
  soldBy: 'Maryam',
}

/** How many of each line are going back. The design has one of the two flat whites returned. */
export type ReturnLine = { lineId: string; qty: number }

export const RETURNING: ReturnLine[] = [
  { lineId: 'l1', qty: 1 },
  { lineId: 'l2', qty: 0 },
  { lineId: 'l3', qty: 0 },
]

/** Whether returned stock goes back on the shelf. A made drink usually does not. */
export type StockChoice = 'backInStock' | 'thrownAway'

/** Money back now, or the same thing made again with nothing changing hands. */
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

export type CreditTotals = {
  /** The returned lines at shelf price. */
  items: number
  /** The share of the original discount that comes off with them. */
  discount: number
  beforeVat: number
  vat: number
  /** What the customer gets back. */
  back: number
}

/**
 * What a credit note comes to.
 *
 * Worked out exactly as the sale was: shelf price, less the rule that applied to those lines,
 * then VAT on the remainder. A tip is never refunded — it was never part of the sale.
 */
export function creditFor(returning: ReturnLine[], lines: SaleLine[] = OPEN_SALE): CreditTotals {
  let items = 0
  let discountable = 0

  for (const entry of returning) {
    if (entry.qty <= 0) continue
    const line = lines.find((l) => l.id === entry.lineId)
    if (!line) continue
    const value = unitPrice(line) * entry.qty
    items += value
    if (lullApplies(line)) discountable += value
  }

  const discount = Math.round((discountable * LULL.percent) / 100)
  const beforeVat = items - discount
  const vat = Math.round(beforeVat * VAT_RATE)
  return { items, discount, beforeVat, vat, back: beforeVat + vat }
}

/** What the original invoice is worth once the credit note is filed against it. */
export function standsAt(was: number, back: number): number {
  return was - back
}

/** How a returnable line is described under its name. */
export function lineNote(lineId: string): {
  key: string
  values: Record<string, string | number>
} {
  const line = OPEN_SALE.find((l) => l.id === lineId)
  if (!line) throw new Error(`No line ${lineId}`)
  const item = itemById(line.itemId)
  const each = unitPrice(line)
  if (lullApplies(line)) {
    return {
      key: 'pos.refund.eachLessLull',
      values: { each: (each / 1000).toFixed(3), percent: LULL.percent },
    }
  }
  return {
    key: 'pos.refund.eachNoDiscount',
    values: { each: (each / 1000).toFixed(3), group: item.group },
  }
}

/** How many of a line were sold, so the stepper knows its ceiling. */
export function soldQty(lineId: string): number {
  return OPEN_SALE.find((l) => l.id === lineId)?.qty ?? 0
}
