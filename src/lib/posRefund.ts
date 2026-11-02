import type {
  PosRefundDto,
  PosRefundLookupDto,
  PosRefundLookupLine,
  PosRefundMoneyMethod,
  PosRefundQuoteDto,
  PosRefundReason,
  PosRefundRequest,
  PosWarning,
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

/** Every way the sale was paid, in the server's order; a sale paid one way reads as `moneyBackMethod`. */
export function waysPaid(sale: PosRefundLookupDto): string[] {
  const paid = sale.paid.byMethod.filter((entry) => entry.amount > 0).map((entry) => entry.method)
  return paid.length > 1 ? paid : [moneyBackMethod(sale)]
}

/**
 * The money back of a refund, in baisa (Abdul, 1 Nov 2026): filled from the server's quote, for the
 * cashier to change. What a company owes is not theirs to change: it goes back to the account.
 */
export type MoneySplit = { card: number; cash: number; transfer: number; reduce: number }

export function splitFromQuote(quote: PosRefundQuoteDto): MoneySplit {
  const of = (method: PosRefundMoneyMethod) =>
    quote.suggested
      .filter((entry) => entry.method === method)
      .reduce((sum, entry) => sum + toBaisa(entry.amount), 0)
  return {
    card: of('CARD'),
    cash: of('CASH'),
    transfer: of('TRANSFER'),
    reduce: of('REDUCE_BALANCE'),
  }
}

/**
 * The cashier typed one figure; the others make up the rest. Card or transfer changed: cash takes
 * the difference. Cash changed: the card takes the rest up to its limit, then transfer. A figure
 * that cannot be made up is left for `splitProblem` to say so.
 */
export function changeSplit(
  split: MoneySplit,
  total: number,
  cardLimit: number,
  edited: 'card' | 'cash' | 'transfer',
  value: number,
): MoneySplit {
  const payOut = total - split.reduce
  const next = { ...split, [edited]: value }
  if (edited === 'cash') {
    const rest = Math.max(0, payOut - value)
    next.card = Math.min(rest, cardLimit)
    next.transfer = rest - next.card
  } else {
    next.cash = Math.max(0, payOut - next.card - next.transfer)
  }
  return next
}

/** Why this money back cannot go: over what the card can take, or not adding up to the note. */
export function splitProblem(
  split: MoneySplit,
  total: number,
  cardLimit: number,
): 'overCard' | 'doesNotAdd' | null {
  if (split.card > cardLimit) return 'overCard'
  if (split.card + split.cash + split.transfer + split.reduce !== total) return 'doesNotAdd'
  return null
}

/** The refund's money back lines; a method given nothing is left out. */
export function moneyBackLines(
  split: MoneySplit,
  references: { approval: string; transfer: string },
): PosRefundRequest['moneyBack'] {
  const lines: PosRefundRequest['moneyBack'] = []
  if (split.reduce > 0) lines.push({ method: 'REDUCE_BALANCE', amount: toRials(split.reduce) })
  if (split.card > 0) {
    lines.push({
      method: 'CARD',
      amount: toRials(split.card),
      reference: references.approval.trim() || null,
    })
  }
  if (split.transfer > 0) {
    lines.push({
      method: 'TRANSFER',
      amount: toRials(split.transfer),
      reference: references.transfer.trim() || null,
    })
  }
  if (split.cash > 0) lines.push({ method: 'CASH', amount: toRials(split.cash) })
  return lines
}

/**
 * Only given-away lines are going back (Abdul, 31 Oct 2026): no credit note and no money. False on
 * a server that does not mark such lines, where the refund goes as before.
 */
export function onlyGivenAway(sale: PosRefundLookupDto, returning: ReturnLine[]): boolean {
  const chosen = returning
    .filter((entry) => entry.qty > 0)
    .map((entry) => sale.lines.find((line) => line.lineNumber === entry.lineNumber))
  return chosen.length > 0 && chosen.every((line) => line?.givenFree === true)
}

/**
 * The lines of a quote or a refund, numbered by the sale line. A code is stated only for a line the
 * server asked about (`HS_CODE_REQUIRED` names the sale line); RC2 takes it for that line alone.
 */
export function refundLines(
  returning: ReturnLine[],
  backOnShelf: boolean,
  hsCodes: Record<number, string> = {},
): PosRefundRequest['lines'] {
  return returning
    .filter((entry) => entry.qty > 0)
    .map((entry) => {
      const hsCode = hsCodes[entry.lineNumber]?.trim()
      const line = { lineNumber: entry.lineNumber, quantity: entry.qty, backOnShelf }
      return hsCode ? { ...line, hsCode } : line
    })
}

/**
 * Money back only as the quote and the cashier settled it. There is deliberately no single-method
 * fallback: without a quote it paid a card or split sale back all in cash (A-03), so the screen sends
 * nothing then.
 */
export function refundRequest(input: {
  tillId: string
  why: WhyId
  note: string
  returning: ReturnLine[]
  backOnShelf: boolean
  hsCodes?: Record<number, string>
  /** Only given-away lines: there is no money to say anything about. */
  noMoney?: boolean
  moneyBack: PosRefundRequest['moneyBack']
}): PosRefundRequest {
  return {
    tillId: input.tillId,
    reason: REASON_CODE[input.why],
    reasonNote: input.note.trim() || null,
    lines: refundLines(input.returning, input.backOnShelf, input.hsCodes),
    moneyBack: input.noMoney ? [] : input.moneyBack,
  }
}

/**
 * The sale line a refund warning is about, as the page lists the sale's lines. The server's STOCK_*
 * warnings name the credit note's line (1..n in sale-line order), so refunding sale lines 3 and 5
 * read "Line 2" for line 5 (contract matrix §3, "Line numbering"); POS_GOODS_FLAG_CLEARED and
 * POS_REFUND_PIECE_CARRIED already name the sale line. Without the response's `lines` the server's
 * number is kept, as before.
 */
export function saleLineOfRefundWarning(
  warning: Pick<PosWarning, 'code' | 'line'>,
  refund: Pick<PosRefundDto, 'lines'>,
): number | null {
  if (warning.line == null || !warning.code.startsWith('STOCK_')) return warning.line
  const line = refund.lines?.find((entry) => entry.lineNumber === warning.line)
  return line ? line.originalLineNumber : warning.line
}

/** What the original invoice is worth once the credit note is filed against it. */
export function standsAt(was: number, credited: number, back: number): number {
  return was - credited - back
}
