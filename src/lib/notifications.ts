import { useSyncExternalStore } from 'react'
import type { TFunction } from 'i18next'
import { usageForecast } from './settings'
import { SIGNING_CERTIFICATE, certificateState } from './settingsCompany'
import { invited } from './settingsPeople'
import { STOCK_BOOK, SUPPLIER } from './catalogStock'

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
  icon: 'certificate' | 'quota' | 'refused' | 'stock' | 'accepted' | 'invite' | 'device'
  titleKey: string
  bodyKey: string
  /** Dates are formatted by the panel, in the reader's language. */
  values: Record<string, string | number | Date>
  /** When it happened — phrased by the panel in the reader's language. */
  when: NoteWhen
  actions: NoteAction[]
  /** New since the panel was last opened. */
  unread: boolean
}

const signing = SIGNING_CERTIFICATE
const forecast = usageForecast()
const invitee = invited[0]

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
 * What the reader has done to the list — read, dismissed, acted on.
 *
 * Kept outside React because every page mounts its own shell, so a panel's state would otherwise
 * be thrown away on every navigation: mark everything read, open Settings, and the bell would be
 * back to 2. One store shared by the badge and the panel keeps the two in step.
 */
type NotesState = {
  read: ReadonlySet<string>
  dismissed: ReadonlySet<string>
  /** Notes whose in-place action has run, and the line that replaces their buttons. */
  done: ReadonlyMap<string, string>
}

let state: NotesState = {
  read: new Set(NOTES.filter((note) => !note.unread).map((note) => note.id)),
  dismissed: new Set(),
  done: new Map(),
}

const listeners = new Set<() => void>()

function set(next: NotesState) {
  state = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const notesStore = {
  markRead(id: string) {
    if (state.read.has(id)) return
    set({ ...state, read: new Set(state.read).add(id) })
  },
  markAllRead() {
    set({ ...state, read: new Set(NOTES.map((note) => note.id)) })
  },
  dismiss(id: string) {
    set({
      ...state,
      dismissed: new Set(state.dismissed).add(id),
      read: new Set(state.read).add(id),
    })
  },
  complete(id: string, doneKey: string) {
    set({
      ...state,
      done: new Map(state.done).set(id, doneKey),
      read: new Set(state.read).add(id),
    })
  },
  /** "See them all" — brings back anything dismissed that is still inside the 30 days. */
  restoreAll() {
    set({ ...state, dismissed: new Set() })
  },
}

/**
 * Whose bell it is. The Super Admin console shares the topbar, but a shop's certificate and quota
 * are not the platform operator's to act on, and the console has no alerts of its own designed yet
 * — so its bell is quiet and its panel says so, rather than showing Al Bahja's list.
 */
export type NoteScope = 'tenant' | 'console'

export function useNotes(scope: NoteScope = 'tenant') {
  const current = useSyncExternalStore(subscribe, () => state)
  const shown = scope === 'console' ? [] : NOTES.filter((note) => !current.dismissed.has(note.id))
  const unread = shown.filter((note) => !current.read.has(note.id)).length
  return {
    shown,
    unread,
    isRead: (id: string) => current.read.has(id),
    doneKey: (id: string) => current.done.get(id),
    anyDismissed: scope === 'tenant' && current.dismissed.size > 0,
  }
}

/** A note's values ready for `t()` — dates written out in the reader's language ("29 September"). */
export function noteValues(note: Note, language: string) {
  const locale = language.startsWith('ar') ? 'ar' : 'en-GB'
  return Object.fromEntries(
    Object.entries(note.values).map(([key, value]) => [
      key,
      value instanceof Date
        ? value.toLocaleDateString(locale, { day: 'numeric', month: 'long' })
        : value,
    ]),
  )
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
