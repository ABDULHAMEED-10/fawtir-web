import type {
  PeriodicRunDto,
  PeriodicScheduleDto,
  RecurrenceInterval,
} from '../api/invoices/periodic'

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

export const PERIODIC_INTERVALS: RecurrenceInterval[] = [
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'ANNUALLY',
]

/**
 * The design's five tabs. `onRequest` and `draft` are states the API has no schedule for yet — a
 * schedule is always on a cadence and always activated — so they stay empty until it does.
 * TODO(backend): an on-request schedule (no cadence, run by hand) and a draft (not yet activated).
 */
export type PeriodicTabId = 'all' | 'active' | 'onRequest' | 'paused' | 'draft'

export const PERIODIC_TABS: PeriodicTabId[] = ['all', 'active', 'onRequest', 'paused', 'draft']

/** What the status pill says. `finished` is an active series with no runs left. */
export type PeriodicStatus = 'active' | 'paused' | 'finished' | 'onRequest' | 'draft'

export function scheduleStatus(schedule: PeriodicScheduleDto): PeriodicStatus {
  if (!schedule.active) return 'paused'
  if (schedule.remainingOccurrences === 0) return 'finished'
  return 'active'
}

export function inTab(schedule: PeriodicScheduleDto, tab: PeriodicTabId): boolean {
  if (tab === 'all') return true
  const status = scheduleStatus(schedule)
  if (tab === 'active') return status === 'active'
  if (tab === 'paused') return status === 'paused'
  return status === tab
}

export function countTab(schedules: PeriodicScheduleDto[], tab: PeriodicTabId): number {
  return schedules.filter((schedule) => inTab(schedule, tab)).length
}

/** What the list knows about the invoice a schedule copies, read once from the invoices list. */
export type TemplateInfo = {
  number: string | null
  subject: string | null
  reference: string | null
  /** Null while the template is a draft: a draft is priced only when issued. */
  total: number | null
  currency: string
}

/** The name a schedule goes by: the template's subject, else the customer. */
export function scheduleName(
  template: TemplateInfo | undefined,
  customerName: string | undefined,
): string | undefined {
  return template?.subject?.trim() || customerName
}

/** How much a schedule is worth per month, for the "recurring revenue" figure. */
export function monthlyEquivalent(total: number, interval: RecurrenceInterval): number {
  switch (interval) {
    case 'WEEKLY':
      return (total * 52) / 12
    case 'MONTHLY':
      return total
    case 'QUARTERLY':
      return total / 3
    case 'ANNUALLY':
      return total / 12
  }
}

/** The run after `date` on the cadence, as the server steps it (calendar months, same day). */
export function addInterval(date: string, interval: RecurrenceInterval): string {
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d))
  if (interval === 'WEEKLY') next.setUTCDate(next.getUTCDate() + 7)
  else if (interval === 'MONTHLY') next.setUTCMonth(next.getUTCMonth() + 1)
  else if (interval === 'QUARTERLY') next.setUTCMonth(next.getUTCMonth() + 3)
  else next.setUTCFullYear(next.getUTCFullYear() + 1)
  return next.toISOString().slice(0, 10)
}

/** The next few run dates, stopping at the end date or the runs left. */
export function upcomingRuns(schedule: PeriodicScheduleDto, count: number): string[] {
  if (!schedule.active) return []
  const dates: string[] = []
  let date = schedule.nextRunDate
  const limit =
    schedule.remainingOccurrences === null ? count : Math.min(count, schedule.remainingOccurrences)
  while (dates.length < limit) {
    if (schedule.endDate && date > schedule.endDate) break
    dates.push(date)
    date = addInterval(date, schedule.interval)
  }
  return dates
}

export type CadenceNote = { key: string; values?: Record<string, string | number> }

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

/** "on the 18th" / "every Saturday": the cadence's second line, worked out from the next run. */
export function cadenceNote(
  schedule: Pick<PeriodicScheduleDto, 'interval' | 'nextRunDate'>,
): CadenceNote {
  const [y, m, d] = schedule.nextRunDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (schedule.interval === 'WEEKLY')
    return { key: 'periodicList.cadence.weekly', values: { weekday: WEEKDAYS[date.getUTCDay()] } }
  if (schedule.interval === 'ANNUALLY')
    return { key: 'periodicList.cadence.yearly', values: { date: schedule.nextRunDate } }
  return {
    key:
      schedule.interval === 'MONTHLY'
        ? 'periodicList.cadence.monthly'
        : 'periodicList.cadence.quarterly',
    values: { count: d },
  }
}

export type PeriodicSortId = 'nextSoonest' | 'name' | 'amountHighest'

export const PERIODIC_SORTS: PeriodicSortId[] = ['nextSoonest', 'name', 'amountHighest']

export function sortSchedules(
  schedules: PeriodicScheduleDto[],
  sort: PeriodicSortId,
  nameOf: (schedule: PeriodicScheduleDto) => string,
  amountOf: (schedule: PeriodicScheduleDto) => number,
): PeriodicScheduleDto[] {
  const rows = [...schedules]
  if (sort === 'name') rows.sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
  else if (sort === 'amountHighest') rows.sort((a, b) => amountOf(b) - amountOf(a))
  else rows.sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate))
  return rows
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
    // A run whose date passed without a draft: with the paused ones, what a person should look at.
    overdue: active.filter(
      (schedule) =>
        schedule.remainingOccurrences !== 0 && daysBetween(today, schedule.nextRunDate) < 0,
    ).length,
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

export function scheduleTone(
  schedule: PeriodicScheduleDto,
  today: string,
): 'warn' | 'ok' | 'muted' {
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
  templateOf: (schedule: PeriodicScheduleDto) => TemplateInfo | undefined = () => undefined,
  interval: RecurrenceInterval | null = null,
): PeriodicScheduleDto[] {
  const text = search.trim().toLowerCase()
  return schedules.filter((schedule) => {
    if (!inTab(schedule, tab)) return false
    if (interval && schedule.interval !== interval) return false
    if (!text) return true
    const template = templateOf(schedule)
    return [
      nameOf(schedule.customerId) ?? schedule.customerId,
      template?.subject,
      template?.reference,
      template?.number,
    ]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(text))
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

/** The design's "Ends" choice: the two API fields, read as one decision. */
export type PeriodicEnding = 'never' | 'date' | 'count'

export function endingOf(form: Pick<PeriodicForm, 'endDate' | 'occurrences'>): PeriodicEnding {
  if (form.endDate) return 'date'
  if (form.occurrences.trim()) return 'count'
  return 'never'
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

export function formOfSchedule(
  schedule: PeriodicScheduleDto,
  customerName: string,
  templateLabel: string,
): PeriodicForm {
  return {
    customerId: schedule.customerId,
    customerName,
    templateInvoiceId: schedule.templateInvoiceId ?? '',
    templateLabel,
    interval: schedule.interval,
    firstRunDate: schedule.nextRunDate,
    endDate: schedule.endDate ?? '',
    occurrences:
      schedule.remainingOccurrences === null ? '' : String(schedule.remainingOccurrences),
  }
}

export type PeriodicField = keyof PeriodicForm

/**
 * What the server would refuse, said first. `firstRunDate` is `@FutureOrPresent` on both routes, so
 * a date already past is refused — which matters most when editing a schedule whose run has lapsed.
 */
export function periodicProblems(
  form: PeriodicForm,
  today: string,
  editing: boolean,
): Partial<Record<PeriodicField, string>> {
  const problems: Partial<Record<PeriodicField, string>> = {}
  if (!editing && !form.customerId) problems.customerId = 'periodicInvoice.error.customerRequired'
  if (!editing && !form.templateInvoiceId)
    problems.templateInvoiceId = 'periodicInvoice.error.templateRequired'
  if (!form.firstRunDate) problems.firstRunDate = 'periodicInvoice.error.dateRequired'
  else if (form.firstRunDate < today) problems.firstRunDate = 'periodicInvoice.error.datePast'
  if (form.endDate && form.firstRunDate && form.endDate < form.firstRunDate)
    problems.endDate = 'periodicInvoice.error.endBeforeStart'
  if (form.occurrences.trim()) {
    const count = Number(form.occurrences)
    if (!Number.isInteger(count) || count < (editing ? 0 : 1))
      problems.occurrences = 'periodicInvoice.error.occurrences'
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
