import { useSyncExternalStore } from 'react'
import type { TFunction } from 'i18next'
import { ApiError } from '../api'
import {
  acknowledgeAllReminders,
  acknowledgeReminder,
  loadReminderInbox,
  loadReminderUnreadCount,
  reminderInboxPath,
  type ReminderInboxItemDto,
} from '../api/expenditure/billReminders'
import { formatAmount } from './format'
import { isAcknowledged, reminderNote, type ReminderNoteIcon } from './reminderNotices'
import { usageForecast } from './settings'
import { SIGNING_CERTIFICATE, certificateState } from './settingsCompany'
import { invited } from './settingsPeople'
import { STOCK_BOOK, SUPPLIER } from './catalogStock'
import {
  subscribeSubscriptionNotices,
  subscriptionNote,
  subscriptionNoticesSnapshot,
  subscriptionNoticesStore,
} from './subscriptionNotices'
import { quotaNoticeSnapshot, quotaNoticeStore, subscribeQuotaNotice } from './quotaNotice'

/**
 * The bell in the topbar (Figma 144:33521).
 *
 * Every line is written as the thing to do about it, not as an event log — "your certificate
 * expires in 24 days" with the button that starts the renewal, not "certificate status changed".
 * Where a figure exists elsewhere in the app it is read from there, so the notification and the
 * screen its button opens cannot disagree: the certificate date, the month's invoice count and
 * allowance, the unanswered invitation, the number of things running low and who supplies them.
 *
 * The day-counts run on the Settings clock (`TODAY` in settings.ts), because that is where the
 * buttons lead: "Start the renewal" opens the Peppol page and "Look at the plan" the plan page, and
 * both work their own countdowns from that clock. The design's "24 days" and "around the 26th" were
 * typed against a different day; here they are the Peppol page's `certificateState` and the plan
 * page's `usageForecast`, so the line and the page it opens always say the same thing.
 *
 * Dates are handed over as `Date`s and written out by the panel in the reader's language — the
 * Arabic line used to say "the 26th" in English.
 *
 * What the bell shows now is the reader's own bill reminders, read from the server
 * (`GET /bill-reminders/inbox`): see the store below and `reminderNotices.ts`. The design's seven
 * sample lines (`NOTES`) are kept here as drawn but are no longer shown: none of them has a
 * source, and typed-in sample lines beside real ones would be read as real.
 *
 * Beside them, for a reader with `tenant.plan.read`, are the trial-ending and grace reminders
 * (`GET /settings/subscription/notices`): their own store is in `subscriptionNotices.ts`, and the
 * store below hands each line's reading and marking to whichever of the two it belongs to.
 */

export type NoteTone = 'danger' | 'warning' | 'success' | 'neutral' | 'brand'

/** "2 hours ago" · "09:14" · "Yesterday 23:00" · "2 Sep 08:12". */
export type NoteWhen =
  { hoursAgo: number } | { at: string } | { yesterday: string } | { on: Date; at: string }

export type NoteAction = {
  id: string
  labelKey: string
  kind: 'primary' | 'secondary' | 'danger'
  /** Where it goes. Omitted for actions that happen in place. */
  to?: string
  /** An in-place action leaves this line behind instead of its buttons. */
  doneKey?: string
  /** An in-place action that also takes the notification away. */
  dismisses?: boolean
}

export type Note = {
  id: string
  group: 'today' | 'earlier'
  tone: NoteTone
  icon:
    | 'certificate'
    | 'quota'
    | 'refused'
    | 'stock'
    | 'accepted'
    | 'invite'
    | 'device'
    | ReminderNoteIcon
  titleKey: string
  /** A title that arrives already written (a reminder's own sentence from the server). */
  titleText?: string
  /** Left out for a line with nothing to add under its title. */
  bodyKey?: string
  /** Dates are formatted by the panel, in the reader's language. */
  values: Record<string, string | number | Date>
  /**
   * How a date in `values` is written: "29 September" unless a line asks for the short form the
   * design gives a bill reminder ("5 Aug"), which keeps Latin digits in Arabic as bills do, or the
   * long form with the year a subscription reminder gives ("27 October 2026"), Latin digits too.
   */
  dates?: 'short' | 'long'
  /** An amount for the body, written out by the panel in the reader's language as `{{amount}}`. */
  money?: { amount: number; currency: string }
  /** When it happened — phrased by the panel in the reader's language. */
  when: NoteWhen
  actions: NoteAction[]
  /** New since the panel was last opened. */
  unread: boolean
}

const signing = SIGNING_CERTIFICATE
const forecast = usageForecast()
const invitee = invited[0]

// Two notes used to be built here from the ERP connector mock: a connection in ERROR after
// three failed runs, and a record superseded in the ERP. Neither state exists -- Phase 2 has no
// extraction, no runs and no ERROR state -- so the bell was telling tenants their integration
// had failed and deep-linking them at screens that now say the feature is not switched on.
//
// The design's sample list. Not shown by the bell any more (see the note at the top).
export const NOTES: Note[] = [
  {
    id: 'certificate',
    group: 'today',
    tone: 'danger',
    icon: 'certificate',
    titleKey: 'notes.certificate.title',
    bodyKey: 'notes.certificate.body',
    values: {
      days: certificateState(signing).daysLeft!,
      date: signing.expires!,
    },
    when: { hoursAgo: 2 },
    actions: [
      {
        id: 'renew',
        labelKey: 'notes.certificate.renew',
        kind: 'primary',
        to: '/settings/peppol',
      },
    ],
    unread: true,
  },
  {
    id: 'quota',
    group: 'today',
    tone: 'warning',
    icon: 'quota',
    titleKey: 'notes.quota.title',
    bodyKey: 'notes.quota.body',
    values: {
      percent: Math.round((forecast.used / forecast.allowance) * 100),
      used: forecast.used,
      allowance: forecast.allowance,
      runsOut: forecast.runOut,
    },
    when: { hoursAgo: 4 },
    actions: [
      { id: 'plan', labelKey: 'notes.quota.plan', kind: 'secondary', to: '/settings/plan' },
    ],
    unread: true,
  },
  {
    id: 'refused',
    group: 'today',
    tone: 'danger',
    icon: 'refused',
    titleKey: 'notes.refused.title',
    bodyKey: 'notes.refused.body',
    values: { invoice: 'INV-2041', others: 2, all: 3 },
    when: { at: '09:14' },
    actions: [
      {
        id: 'fix',
        labelKey: 'notes.refused.fix',
        kind: 'secondary',
        to: '/compliance/activity/INV-2041/resubmit',
      },
    ],
    unread: false,
  },
  {
    id: 'stock',
    group: 'today',
    tone: 'warning',
    icon: 'stock',
    titleKey: 'notes.stock.title',
    bodyKey: 'notes.stock.body',
    values: {
      count: STOCK_BOOK.runningLow,
      first: 'Yirgacheffe',
      supplier: SUPPLIER.name,
      order: 'PO-0034',
    },
    when: { at: '08:00' },
    actions: [
      {
        id: 'order',
        labelKey: 'notes.stock.order',
        kind: 'secondary',
        to: '/suppliers/muscat-roastery/purchase-order',
      },
    ],
    unread: false,
  },
  {
    id: 'accepted',
    group: 'earlier',
    tone: 'success',
    icon: 'accepted',
    titleKey: 'notes.accepted.title',
    bodyKey: 'notes.accepted.body',
    values: { count: 38 },
    when: { yesterday: '23:00' },
    actions: [],
    unread: false,
  },
  {
    id: 'invite',
    group: 'earlier',
    tone: 'neutral',
    icon: 'invite',
    titleKey: 'notes.invite.title',
    bodyKey: 'notes.invite.body',
    values: {
      name: invitee.name.split(' ')[0],
      sent: invitee.invited!.daysAgo,
      expires: invitee.invited!.expiresInDays,
    },
    when: { yesterday: '10:02' },
    actions: [
      {
        id: 'resend',
        labelKey: 'notes.invite.resend',
        kind: 'secondary',
        doneKey: 'notes.invite.resent',
      },
      { id: 'cancel', labelKey: 'notes.invite.cancel', kind: 'danger', dismisses: true },
    ],
    unread: false,
  },
  {
    id: 'device',
    group: 'earlier',
    tone: 'brand',
    icon: 'device',
    titleKey: 'notes.device.title',
    bodyKey: 'notes.device.body',
    values: { name: 'Yusuf', device: 'iPhone', town: 'Muscat' },
    when: { on: new Date(2026, 8, 2), at: '08:12' },
    actions: [
      {
        id: 'notThem',
        labelKey: 'notes.device.notThem',
        kind: 'danger',
        to: '/settings/signing-in',
      },
    ],
    unread: false,
  },
]

/* --------------------------------------------------------------------- store */

/**
 * The reader's reminders as last read from the server, and what they have done to the list.
 *
 * Kept outside React because every page mounts its own shell, so a panel's state would otherwise
 * be thrown away on every navigation: the badge would drop to nothing and come back on every
 * page. One store shared by the badge and the panel keeps the two in step.
 *
 * Read is the server's to say. Marking a line read shows at once and is then sent
 * (`POST /inbox/{id}/acknowledge`, or `/inbox/acknowledge-all`); if the server does not take it,
 * the list is read again and shows what is true.
 */
type NotesState = {
  /** Whose inbox this is (`tenant:user`), or null when there is nobody's to read. */
  owner: string | null
  /** The newest lines, or null before the first answer. */
  items: readonly ReminderInboxItemDto[] | null
  /** The latest read of the lines did not answer. Any lines read before it are kept. */
  listFailed: boolean
  /** The server's own count of unread, which no page of the list caps. */
  unread: number
  /** Put away for this visit. "See them all" brings them back. */
  dismissed: ReadonlySet<string>
  /** Notes whose in-place action has run, and the line that replaces their buttons. */
  done: ReadonlyMap<string, string>
}

const EMPTY: NotesState = {
  owner: null,
  items: null,
  listFailed: false,
  unread: 0,
  dismissed: new Set(),
  done: new Map(),
}

let state: NotesState = EMPTY
/** Acknowledgements on their way to the server, in order. A read waits for them to land. */
let writes: Promise<unknown> = Promise.resolve()
/** Counts what the reader has marked read. An answer that set out before the latest is stale. */
let edits = 0

const listeners = new Set<() => void>()

function set(next: NotesState) {
  state = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** A server from before the route answers "no such thing", which is not a failure to report. */
const routeMissing = (error: unknown) =>
  error instanceof ApiError && (error.status === 404 || error.status === 405)

/**
 * The unread count. A server from before `GET /inbox/unread-count` is asked for its unread lines
 * instead and they are counted, which stops at the read's own limit.
 */
async function readUnread(): Promise<number> {
  try {
    return await loadReminderUnreadCount()
  } catch (error) {
    if (!routeMissing(error)) throw error
    return (await loadReminderInbox(reminderInboxPath(true))).length
  }
}

/**
 * Reads the count, and the list too when the panel is open. Never throws: a read that fails
 * leaves what was last read in place, and the page the reader is on is not disturbed by its bell.
 */
async function read(withList: boolean): Promise<void> {
  const owner = state.owner
  if (owner === null) return
  // Let anything marked read reach the server first, so the answer includes it.
  for (let pending = writes; ; pending = writes) {
    await pending
    if (pending === writes) break
  }
  const before = edits
  const [list, count] = await Promise.allSettled([
    withList ? loadReminderInbox(reminderInboxPath(false)) : Promise.resolve(null),
    readUnread(),
  ])
  if (state.owner !== owner) return
  // Something was marked read while this was on its way: ask again rather than undo it.
  if (edits !== before) return read(withList)
  const items = list.status === 'fulfilled' && list.value !== null ? list.value : state.items
  set({
    ...state,
    items,
    listFailed: withList ? list.status === 'rejected' : state.listFailed,
    unread: count.status === 'fulfilled' ? count.value : state.unread,
  })
}

const asRead = (item: ReminderInboxItemDto): ReminderInboxItemDto =>
  isAcknowledged(item)
    ? item
    : { ...item, read: true, acknowledgedAt: item.acknowledgedAt ?? new Date().toISOString() }

export const notesStore = {
  /**
   * Whose bell this is. Called by the bell each time a page mounts it: a different reader (or
   * none) starts from nothing, and the count is asked for afresh either way.
   */
  watch(owner: string | null) {
    if (state.owner !== owner) set({ ...EMPTY, owner })
    void read(false)
  },
  /** The panel has been opened: read its lines and the count. */
  refresh() {
    void read(true)
    subscriptionNoticesStore.refresh()
  },
  markRead(id: string) {
    if (quotaNoticeStore.markRead(id)) return
    if (subscriptionNoticesStore.markRead(id)) return
    const item = state.items?.find((entry) => entry.id === id)
    if (!item || isAcknowledged(item)) return
    const owner = state.owner
    edits += 1
    set({
      ...state,
      items: state.items!.map((entry) => (entry.id === id ? asRead(entry) : entry)),
      unread: Math.max(0, state.unread - 1),
    })
    writes = writes
      .then(() => acknowledgeReminder(id))
      .catch(() => {
        // Not taken: show what the server holds rather than a line that only looks read.
        if (state.owner === owner) void read(true)
      })
  },
  markAllRead() {
    quotaNoticeStore.markAllRead()
    subscriptionNoticesStore.markAllRead()
    if (state.unread === 0 && !(state.items ?? []).some((item) => !isAcknowledged(item))) return
    const owner = state.owner
    const shownUnread = (state.items ?? []).filter((item) => !isAcknowledged(item))
    edits += 1
    set({ ...state, items: state.items?.map(asRead) ?? null, unread: 0 })
    writes = writes
      .then(async () => {
        try {
          await acknowledgeAllReminders()
        } catch (error) {
          if (!routeMissing(error)) throw error
          // A server from before "mark all": the lines that were on show, one at a time.
          for (const item of shownUnread) await acknowledgeReminder(item.id)
        }
      })
      .catch(() => undefined)
      // Read again either way: the server says what is still unread.
      .then(() => {
        if (state.owner === owner) void read(true)
      })
  },
  dismiss(id: string) {
    notesStore.markRead(id)
    set({ ...state, dismissed: new Set(state.dismissed).add(id) })
  },
  complete(id: string, doneKey: string) {
    notesStore.markRead(id)
    set({ ...state, done: new Map(state.done).set(id, doneKey) })
  },
  /** "See them all" — brings back anything dismissed that is still inside the 30 days. */
  restoreAll() {
    set({ ...state, dismissed: new Set() })
  },
  /** For tests: forget the reader and everything read for them. */
  reset() {
    writes = Promise.resolve()
    edits = 0
    set(EMPTY)
    subscriptionNoticesStore.reset()
    quotaNoticeStore.reset()
  },
}

/**
 * Whose bell it is. The Super Admin console shares the topbar, but a shop's reminders are not the
 * platform operator's to act on, and the console has no alerts of its own designed yet — so its
 * bell is quiet and its panel says so.
 */
export type NoteScope = 'tenant' | 'console'

export function useNotes(scope: NoteScope = 'tenant') {
  const current = useSyncExternalStore(subscribe, () => state)
  const plan = useSyncExternalStore(subscribeSubscriptionNotices, subscriptionNoticesSnapshot)
  const quota = useSyncExternalStore(subscribeQuotaNotice, quotaNoticeSnapshot)
  const mine = scope === 'tenant' && current.owner !== null
  const planMine = scope === 'tenant' && plan.owner !== null
  const items = mine ? (current.items ?? []) : []
  const planItems = planMine ? (plan.items ?? []) : []
  // The allowance warning (AL-8) is about now, so it heads the list.
  const quotaNote = scope === 'tenant' && quota.owner !== null ? quota.note : null
  const now = new Date()
  // The two lists merged newest first. Each keeps the server's own order: a subscription
  // reminder goes in ahead of the first bill reminder older than it.
  const merged: Note[] = quotaNote ? [quotaNote] : []
  let next = 0
  for (const item of items) {
    const at = Date.parse(item.createdAt) || 0
    while (next < planItems.length && (Date.parse(planItems[next].createdAt) || 0) > at)
      merged.push(subscriptionNote(planItems[next++], now))
    merged.push(reminderNote(item, now))
  }
  while (next < planItems.length) merged.push(subscriptionNote(planItems[next++], now))
  const shown = merged.filter((note) => !current.dismissed.has(note.id))
  return {
    shown,
    unread:
      (mine ? current.unread : 0) +
      (planMine ? plan.unread : 0) +
      (quotaNote !== null && !quota.read ? 1 : 0),
    /** False while the first read of either list is still on its way. */
    loaded: (!mine || current.items !== null) && (!planMine || plan.items !== null),
    /** The lines could not be read, so an empty list here is not "nothing to show". */
    failed: mine && current.listFailed,
    isRead: (id: string) => {
      if (quotaNote !== null && id === quotaNote.id) return quota.read
      const reminder = planItems.find((entry) => entry.id === id)
      if (reminder) return reminder.read
      const item = items.find((entry) => entry.id === id)
      return item ? isAcknowledged(item) : true
    },
    doneKey: (id: string) => current.done.get(id),
    anyDismissed: (mine || planMine || quotaNote !== null) && current.dismissed.size > 0,
  }
}

/**
 * The reader's unread bill reminders, for anything that shows the bell's number somewhere else
 * (the Bills entry of the sidebar). It reads the bell's store and asks nothing itself: the bell
 * does the asking, so the two always show one number. 0 when there is nobody's inbox to read.
 */
export function useUnreadReminders(): number {
  return useSyncExternalStore(subscribe, () => (state.owner === null ? 0 : state.unread))
}

/** A note's values ready for `t()` — dates written out in the reader's language ("29 September"). */
export function noteValues(note: Note, language: string) {
  const short = note.dates === 'short'
  const long = note.dates === 'long'
  const arabic = language.startsWith('ar')
  const locale = arabic ? (short || long ? 'ar-u-nu-latn' : 'ar') : 'en-GB'
  const values: Record<string, string | number> = Object.fromEntries(
    Object.entries(note.values).map(([key, value]) => [
      key,
      value instanceof Date
        ? value.toLocaleDateString(locale, {
            day: 'numeric',
            month: short ? 'short' : 'long',
            ...(long ? { year: 'numeric' as const } : {}),
          })
        : value,
    ]),
  )
  // Written as the rest of the app writes money; the panel swaps "OMR" for the rial sign.
  if (note.money) {
    const { amount, currency } = note.money
    values.amount = `${currency} ${formatAmount(amount, currency, language)}`
  }
  return values
}

/** The time line under a note, in the reader's language. */
export function noteWhen(when: NoteWhen, t: TFunction, language: string) {
  if ('hoursAgo' in when) return t('notes.when.hoursAgo', { count: when.hoursAgo })
  if ('yesterday' in when) return t('notes.when.yesterday', { time: when.yesterday })
  if ('on' in when) {
    const locale = language.startsWith('ar') ? 'ar' : 'en-GB'
    const date = when.on.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
    return `${date} ${when.at}`
  }
  return when.at
}
