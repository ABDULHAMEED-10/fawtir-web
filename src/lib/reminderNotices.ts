import type { ReminderInboxItemDto, ReminderReasonDto } from '../api/expenditure/billReminders'
import { RULE_LABEL_KEY } from './billReminders'
import { BUSINESS_TIME_ZONE } from './format'
import type { Note, NoteAction, NoteTone, NoteWhen } from './notifications'

/**
 * A bill reminder from the reader's inbox, as a line of the bell's panel.
 *
 * The sentence is written here, from the fields the server sends (what it is about, the name a
 * reader knows it by, the amount, the days), so it reads in the reader's language. The server's
 * own `headline` is an English sentence fixed when the notice was recorded; it is used only for a
 * notice that carries no name, which is one recorded before the server kept the name (or sent by a
 * server from before these fields), because there it is the only thing that says which bill.
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

/** The line under the title: the amount where there is one, else what kind of reminder it is. */
function bodyOf(
  item: ReminderInboxItemDto,
  reason: ReminderReasonDto,
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
        percent: Math.round(Math.abs(variance) * 100) / 100,
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
  // A scan has no amount yet; a bill line recorded without one says which reminder it is.
  return money && reason !== 'SCAN_UNCONFIRMED'
    ? { bodyKey: 'notes.reminder.body.owed', money }
    : { bodyKey: `${RULE_LABEL_KEY[item.ruleType]}.title` }
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
  const days = daysOf(item, reason)
  const counted = reason !== 'RECURRING_CHASE' && reason !== 'RECURRING_OUT_OF_RANGE'
  const { percent, ...body } = bodyOf(item, reason)

  return {
    id: item.id,
    ...whenOf(item.createdAt, now),
    icon: 'bill',
    tone: TONE[reason],
    titleKey: !counted
      ? `notes.reminder.${reason}.title`
      : days === 0
        ? `notes.reminder.${reason}.now`
        : `notes.reminder.${reason}.days`,
    // No name to write a sentence around: the server's own sentence names the bill.
    titleText: name === null ? item.headline : undefined,
    ...body,
    values: {
      name: name ?? '',
      count: days,
      ...(percent === undefined ? {} : { percent }),
    },
    actions: actionOf(item, reason),
    unread: !isAcknowledged(item),
  }
}
