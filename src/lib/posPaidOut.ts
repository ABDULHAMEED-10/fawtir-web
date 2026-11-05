import { ApiError, NetworkError, serverCode } from '../api'
import {
  PAID_OUT_RECEIPT_MAX_BYTES,
  PAID_OUT_RECEIPT_TYPES,
  newPosKey,
  type PosPaidOutCategory,
  type PosPaidOutClass,
  type PosPaidOutRequest,
} from '../api/pos/pos'
import { formatAmount } from './format'
import { refusalMessage } from './posRefusals'

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
 * The paid-out in flight. `unknown` is set when a press went out and no definite answer came back
 * (review W4-1): the server may have recorded it, so the form is locked to that exact body and key
 * until a definite answer, or until the cashier has re-read the shift's cash moves and said it is
 * not there. The body is the attempt's fingerprint, so it can be sent again after a reload.
 * `sentAt` (epoch ms) is the last time that body went out (review W5-2).
 */
export type PaidOutStore = {
  attempt: PaidOutAttempt
  receipt: { file: string; receiptObjectId: string } | null
  unknown: boolean
  sentAt: number | null
}

export const emptyPaidOutStore = (): PaidOutStore => ({
  attempt: null,
  receipt: null,
  unknown: false,
  sentAt: null,
})

/** Locked: a press went out and its outcome is not known (review W4-1). */
export function isLocked(store: PaidOutStore): boolean {
  return store.unknown && store.attempt !== null
}

/**
 * The body of the press whose outcome is unknown, as it was sent; null when it cannot be read back.
 * A null body never unlocks the form (review N-W5a): it can only not be sent again.
 */
export function pendingBody(store: PaidOutStore): PosPaidOutRequest | null {
  if (!isLocked(store) || !store.attempt) return null
  try {
    const body = JSON.parse(store.attempt.fingerprint) as Partial<PosPaidOutRequest> | null
    if (
      !body ||
      body.type !== 'PAID_OUT' ||
      typeof body.amount !== 'number' ||
      typeof body.note !== 'string' ||
      typeof body.category !== 'string' ||
      typeof body.currency !== 'string'
    ) {
      return null
    }
    return body as PosPaidOutRequest
  } catch {
    return null
  }
}

/**
 * How long a sent press may still be in flight. The paid-out route runs under the gateway's general
 * upstream read timeout, 60 s (gateway-service application.yml `fawtir.gateway.upstream.read-timeout`,
 * nginx `proxy_read_timeout 60s`, backend bab1802b1). When the gateway gives up, core can still be
 * finishing the write, and this device's clock is not the server's: the extra 30 s is margin for
 * both. A re-read inside the wait can miss a paid-out the server is still writing (review W5-2,
 * raised from 60 s in W6).
 */
export const UNLOCK_AFTER_MS = 90_000

/** Milliseconds left before the cashier may unlock; the full wait when no send time is known. */
export function unlockWaitMs(store: PaidOutStore, now: number): number {
  if (store.sentAt === null) return UNLOCK_AFTER_MS
  return Math.max(0, store.sentAt + UNLOCK_AFTER_MS - now)
}

/**
 * "It is not there" counts only from a re-read that started after the wait was over: one started
 * inside it may have missed the paid-out, however long the cashier then waited (review W6-1).
 * `checkedAt` is when that re-read was sent; null when none ran on this screen.
 */
export function mayUnlock(store: PaidOutStore, checkedAt: number | null): boolean {
  return checkedAt !== null && store.sentAt !== null && unlockWaitMs(store, checkedAt) === 0
}

/**
 * The press was sent and nothing definite came back: no answer at all, or a gateway or server fault
 * without the server's own code. Any coded refusal is definite: nothing was recorded. That includes
 * 503 POS_PAID_OUT_TIMED_OUT, whose attempt and key are nevertheless kept (keepsAttemptAfter, WB5-1).
 */
export function outcomeUnknown(error: unknown): boolean {
  if (error instanceof NetworkError) return true
  return error instanceof ApiError && error.status >= 500 && serverCode(error) === null
}

/*
 * Kept in sessionStorage per till and shift (review W4-2) so a reload, or the tab coming back,
 * cannot turn a retry into a second paid-out. Tab-scoped on purpose: another tab is another
 * attempt. Storage may be absent or refuse (private mode, quota); the page then works from memory.
 */
const storageKey = (tillId: string, shiftId: string) => `fawtir.pos.paidOut.${tillId}.${shiftId}`

export function loadPaidOutStore(tillId: string, shiftId: string): PaidOutStore {
  try {
    const raw = window.sessionStorage.getItem(storageKey(tillId, shiftId))
    if (!raw) return emptyPaidOutStore()
    const held = JSON.parse(raw) as Partial<PaidOutStore>
    const attempt =
      held.attempt && typeof held.attempt.key === 'string' && typeof held.attempt.fingerprint === 'string'
        ? { key: held.attempt.key, fingerprint: held.attempt.fingerprint }
        : null
    const receipt =
      held.receipt &&
      typeof held.receipt.file === 'string' &&
      typeof held.receipt.receiptObjectId === 'string'
        ? { file: held.receipt.file, receiptObjectId: held.receipt.receiptObjectId }
        : null
    const unknown = held.unknown === true && attempt !== null
    // A stored lock with no readable send time starts its wait now: never shorter than the rule.
    const sentAt =
      typeof held.sentAt === 'number' && Number.isFinite(held.sentAt) && held.sentAt <= Date.now()
        ? held.sentAt
        : unknown
          ? Date.now()
          : null
    return { attempt, receipt, unknown, sentAt }
  } catch {
    return emptyPaidOutStore()
  }
}

/**
 * Written only while an attempt is open: once a definite answer closes it, nothing is kept, and a
 * receipt still held in memory is not worth a stored entry of its own.
 */
export function savePaidOutStore(tillId: string, shiftId: string, store: PaidOutStore): void {
  try {
    if (!store.attempt) {
      window.sessionStorage.removeItem(storageKey(tillId, shiftId))
      return
    }
    window.sessionStorage.setItem(storageKey(tillId, shiftId), JSON.stringify(store))
  } catch {
    // Memory still holds it for this page.
  }
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

/**
 * 503 POS_PAID_OUT_TIMED_OUT is sent only after the rollback (Agent 10), so nothing was paid out,
 * yet the attempt and its key are kept (coordinator ruling, 2026-11-05): the same paid-out sent
 * again goes under the same key, so even a commit that ever coincided with this 503 would come back
 * as the replayed 200, never a second paid-out. The form is not locked: changing a detail is a new
 * attempt with a new key, which is safe because nothing was paid out.
 */
export function keepsAttemptAfter(error: unknown): boolean {
  return error instanceof ApiError && serverCode(error) === 'POS_PAID_OUT_TIMED_OUT'
}

/**
 * B8R-1 (Agent 10, on WB4-2): a supplier payment recorded before K10 and sent again under its kept
 * key by someone without bill.settle is answered 403 POS_SUPPLIER_PAYMENT_REQUIRES_BILL_SETTLE, not
 * replayed. On such a retry the 403 says nothing about the first press, which may have paid the cash
 * out, so it is not a definite "nothing was recorded": the attempt stays held for a manager's check.
 */
export function retryRefusedForBillSettle(error: unknown): boolean {
  return error instanceof ApiError && serverCode(error) === 'POS_SUPPLIER_PAYMENT_REQUIRES_BILL_SETTLE'
}

/** The edge refused the body for size before the server's coded answer (the gateway's limit). */
function refusedAtTheEdge(error: unknown): boolean {
  return error instanceof ApiError && error.status === 413 && serverCode(error) === null
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
  return refusalMessage(error)
}
