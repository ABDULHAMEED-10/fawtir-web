import { apiRequest } from '../client'
import type { DiscountDto, ReferenceDto } from './drafts'

/**
 * Periodic invoices (I-13): a standing instruction that copies one invoice on a schedule.
 *
 * `PeriodicScheduleController`. Reads need `invoice.read`, writes `invoice.draft`. Every route
 * answers a **bare array or one object** — there is no paging, no total, no filter and no search,
 * and no summary endpoint, so a screen sorts and narrows what it was given.
 *
 * Each run raises a **draft**, never an issued invoice: issuing takes a number, sends the document
 * and reports it, so it stays a human click.
 */

export type RecurrenceInterval = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'

/**
 * `DRAFTED` raised a draft; `FAILED` could not; `SKIPPED` was claimed and never completed;
 * `CLAIMED` is being raised right now; `DEAD_LETTERED` gave up after its attempts and waits for a
 * retry (`retryable`).
 */
export type PeriodicRunOutcome = 'DRAFTED' | 'FAILED' | 'SKIPPED' | 'CLAIMED' | 'DEAD_LETTERED'

/**
 * A line of the schedule's own template. The design (154:164555) sets a schedule up
 * from scratch, under the composer's line rules: free-text description, goods or service per line,
 * unit, ex-VAT price, discount, the document's tax category; an HS code on goods lines and a
 * service type on service lines (docs/backend-guides/INCOME.md (part C)). Same shape as a draft line.
 */
export type PeriodicTemplateLineDto = {
  lineNumber: number
  description: string
  itemType: 'GOODS' | 'SERVICE'
  unitCode: string
  quantity: number
  /** Always exclusive of VAT, as a draft line is. */
  unitPrice: number
  discount: DiscountDto
  taxCategory: {
    code: string
    en16931Category: string
    rate: number
    exemptionReason: string | null
    /** IBT-121 for a zero-rated (VATZR-OM-nn) or exempt (VATEX-OM-nn) line. */
    exemptionReasonCode?: string | null
  }
  hsCode: string | null
  serviceType: string | null
}

/**
 * What a schedule sends, carried by the schedule itself rather than borrowed from an invoice. Sent
 * on create and update, which the API accepts, and read back on the schedule when present.
 */
export type PeriodicTemplateDto = {
  branchId: string
  currency: string
  vatMode: 'EXCLUSIVE' | 'INCLUSIVE'
  /** The document's tax category, printed on every line (the composer never chooses one per line). */
  taxCategoryCode: string
  /** The document's reason code when its category is zero-rated or exempt. */
  exemptionReasonCode?: string | null
  /** The written reason of a reverse-charge, export or out-of-scope document. */
  exemptionReason?: string | null
  details: {
    subject: string | null
    purchaseOrderReference: string | null
    paymentTerms: ReferenceDto | null
    customerVisibleNote: string | null
    internalNote: string | null
  }
  lines: PeriodicTemplateLineDto[]
}

export type PeriodicScheduleDto = {
  id: string
  customerId: string
  /** The invoice each run copies, when the schedule was set up from one. */
  templateInvoiceId: string | null
  /** The schedule's own template (see `PeriodicTemplateDto`). */
  template?: PeriodicTemplateDto | null
  interval: RecurrenceInterval
  /**
   * Derived from the interval, so it is shown and never chosen: monthly is a summary invoice,
   * weekly and longer are continuous supply (IBR-036-OM keeps a summary within one month).
   */
  transactionSubtype: 'SUMMARY' | 'CONTINUOUS_SUPPLY'
  nextRunDate: string
  endDate: string | null
  remainingOccurrences: number | null
  active: boolean
  /**
   * TODO(backend): the design's "Send automatically" switch — each run issues and delivers over
   * Peppol. The API accepts it on create and update and ignores it; nothing is stored.
   */
  autoIssue?: boolean
  /** TODO(backend): the design's "Notify me on each run" switch. Accepted and ignored, as `autoIssue`. */
  notifyOnRun?: boolean
  /** How many invoices the schedule raised, and when it last ran (the list's "Generated" column). */
  runCount?: number
  lastRunDate?: string | null
  /** When the schedule was set up (the design's "Started"). */
  createdAt?: string
  /**
   * The anchor day (1 to 31) of a monthly, quarterly or yearly series: each run lands on it, or on
   * the last day of a shorter month. Null or absent on a weekly series and on older servers.
   */
  dayOfMonth?: number | null
  /**
   * Why Fawtir paused the schedule: `PLAN_FEATURE_NOT_INCLUDED` when the company moved to a plan
   * without periodic invoices; it is resumed by hand once the plan includes them. Null when active,
   * paused by hand, on the answer to a write, and absent on older servers.
   */
  pauseReason?: PeriodicPauseReason | null
}

export type PeriodicPauseReason = 'PLAN_FEATURE_NOT_INCLUDED'

export type PeriodicRunDto = {
  runDate: string
  periodStart: string | null
  periodEnd: string | null
  outcome: PeriodicRunOutcome
  draftInvoiceId: string | null
  /** A prebuilt API link; the page routes by the id instead. */
  draftInvoice: string | null
  failureReason: string | null
  /** The refusal code behind a failed or dead-lettered run. */
  failureCode?: string | null
  attemptCount?: number
  deadLetteredAt?: string | null
  /** Only a `DEAD_LETTERED` run can be retried. */
  retryable?: boolean
  createdAt: string
  /**
   * The raised document's number and amount. TODO(backend): its delivery and payment, as the
   * design's run row shows them.
   */
  invoiceNumber?: string | null
  totalAmount?: number | null
  deliveryState?: string | null
  paymentState?: 'NOT_APPLICABLE' | 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | null
}

export type CreatePeriodicScheduleDto = {
  customerId: string
  /**
   * The invoice copied as a pre-fill, when there was one; null for a schedule set up from scratch,
   * whose content travels in `template`.
   */
  templateInvoiceId: string | null
  template?: PeriodicTemplateDto
  interval: RecurrenceInterval
  firstRunDate: string
  endDate: string | null
  occurrences: number | null
  /** TODO(backend): accepted and ignored; nothing acts on it yet. */
  autoIssue?: boolean
  /** TODO(backend): accepted and ignored; nothing acts on it yet. */
  notifyOnRun?: boolean
}

export type UpdatePeriodicScheduleDto = {
  interval: RecurrenceInterval
  nextRunDate: string
  endDate: string | null
  occurrences: number | null
  /** The design lets the customer and the content change on an existing schedule. */
  customerId?: string
  template?: PeriodicTemplateDto
  /** TODO(backend): accepted and ignored; nothing acts on it yet. */
  autoIssue?: boolean
  /** TODO(backend): accepted and ignored; nothing acts on it yet. */
  notifyOnRun?: boolean
}

export const PERIODIC_SCHEDULES_PATH = '/v1/periodic-invoice-schedules'

export function periodicSchedulePath(id: string) {
  return `${PERIODIC_SCHEDULES_PATH}/${encodeURIComponent(id)}`
}

export function loadPeriodicSchedules(): Promise<PeriodicScheduleDto[]> {
  return apiRequest<PeriodicScheduleDto[]>(PERIODIC_SCHEDULES_PATH)
}

export function loadPeriodicSchedule(id: string): Promise<PeriodicScheduleDto> {
  return apiRequest<PeriodicScheduleDto>(periodicSchedulePath(id))
}

export function periodicRunsPath(id: string) {
  return `${periodicSchedulePath(id)}/runs`
}

export function loadPeriodicRuns(path: string): Promise<PeriodicRunDto[]> {
  return apiRequest<PeriodicRunDto[]>(path)
}

export function createPeriodicSchedule(
  body: CreatePeriodicScheduleDto,
): Promise<PeriodicScheduleDto> {
  return apiRequest<PeriodicScheduleDto>(PERIODIC_SCHEDULES_PATH, { method: 'POST', body })
}

export function updatePeriodicSchedule(
  id: string,
  body: UpdatePeriodicScheduleDto,
): Promise<PeriodicScheduleDto> {
  return apiRequest<PeriodicScheduleDto>(periodicSchedulePath(id), { method: 'PUT', body })
}

/** Pause stops a schedule and resume starts it again; delete (below) removes it for good. */
export function setPeriodicActive(id: string, active: boolean): Promise<PeriodicScheduleDto> {
  return apiRequest<PeriodicScheduleDto>(
    `${periodicSchedulePath(id)}/${active ? 'resume' : 'pause'}`,
    { method: 'POST', body: {} },
  )
}

/**
 * "Generate invoice": raises the schedule's next run now, as a draft, and moves the schedule on
 * one interval. The run can still come back `FAILED` or `DEAD_LETTERED` when drafting was refused.
 */
export function runPeriodicNow(id: string): Promise<PeriodicRunDto> {
  return apiRequest<PeriodicRunDto>(periodicRunsPath(id), { method: 'POST', body: {} })
}

/**
 * Removes a schedule from the list. The runs and the drafts it raised are kept. Refused while a
 * run is in progress or waiting to be retried (`PERIODIC_SCHEDULE_HAS_OPEN_RUN`).
 */
export function deletePeriodicSchedule(id: string): Promise<void> {
  return apiRequest<void>(periodicSchedulePath(id), { method: 'DELETE' })
}
