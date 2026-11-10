import type { TFunction } from 'i18next'
import { ApiError } from '../api/errors'
import type {
  BlockedReasonCode,
  MarkPaidBlockCode,
  PaymentRunDto,
  PaymentRunItemDto,
  PaymentRunState,
} from '../api/expenditure/paymentRuns'
import { describeApiFailure } from './apiFailure'
import { PERIOD_CLOSED_CHOSEN_DATE_KEY } from './expenditureRefusals'
import { muscatToday, plusDays } from './invoiceIssue'

/**
 * The payment run builder's rules (E-11). The server prices every bill and decides what a run may
 * take; these only group, label and pick what the server already offered.
 */

export type RunBill = {
  billId: string
  supplierId: string | null
  supplierName: string | null
  supplierBillNumber: string | null
  issueDate: string | null
  dueDate: string | null
  outstanding: number
  discount: number
  amount: number
  /** On a candidate only (batch 39 EXP): as `BillRow.duplicateOf`, the sure twin's bill id. */
  duplicateOf?: string | null
  /** On a candidate only (batch 39 EXP): as `BillRow.possibleDuplicateOf`. */
  possibleDuplicateOf?: string | null
  /** On a candidate only (PRV-b39 E-1): as `BillRow.heldCopyId`. */
  heldCopyId?: string | null
}

/**
 * The bill a candidate may be the same supplier document as, so whoever builds a run sees it
 * before paying both copies (ACC-8 interim; batch 39 EXP §5). A sure pair wins over a possible one.
 * A held copy never reaches the candidates, so this never names a decided hold. The upload it is
 * held against does, and it is the bill to pay: it is told where its copy is (`heldCopy`), never
 * that it is the same as another (PRV-b39 E-1); read first, so a reply still carrying
 * `duplicateOf` cannot say otherwise.
 */
export function candidateTwinOf(
  bill: Pick<RunBill, 'duplicateOf' | 'possibleDuplicateOf' | 'heldCopyId'>,
): { certainty: 'heldCopy' | 'sure' | 'possible'; otherId: string } | null {
  if (bill.heldCopyId) return { certainty: 'heldCopy', otherId: bill.heldCopyId }
  if (bill.duplicateOf) return { certainty: 'sure', otherId: bill.duplicateOf }
  if (bill.possibleDuplicateOf) return { certainty: 'possible', otherId: bill.possibleDuplicateOf }
  return null
}

export type SupplierGroup = {
  key: string
  supplierId: string | null
  name: string | null
  bills: RunBill[]
}

/** One transfer per supplier; a bill with no supplier record pays on its own. */
export function groupBySupplier(bills: RunBill[]): SupplierGroup[] {
  const groups = new Map<string, SupplierGroup>()
  for (const bill of bills) {
    const key = bill.supplierId ?? `bill:${bill.billId}`
    const group = groups.get(key) ?? {
      key,
      supplierId: bill.supplierId,
      name: bill.supplierName,
      bills: [],
    }
    group.bills.push(bill)
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
}

export type DueWindow = 'thisWeek' | 'twoWeeks' | 'endOfMonth' | 'everything'
export const DUE_WINDOWS: DueWindow[] = ['thisWeek', 'twoWeeks', 'endOfMonth', 'everything']

/** The last due date a window sweeps in, or null for everything. */
export function windowEnd(window: DueWindow, today: string): string | null {
  if (window === 'thisWeek') return plusDays(today, 7)
  if (window === 'twoWeeks') return plusDays(today, 14)
  if (window === 'endOfMonth') {
    const [year, month] = today.split('-').map(Number)
    return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  }
  return null
}

/** Bills due on or before `by` (every bill when `by` is null), like the server's select-due-by. */
export function dueBy(bills: RunBill[], by: string | null): RunBill[] {
  return by === null ? bills : bills.filter((bill) => bill.dueDate !== null && bill.dueDate <= by)
}

export type DueTone = 'late' | 'soon' | 'later' | 'none'

/** Days are counted on the Muscat calendar day the caller passes as `today`. */
export function dueNote(
  dueDate: string | null,
  today: string,
): { tone: DueTone; key: string; days: number } {
  if (!dueDate) return { tone: 'none', key: 'paymentRuns.due.none', days: 0 }
  const days = Math.round(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  )
  if (days < 0) return { tone: 'late', key: 'paymentRuns.due.late', days: -days }
  if (days === 0) return { tone: 'soon', key: 'paymentRuns.due.today', days: 0 }
  return { tone: days <= 7 ? 'soon' : 'later', key: 'paymentRuns.due.inDays', days }
}

export function sum(values: number[]): number {
  // Money is at most three decimals; summing in thousandths keeps a column from drifting.
  return values.reduce((total, value) => total + Math.round(value * 1000), 0) / 1000
}

export type RunActions = {
  editable: boolean
  canMarkPaid: boolean
  canCancel: boolean
}

/**
 * Fawtir makes no bank files (owner, 9 Oct 2026): the company pays its suppliers itself and marks
 * the run paid, from DRAFT or SCHEDULED. An EXPORTED run, made before that, is still marked paid.
 */
export function actionsFor(state: PaymentRunState | null): RunActions {
  return {
    editable: state === null || state === 'DRAFT' || state === 'SCHEDULED',
    canMarkPaid: state === 'DRAFT' || state === 'SCHEDULED' || state === 'EXPORTED',
    canCancel: state === 'DRAFT' || state === 'SCHEDULED',
  }
}

/**
 * The day a paid run's bills were paid: the server's `paidOn` (the day chosen in Mark as paid,
 * backend #480). A server without it: the run's payment date when it has one that was not after
 * the day it was marked paid, else that day (Muscat). Null before then.
 */
export function paidOn(
  run: Pick<PaymentRunDto, 'paymentDate' | 'paidAt'> & Pick<Partial<PaymentRunDto>, 'paidOn'>,
): string | null {
  if (run.paidOn) return run.paidOn
  const marked = run.paidAt ? muscatToday(new Date(run.paidAt)) : null
  if (run.paymentDate && (marked === null || run.paymentDate <= marked)) return run.paymentDate
  return marked
}

/**
 * The day the Mark as paid dialog starts on (owner, 10 Oct 2026): the run's payment date, or today
 * in Muscat when the run has none or it is still in the future. People often mark a run paid a
 * day or two after paying, so any day up to today can be chosen.
 */
export function markPaidDateFor(run: Pick<PaymentRunDto, 'paymentDate'>, today: string): string {
  return run.paymentDate && run.paymentDate <= today ? run.paymentDate : today
}

/** Why the dialog's date cannot be sent, said before the request goes; the server still decides. */
export function markPaidDateProblem(date: string, today: string): string | null {
  if (!date) return 'paymentRuns.paidOnRequired'
  if (date > today) return 'invoiceDetails.pay.error.dateFuture'
  return null
}

/**
 * The suppliers whose bank details changed after one of their bills was added to the run, once
 * each in the run's order (owner, 10 Oct 2026). Only a run still to be paid warns: none on a PAID
 * or CANCELLED run, and none with no supplier name to say.
 */
export function bankDetailsChangedIn(
  state: PaymentRunState | null,
  items: Pick<PaymentRunItemDto, 'supplierId' | 'supplierName' | 'supplierBankDetailsChangedSinceAdded'>[],
): { key: string; name: string }[] {
  if (state === null || state === 'PAID' || state === 'CANCELLED') return []
  const seen = new Map<string, string>()
  for (const item of items) {
    const name = item.supplierName?.trim()
    if (item.supplierBankDetailsChangedSinceAdded !== true || !name) continue
    const key = item.supplierId ?? name
    if (!seen.has(key)) seen.set(key, name)
  }
  return [...seen].map(([key, name]) => ({ key, name }))
}

export const RUN_STATES: PaymentRunState[] = ['DRAFT', 'SCHEDULED', 'EXPORTED', 'PAID', 'CANCELLED']

export const REASON_KEYS: Record<BlockedReasonCode, string> = {
  ON_HOLD: 'paymentRuns.blocked.onHold',
  MISMATCH: 'paymentRuns.blocked.mismatch',
  REJECTED: 'paymentRuns.blocked.rejected',
  AWAITING_APPROVALS: 'paymentRuns.blocked.awaiting',
  DEBIT_NOTE_REFUSED: 'paymentRuns.blocked.debitNoteRefused',
  // Backend #480 (10 Oct 2026): not payable until accepted.
  DEBIT_NOTE_NOT_ACCEPTED: 'apiErrors.refused.debitNoteNotAccepted',
}

/**
 * Why a bill in a live run cannot be marked paid now (`markPaidBlock.code`), in the words the run
 * page and the Mark as paid dialog print beside it. Where the "can't be paid yet" list already
 * has the word (On hold, Rejected, Refused), the same word.
 */
export const MARK_PAID_BLOCK_KEYS: Record<MarkPaidBlockCode, string> = {
  PAYMENT_RUN_BILL_ON_HOLD: 'paymentRuns.blocked.onHold',
  PAYMENT_RUN_BILL_NOT_READY: 'paymentRuns.blocked.rejected',
  PAYMENT_RUN_DEBIT_NOTE_REFUSED: 'paymentRuns.blocked.debitNoteRefused',
  // Backend #480: a debit note nobody has accepted is not payable until it is.
  PAYMENT_RUN_DEBIT_NOTE_NOT_ACCEPTED: 'apiErrors.refused.debitNoteNotAccepted',
  PAYMENT_RUN_AMOUNT_CHANGED: 'paymentRuns.markPaidBlock.amountChanged',
  PAYMENT_RUN_BILL_SETTLED: 'paymentRuns.markPaidBlock.settled',
}

/** A block's words, or null for a code this screen does not know (it is still ticked). */
export function markPaidBlockKey(code: string | null | undefined): string | null {
  return code && Object.hasOwn(MARK_PAID_BLOCK_KEYS, code) ? MARK_PAID_BLOCK_KEYS[code as MarkPaidBlockCode] : null
}

/**
 * A Mark as paid refusal that names one bill of the run (its `billId`) and is about that bill: the
 * markPaidBlock reasons, and a date after the bill's early-payment discount ends. Reopened, the
 * dialog ticks that bill to be taken out with these words beside it, as it does a markPaidBlock.
 * Null for any other refusal.
 */
export function refusedBillOf(
  error: unknown,
  billIds: readonly string[],
): { billId: string; key: string | null } | null {
  if (!(error instanceof ApiError) || !error.code) return null
  const billId = error.problem.billId
  if (typeof billId !== 'string' || !billIds.includes(billId)) return null
  if (error.code === 'PAYMENT_RUN_PAYMENT_DATE_AFTER_DISCOUNT')
    return { billId, key: 'paymentRuns.markPaidBlock.afterDiscount' }
  if (Object.hasOwn(MARK_PAID_BLOCK_KEYS, error.code)) return { billId, key: markPaidBlockKey(error.code) }
  return null
}

/** The run refusals a person can act on, by the server's code. */
export const RUN_REFUSALS: Record<string, string> = {
  PAYMENT_RUN_BILL_NOT_READY: 'paymentRuns.refused.notReady',
  PAYMENT_RUN_BILL_ON_HOLD: 'paymentRuns.refused.onHold',
  PAYMENT_RUN_BILL_MISMATCHED: 'paymentRuns.refused.mismatched',
  PAYMENT_RUN_CURRENCY_MISMATCH: 'paymentRuns.refused.currency',
  PAYMENT_RUN_BILL_NOT_PAYABLE: 'paymentRuns.refused.notPayable',
  PAYMENT_RUN_BILL_ALREADY_SCHEDULED: 'paymentRuns.refused.alreadyScheduled',
  PAYMENT_RUN_NOT_EDITABLE: 'paymentRuns.refused.notEditable',
  PAYMENT_RUN_TRANSITION_INVALID: 'paymentRuns.refused.transition',
  PAYMENT_RUN_CONCURRENTLY_MODIFIED: 'paymentRuns.refused.concurrent',
  PAYMENT_RUN_EMPTY: 'paymentRuns.refused.empty',
  PAYER_ACCOUNT_INACTIVE: 'paymentRuns.refused.payerInactive',
  PAYER_ACCOUNT_IBAN_INVALID: 'paymentRuns.account.ibanInvalid',
  PAYER_ACCOUNT_BIC_INVALID: 'paymentRuns.account.bicInvalid',
  PAYER_ACCOUNT_NAME_INVALID: 'paymentRuns.account.nameInvalid',
  // The pay-from account was switched off after the run chose it, from a server that sends no
  // `accountName`: the sentence the other switched-off account refusal reads.
  PAYMENT_RUN_PAYER_ACCOUNT_INACTIVE: 'paymentRuns.refused.payerInactive',
  // The date in the Mark as paid dialog (owner, 10 Oct 2026). The future-date sentence is the one
  // Record payment reads. A date after a bill's early-payment discount ends is refused by name;
  // this sentence is for an answer that names none.
  PAYMENT_RUN_PAYMENT_DATE_IN_FUTURE: 'invoiceDetails.pay.error.dateFuture',
  PAYMENT_RUN_PAYMENT_DATE_AFTER_DISCOUNT: 'paymentRuns.refused.dateAfterDiscount',
  // Backend #480: a debit note nobody has accepted, added to a run or marked paid with it.
  PAYMENT_RUN_DEBIT_NOTE_NOT_ACCEPTED: 'apiErrors.refused.debitNoteNotAccepted',
}

/** What was being done to a run when it refused, where one code needs a sentence per action. */
export type RunAction = 'add' | 'markPaid'

/**
 * The refusals that are one code with a sentence per action (owner, 8 Oct 2026), each naming the
 * bill or note by the number the server sends beside the code. An action with no sentence keeps
 * the generic refusal.
 */
const BY_ACTION: Record<string, Partial<Record<RunAction, string>>> = {
  PAYMENT_RUN_DEBIT_NOTE_REFUSED: {
    add: 'paymentRuns.refused.debitNoteRefusedAdd',
    markPaid: 'paymentRuns.refused.debitNoteRefusedMarkPaid',
  },
  PAYMENT_RUN_AMOUNT_CHANGED: {
    markPaid: 'paymentRuns.refused.amountChangedMarkPaid',
  },
  // Backend #476: a hold or a rejection placed after the bill joined the run. With no bill to
  // name, the hold keeps the sentence that names none.
  PAYMENT_RUN_BILL_ON_HOLD: { markPaid: 'paymentRuns.refused.onHoldMarkPaidNamed' },
  PAYMENT_RUN_BILL_NOT_READY: { markPaid: 'paymentRuns.refused.rejectedMarkPaid' },
  // Marking paid is dated by the person (the dialog's date, else the run's), so another date is a
  // way past a closed period; no other run action posts cash.
  PERIOD_CLOSED: { markPaid: PERIOD_CLOSED_CHOSEN_DATE_KEY },
}

/** Sentences that name the bill: without its number the code's own sentence is said instead. */
const NAMES_THE_BILL = new Set(['PAYMENT_RUN_BILL_NOT_READY'])

/** Sentences that name the bill, with one that names none to say when no number is known. */
const UNNAMED: Record<string, Partial<Record<RunAction, string>>> = {
  PAYMENT_RUN_BILL_ON_HOLD: { markPaid: 'paymentRuns.refused.onHoldMarkPaid' },
}

/**
 * `PAYMENT_RUN_BILL_SETTLED` names the bill, in every action. The Arabic agrees with the document:
 * a supplier debit note (383) is masculine, a bill feminine (owner, 8 Oct 2026).
 */
function settledKey(documentTypeCode: unknown): string {
  return String(documentTypeCode ?? '') === '383'
    ? 'paymentRuns.refused.settledDebitNote'
    : 'paymentRuns.refused.settledBill'
}

/**
 * `PAYMENT_RUN_PAYMENT_DATE_AFTER_DISCOUNT` (owner, 10 Oct 2026): the date paid is after the
 * early-payment discount a bill of the run was priced with. It names the bill, agreeing in Arabic
 * with the document as `settledKey` does.
 */
function afterDiscountKey(documentTypeCode: unknown): string {
  return String(documentTypeCode ?? '') === '383'
    ? 'paymentRuns.refused.dateAfterDiscountDebitNote'
    : 'paymentRuns.refused.dateAfterDiscountBill'
}

/**
 * A run's refusal in the page's language, or the generic failure when it is not one a person can
 * act on. `action` says what was being done, for the refusals whose sentence depends on it.
 * `knownBill` names the bill the screen can tell a refusal code is about, used when the server's
 * answer names none.
 */
export function refusalOf(
  error: unknown,
  t: TFunction,
  action?: RunAction,
  knownBill?: (code: string) => string | null,
): string {
  if (error instanceof ApiError && error.code) {
    const number = String(error.problem.supplierBillNumber ?? knownBill?.(error.code) ?? '')
    const unnamed = action && Object.hasOwn(UNNAMED, error.code) ? UNNAMED[error.code]?.[action] : undefined
    if (unnamed && !number) return t(unnamed)
    const byAction = action && Object.hasOwn(BY_ACTION, error.code) ? BY_ACTION[error.code]?.[action] : undefined
    if (byAction && (number || !NAMES_THE_BILL.has(error.code)))
      return t(byAction, { note: number, bill: number })
    if (error.code === 'PAYMENT_RUN_BILL_SETTLED')
      return t(settledKey(error.problem.documentTypeCode), { bill: number })
    if (error.code === 'PAYMENT_RUN_PAYMENT_DATE_AFTER_DISCOUNT' && number)
      return t(afterDiscountKey(error.problem.documentTypeCode), { bill: number })
    // The switched-off pay-from account by its name. (No sentence for unconfirmed bank details:
    // nobody confirms a changed IBAN since 10 Oct 2026.)
    if (error.code === 'PAYMENT_RUN_PAYER_ACCOUNT_INACTIVE' && error.problem.accountName)
      return t('paymentRuns.refused.payerAccountInactive', {
        account: String(error.problem.accountName),
      })
    if (Object.hasOwn(RUN_REFUSALS, error.code)) return t(RUN_REFUSALS[error.code])
  }
  const described = describeApiFailure(error)
  return t(described.key, described.values)
}

/** ISO 13616 shape and ISO 7064 MOD 97-10, as the server checks it: a typo is refused before it is sent. */
export function ibanValid(raw: string): boolean {
  const iban = raw.replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (letter) =>
    String(letter.charCodeAt(0) - 55),
  )
  let remainder = 0
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97
  return remainder === 1
}

export const BIC_SHAPE = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/

/** The discount as the design prints it beside a bill: "2% saved by paying early". */
export function discountPercent(discount: number, outstanding: number): number {
  if (discount <= 0 || outstanding <= 0) return 0
  return Math.round((discount / outstanding) * 100 * 10) / 10
}

/** Two letters and a tint for the supplier tile the frames draw instead of a logo. */
const TINTS = [
  'bg-success-100 text-success-700',
  'bg-primary-50 text-primary-800',
  'bg-pending-100 text-pending-700',
  'bg-[#e3e4ea] text-[#474a5e]',
]

export function supplierTile(name: string | null): { initials: string; tint: string } {
  if (!name) return { initials: '?', tint: TINTS[3] }
  const words = name.split(/\s+/).filter(Boolean)
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase()
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997
  return { initials, tint: TINTS[hash % TINTS.length] }
}
