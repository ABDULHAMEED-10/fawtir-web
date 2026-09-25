import type { TFunction } from 'i18next'
import { ApiError } from '../api/errors'
import type {
  BlockedReasonCode,
  PaymentRunFormat,
  PaymentRunState,
} from '../api/expenditure/paymentRuns'
import { describeApiFailure } from './apiFailure'
import { plusDays } from './invoiceIssue'

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
}

export type SupplierGroup = {
  key: string
  supplierId: string | null
  name: string | null
  bills: RunBill[]
}

/** One transfer per supplier, as the bank file makes them; a bill with no supplier record pays on its own. */
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
  canExport: boolean
  canMarkPaid: boolean
  canCancel: boolean
}

export function actionsFor(state: PaymentRunState | null): RunActions {
  return {
    editable: state === null || state === 'DRAFT' || state === 'SCHEDULED',
    canExport: state === 'SCHEDULED' || state === 'EXPORTED',
    canMarkPaid: state === 'EXPORTED',
    canCancel: state === 'DRAFT' || state === 'SCHEDULED',
  }
}

export const FORMATS: { id: PaymentRunFormat; titleKey: string; noteKey: string }[] = [
  {
    id: 'BANK_MUSCAT_CSV',
    titleKey: 'paymentsPage.format.csv',
    noteKey: 'paymentsPage.format.csvNote',
  },
  { id: 'PAIN_001', titleKey: 'paymentsPage.format.iso', noteKey: 'paymentsPage.format.isoNote' },
  {
    id: 'PRINTED_LIST',
    titleKey: 'paymentsPage.format.printed',
    noteKey: 'paymentsPage.format.printedNote',
  },
]

export const RUN_STATES: PaymentRunState[] = ['DRAFT', 'SCHEDULED', 'EXPORTED', 'PAID', 'CANCELLED']

export const REASON_KEYS: Record<BlockedReasonCode, string> = {
  ON_HOLD: 'paymentRuns.blocked.onHold',
  MISMATCH: 'paymentRuns.blocked.mismatch',
  REJECTED: 'paymentRuns.blocked.rejected',
  AWAITING_APPROVALS: 'paymentRuns.blocked.awaiting',
}

/** The run refusals a person can act on, by the server's code. */
export const RUN_REFUSALS: Record<string, string> = {
  PAYMENT_RUN_BILL_NOT_READY: 'paymentRuns.refused.notReady',
  PAYMENT_RUN_BILL_ON_HOLD: 'paymentRuns.refused.onHold',
  PAYMENT_RUN_BILL_MISMATCHED: 'paymentRuns.refused.mismatched',
  PAYMENT_RUN_CURRENCY_MISMATCH: 'paymentRuns.refused.currency',
  PAYMENT_RUN_BILL_SETTLED: 'paymentRuns.refused.settled',
  PAYMENT_RUN_BILL_NOT_PAYABLE: 'paymentRuns.refused.notPayable',
  PAYMENT_RUN_BILL_ALREADY_SCHEDULED: 'paymentRuns.refused.alreadyScheduled',
  PAYMENT_RUN_BANK_DETAILS_MISSING: 'paymentRuns.refused.bankDetailsMissing',
  PAYMENT_RUN_NOT_EDITABLE: 'paymentRuns.refused.notEditable',
  PAYMENT_RUN_TRANSITION_INVALID: 'paymentRuns.refused.transition',
  PAYMENT_RUN_CONCURRENTLY_MODIFIED: 'paymentRuns.refused.concurrent',
  PAYMENT_RUN_DATE_REQUIRED: 'paymentRuns.refused.dateRequired',
  PAYMENT_RUN_FORMAT_REQUIRED: 'paymentRuns.refused.formatRequired',
  PAYMENT_RUN_EMPTY: 'paymentRuns.refused.empty',
  PAYMENT_RUN_PAYER_ACCOUNT_REQUIRED: 'paymentRuns.refused.payerRequired',
  PAYER_ACCOUNT_INACTIVE: 'paymentRuns.refused.payerInactive',
  PAYER_ACCOUNT_IBAN_INVALID: 'paymentRuns.account.ibanInvalid',
  PAYER_ACCOUNT_BIC_INVALID: 'paymentRuns.account.bicInvalid',
  PAYER_ACCOUNT_NAME_INVALID: 'paymentRuns.account.nameInvalid',
}

/** A run's refusal in the page's language, or the generic failure when it is not one a person can act on. */
export function refusalOf(error: unknown, t: TFunction): string {
  if (error instanceof ApiError && error.code && RUN_REFUSALS[error.code])
    return t(RUN_REFUSALS[error.code])
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

export function formatLabelKey(format: PaymentRunFormat | null): string {
  return format ? FORMATS.find((entry) => entry.id === format)!.titleKey : 'paymentRuns.noFormat'
}
