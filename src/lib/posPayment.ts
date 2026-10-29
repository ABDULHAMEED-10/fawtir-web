import type { PosMethod, PosPaymentRequest, PosSlipFields } from '../api/pos/pos'
import { BAISA, toRials } from './pos'

/**
 * Taking the money (Figma 143:18592) and what happens after (143:18997).
 *
 * A sale can be settled several ways at once, so payment is a list rather than a choice, and
 * "still to collect" is the sale (plus the tip) less what has been taken. The card is paid on the
 * shop's own bank machine; Fawtir has no link to it (owner, 27 Oct 2026), so a card payment
 * records only what the cashier enters: the amount, an optional approval code, and optionally the
 * slip they scanned.
 */

export type MethodId = 'cash' | 'card' | 'transfer' | 'account'

export const METHODS: { id: MethodId; labelKey: string; hotkey: string }[] = [
  { id: 'cash', labelKey: 'pos.pay.cash', hotkey: 'F1' },
  { id: 'card', labelKey: 'pos.pay.card', hotkey: 'F2' },
  { id: 'transfer', labelKey: 'pos.pay.transfer', hotkey: 'F3' },
  { id: 'account', labelKey: 'pos.pay.account', hotkey: 'F4' },
]

export const METHOD_CODE: Record<MethodId, PosMethod> = {
  cash: 'CASH',
  card: 'CARD',
  transfer: 'TRANSFER',
  account: 'ON_ACCOUNT',
}

export const METHOD_ID: Record<PosMethod, MethodId> = {
  CASH: 'cash',
  CARD: 'card',
  TRANSFER: 'transfer',
  ON_ACCOUNT: 'account',
}

export type Taken = {
  id: string
  method: MethodId
  /** What this payment settles (tip included, as the screen counts it), in baisa. */
  amount: number
  /** Cash only: what was put on the counter. */
  handedOver?: number
  /** Card only, optional: the approval code from the bank slip, kept as typed. */
  approvalCode?: string
  /** Transfer only, optional. */
  reference?: string
  /** Card only, optional: the scanned bank slip and what was read from it or typed. */
  slipFileId?: string
  slipFields?: PosSlipFields
  /** Card only: a slip photographed while the till was offline, sent once the sale is filed. */
  slipPhoto?: { blob: Blob; name: string }
}

/** The tip sits on top of the sale and carries no VAT, which the design says twice. */
export type TipChoice = 'none' | 'p5' | 'p10' | 'p15' | 'roundUp'

/** Rounding the total up to the next whole rial. */
export function roundUpTip(sale: number): number {
  return (BAISA - (sale % BAISA)) % BAISA
}

export function tipFor(choice: TipChoice, sale: number): number {
  if (choice === 'none') return 0
  if (choice === 'roundUp') return roundUpTip(sale)
  const percent = choice === 'p5' ? 5 : choice === 'p10' ? 10 : 15
  return Math.round((sale * percent) / 100)
}

export const TIP_CHOICES: TipChoice[] = ['none', 'p5', 'p10', 'p15', 'roundUp']

/** What the customer owes: the sale, plus whatever tip they chose. */
export function toPay(sale: number, tip: number): number {
  return sale + tip
}

export function collected(taken: Taken[]): number {
  return taken.reduce((sum, entry) => sum + entry.amount, 0)
}

/** Nothing left to collect once the payments cover what is owed. */
export function stillToCollect(owed: number, taken: Taken[]): number {
  return Math.max(0, owed - collected(taken))
}

/** Cash back out of the drawer: only ever from the cash payments. */
export function changeDue(taken: Taken[]): number {
  return taken.reduce((sum, entry) => sum + Math.max(0, (entry.handedOver ?? 0) - entry.amount), 0)
}

/** The buttons beside the cash field: the exact amount, then the notes above it. */
export function quickCash(owed: number): number[] {
  const notes = [5000, 10000, 20000, 50000]
  return [owed, ...notes.filter((note) => note > owed)].slice(0, 4)
}

/** A typed figure ("12.5", "12.500") in baisa; anything else is 0. */
export function parseBaisa(text: string): number {
  const value = Number(text.replace(/[^0-9.]/g, ''))
  return Number.isFinite(value) ? Math.round(value * BAISA) : 0
}

/** The tip is paid in cash when cash was taken, else on the card; never by transfer or account. */
export function tipMethodOf(taken: Taken[]): 'CASH' | 'CARD' | null {
  if (taken.some((entry) => entry.method === 'cash')) return 'CASH'
  if (taken.some((entry) => entry.method === 'card')) return 'CARD'
  return null
}

/**
 * The payments as `POST /v1/pos/sales` takes them: they add up to the invoice total, with the tip
 * outside it (`tip`, Abdul 14). The screen counts the tip in what it collects, so it comes off
 * the payment it was paid with: the cash (whose `tendered` still covers it) or the card.
 */
export function paymentsRequest(
  taken: Taken[],
  tip: number,
): {
  payments: PosPaymentRequest[]
  tip: { amount: number; method: 'CASH' | 'CARD' } | null
  /** The offline slip photos, each with the position of the payment it proves (1, 2 ...). */
  slipPhotos: { position: number; blob: Blob; name: string }[]
} {
  const tipMethod = tip > 0 ? tipMethodOf(taken) : null
  let tipLeft = tipMethod ? tip : 0
  const payments: PosPaymentRequest[] = []
  const slipPhotos: { position: number; blob: Blob; name: string }[] = []
  for (const entry of taken) {
    let amount = entry.amount
    if (tipLeft > 0 && METHOD_CODE[entry.method] === tipMethod) {
      const off = Math.min(tipLeft, amount)
      amount -= off
      tipLeft -= off
    }
    if (amount <= 0) continue
    const payment: PosPaymentRequest = {
      method: METHOD_CODE[entry.method],
      amount: toRials(amount),
    }
    if (entry.method === 'cash' && entry.handedOver != null) {
      payment.tendered = toRials(entry.handedOver)
    }
    if (entry.method === 'card') {
      const code = entry.approvalCode?.trim()
      if (code) payment.cardApprovalCode = code
      if (entry.slipFileId) payment.slipFileId = entry.slipFileId
      if (entry.slipFields) payment.slipFields = entry.slipFields
    }
    if (entry.method === 'transfer' && entry.reference?.trim()) {
      payment.reference = entry.reference.trim()
    }
    payments.push(payment)
    if (entry.method === 'card' && entry.slipPhoto) {
      slipPhotos.push({ position: payments.length, ...entry.slipPhoto })
    }
  }
  return {
    payments,
    slipPhotos,
    tip: tipMethod ? { amount: toRials(tip - tipLeft), method: tipMethod } : null,
  }
}

/* -------------------------------------------------------- what happens next */

/** The four steps the finish runs through (Figma 143:18997). */
export const FILING_STEPS = [
  { id: 'raised', labelKey: 'pos.done.raised', noteKey: 'pos.done.raisedNote' },
  { id: 'signed', labelKey: 'pos.done.signed', noteKey: 'pos.done.signedNote' },
  { id: 'filed', labelKey: 'pos.done.filed', noteKey: 'pos.done.filedNote' },
  { id: 'accepted', labelKey: 'pos.done.accepted', noteKey: 'pos.done.acceptedNote' },
]

/** How the receipt can be handed over. */
export const RECEIPT_WAYS = [
  { id: 'print', labelKey: 'pos.done.printed', noteKey: 'pos.done.printedNote', hotkey: 'P' },
  { id: 'email', labelKey: 'pos.done.email', noteKey: 'pos.done.emailNote', hotkey: 'E' },
  { id: 'text', labelKey: 'pos.done.text', noteKey: 'pos.done.textNote', hotkey: 'T' },
  { id: 'qr', labelKey: 'pos.done.qr', noteKey: 'pos.done.qrNote', hotkey: 'Q' },
]

/* ------------------------------------------------------- on the company */

/** What changes when a walk-in becomes a company sale. */
export const WALK_IN_IS = ['simplified', 'printed', 'filed', 'paidNow']
export const COMPANY_IS = ['addressed', 'sentToAccounts', 'filedB2B', 'claimVat']
