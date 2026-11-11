import type {
  OverShortReason,
  PosClosePreviewDto,
  PosMethod,
  PosShiftCloseRequest,
} from '../api/pos/pos'
import { toBaisa, toRials } from './pos'
import { parseBaisa } from './posPayment'

/**
 * Cashing up (Figma 143:20055): one close per cashier shift (Abdul 17), from the shift's close
 * preview (`GET /v1/pos/shifts/{id}/close-preview`). The drawer is counted, by denomination or as
 * a total, against what it should hold; the card total Fawtir took is checked against the bank
 * machine's end-of-day report, typed by the cashier (owner, 27 Oct 2026: no link to the machine),
 * with a note when they differ.
 */

/** Oman's notes and coins, in baisa, as the close takes them (`POS_DENOMINATION_UNKNOWN`). */
export const DENOMINATIONS = [50000, 20000, 10000, 5000, 1000, 500, 200, 100, 50, 25, 10, 5]

export type Counted = Record<number, number>

export function countedTotal(counted: Counted): number {
  return DENOMINATIONS.reduce((sum, value) => sum + value * (counted[value] ?? 0), 0)
}

/** A note's face as the drawer reads it: 20, 0.500, 0.005. */
export function denominationLabel(baisa: number): string {
  return baisa >= 1000 ? String(baisa / 1000) : (baisa / 1000).toFixed(3)
}

export type Figures = {
  float: number
  cashTaken: number
  cashSales: number
  cashTips: number
  cashRefunded: number
  paidOut: number
  paidIn: number
  expected: number
  card: number
  cardSales: number
  onAccount: number
  companyInvoices: number
  taken: number
  sales: number
  /** Given back to cards this shift: it comes off the machine's batch, not the drawer. */
  cardRefunded: number
  /** Given back by bank transfer this shift: neither the drawer nor the machine, so only the summary names it. */
  transferRefunded: number
  /** Whether the server's terminal figure below already takes card refunds off. */
  terminalNet: boolean
  /** What the bank machine's batch should show: card takings plus card tips, less card refunds. */
  terminal: number
}

/**
 * The drawer figures the server withheld because the shift's records span currencies (backend
 * a2c9fcf0c, FIN-M3-CURRENCY-MIX). Any one of them leaves no total to count against, so the close
 * form is not drawn; nothing is worked out here in their place.
 */
export function withheldFigures(preview: PosClosePreviewDto): ('expectedCash' | 'paidOut' | 'paidIn')[] {
  return (['expectedCash', 'paidOut', 'paidIn'] as const).filter((name) => preview[name] == null)
}

export function figuresOf(preview: PosClosePreviewDto): Figures {
  const by = (method: PosMethod) => preview.byMethod.find((entry) => entry.method === method)
  const cash = by('CASH')
  const card = by('CARD')
  const account = by('ON_ACCOUNT')
  return {
    float: toBaisa(preview.openingFloat),
    cashTaken: toBaisa(cash?.taken),
    cashSales: cash?.sales ?? 0,
    cashTips: toBaisa(cash?.tips),
    cashRefunded: toBaisa(preview.cashRefunded),
    paidOut: toBaisa(preview.paidOut),
    paidIn: toBaisa(preview.paidIn),
    expected: toBaisa(preview.expectedCash),
    card: toBaisa(card?.taken),
    cardSales: card?.sales ?? 0,
    onAccount: toBaisa(account?.taken),
    companyInvoices: preview.companyInvoices,
    taken: toBaisa(preview.salesAmount),
    sales: preview.salesCount,
    cardRefunded: toBaisa(card?.refunded),
    transferRefunded: toBaisa(by('TRANSFER')?.refunded),
    terminalNet:
      toBaisa(preview.looseEnds.cardSalesForTerminalCheck.amount) !==
      toBaisa(card?.taken) + toBaisa(card?.tips),
    terminal: toBaisa(preview.looseEnds.cardSalesForTerminalCheck.amount),
  }
}

/**
 * Where the count starts: what the drawer should hold, or 0 when refunds took that below zero
 * (Abdul, 1 Nov 2026). A drawer cannot hold less than nothing, and the server refuses a negative
 * count (`POS_COUNT_INVALID`).
 */
export function startingCount(expected: number): number {
  return Math.max(0, expected)
}

/**
 * A typed bank-machine total with its sign kept. `parseBaisa` drops a minus, which read a net card
 * figure below zero (refunds over takings) as a positive one and sent that (A-05). RC2 refuses a
 * negative total (`PosMoney.cash`, POS_CARD_TERMINAL_TOTAL_INVALID), so the screen must see it.
 */
export function parseSignedBaisa(text: string): number {
  const trimmed = text.trim()
  const negative = trimmed.startsWith('-') || trimmed.startsWith('−')
  const baisa = parseBaisa(trimmed)
  return negative ? -baisa : baisa
}

/** Why the count came up short or over: a guess is fine, the point is that somebody looked. */
export const SHORT_REASONS: { id: OverShortReason; labelKey: string; noteKey: string }[] = [
  { id: 'CHANGE_WRONG', labelKey: 'pos.close.changeWrong', noteKey: 'pos.close.changeWrongNote' },
  {
    id: 'PAYOUT_MISSED',
    labelKey: 'pos.close.payoutMissed',
    noteKey: 'pos.close.payoutMissedNote',
  },
  { id: 'MISCOUNTED', labelKey: 'pos.close.miscounted', noteKey: 'pos.close.miscountedNote' },
  { id: 'DONT_KNOW', labelKey: 'pos.close.dontKnow', noteKey: 'pos.close.dontKnowNote' },
]

/** `POST /v1/pos/shifts/{id}/close`; the server works every figure out again. */
export function closeRequest(input: {
  byNote: boolean
  counted: Counted
  total: number
  floatLeft: number
  terminal: number | null
  terminalExpected: number
  cardNote: string
  reason: OverShortReason | null
  overShort: number
  note: string
}): PosShiftCloseRequest {
  const differs = input.terminal != null && input.terminal !== input.terminalExpected
  return {
    counting: input.byNote
      ? {
          mode: 'DENOMINATIONS',
          denominations: DENOMINATIONS.filter((value) => (input.counted[value] ?? 0) > 0).map(
            (value) => ({ value: toRials(value), count: input.counted[value] }),
          ),
        }
      : { mode: 'TOTAL', total: toRials(input.total) },
    floatLeft: toRials(input.floatLeft),
    cardTerminalTotal: input.terminal == null ? null : toRials(input.terminal),
    cardDifferenceNote: differs && input.cardNote.trim() ? input.cardNote.trim() : null,
    overShortReason: input.overShort !== 0 ? input.reason : null,
    note: input.note.trim() || null,
  }
}
