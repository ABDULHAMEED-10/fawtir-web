import type { ReminderLogDto, ReminderOutcome, ReminderScheduleDto, ReminderVerdict } from '../api/invoices/reminders'

/**
 * Payment reminders (I-14, decisions of 2026-09-18).
 *
 * The settings are two fields: a ladder of signed day offsets and a switch. Everything the design
 * draws around them — tones, per-step templates, final-notice approval, stop conditions, a send
 * hour — has nothing behind it, so none of it is modelled here.
 */

/** At most ten rungs, each within a year of the due date. Both are the server's own limits. */
export const MAX_RUNGS = 10
export const MAX_OFFSET_DAYS = 365

/** What a new tenant is offered: the server's own `ReminderSchedule.standard()`. */
export const SUGGESTED_OFFSETS = [-3, 0, 7, 14]

export const REMINDER_OUTCOMES: ReminderOutcome[] = ['SENT', 'FAILED', 'SKIPPED']

export type ReminderTabId = 'ALL' | ReminderOutcome

export const REMINDER_TABS: ReminderTabId[] = ['ALL', 'SENT', 'FAILED', 'SKIPPED']

/** How one rung reads in words. The sign is the whole meaning, so it is never shown raw. */
export function rungNote(days: number): { key: string; values?: Record<string, number> } {
  if (days === 0) return { key: 'paymentReminders.rung.onDueDate' }
  if (days < 0) return { key: 'paymentReminders.rung.before', values: { count: Math.abs(days) } }
  return { key: 'paymentReminders.rung.after', values: { count: days } }
}

export type RungProblem = 'notWhole' | 'outOfRange' | 'duplicate'

/**
 * What the server would refuse, checked here first.
 *
 * Not belt and braces: `PUT /payment-reminders/schedule` answers **500** for its own domain
 * refusals today, because its controller is missing from the invoice exception handler. Until that
 * is fixed the page is the only thing that can tell someone their rung is out of range, so these
 * checks are load-bearing rather than a nicety.
 */
export function rungProblem(value: string, others: number[]): RungProblem | null {
  const days = Number(value)
  if (value.trim() === '' || !Number.isInteger(days)) return 'notWhole'
  if (Math.abs(days) > MAX_OFFSET_DAYS) return 'outOfRange'
  if (others.includes(days)) return 'duplicate'
  return null
}

export type ScheduleProblem = 'tooMany' | 'emptyWhileOn' | null

export function scheduleProblem(offsets: number[], enabled: boolean): ScheduleProblem {
  if (offsets.length > MAX_RUNGS) return 'tooMany'
  // The server refuses an enabled ladder with no rungs and says to disable it instead, which is
  // the clearer instruction to pass on rather than inventing one.
  if (enabled && offsets.length === 0) return 'emptyWhileOn'
  return null
}

/** The server deduplicates and sorts; doing the same here keeps the page honest before it saves. */
export function normaliseOffsets(offsets: number[]): number[] {
  return [...new Set(offsets)].sort((a, b) => a - b)
}

export function scheduleChanged(saved: ReminderScheduleDto, offsets: number[], enabled: boolean): boolean {
  if (saved.enabled !== enabled) return true
  const next = normaliseOffsets(offsets)
  const previous = normaliseOffsets(saved.offsets)
  return next.length !== previous.length || next.some((value, index) => value !== previous[index])
}

/**
 * The page holds one page of rows and the API sends no total, so "there is more" can only be
 * inferred from a full page. Said plainly on the page rather than drawn as a page count.
 */
export function hasMorePages(rows: ReminderLogDto[], pageSize: number): boolean {
  return rows.length === pageSize
}

export function inTab(row: ReminderLogDto, tab: ReminderTabId): boolean {
  return tab === 'ALL' || row.outcome === tab
}

export const OUTCOME_TONE: Record<ReminderOutcome, 'ok' | 'warn' | 'muted'> = {
  SENT: 'ok',
  FAILED: 'warn',
  SKIPPED: 'muted',
}

/**
 * What a row says happened.
 *
 * A `SKIPPED` row gets no reason because the server stores none — only that the rung was spent. An
 * invented explanation would be worse than the silence.
 */
export function outcomeNote(row: ReminderLogDto): { key: string; values?: Record<string, string> } {
  if (row.outcome === 'FAILED') {
    return row.failureReason
      ? { key: 'paymentReminders.log.failedWithReason', values: { reason: row.failureReason } }
      : { key: 'paymentReminders.log.failed' }
  }
  if (row.outcome === 'SKIPPED') return { key: 'paymentReminders.log.skipped' }
  return { key: 'paymentReminders.log.sent' }
}

/** The eight verdicts, each said in the page's own words. */
export const VERDICT_NOTE: Record<ReminderVerdict, string> = {
  SEND: 'paymentReminders.verdict.send',
  TENANT_DISABLED: 'paymentReminders.verdict.tenantDisabled',
  CUSTOMER_OPTED_OUT: 'paymentReminders.verdict.customerOptedOut',
  NOT_ISSUED: 'paymentReminders.verdict.notIssued',
  SETTLED: 'paymentReminders.verdict.settled',
  NO_RUNG_TODAY: 'paymentReminders.verdict.noRungToday',
  ALREADY_SENT: 'paymentReminders.verdict.alreadySent',
  NO_RECIPIENT: 'paymentReminders.verdict.noRecipient',
}

/** The server's refusals when sending by hand, in the page's words. */
export const REMINDER_REFUSALS: Record<string, string> = {
  REMINDER_NOT_SENDABLE: 'paymentReminders.error.notSendable',
  REMINDER_ALREADY_SENT: 'paymentReminders.error.alreadySent',
  REMINDER_DELIVERY_UNAVAILABLE: 'paymentReminders.error.deliveryUnavailable',
  REMINDER_SEND_FAILED: 'paymentReminders.error.sendFailed',
}

/** A date range the server would refuse (`from` after `to`) is refused here first. */
export function rangeProblem(from: string, to: string): boolean {
  return Boolean(from && to && from > to)
}
