import { ApiError } from '../api'
import {
  PAID_OUT_RECEIPT_MAX_BYTES,
  PAID_OUT_RECEIPT_TYPES,
  newPosKey,
  type PosPaidOutCategory,
  type PosPaidOutClass,
  type PosPaidOutRequest,
} from '../api/pos/pos'
import { formatAmount } from './format'
import { posRefusalKey, refusalValues } from './posRefusals'

/**
 * The till's paid-out (backend cb9898ac3, FIN-M3, V536): what it was for, how it is classed, the
 * currency, and the receipt behind it. The rules mirror `PosPaidOut.fixedClass` and `admits`, so the
 * form never offers a class the server would refuse; the server still decides.
 */

export const PAID_OUT_CATEGORIES: readonly PosPaidOutCategory[] = [
  'PETTY_CASH_EXPENSE',
  'SUPPLIER_PAYMENT',
  'CASH_TRANSFER',
  'FLOAT_ADJUSTMENT',
  'OTHER',
]

/** The class a category fixes, or null where the cashier must choose one (no default, spec §4.1). */
export function fixedClass(category: PosPaidOutCategory, linked: boolean): PosPaidOutClass | null {
  switch (category) {
    case 'PETTY_CASH_EXPENSE':
      return 'EXPENSE'
    case 'CASH_TRANSFER':
    case 'FLOAT_ADJUSTMENT':
      return 'TRANSFER'
    case 'SUPPLIER_PAYMENT':
      return linked ? 'BILL_SETTLEMENT' : null
    case 'OTHER':
      return null
  }
}

/** What the cashier may choose where nothing is fixed. */
export function choosableClasses(category: PosPaidOutCategory, linked: boolean): PosPaidOutClass[] {
  if (fixedClass(category, linked) !== null) return []
  return category === 'OTHER' ? ['EXPENSE', 'ADVANCE', 'TRANSFER'] : ['EXPENSE', 'ADVANCE']
}

export type PaidOutForm = {
  amount: number
  note: string
  category: PosPaidOutCategory | null
  chosenClass: PosPaidOutClass | null
  currency: string
  billId: string | null
  receiptObjectId: string | null
  /** Null while a receipt is to be attached; the reason when there is none. */
  missingReceiptReason: string | null
}

/** Why the form cannot be sent yet, before anything is asked of the server. */
export type PaidOutGap = 'amount' | 'note' | 'category' | 'class' | 'currency' | 'receipt'

export function paidOutGap(
  form: Omit<PaidOutForm, 'receiptObjectId'> & { hasReceipt: boolean },
): PaidOutGap | null {
  if (!(form.amount > 0)) return 'amount'
  if (!form.note.trim()) return 'note'
  if (!form.category) return 'category'
  const linked = form.category === 'SUPPLIER_PAYMENT' && form.billId !== null
  if (fixedClass(form.category, linked) === null) {
    if (!form.chosenClass || !choosableClasses(form.category, linked).includes(form.chosenClass)) {
      return 'class'
    }
  }
  if (!/^[A-Z]{3}$/.test(form.currency)) return 'currency'
  const reason = form.missingReceiptReason?.trim() ?? ''
  if (form.hasReceipt === (reason.length > 0)) return 'receipt'
  return null
}

/**
 * The request as sent. A fixed class is sent as fixed rather than left out, so the body reads the
 * same whichever server default applies; a bill is named only on a supplier payment.
 */
export function paidOutRequest(form: PaidOutForm & { category: PosPaidOutCategory }): PosPaidOutRequest {
  const billId = form.category === 'SUPPLIER_PAYMENT' ? form.billId : null
  const reason = form.missingReceiptReason?.trim() || null
  return {
    type: 'PAID_OUT',
    amount: form.amount,
    note: form.note.trim(),
    category: form.category,
    accountingClass: fixedClass(form.category, billId !== null) ?? form.chosenClass,
    currency: form.currency,
    billId,
    receiptObjectId: reason ? null : form.receiptObjectId,
    missingReceiptReason: reason,
  }
}

/**
 * One key per paid-out attempt. The same body sent again (a retry after a timeout or a dropped
 * connection) keeps its key, so the server answers with the paid-out it already recorded instead
 * of paying the cash out twice; any change to the body is a new attempt and gets a new key, since
 * the server refuses a key reused for other figures (409 POS_PAID_OUT_IDEMPOTENCY_KEY_REUSED).
 */
export type PaidOutAttempt = { fingerprint: string; key: string } | null

export function keyForAttempt(
  attempt: PaidOutAttempt,
  body: PosPaidOutRequest,
): { attempt: NonNullable<PaidOutAttempt>; key: string } {
  const fingerprint = JSON.stringify(body)
  const next = attempt && attempt.fingerprint === fingerprint ? attempt : { fingerprint, key: newPosKey('paidout') }
  return { attempt: next, key: next.key }
}

/**
 * Refusals that make the held receipt id useless (backend 9ce2bdcf4): gone, uploaded at another
 * till, or already backing a paid-out. The id is dropped so the next press uploads a file again
 * (the form asks for the file afresh after ALREADY_USED); the new id changes the body, so it is a new
 * attempt with a new key, as any changed body is.
 */
const RECEIPT_REFUSALS = new Set([
  'POS_PAID_OUT_RECEIPT_NOT_FOUND',
  'POS_PAID_OUT_RECEIPT_OTHER_TILL',
  'POS_PAID_OUT_RECEIPT_ALREADY_USED',
])

export function dropsHeldReceipt(error: unknown): boolean {
  return error instanceof ApiError && error.code !== null && RECEIPT_REFUSALS.has(error.code)
}

/** What the server would refuse, said before the upload is spent. */
export function receiptProblem(file: { type: string; size: number }): 'type' | 'size' | null {
  if (!(PAID_OUT_RECEIPT_TYPES as readonly string[]).includes(file.type)) return 'type'
  if (file.size <= 0 || file.size > PAID_OUT_RECEIPT_MAX_BYTES) return 'size'
  return null
}

/**
 * A linked bill's refusals come back under the bill's own codes (PosSupplierBillPaymentAdapter), so
 * they take the bill screens' sentences rather than a second set.
 */
const BILL_REFUSALS: Record<string, string> = {
  BILL_NOT_FOUND: 'apiErrors.refused.billNotFound',
  BILL_NOT_READY_FOR_PAYMENT: 'billDetail.pay.notApproved',
  BILL_PAYMENT_ON_HOLD: 'billDetail.pay.onHold',
  BILL_PAYMENT_MISMATCHED: 'paymentRuns.refused.mismatched',
  BILL_PAYMENT_IN_PAYMENT_RUN: 'billDetail.pay.inRun',
  BILL_PAYMENT_DEBIT_NOTE_REFUSED: 'apiErrors.refused.billPaymentDebitNoteRefused',
  BILL_PAYMENT_DEBIT_NOTE_NOT_ACCEPTED: 'apiErrors.refused.debitNoteNotAccepted',
  BILL_PAYMENT_CURRENCY_MISMATCH: 'apiErrors.refused.paymentCurrencyMismatch',
  BILL_PAYMENT_EXCEEDS_OUTSTANDING: 'billDetail.pay.tooMuch',
  // Not the bill dialog's "3 decimals": a USD bill takes two, and the till always offers three.
  BILL_PAYMENT_AMOUNT_SCALE_INVALID: 'pos.close.paidOutForm.billAmountScale',
}

/** The edge refused the body for size before the server's coded answer (the gateway's limit). */
function refusedAtTheEdge(error: unknown): boolean {
  return error instanceof ApiError && error.status === 413 && !error.code
}

export function paidOutRefusal(
  error: unknown,
  language: string,
): { key: string; values: Record<string, string> } {
  if (refusedAtTheEdge(error)) return { key: 'pos.close.paidOutForm.receiptTooBigForServer', values: {} }
  if (error instanceof ApiError && error.code && Object.hasOwn(BILL_REFUSALS, error.code)) {
    const problem = error.problem
    if (error.code === 'BILL_PAYMENT_EXCEEDS_OUTSTANDING') {
      const owed = Number(problem.outstandingAmount)
      const currency = typeof problem.currency === 'string' ? problem.currency : null
      return Number.isFinite(owed) && currency
        ? { key: 'billDetail.pay.tooMuchMost', values: { amount: `${formatAmount(owed, currency, language)} ${currency}` } }
        : { key: 'billDetail.pay.tooMuch', values: {} }
    }
    if (error.code === 'BILL_PAYMENT_IN_PAYMENT_RUN') {
      return { key: BILL_REFUSALS[error.code], values: { run: String(problem.paymentRun ?? '') } }
    }
    return { key: BILL_REFUSALS[error.code], values: {} }
  }
  return { key: posRefusalKey(error), values: refusalValues(error) }
}
