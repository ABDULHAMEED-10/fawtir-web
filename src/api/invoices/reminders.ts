import { apiRequest } from '../client'
import { withQuery } from '../query'

/**
 * Payment reminders (I-14): the e-mails chasing an unpaid invoice.
 *
 * `ReminderScheduleController` (the ladder) and `ReminderOperationsController` (everything else).
 * The ladder needs `admin.settings.manage` to **read as well as write**; the history and preview
 * need `invoice.read`; sending one needs `invoice.payment.manage`.
 *
 * Two things shape every screen here:
 *
 * 1. **The log is a past-tense ledger, not a queue.** It answers a bare array with no total and no
 *    "has more", and there is no upcoming-sends endpoint at all. Nothing can say what is due to go
 *    out tomorrow; `preview` answers only what would happen **today**, for one invoice.
 * 2. **A rung is spent once, for ever.** The server holds `UNIQUE (invoice_id, days_from_due)`,
 *    and there is no retry and no way to un-spend one.
 */

/** Signed days from the due date: negative is before, 0 is on the day, positive is after. */
export type ReminderOffset = number

export type ReminderScheduleDto = {
  offsets: ReminderOffset[]
  enabled: boolean
}

export type ReminderOutcome = 'SENT' | 'FAILED' | 'SKIPPED'

/**
 * One fired rung. It carries no id, no customer, no amount and no due date — and for a `SKIPPED`
 * row, no reason: the server records that the rung was spent, deliberately not the verdict.
 */
export type ReminderLogDto = {
  invoiceId: string
  invoiceNumber: string
  daysFromDue: number
  firedOn: string
  recipient: string
  locale: string
  outcome: ReminderOutcome
  failureReason: string | null
  createdAt: string
}

/** Why a reminder would not go out. `SEND` is the only one that would. */
export type ReminderVerdict =
  | 'SEND'
  | 'TENANT_DISABLED'
  | 'CUSTOMER_OPTED_OUT'
  | 'NOT_ISSUED'
  | 'SETTLED'
  | 'NO_RUNG_TODAY'
  | 'ALREADY_SENT'
  | 'NO_RECIPIENT'

/** The real message, not a template: `subject` and `body` are what the server would actually send. */
export type ReminderPreviewDto = {
  invoiceId: string
  invoiceNumber: string
  verdict: ReminderVerdict
  rung: number | null
  recipient: string | null
  language: string | null
  subject: string | null
  body: string | null
}

export const REMINDER_SCHEDULE_PATH = '/v1/payment-reminders/schedule'
export const REMINDER_LOG_PATH = '/v1/payment-reminders/log'

export function loadReminderSchedule(): Promise<ReminderScheduleDto> {
  return apiRequest<ReminderScheduleDto>(REMINDER_SCHEDULE_PATH)
}

/** The server deduplicates and sorts the rungs, so the answer is read back rather than assumed. */
export function saveReminderSchedule(body: ReminderScheduleDto): Promise<ReminderScheduleDto> {
  return apiRequest<ReminderScheduleDto>(REMINDER_SCHEDULE_PATH, { method: 'PUT', body })
}

export type ReminderLogFilter = {
  invoiceId?: string | null
  from?: string | null
  to?: string | null
  outcome?: ReminderOutcome | null
  page: number
  pageSize: number
}

export function reminderLogPath(filter: ReminderLogFilter): string {
  return withQuery(REMINDER_LOG_PATH, {
    invoice_id: filter.invoiceId ?? undefined,
    from: filter.from ?? undefined,
    to: filter.to ?? undefined,
    outcome: filter.outcome ?? undefined,
    page: filter.page,
    page_size: filter.pageSize,
  })
}

export function loadReminderLog(path: string): Promise<ReminderLogDto[]> {
  return apiRequest<ReminderLogDto[]>(path)
}

/** One invoice's history. The route takes no paging and stops at 100 rows. */
export function invoiceRemindersPath(invoiceId: string): string {
  return `/v1/authored-invoices/${encodeURIComponent(invoiceId)}/reminders`
}

export function loadInvoiceReminders(path: string): Promise<ReminderLogDto[]> {
  return apiRequest<ReminderLogDto[]>(path)
}

export function reminderPreviewPath(invoiceId: string, daysFromDue?: number | null): string {
  return withQuery(`${invoiceRemindersPath(invoiceId)}/preview`, {
    days_from_due: daysFromDue ?? undefined,
  })
}

export function loadReminderPreview(path: string): Promise<ReminderPreviewDto> {
  return apiRequest<ReminderPreviewDto>(path)
}

/**
 * Send one now. `daysFromDue` names the rung to spend; omitted, the server works out today's.
 *
 * Bypasses the two schedule refusals — a person is deciding — but not the invoice's own. Answers
 * 503 `REMINDER_DELIVERY_UNAVAILABLE` wherever mail delivery is switched off.
 */
export function sendReminderNow(invoiceId: string, daysFromDue: number | null): Promise<ReminderPreviewDto> {
  return apiRequest<ReminderPreviewDto>(`${invoiceRemindersPath(invoiceId)}/send`, {
    method: 'POST',
    body: daysFromDue === null ? {} : { daysFromDue },
  })
}
