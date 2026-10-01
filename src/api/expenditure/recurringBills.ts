import { apiDownload, apiRequest, type ApiDownload } from '../client'
import { withQuery } from '../query'

/**
 * Recurring bills (E-12): a standing instruction about a bill that comes round again.
 *
 * Two modes. `EXPECT` watches for the supplier's own bill and matches it to the period it belongs
 * to; `RAISE` has Fawtir create the bill itself on the day. Reads need `invoice.read`, writes
 * `invoice.payment.manage`.
 */

export type RecurrenceInterval = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'
export type RecurringMode = 'RAISE' | 'EXPECT'
export type RecurringListState = 'ACTIVE' | 'LATE' | 'PAUSED' | 'ALL'
/** `ENDED` is a finished instruction: its count ran out or its end date passed. It cannot be resumed. */
export type RecurringStatus = 'ACTIVE' | 'PAUSED' | 'ENDED'
export type PauseReason = 'MANUAL' | 'SUPPLIER_SWITCHED_OFF'
export type ExpectationState = 'DUE_TO_ARRIVE' | 'ARRIVED' | 'ARRIVED_OUT_OF_RANGE' | 'LATE'
export type RunOutcome =
  | 'RAISED'
  | 'FAILED'
  | 'SKIPPED'
  | 'EXPECTED'
  | 'ARRIVED'
  | 'ARRIVED_OUT_OF_RANGE'
  | 'LATE'

/** What the watch is saying today. Computed on read; `null` for a RAISE watch. */
export type ExpectationDto = {
  state: ExpectationState
  expectedOn: string | null
  lastArrivedOn: string | null
  lastArrivedAmount: number | null
  variancePercent: number | null
  lateDays: number | null
  /** The outcome of the most recent matched period, kept after the watch moved on to the next. */
  lastArrivalOutcome?: 'ARRIVED' | 'ARRIVED_OUT_OF_RANGE' | null
  lastArrivedBillId?: string | null
}

/** A span of periods the watch skipped instead of replaying (after a pause, or a past start). */
export type NotWatchedDto = {
  from: string
  to: string
  periods: number
  reason: 'WATCHING_FROM_PAST' | 'RESUMED' | 'DAILY_RUN_CATCH_UP'
  recordedAt: string
}

export type RecurringBillDto = {
  id: string
  supplierId: string | null
  supplierName: string
  description: string
  currencyCode: string
  totalIncludingVat: number
  vatAmount: number | null
  paymentTermsDays: number
  interval: RecurrenceInterval
  nextRunDate: string | null
  endDate: string | null
  remainingOccurrences: number | null
  active: boolean
  lastRunDate: string | null
  mode: RecurringMode
  category: string | null
  theirReference: string | null
  arrivesAroundDay: number | null
  paymentDueDay: number | null
  tolerancePercent: number | null
  lateAfterDays: number | null
  autoApproveWithinRange: boolean
  notifyUserId: string | null
  watchingFrom: string | null
  lastVariancePercent: number | null
  expectation: ExpectationDto | null
  /**
   * The schedule's VAT category (S5, Z0, E0, O0). Null on a row saved before the server kept it,
   * when the treatment is inferred from `vatAmount`.
   */
  taxCategoryCode?: string | null
  /** `active` is false for a paused and for an ended instruction alike; this tells them apart. */
  status?: RecurringStatus
  ended?: boolean
  /** The date an ended instruction ended; null unless ended. */
  endedOn?: string | null
  /** When it was paused; null on an active row and on one paused before the server kept it. */
  pausedAt?: string | null
  pauseReason?: PauseReason | null
  /** Whether an amount outside the range is flagged. The percentage is kept while this is off. */
  toleranceEnabled?: boolean
  /** The named person's display name. On a single instruction only; null on list rows. */
  notifyUserName?: string | null
  /** Newest first. On a single instruction only; null on list rows. */
  notWatched?: NotWatchedDto[] | null
}

/** `count` is the rows on this page, never a total: a full page means there may be more. */
export type RecurringBillPageDto = {
  items: RecurringBillDto[]
  page: number
  pageSize: number
  count: number
}

export type RecurringSummaryDto = {
  expectedMonthly: number
  currencyCode: string
  recurringCount: number
  activeCount: number
  lateCount: number
  /** The server's own English prose, or null when nothing is late. */
  lateDescription: string | null
  arrivingNext: string | null
  arrivingNextDescription: string | null
  /** Not active and not ended. */
  pausedCount?: number
  endedCount?: number
}

export type RecurringRunDto = {
  id: string
  runDate: string
  periodStart: string | null
  periodEnd: string | null
  billId: string | null
  outcome: RunOutcome
  failureReason: string | null
  expectedOn: string | null
  variancePercent: number | null
  /** The matched (or raised) bill, as stored on the bill itself. */
  billNumber?: string | null
  billIssueDate?: string | null
  billAmount?: number | null
  billCurrency?: string | null
  /** The date the bill was settled in full; null while anything is still owed. */
  paidOn?: string | null
  /** The bill arrived inside the range and the instruction marks such bills as expected. */
  markedAsExpected?: boolean
  receivedManually?: boolean
}

export type RecurringBillRequestDto = {
  supplierId: string | null
  supplierName: string
  description: string
  currencyCode: string
  totalIncludingVat: number
  vatAmount: number | null
  paymentTermsDays: number | null
  interval: RecurrenceInterval
  startDate: string | null
  endDate: string | null
  occurrences: number | null
  mode: RecurringMode
  category: string | null
  theirReference: string | null
  arrivesAroundDay: number | null
  paymentDueDay: number | null
  tolerancePercent: number | null
  lateAfterDays: number | null
  autoApproveWithinRange: boolean | null
  notifyUserId: string | null
  watchingFrom: string | null
  /** S5, Z0, E0 or O0, from the VAT treatment picked. */
  taxCategoryCode?: string | null
  /** False: an amount outside the range is not flagged at all. The percentage is kept either way. */
  toleranceEnabled?: boolean | null
}

export const RECURRING_PAGE_SIZE = 50

export function recurringListPath(
  state: RecurringListState,
  page: number,
  pageSize = RECURRING_PAGE_SIZE,
) {
  return withQuery('/v1/recurring-bills', { state, page, page_size: pageSize })
}

export function loadRecurringPage(path: string): Promise<RecurringBillPageDto> {
  return apiRequest<RecurringBillPageDto>(path)
}

export function recurringSummaryPath(currency = 'OMR') {
  return withQuery('/v1/recurring-bills/summary', { currency })
}

export function loadRecurringSummary(path: string): Promise<RecurringSummaryDto> {
  return apiRequest<RecurringSummaryDto>(path)
}

export function recurringBillPath(id: string) {
  return `/v1/recurring-bills/${encodeURIComponent(id)}`
}

export function loadRecurringBill(id: string): Promise<RecurringBillDto> {
  return apiRequest<RecurringBillDto>(recurringBillPath(id))
}

export function recurringRunsPath(id: string, limit = 24) {
  return withQuery(`${recurringBillPath(id)}/runs`, { limit })
}

export function loadRecurringRuns(path: string): Promise<RecurringRunDto[]> {
  return apiRequest<RecurringRunDto[]>(path)
}

export function createRecurringBill(request: RecurringBillRequestDto): Promise<RecurringBillDto> {
  return apiRequest<RecurringBillDto>('/v1/recurring-bills', { method: 'POST', body: request })
}

export function updateRecurringBill(
  id: string,
  request: RecurringBillRequestDto,
): Promise<RecurringBillDto> {
  return apiRequest<RecurringBillDto>(recurringBillPath(id), { method: 'PUT', body: request })
}

/** `pause` and `resume` answer the watch; `chase` tells whoever is named, never the supplier. */
export function setRecurringActive(id: string, active: boolean): Promise<RecurringBillDto> {
  return apiRequest<RecurringBillDto>(`${recurringBillPath(id)}/${active ? 'resume' : 'pause'}`, {
    method: 'POST',
    body: {},
  })
}

/** Who the chase reaches. `told` is false when nobody is named, they have left, or sending is off. */
export type RecurringChaseDto = {
  recurringBillId: string
  notifyUserId: string | null
  expectedOn: string | null
  told?: boolean
  toldNames?: string[]
  notToldReason?: 'NOBODY_NAMED' | 'RECIPIENT_UNAVAILABLE' | 'SENDING_OFF' | null
}

export function chaseRecurringBill(id: string): Promise<RecurringChaseDto> {
  return apiRequest<RecurringChaseDto>(`${recurringBillPath(id)}/chase`, {
    method: 'POST',
    body: {},
  })
}

/**
 * The people a recurring bill can tell: names only, readable by whoever may manage recurring
 * bills (`invoice.payment.manage`). `displayName` is null for someone with no name on file.
 */
export type RecurringRecipientDto = { id: string; displayName: string | null }

export const RECURRING_RECIPIENTS_PATH = '/v1/recurring-bills/recipients'

export function loadRecurringRecipients(): Promise<RecurringRecipientDto[]> {
  return apiRequest<RecurringRecipientDto[]>(RECURRING_RECIPIENTS_PATH)
}

/** One of the supplier's bills that could be a period's arrival. */
export type ReceivableBillDto = {
  billId: string
  billNumber: string | null
  issueDate: string | null
  totalIncludingVat: number | null
  currencyCode: string
  variancePercent: number | null
  inWindow: boolean
}

/** The bills to pick from for the period expected on `expectedOn` (the watched period when null). */
export function receivableBillsPath(id: string, expectedOn: string | null) {
  return withQuery(`${recurringBillPath(id)}/receivable-bills`, { expectedOn: expectedOn ?? undefined })
}

export function loadReceivableBills(path: string): Promise<ReceivableBillDto[]> {
  return apiRequest<ReceivableBillDto[]>(path)
}

/** Says by hand which bill a period's arrival was (`invoice.payment.manage`). */
export function markRecurringReceived(
  id: string,
  billId: string,
  expectedOn: string | null,
): Promise<RecurringBillDto> {
  return apiRequest<RecurringBillDto>(`${recurringBillPath(id)}/mark-received`, {
    method: 'POST',
    body: expectedOn ? { billId, expectedOn } : { billId },
  })
}

/** The history as a CSV (`invoice.export`). */
export function exportRecurringRuns(id: string): Promise<ApiDownload> {
  return apiDownload(`${recurringBillPath(id)}/runs/export.csv`)
}

/** How a supplier's recurring bills stand, for the supplier's own page. */
export type SupplierRecurringStandingDto = {
  supplierId: string
  total: number
  active: number
  paused: number
  pausedBySupplierSwitchOff: number
  ended: number
}

export function supplierRecurringPath(supplierId: string) {
  return `/v1/recurring-bills/by-supplier/${encodeURIComponent(supplierId)}`
}

export function loadSupplierRecurring(supplierId: string): Promise<SupplierRecurringStandingDto> {
  return apiRequest<SupplierRecurringStandingDto>(supplierRecurringPath(supplierId))
}
