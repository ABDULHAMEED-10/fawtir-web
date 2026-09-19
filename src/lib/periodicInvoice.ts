import type { PeriodicRunDto, PeriodicScheduleDto, RecurrenceInterval } from '../api/invoices/periodic'

/**
 * Periodic invoices (I-13, decisions of 2026-09-18).
 *
 * A schedule is a standing instruction that copies **one existing invoice** — its lines, currency
 * and terms all live on that invoice, not on the schedule. So the screens name the template and
 * link to it rather than composing an invoice of their own, which is what the design drew.
 *
 * The API answers bare arrays: no paging, no totals, no filters, no summary. Every figure here is
 * counted from the list in hand, and the page says so instead of implying a server-side view.
 */

export const PERIODIC_INTERVALS: RecurrenceInterval[] = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']

export type PeriodicTabId = 'active' | 'paused' | 'all'

export const PERIODIC_TABS: PeriodicTabId[] = ['active', 'paused', 'all']

export function inTab(schedule: PeriodicScheduleDto, tab: PeriodicTabId): boolean {
  if (tab === 'all') return true
  return tab === 'active' ? schedule.active : !schedule.active
}

/** Days between two ISO dates, ignoring time: both are plain dates in the tenant's own day. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** The three figures the page can count honestly: everything else would need amounts it has not got. */
export function periodicCounts(schedules: PeriodicScheduleDto[], today: string) {
  const active = schedules.filter((schedule) => schedule.active)
  return {
    total: schedules.length,
    active: active.length,
    paused: schedules.length - active.length,
    // A run whose date has already passed is still owed — the sweep fires it on the next pass —
    // so it belongs in "due in 30 days" rather than vanishing from every count on the page.
    dueSoon: active.filter((schedule) => daysBetween(today, schedule.nextRunDate) <= 30).length,
  }
}

export type ScheduleNote = { key: string; values?: Record<string, string | number> }

/** What the row says: paused first, then a finished series, then when the next draft is due. */
export function scheduleNote(schedule: PeriodicScheduleDto, today: string): ScheduleNote {
  if (!schedule.active) return { key: 'periodicList.state.paused' }
  if (schedule.remainingOccurrences === 0) return { key: 'periodicList.state.finished' }
  const days = daysBetween(today, schedule.nextRunDate)
  if (days < 0) return { key: 'periodicList.state.overdue', values: { date: schedule.nextRunDate } }
  if (days === 0) return { key: 'periodicList.state.today' }
  return { key: 'periodicList.state.dueIn', values: { count: days } }
}

export function scheduleTone(schedule: PeriodicScheduleDto, today: string): 'warn' | 'ok' | 'muted' {
  if (!schedule.active || schedule.remainingOccurrences === 0) return 'muted'
  return daysBetween(today, schedule.nextRunDate) < 0 ? 'warn' : 'ok'
}

/** How many drafts a series has actually raised, counted from its runs. */
export function draftedCount(runs: PeriodicRunDto[]): number {
  return runs.filter((run) => run.outcome === 'DRAFTED').length
}

export function narrowSchedules(
  schedules: PeriodicScheduleDto[],
  tab: PeriodicTabId,
  search: string,
  nameOf: (customerId: string) => string | undefined,
): PeriodicScheduleDto[] {
  const text = search.trim().toLowerCase()
  return schedules.filter((schedule) => {
    if (!inTab(schedule, tab)) return false
    if (!text) return true
    return (nameOf(schedule.customerId) ?? schedule.customerId).toLowerCase().includes(text)
  })
}

export type PeriodicForm = {
  customerId: string
  customerName: string
  templateInvoiceId: string
  templateLabel: string
  interval: RecurrenceInterval
  firstRunDate: string
  endDate: string
  occurrences: string
}

export function blankPeriodicForm(today: string): PeriodicForm {
  return {
    customerId: '',
    customerName: '',
    templateInvoiceId: '',
    templateLabel: '',
    interval: 'MONTHLY',
    firstRunDate: today,
    endDate: '',
    occurrences: '',
  }
}

export function formOfSchedule(schedule: PeriodicScheduleDto, customerName: string, templateLabel: string): PeriodicForm {
  return {
    customerId: schedule.customerId,
    customerName,
    templateInvoiceId: schedule.templateInvoiceId ?? '',
    templateLabel,
    interval: schedule.interval,
    firstRunDate: schedule.nextRunDate,
    endDate: schedule.endDate ?? '',
    occurrences: schedule.remainingOccurrences === null ? '' : String(schedule.remainingOccurrences),
  }
}

export type PeriodicField = keyof PeriodicForm

/**
 * What the server would refuse, said first. `firstRunDate` is `@FutureOrPresent` on both routes, so
 * a date already past is refused — which matters most when editing a schedule whose run has lapsed.
 */
export function periodicProblems(form: PeriodicForm, today: string, editing: boolean): Partial<Record<PeriodicField, string>> {
  const problems: Partial<Record<PeriodicField, string>> = {}
  if (!editing && !form.customerId) problems.customerId = 'periodicInvoice.error.customerRequired'
  if (!editing && !form.templateInvoiceId) problems.templateInvoiceId = 'periodicInvoice.error.templateRequired'
  if (!form.firstRunDate) problems.firstRunDate = 'periodicInvoice.error.dateRequired'
  else if (form.firstRunDate < today) problems.firstRunDate = 'periodicInvoice.error.datePast'
  if (form.endDate && form.firstRunDate && form.endDate < form.firstRunDate) problems.endDate = 'periodicInvoice.error.endBeforeStart'
  if (form.occurrences.trim()) {
    const count = Number(form.occurrences)
    if (!Number.isInteger(count) || count < (editing ? 0 : 1)) problems.occurrences = 'periodicInvoice.error.occurrences'
  }
  return problems
}

export function toCreateRequest(form: PeriodicForm) {
  return {
    customerId: form.customerId,
    templateInvoiceId: form.templateInvoiceId,
    interval: form.interval,
    firstRunDate: form.firstRunDate,
    endDate: form.endDate || null,
    occurrences: form.occurrences.trim() ? Number(form.occurrences) : null,
  }
}

export function toUpdateRequest(form: PeriodicForm) {
  return {
    interval: form.interval,
    nextRunDate: form.firstRunDate,
    endDate: form.endDate || null,
    occurrences: form.occurrences.trim() ? Number(form.occurrences) : null,
  }
}

/** The server's refusals, in the page's words. */
export const PERIODIC_REFUSALS: Record<string, string> = {
  PERIODIC_INTERVAL_REQUIRED: 'periodicInvoice.error.intervalRequired',
  PERIODIC_NEXT_RUN_REQUIRED: 'periodicInvoice.error.dateRequired',
  PERIODIC_END_BEFORE_START: 'periodicInvoice.error.endBeforeStart',
  PERIODIC_OCCURRENCES_NEGATIVE: 'periodicInvoice.error.occurrences',
  PERIODIC_SCHEDULE_NOT_FOUND: 'periodicInvoice.error.notFound',
}
