import type {
  BillFilter,
  BillRowDto,
  BillSort,
  BillSourceDto,
  BillSummaryDto,
  BillWorkflowState,
} from '../api/expenditure/bills'

/**
 * The Bills list's view model, written only from what a row carries. The mock's per-row sentences
 * ("3 boxes more than we received", "PDF · by Yusuf", "Waiting on Hafidh") have no field behind
 * them, so each note here is built from a field or left out.
 */

export type Note = { key: string; values?: Record<string, string | number> }

export type BillSourceBadge = 'peppol' | 'uploaded' | 'scanned' | 'recurring' | 'selfBilled'

export type BillStatusChip =
  | 'newNotReviewed'
  | 'mismatch'
  | 'awaitingApproval'
  | 'draft'
  | 'onHold'
  | 'approved'
  | 'rejected'
  | 'inPaymentRun'
  | 'paid'

export type BillListItem = {
  id: string
  supplier: string | null
  source: BillSourceBadge
  number: string | null
  issueDate: string | null
  dueDate: string | null
  /** Settled at the counter: no due date to show, and none to chase. */
  paidOnTheSpot: boolean
  paid: boolean
  match: { verdict: 'ok' | 'warn'; order: string | null; note: Note } | { verdict: 'none'; theirOrder: string | null }
  status: BillStatusChip
  statusValues?: Record<string, string | number>
  /** A person's reason for holding the bill, shown under the chip. */
  holdReason: string | null
  canApprove: boolean
  currency: string
  amount: number | null
  amountNote: Note | null
}

const SOURCE: Record<BillSourceDto, BillSourceBadge> = {
  PEPPOL: 'peppol',
  UPLOADED: 'uploaded',
  SCANNED: 'scanned',
  RECURRING: 'recurring',
  SELF_BILLED: 'selfBilled',
}

const STATUS: Record<BillWorkflowState, BillStatusChip> = {
  DRAFT: 'draft',
  NEW: 'newNotReviewed',
  MISMATCH: 'mismatch',
  AWAITING_APPROVAL: 'awaitingApproval',
  APPROVED: 'approved',
  ON_HOLD: 'onHold',
  REJECTED: 'rejected',
  IN_PAYMENT_RUN: 'inPaymentRun',
  PAID: 'paid',
}

/** A supplier's credit note (381) or a self-billed one (261): it lowers a bill, nothing is owed on it. */
const CREDIT_NOTES = new Set(['381', '261'])

export function toBillListItem(row: BillRowDto): BillListItem {
  const status = STATUS[row.workflowState]
  const pending = row.readiness.state === 'PENDING'
  return {
    id: row.id,
    supplier: row.supplierName,
    source: SOURCE[row.source],
    number: row.supplierBillNumber,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    paidOnTheSpot: row.paidOnTheSpot,
    paid: row.workflowState === 'PAID',
    // NO_ORDER is a verdict too: the matcher looked and found no order to hold the bill against.
    match:
      row.match && row.match.verdict !== 'NO_ORDER'
        ? {
            verdict: row.match.verdict === 'MISMATCH' ? 'warn' : 'ok',
            order: row.match.purchaseOrderNumber,
            note: {
              key:
                row.match.byHand || row.match.verdict === 'MATCHED_BY_HAND'
                  ? 'billsPage.rows.matchedByHand'
                  : row.match.verdict === 'MISMATCH'
                    ? 'billsPage.rows.differsFromOrder'
                    : 'billsPage.rows.agreesWithOrder',
            },
          }
        : { verdict: 'none', theirOrder: row.purchaseOrderReference },
    status,
    statusValues:
      status === 'awaitingApproval' && row.readiness.required > 1
        ? { given: row.readiness.distinctApprovals, required: row.readiness.required }
        : status === 'inPaymentRun' && row.paymentRunReference
          ? { run: row.paymentRunReference }
          : undefined,
    holdReason: row.workflowState === 'ON_HOLD' ? (row.hold?.reason ?? null) : null,
    // A mismatch is approved only after its difference has been looked at, which is the detail's job.
    canApprove: pending && (row.workflowState === 'NEW' || row.workflowState === 'AWAITING_APPROVAL'),
    currency: row.currencyCode,
    amount: row.totalIncludingVat,
    amountNote: amountNoteOf(row),
  }
}

function amountNoteOf(row: BillRowDto): Note | null {
  if (row.documentTypeCode && CREDIT_NOTES.has(row.documentTypeCode)) return { key: 'billsPage.rows.creditNote' }
  if (row.paidAmount > 0 && row.outstandingAmount > 0) {
    return { key: 'billsPage.rows.leftToPay', values: { amount: row.outstandingAmount } }
  }
  if (row.vatAmount !== null && row.vatAmount > 0) return { key: 'billsPage.rows.inclVat', values: { amount: row.vatAmount } }
  return null
}

/** Status chip label key, with the approver count when the policy needs more than one. */
export function statusLabelKey(item: BillListItem): string {
  if (item.status === 'awaitingApproval' && item.statusValues) return 'billsPage.state.awaitingApprovals'
  if (item.status === 'inPaymentRun' && item.statusValues) return 'billsPage.state.inPaymentRunRef'
  return `billsPage.state.${item.status}`
}

/**
 * Whole days from today in Oman to `isoDate`: negative when it has passed. Muscat, not the
 * browser's zone, because a bill falls due when Oman's day turns.
 */
export function daysFromMuscatToday(isoDate: string, now: Date = new Date()): number {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(now)
  const [y, m, d] = today.split('-').map(Number)
  const [dy, dm, dd] = isoDate.split('-').map(Number)
  return Math.round((Date.UTC(dy, dm - 1, dd) - Date.UTC(y, m - 1, d)) / 86_400_000)
}

export function dueNoteOf(item: BillListItem, now?: Date): Note | null {
  if (item.paidOnTheSpot) return { key: 'billsPage.rows.cash' }
  if (!item.dueDate || item.paid) return null
  const days = daysFromMuscatToday(item.dueDate, now)
  if (days === 0) return { key: 'billsPage.rows.dueToday' }
  return days > 0
    ? { key: 'billsPage.rows.inDays', values: { count: days } }
    : { key: 'billsPage.rows.daysOverdue', values: { count: -days } }
}

export type BillTabId = 'needsAttention' | 'all' | 'awaitingApproval' | 'approved' | 'onHold' | 'paid'

export const BILL_TABS: { id: BillTabId; labelKey: string; filter: BillFilter }[] = [
  { id: 'needsAttention', labelKey: 'billsPage.tabs.needsAttention', filter: 'NEEDS_ATTENTION' },
  { id: 'all', labelKey: 'billsPage.tabs.all', filter: 'ALL' },
  { id: 'awaitingApproval', labelKey: 'billsPage.tabs.awaitingApproval', filter: 'AWAITING_APPROVAL' },
  { id: 'approved', labelKey: 'billsPage.tabs.approved', filter: 'APPROVED' },
  { id: 'onHold', labelKey: 'billsPage.tabs.onHold', filter: 'ON_HOLD' },
  { id: 'paid', labelKey: 'billsPage.tabs.paid', filter: 'PAID' },
]

export const DEFAULT_BILL_TAB: BillTabId = 'needsAttention'

export function isBillTab(value: string | null): value is BillTabId {
  return BILL_TABS.some((tab) => tab.id === value)
}

export function billTabCount(summary: BillSummaryDto, tab: BillTabId): number {
  return summary.tabs[tab]
}

export type BillSortKey = 'newest' | 'dueAsc' | 'dueDesc' | 'amountDesc' | 'amountAsc' | 'supplierAsc'

export const BILL_SORTS: { value: BillSortKey; labelKey: string; sort: BillSort }[] = [
  { value: 'newest', labelKey: 'billsPage.sortOptions.newest', sort: 'NEWEST' },
  { value: 'dueAsc', labelKey: 'billsPage.sortOptions.dueAsc', sort: 'DUE_SOONEST' },
  { value: 'dueDesc', labelKey: 'billsPage.sortOptions.dueDesc', sort: 'DUE_LATEST' },
  { value: 'amountDesc', labelKey: 'billsPage.sortOptions.amountDesc', sort: 'AMOUNT_HIGHEST' },
  { value: 'amountAsc', labelKey: 'billsPage.sortOptions.amountAsc', sort: 'AMOUNT_LOWEST' },
  { value: 'supplierAsc', labelKey: 'billsPage.sortOptions.supplierAsc', sort: 'SUPPLIER' },
]

export function isBillSort(value: string | null): value is BillSortKey {
  return BILL_SORTS.some((option) => option.value === value)
}

export const BILL_SOURCES: { id: BillSourceBadge | 'all'; labelKey: string; source: BillSourceDto | null }[] = [
  { id: 'all', labelKey: 'billsPage.sourceFilter.all', source: null },
  { id: 'peppol', labelKey: 'billsPage.source.peppol', source: 'PEPPOL' },
  { id: 'uploaded', labelKey: 'billsPage.source.uploaded', source: 'UPLOADED' },
  { id: 'scanned', labelKey: 'billsPage.source.scanned', source: 'SCANNED' },
  { id: 'recurring', labelKey: 'billsPage.source.recurring', source: 'RECURRING' },
  { id: 'selfBilled', labelKey: 'billsPage.source.selfBilled', source: 'SELF_BILLED' },
]

export function isBillSource(value: string | null): value is BillSourceBadge {
  return BILL_SOURCES.some((option) => option.id === value && option.id !== 'all')
}

export const BILL_PAGE_SIZES = [10, 25, 50] as const
export const DEFAULT_BILL_PAGE_SIZE = 10

export function billPageSizeOf(value: string | null): number {
  const size = Number(value)
  return (BILL_PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_BILL_PAGE_SIZE
}
