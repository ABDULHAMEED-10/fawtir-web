import type { ReminderInboxItemDto, ReminderReasonDto } from '../api/expenditure/billReminders'
import { RULE_LABEL_KEY } from './billReminders'
import { BUSINESS_TIME_ZONE } from './format'
import type { Note, NoteAction, NoteTone, NoteWhen } from './notifications'

/**
 * A bill reminder from the reader's inbox, as a line of the bell's panel.
 *
 * The sentence is written here, from the fields the server sends, so it reads in the reader's
 * language, and it is worded as the design words its own reminder lines: the supplier is named
 * and the line says what is waiting ("Al Noor Dates unpaid for 9 days", "Sohar Packaging due in
 * 3 days"). That needs the supplier's name (`supplierName`).
 *
 * A bill that is due or late is counted from its due date (`dueDate`) on the day the line is
 * read, not from the number stored when the notice was recorded, so a notice read a week later
 * still says how long the bill has gone unpaid. The same date decides which of the two it says:
 * before or on the due date the bill is due, after it the bill is unpaid. The other kinds have no
 * date to count from and say the number of days the notice was recorded with.
 *
 * An early-payment discount is written as the design's own sample is ("2% discount expires 5 Aug"
 * over "Saves 47.090") when the server sends its percentage, the day it runs out and the saving
 * (`discountPercent`, `discountExpiresOn`, `discountSaving`). Without them it counts the days.
 *
 * A scan has no supplier until somebody confirms it, so its line names the file. A notice with
 * no supplier's name (a server from before the field, or a bill that is no longer there), or a
 * due or late one with no due date, is worded around the name a reader knows the thing by: the
 * bill's number or the recurring bill's name. With no such name either, the server's own
 * `headline` is shown: an English sentence fixed when the notice was recorded, and there the
 * only thing that says which bill.
 *
 * The line is drawn by the panel exactly as it draws every other: a tinted tile with an icon, a
 * title, one line under it, when it arrived, and one button that opens the bill, the recurring
 * bill or the upload. Every bill reminder wears the one icon, the sidebar's Bills icon; the tile
 * behind it is tinted by what the reminder is about.
 */

export type ReminderNoteIcon = 'bill'

const TONE: Record<ReminderReasonDto, NoteTone> = {
  BEFORE_DUE: 'brand',
  LATE: 'danger',
  DISCOUNT_EXPIRY: 'success',
  APPROVAL_STALE: 'brand',
  MISMATCH_STALE: 'neutral',
  SCAN_UNCONFIRMED: 'neutral',
  RECURRING_LATE: 'warning',
  RECURRING_CHASE: 'warning',
  RECURRING_OUT_OF_RANGE: 'warning',
}

/** A server from before `reason` sends the rule type alone, which says the same for all but two. */
export function reasonOf(item: ReminderInboxItemDto): ReminderReasonDto {
  return item.reason && item.reason in TONE ? item.reason : item.ruleType
}

/** A server from before `read` says it with the time it was acknowledged. */
export function isAcknowledged(item: ReminderInboxItemDto): boolean {
  return item.read ?? item.acknowledgedAt !== null
}

/**
 * The days a sentence counts. Before due and discount are sent zero or negative (the days still
 * to go); everything else counts up. Never negative on the page.
 */
function daysOf(item: ReminderInboxItemDto, reason: ReminderReasonDto): number {
  const days = Number.isFinite(item.daysFromDue) ? Math.trunc(item.daysFromDue) : 0
  return reason === 'BEFORE_DUE' || reason === 'DISCOUNT_EXPIRY'
    ? Math.abs(days)
    : Math.max(0, days)
}

/** Where a line leads, and what its one button says. Existing labels, no new wording. */
function actionOf(item: ReminderInboxItemDto, reason: ReminderReasonDto): NoteAction[] {
  const open = (to: string, labelKey: string): NoteAction[] => [
    { id: 'open', labelKey, kind: 'secondary', to },
  ]
  const bill = (id: string) =>
    open(`/expenditure/bills/${encodeURIComponent(id)}`, 'expenditureReminders.inbox.openBill')

  // The bill that arrived outside the range is the thing to look at; the instruction otherwise.
  if (reason === 'RECURRING_OUT_OF_RANGE' && item.arrivedBillId) return bill(item.arrivedBillId)
  if (item.subjectType === 'BILL') return bill(item.billId ?? item.subjectId)
  if (item.subjectType === 'RECURRING_BILL')
    return open(
      `/expenditure/recurring-bills/${encodeURIComponent(item.recurringBillId ?? item.subjectId)}`,
      'recurringBills.menu.open',
    )
  if (item.subjectType === 'INTAKE')
    return open(
      `/expenditure/bills/upload/${encodeURIComponent(item.intakeId ?? item.subjectId)}`,
      'billsPage.actions.checkAndSave',
    )
  return []
}

const DAY_MS = 24 * 60 * 60 * 1000

/** A calendar day (`YYYY-MM-DD`, with or without a time after it) as its three numbers. */
function calendarDay(day: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day?.trim() ?? '')
  if (!match) return null
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])]
  return Number.isNaN(Date.UTC(year, month - 1, date)) ? null : { year, month, date }
}

/**
 * How many days past a date today is, in the business's own day: positive once the date has gone
 * (a bill is late), zero on the day, negative while there are days to go. Null with no date to
 * count from.
 */
function daysPastDue(dueDate: string | null | undefined, now: Date): number | null {
  const due = calendarDay(dueDate)
  if (!due) return null
  const today = businessParts(now)
  return Math.round(
    (Date.UTC(today.year, today.month - 1, today.date) -
      Date.UTC(due.year, due.month - 1, due.date)) /
      DAY_MS,
  )
}

/**
 * The title's key and the days it counts, or null when the line cannot be written this way. A
 * discount written with its facts carries them too.
 */
type Title = { titleKey: string; count: number; facts?: { percent: number; date: Date } }

const twoDecimals = (value: number) => Math.round(value * 100) / 100

/**
 * The discount's title in the design's own form, "2% discount expires 5 Aug", which needs the
 * percentage and the day it runs out. The day is read against today: on its last day the
 * discount "runs out today", and a notice read after it says the discount expired. Null when
 * either fact is missing, and the caller counts the days as before.
 */
function discountTitle(item: ReminderInboxItemDto, base: string, now: Date): Title | null {
  const percent = item.discountPercent
  const day = calendarDay(item.discountExpiresOn)
  const past = daysPastDue(item.discountExpiresOn, now)
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent <= 0) return null
  if (day === null || past === null) return null
  return {
    titleKey: `${base}.${past > 0 ? 'datedPast' : past === 0 ? 'datedNow' : 'dated'}`,
    count: 0,
    facts: { percent: twoDecimals(percent), date: new Date(day.year, day.month - 1, day.date) },
  }
}

/**
 * The title that names the supplier. A due or late bill is read from its due date as it stands
 * today; without that date there is nothing true to count, and the caller words it the other way.
 */
function supplierTitle(
  item: ReminderInboxItemDto,
  reason: ReminderReasonDto,
  now: Date,
): Title | null {
  const key = (kind: ReminderReasonDto, form: 'now' | 'days' | 'title') =>
    `notes.reminder.supplier.${kind}.${form}`

  if (reason === 'BEFORE_DUE' || reason === 'LATE') {
    const past = daysPastDue(item.dueDate, now)
    if (past === null) return null
    if (past > 0) return { titleKey: key('LATE', 'days'), count: past }
    return past === 0
      ? { titleKey: key('BEFORE_DUE', 'now'), count: 0 }
      : { titleKey: key('BEFORE_DUE', 'days'), count: -past }
  }
  if (reason === 'RECURRING_CHASE' || reason === 'RECURRING_OUT_OF_RANGE')
    return { titleKey: key(reason, 'title'), count: 0 }
  if (reason === 'DISCOUNT_EXPIRY') {
    const dated = discountTitle(item, 'notes.reminder.supplier.DISCOUNT_EXPIRY', now)
    if (dated) return dated
  }
  const days = daysOf(item, reason)
  return { titleKey: key(reason, days === 0 ? 'now' : 'days'), count: days }
}

/** The title around the bill's number, the file's name or the recurring bill's name. */
function namedTitle(item: ReminderInboxItemDto, reason: ReminderReasonDto, now: Date): Title {
  if (reason === 'RECURRING_CHASE' || reason === 'RECURRING_OUT_OF_RANGE')
    return { titleKey: `notes.reminder.${reason}.title`, count: 0 }
  if (reason === 'DISCOUNT_EXPIRY') {
    const dated = discountTitle(item, 'notes.reminder.DISCOUNT_EXPIRY', now)
    if (dated) return dated
  }
  const days = daysOf(item, reason)
  return { titleKey: `notes.reminder.${reason}.${days === 0 ? 'now' : 'days'}`, count: days }
}

/** The line under the title: the amount where there is one, else what kind of reminder it is. */
function bodyOf(
  item: ReminderInboxItemDto,
  reason: ReminderReasonDto,
  now: Date,
): Pick<Note, 'bodyKey' | 'money'> & { percent?: number } {
  const money =
    typeof item.amount === 'number' && item.currency
      ? { amount: item.amount, currency: item.currency }
      : undefined

  if (reason === 'RECURRING_OUT_OF_RANGE') {
    const variance = item.variancePercent
    if (typeof variance === 'number' && variance !== 0) {
      return {
        bodyKey: variance > 0 ? 'notes.reminder.body.above' : 'notes.reminder.body.below',
        percent: twoDecimals(Math.abs(variance)),
      }
    }
    // The rule's own title ("a recurring bill that hasn't arrived") would be wrong here.
    return money ? { bodyKey: 'notes.reminder.body.usual', money } : {}
  }
  if (reason === 'RECURRING_LATE' || reason === 'RECURRING_CHASE') {
    return money
      ? { bodyKey: 'notes.reminder.body.usual', money }
      : { bodyKey: `${RULE_LABEL_KEY.RECURRING_LATE}.title` }
  }
  // The design's own second line for a discount: what paying in time saves, in the entry's
  // currency. Not once the day has gone, when there is no saving left to be had.
  if (reason === 'DISCOUNT_EXPIRY' && item.currency) {
    const saving = item.discountSaving
    const gone = (daysPastDue(item.discountExpiresOn, now) ?? 0) > 0
    if (typeof saving === 'number' && Number.isFinite(saving) && saving > 0 && !gone)
      return {
        bodyKey: 'notes.reminder.body.saves',
        money: { amount: saving, currency: item.currency },
      }
  }
  // A scan has no amount yet; a bill line recorded without one says which reminder it is.
  if (!money || reason === 'SCAN_UNCONFIRMED')
    return { bodyKey: `${RULE_LABEL_KEY[item.ruleType]}.title` }
  // The design's own second line for an approval: the amount is held up, not yet owed.
  return {
    bodyKey:
      reason === 'APPROVAL_STALE' ? 'notes.reminder.body.heldUp' : 'notes.reminder.body.owed',
    money,
  }
}

const DAY_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** An instant as the business day and time it fell on, the way every other date on a bill is read. */
function businessParts(instant: Date) {
  const parts = Object.fromEntries(
    DAY_PARTS.formatToParts(instant).map((part) => [part.type, part.value]),
  )
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    year: Number(parts.year),
    month: Number(parts.month),
    date: Number(parts.day),
  }
}

/** "09:14" today, "Yesterday 23:00", "2 Sep 08:12": the three ways the panel already says when. */
export function whenOf(createdAt: string, now: Date): { when: NoteWhen; group: Note['group'] } {
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return { when: { at: '' }, group: 'earlier' }
  const at = businessParts(created)
  if (at.day === businessParts(now).day) return { when: { at: at.time }, group: 'today' }
  const yesterday = businessParts(new Date(now.getTime() - 24 * 60 * 60 * 1000)).day
  if (at.day === yesterday) return { when: { yesterday: at.time }, group: 'earlier' }
  return {
    when: { on: new Date(at.year, at.month - 1, at.date), at: at.time },
    group: 'earlier',
  }
}

/** One inbox item as one line of the panel. */
export function reminderNote(item: ReminderInboxItemDto, now: Date): Note {
  const reason = reasonOf(item)
  const name = item.subjectDisplay?.trim() || null
  const supplier = item.supplierName?.trim() || null
  // A scan has no supplier until somebody confirms it: it is known by its file.
  const bySupplier =
    supplier === null || reason === 'SCAN_UNCONFIRMED' ? null : supplierTitle(item, reason, now)
  const { titleKey, count, facts } = bySupplier ?? namedTitle(item, reason, now)
  const { percent, ...body } = bodyOf(item, reason, now)

  return {
    id: item.id,
    ...whenOf(item.createdAt, now),
    icon: 'bill',
    tone: TONE[reason],
    titleKey,
    // Neither a supplier nor a name to write a sentence around: the server's own names the bill.
    titleText: bySupplier === null && name === null ? item.headline : undefined,
    ...body,
    values: {
      name: name ?? '',
      supplier: supplier ?? '',
      count,
      ...(percent === undefined ? {} : { percent }),
      ...facts,
    },
    // "5 Aug", as the design writes a discount's day.
    ...(facts ? { dates: 'short' as const } : {}),
    actions: actionOf(item, reason),
    unread: !isAcknowledged(item),
  }
}
