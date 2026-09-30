import type {
  ReminderLogDto,
  ReminderOutcome,
  ReminderScheduleDto,
  ReminderVerdict,
} from '../api/invoices/reminders'

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
 * What the server would refuse, checked here first. `PUT /payment-reminders/schedule` answers 400
 * for the same cases; checking here says which rung is wrong before anything is sent.
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

export function scheduleChanged(
  saved: ReminderScheduleDto,
  offsets: number[],
  enabled: boolean,
): boolean {
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

/**
 * Sending by hand bypasses the two **schedule** verdicts — a person is deciding, so "the ladder is
 * off" and "no rung falls today" are not refusals for them. The invoice's own verdicts stand:
 * a settled, unissued or opted-out invoice, a customer with no address, and a rung already spent
 * are all refused by the server whoever asks.
 */
export function canSendByHand(verdict: ReminderVerdict): boolean {
  return verdict === 'SEND' || verdict === 'NO_RUNG_TODAY' || verdict === 'TENANT_DISABLED'
}

/**
 * The rung a manual send would spend: today's distance from the due date, which is what the server
 * works out for itself when the caller names none. Passing it to **preview** is what makes the real
 * subject and body readable on a day when no rung falls — otherwise the message can never be seen.
 */
export function rungToday(today: string, dueDate: string | null): number | null {
  if (!dueDate) return null
  const days = daysBetween(dueDate, today)
  return Math.max(-MAX_OFFSET_DAYS, Math.min(MAX_OFFSET_DAYS, days))
}

/** Days between two plain dates, ignoring time. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
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

/* ------------------------------------------------------------ the queue (design 159:17137) */

/**
 * The design's reminders page is a **queue**: what is about to go out, per invoice, with a step
 * name and a tone. The API has no queue, but it has everything the queue is made of: the ladder,
 * the unpaid invoices with their due dates, and the log of rungs already spent. So the queue is
 * worked out here, invoice by invoice: the first rung on or after today that has not fired yet.
 * TODO(backend): a queue endpoint would replace this derivation (and add cancel, hold and
 * per-invoice pause, which nothing here can do).
 */

export type ReminderTone = 'polite' | 'direct' | 'firm'

/** The design's step names, by position on the ladder: first, in between, last. */
export function stepOf(
  offsets: number[],
  offset: number,
): {
  index: number
  tone: ReminderTone
  nameKey: string
} {
  const sorted = normaliseOffsets(offsets)
  const position = sorted.indexOf(offset)
  const index = position === -1 ? 0 : position + 1
  if (position === -1) return { index, tone: 'direct', nameKey: 'reminders.steps.followUp' }
  if (position === 0) return { index, tone: 'polite', nameKey: 'reminders.steps.friendly' }
  if (position === sorted.length - 1)
    return { index, tone: 'firm', nameKey: 'reminders.steps.finalNotice' }
  return { index, tone: 'direct', nameKey: 'reminders.steps.followUp' }
}

export function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

/** What the queue needs to know about one unpaid invoice. */
export type QueueInvoice = {
  id: string
  invoiceNumber: string | null
  customerId: string
  customerName: string | null
  dueDate: string | null
  currency: string
  outstanding: number | null
  overdue: boolean
  daysOverdue: number | null
  paid: boolean
}

export type QueueReason = 'optedOut' | 'noDueDate' | 'noRungs' | 'ladderSpent' | 'noRecipient'

/**
 * Why a row is under "Not sending", in the page's words. A customer who has not opted in reads
 * the preview's own verdict wording, so the queue and the invoice page say the same thing.
 */
export const QUEUE_REASON_NOTE: Record<QueueReason, string> = {
  optedOut: 'paymentReminders.verdict.customerOptedOut',
  noDueDate: 'reminders.queue.reason.noDueDate',
  noRungs: 'reminders.queue.reason.noRungs',
  ladderSpent: 'reminders.queue.reason.ladderSpent',
  noRecipient: 'reminders.queue.reason.noRecipient',
}

/**
 * The log's `locale` is the customer's language as stored (`en`, `ar`) or the server's default
 * (`EN`); the page's keys are upper case, so either spelling finds its words.
 */
export function logLocaleKey(locale: string): string {
  return `reminders.queue.locale.${locale.toUpperCase()}`
}

export type QueueEntry = {
  invoice: QueueInvoice
  email: string | null
  /** The next rung to fire, or null with the reason under `reason`. */
  next: { offset: number; date: string } | null
  reason: QueueReason | null
  /** The rungs already spent on this invoice, newest first. */
  spent: ReminderLogDto[]
}

/**
 * `optedOutOf` answers true only for a customer the page holds whose own reminder switch is off:
 * the sweep never mails them (`ReminderDecision` checks it before anything else), so they are
 * "Not sending" whatever the ladder says. A customer the page does not hold is not guessed at.
 */
export function buildQueue(
  invoices: QueueInvoice[],
  offsets: number[],
  log: ReminderLogDto[],
  emailOf: (customerId: string) => string | null,
  today: string,
  optedOutOf: (customerId: string) => boolean = () => false,
): QueueEntry[] {
  const ladder = normaliseOffsets(offsets)
  return invoices
    .filter((invoice) => !invoice.paid)
    .map((invoice) => {
      const spent = log
        .filter((row) => row.invoiceId === invoice.id)
        .sort((a, b) => b.firedOn.localeCompare(a.firedOn))
      const used = new Set(spent.map((row) => row.daysFromDue))
      const email = emailOf(invoice.customerId)
      if (optedOutOf(invoice.customerId))
        return { invoice, email, next: null, reason: 'optedOut', spent }
      if (!invoice.dueDate) return { invoice, email, next: null, reason: 'noDueDate', spent }
      if (ladder.length === 0) return { invoice, email, next: null, reason: 'noRungs', spent }
      const dueDate = invoice.dueDate
      const candidate = ladder
        .filter((offset) => !used.has(offset))
        .map((offset) => ({ offset, date: addDays(dueDate, offset) }))
        .find((rung) => rung.date >= today)
      if (!candidate) return { invoice, email, next: null, reason: 'ladderSpent', spent }
      if (!email) return { invoice, email, next: null, reason: 'noRecipient', spent }
      return { invoice, email, next: candidate, reason: null, spent }
    })
}

/** The rows the log says were paid after a reminder went out, in the last `days` days. */
export function paidAfterReminder(
  invoices: QueueInvoice[],
  log: ReminderLogDto[],
  today: string,
  days = 30,
): { paid: number; sent: number } {
  const since = addDays(today, -days)
  const recent = log.filter((row) => row.firedOn >= since && row.outcome === 'SENT')
  const chased = new Set(recent.map((row) => row.invoiceId))
  return {
    paid: invoices.filter((invoice) => invoice.paid && chased.has(invoice.id)).length,
    sent: recent.length,
  }
}

export type QueueTabId = 'scheduled' | 'sent' | 'paused' | 'notSending'

export const QUEUE_TABS: QueueTabId[] = ['scheduled', 'sent', 'paused', 'notSending']
