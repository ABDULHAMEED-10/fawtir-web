import { apiRequest } from '../client'

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

/** `DRAFTED` raised a draft; `FAILED` could not; `SKIPPED` was claimed and never completed. */
export type PeriodicRunOutcome = 'DRAFTED' | 'FAILED' | 'SKIPPED'

export type PeriodicScheduleDto = {
  id: string
  customerId: string
  /** The invoice each run copies. Fixed at creation, as is the customer. */
  templateInvoiceId: string | null
  interval: RecurrenceInterval
  /** Derived from the interval (IBR-036-OM), so it is shown and never chosen. */
  transactionSubtype: 'SUMMARY' | 'CONTINUOUS_SUPPLY'
  nextRunDate: string
  endDate: string | null
  remainingOccurrences: number | null
  active: boolean
}

export type PeriodicRunDto = {
  runDate: string
  periodStart: string | null
  periodEnd: string | null
  outcome: PeriodicRunOutcome
  draftInvoiceId: string | null
  /** A prebuilt API link; the page routes by the id instead. */
  draftInvoice: string | null
  failureReason: string | null
  createdAt: string
}

export type CreatePeriodicScheduleDto = {
  customerId: string
  templateInvoiceId: string
  interval: RecurrenceInterval
  firstRunDate: string
  endDate: string | null
  occurrences: number | null
}

export type UpdatePeriodicScheduleDto = {
  interval: RecurrenceInterval
  nextRunDate: string
  endDate: string | null
  occurrences: number | null
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

export function createPeriodicSchedule(body: CreatePeriodicScheduleDto): Promise<PeriodicScheduleDto> {
  return apiRequest<PeriodicScheduleDto>(PERIODIC_SCHEDULES_PATH, { method: 'POST', body })
}

export function updatePeriodicSchedule(id: string, body: UpdatePeriodicScheduleDto): Promise<PeriodicScheduleDto> {
  return apiRequest<PeriodicScheduleDto>(periodicSchedulePath(id), { method: 'PUT', body })
}

/** Pause is the only stop: there is no cancel and no delete, and the run log forbids removal. */
export function setPeriodicActive(id: string, active: boolean): Promise<PeriodicScheduleDto> {
  return apiRequest<PeriodicScheduleDto>(`${periodicSchedulePath(id)}/${active ? 'resume' : 'pause'}`, { method: 'POST', body: {} })
}
