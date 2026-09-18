import { apiRequest } from '../client'
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
export type ExpectationState = 'DUE_TO_ARRIVE' | 'ARRIVED' | 'ARRIVED_OUT_OF_RANGE' | 'LATE'
export type RunOutcome = 'RAISED' | 'FAILED' | 'SKIPPED' | 'EXPECTED' | 'ARRIVED' | 'ARRIVED_OUT_OF_RANGE' | 'LATE'

/** What the watch is saying today. Computed on read; `null` for a RAISE watch. */
export type ExpectationDto = {
  state: ExpectationState
  expectedOn: string | null
  lastArrivedOn: string | null
  lastArrivedAmount: number | null
  variancePercent: number | null
  lateDays: number | null
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
}

export const RECURRING_PAGE_SIZE = 50

export function recurringListPath(state: RecurringListState, page: number, pageSize = RECURRING_PAGE_SIZE) {
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

export function updateRecurringBill(id: string, request: RecurringBillRequestDto): Promise<RecurringBillDto> {
  return apiRequest<RecurringBillDto>(recurringBillPath(id), { method: 'PUT', body: request })
}

/** `pause` and `resume` answer the watch; `chase` tells whoever is named, never the supplier. */
export function setRecurringActive(id: string, active: boolean): Promise<RecurringBillDto> {
  return apiRequest<RecurringBillDto>(`${recurringBillPath(id)}/${active ? 'resume' : 'pause'}`, { method: 'POST', body: {} })
}

export function chaseRecurringBill(id: string): Promise<{ recurringBillId: string; notifyUserId: string | null; expectedOn: string | null }> {
  return apiRequest<{ recurringBillId: string; notifyUserId: string | null; expectedOn: string | null }>(`${recurringBillPath(id)}/chase`, {
    method: 'POST',
    body: {},
  })
}
