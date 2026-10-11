import type {
  BillFilter,
  BillRowDto,
  BillSort,
  BillSourceDto,
  BillSummaryDto,
  BillWorkflowState,
} from '../api/expenditure/bills'
import type { IntakeDto } from '../api/expenditure/billIntake'

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
  match:
    | { verdict: 'ok' | 'warn'; order: string | null; note: Note }
    | { verdict: 'none'; theirOrder: string | null }
  status: BillStatusChip
  statusValues?: Record<string, string | number>
  /** A person's reason for holding the bill, shown under the chip. */
  holdReason: string | null
  canApprove: boolean
  currency: string
  amount: number | null
  amountNote: Note | null
  /** What is still owed on this bill. Zero once it is settled. */
  outstanding: number
  /** Whether anything is actually owed, so a credit note is not presented as a debt. */
  owes: boolean
  /**
   * A supplier debit note (383), with its decision once one is taken; absent on any other
   * document. The row says it is a debit note, and whether it was accepted or refused.
   */
  debitNote?: { decision: 'ACCEPTED' | 'REFUSED' | null }
  /**
   * The server's judgment, not the browser's. It is computed at read time from the same clock
   * as the tab counts and the KPI strip, so taking it from here keeps a row and the totals
   * above it telling the same story.
   */
  overdue: boolean
  /**
   * An upload or receipt nobody has confirmed yet, drawn as the design's "Draft, confirm details"
   * row. The API keeps these apart from the bills (`GET /bills/intake?status=UNCONFIRMED`), so the
   * row carries the intake it came from and the page it is finished on.
   */
  draft: {
    intakeId: string
    source: 'UPLOADED' | 'SCANNED'
    uploadedAt: string
    filename: string | null
  } | null
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

/**
 * What a bill reads as. A bill approved while it still differs from its order keeps showing
 * Mismatch (owner's Round 5 answer 1, 2 Oct 2026): nothing pays it until the difference is
 * resolved. The server says `MISMATCH` for it; one from before that says `APPROVED` beside the
 * mismatch verdict, and that pair is read the same way.
 */
export function workflowStateOf(
  row: Pick<BillRowDto, 'workflowState'> & { match: { verdict: string } | null },
): BillWorkflowState {
  return row.workflowState === 'APPROVED' && row.match?.verdict === 'MISMATCH'
    ? 'MISMATCH'
    : row.workflowState
}

export function toBillListItem(row: BillRowDto): BillListItem {
  const status = STATUS[workflowStateOf(row)]
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
    // A credit note has nothing to approve, and the server refuses it (APPROVAL_CREDIT_NOTE).
    canApprove:
      pending &&
      !isCreditNote(row) &&
      (row.workflowState === 'NEW' || row.workflowState === 'AWAITING_APPROVAL'),
    currency: row.currencyCode,
    amount: row.totalIncludingVat,
    amountNote: amountNoteOf(row),
    outstanding: row.outstandingAmount,
    owes: !isCreditNote(row) && row.outstandingAmount > 0,
    overdue: row.overdue,
    draft: null,
    ...(row.documentTypeCode === '383'
      ? { debitNote: { decision: row.debitNoteDecision ?? null } }
      : {}),
  }
}

/**
 * An unconfirmed upload or receipt as a row of the list (Figma 163:21928 draws "Draft, confirm
 * details" beside the bills). What was typed so far names it; a fresh photo has only its file.
 */
export function draftRowOf(intake: IntakeDto): BillListItem {
  const read = intake.extracted
  const vat = read?.vat ?? null
  return {
    id: `intake:${intake.id}`,
    supplier: read?.supplierName?.trim() || null,
    source: intake.source === 'SCANNED' ? 'scanned' : 'uploaded',
    number: read?.billNumber?.trim() || null,
    issueDate: read?.issueDate ?? null,
    dueDate: read?.dueDate ?? null,
    paidOnTheSpot: false,
    paid: false,
    match: { verdict: 'none', theirOrder: null },
    status: 'draft',
    holdReason: null,
    canApprove: false,
    currency: read?.currency ?? 'OMR',
    amount: read?.total ?? null,
    amountNote:
      vat === null
        ? { key: 'billsPage.rows.vatUnclear' }
        : { key: 'billsPage.rows.inclVat', values: { amount: vat } },
    outstanding: 0,
    owes: false,
    overdue: false,
    draft: {
      intakeId: intake.id,
      source: intake.source,
      uploadedAt: intake.uploadedAt,
      filename: intake.filename,
    },
  }
}

/** Where a draft row is finished: an upload on its own page, a receipt back in Scan receipts. */
export function draftRowPath(item: BillListItem): string | null {
  if (!item.draft) return null
  return item.draft.source === 'SCANNED'
    ? `/expenditure/bills/scan?intake=${encodeURIComponent(item.draft.intakeId)}`
    : `/expenditure/bills/upload/${encodeURIComponent(item.draft.intakeId)}`
}

/**
 * The one button the design draws under a row's status chip: Approve on a bill waiting for it,
 * a look at the difference on a mismatch, a nudge when someone else must approve, the hold
 * reason on a held bill, and "Check and save" on a draft.
 */
export type BillRowAction = 'approve' | 'reviewDifference' | 'nudge' | 'viewHold' | 'checkAndSave'

/** What the reader may do, as far as a row's button goes. */
export type BillRowAccess = {
  /** `invoice.approve`. */
  canApprove: boolean
  /** `invoice.payment.manage`: capturing a bill (finishing a draft) and paying it. */
  canCapture: boolean
}

/**
 * An action the reader cannot take is not offered (owner decision 2026-10-01): no "Check and
 * save" without the capture permission, and no nudge for a reader who can neither capture, pay
 * nor approve. The nudge is for a bill that is waiting on an approver, which a new bill under
 * the approval limit is not; the server refuses it there (`BILL_APPROVAL_NOT_PENDING`).
 */
export function rowActionOf(item: BillListItem, access: BillRowAccess): BillRowAction | null {
  if (item.draft) return access.canCapture ? 'checkAndSave' : null
  if (item.status === 'mismatch') return 'reviewDifference'
  if (item.status === 'onHold') return 'viewHold'
  if (!item.canApprove) return null
  if (access.canApprove) return 'approve'
  return access.canCapture && item.status === 'awaitingApproval' ? 'nudge' : null
}

function isCreditNote(row: BillRowDto): boolean {
  return row.documentTypeCode !== null && CREDIT_NOTES.has(row.documentTypeCode)
}

/**
 * The line under the amount, as the design draws it: the day a held bill was queried, what is
 * still owed on a part-paid one, "Credit note" on a note, and otherwise the VAT the total
 * includes. One note per row; the outstanding figure has no column of its own in the frame.
 */
function amountNoteOf(row: BillRowDto): Note | null {
  if (isCreditNote(row)) return { key: 'billsPage.rows.creditNote' }
  if (row.workflowState === 'ON_HOLD' && row.hold)
    return { key: 'billsPage.rows.queried', values: { date: row.hold.openedAt } }
  if (row.paidAmount > 0 && row.outstandingAmount > 0 && row.workflowState !== 'PAID') {
    return { key: 'billsPage.rows.leftToPay', values: { amount: row.outstandingAmount } }
  }
  if (row.vatAmount !== null && row.vatAmount > 0)
    return { key: 'billsPage.rows.inclVat', values: { amount: row.vatAmount } }
  return null
}

/** Status chip label key, with the approver count when the policy needs more than one. */
export function statusLabelKey(item: BillListItem): string {
  if (item.status === 'awaitingApproval' && item.statusValues)
    return 'billsPage.state.awaitingApprovals'
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

/**
 * Whether a bill is overdue is {@link BillListItem.overdue} — the server's answer. Only the
 * number of days is counted here.
 *
 * <p>The two clocks do not agree for part of every day: this browser reads Asia/Muscat while
 * the service runs UTC, so between 20:00 and midnight UTC the local calendar is already on
 * tomorrow and the server is not. Deciding "overdue" here made a row turn red up to four hours
 * before the count above the table agreed with it. So the flag decides, and when the local
 * count has not caught up the row says "overdue" without a number rather than "0 days overdue".</p>
 */
export function dueNoteOf(item: BillListItem, now?: Date): Note | null {
  if (item.paidOnTheSpot) return { key: 'billsPage.rows.cash' }
  if (!item.dueDate || item.paid) return null
  const days = daysFromMuscatToday(item.dueDate, now)
  if (item.overdue) {
    return days < 0
      ? { key: 'billsPage.rows.daysOverdue', values: { count: -days } }
      : { key: 'billsPage.rows.overdue' }
  }
  if (days > 0) return { key: 'billsPage.rows.inDays', values: { count: days } }

  // Past its date locally while the server says it is not overdue. That used to mean only the skew
  // above, the other way round, so the branch said "Due today" -- and it was right while "not
  // overdue" implied "not yet past due".
  //
  // It stopped implying that: a REJECTED bill is excluded from overdue whatever its date, so a bill
  // refused weeks ago read "Due today" on the Bills list (found 2026-09-24, from the fix that made
  // the row agree with the summary card). The skew is bounded at one day, so a wider gap is never
  // skew; a rejected bill is never skew either, at any width.
  const cannotBeSkew = days < -1 || item.status === 'rejected'
  return days < 0 && cannotBeSkew
    ? { key: 'billsPage.rows.wasDue', values: { count: -days } }
    : { key: 'billsPage.rows.dueToday' }
}

export type BillTabId =
  'needsAttention' | 'all' | 'awaitingApproval' | 'approved' | 'onHold' | 'paid'

export const BILL_TABS: { id: BillTabId; labelKey: string; filter: BillFilter }[] = [
  { id: 'needsAttention', labelKey: 'billsPage.tabs.needsAttention', filter: 'NEEDS_ATTENTION' },
  { id: 'all', labelKey: 'billsPage.tabs.all', filter: 'ALL' },
  {
    id: 'awaitingApproval',
    labelKey: 'billsPage.tabs.awaitingApproval',
    filter: 'AWAITING_APPROVAL',
  },
  { id: 'approved', labelKey: 'billsPage.tabs.approved', filter: 'APPROVED' },
  { id: 'onHold', labelKey: 'billsPage.tabs.onHold', filter: 'ON_HOLD' },
  { id: 'paid', labelKey: 'billsPage.tabs.paid', filter: 'PAID' },
]

export const DEFAULT_BILL_TAB: BillTabId = 'needsAttention'

export function isBillTab(value: string | null): value is BillTabId {
  return BILL_TABS.some((tab) => tab.id === value)
}

export function billTabCount(tabs: BillSummaryDto['tabs'], tab: BillTabId): number {
  return tabs[tab]
}

export type BillSortKey =
  'newest' | 'dueAsc' | 'dueDesc' | 'amountDesc' | 'amountAsc' | 'supplierAsc'

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

export const BILL_SOURCES: {
  id: BillSourceBadge | 'all'
  labelKey: string
  source: BillSourceDto | null
}[] = [
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

/** The design's "Show result" box offers 5; the server's default page is 10. */
/** The design's "Show result" box offers 5; the server's default page stays 10. */
export const BILL_PAGE_SIZES = [5, 10, 25, 50] as const
export const DEFAULT_BILL_PAGE_SIZE = 10

export function billPageSizeOf(value: string | null): number {
  const size = Number(value)
  return (BILL_PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_BILL_PAGE_SIZE
}
