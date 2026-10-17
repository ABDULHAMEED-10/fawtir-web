import { ApiError } from '../api'
import {
  SUBSCRIPTION_NOTICES_MAX,
  acknowledgeSubscriptionNotice,
  loadSubscriptionNotices,
  subscriptionNoticesPath,
  type SubscriptionNoticeDto,
} from '../api/settings/subscription'
import { whenOf } from './reminderNotices'
import type { Note, NoteAction } from './notifications'

/**
 * The trial-ending and grace reminders (`GET /settings/subscription/notices`, V299), and the
 * notice that Fawtir cancelled the subscription (V365), as lines of the bell's panel, beside the
 * bill reminders and drawn exactly as they are.
 *
 * The sentence is written here from the dates the server sends, so it reads in the reader's
 * language; the server's `headline` is English e-mail text and is shown only for a kind this
 * screen does not know yet. The button opens the route the server names (`actionPath`), which is
 * Settings › Plan for a trial and Settings › Bills for grace.
 *
 * Reading needs `tenant.plan.read`. A server from before V299 answers 404: the bell then shows
 * the bill reminders alone, with no error and no count, and does not ask again for this reader.
 */

/** The list the panel shows, as the bill reminders' own. */
const LIST_LIMIT = 20

const PLAN_PATH = '/settings/plan'
const BILLS_PATH = '/settings/bills'

/** A route inside the app, never another site: anything else falls back to the kind's own page. */
function internalPath(path: string | null | undefined): string | null {
  const value = path?.trim() ?? ''
  return /^\/(?![/\\])[A-Za-z0-9/_?=&.-]*$/.test(value) ? value : null
}

/** `YYYY-MM-DD` as a local date for the panel to write out, or null. */
function dayOf(day: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day?.trim() ?? '')
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

/** One reminder as one line of the panel. */
export function subscriptionNote(item: SubscriptionNoticeDto, now: Date): Note {
  const target = internalPath(item.actionPath)
  const cancelled = item.kind === 'CANCELLED_BY_FAWTIR'
  const grace =
    item.kind === 'GRACE' || (item.kind !== 'TRIAL_ENDING' && !cancelled && target === BILLS_PATH)
  const action: NoteAction = {
    id: 'open',
    labelKey: grace
      ? 'notes.subscription.payBill'
      : cancelled
        ? 'notes.subscription.viewPlan'
        : 'notes.subscription.choosePlan',
    kind: 'primary',
    to: target ?? (grace ? BILLS_PATH : PLAN_PATH),
  }
  const base = {
    id: item.id,
    ...whenOf(item.createdAt, now),
    icon: 'quota' as const,
    tone: grace || cancelled ? ('danger' as const) : ('warning' as const),
    // Written out in full, "27 October 2026", as the e-mail writes it.
    dates: 'long' as const,
    actions: [action],
    unread: !item.read,
  }
  const covered = dayOf(item.coveredThrough)
  const until = dayOf(item.graceUntil)

  if (item.kind === 'TRIAL_ENDING' && covered)
    return {
      ...base,
      titleKey: 'notes.subscription.trialEnding.title',
      bodyKey: 'notes.subscription.trialEnding.body',
      values: { date: covered },
    }
  if (item.kind === 'GRACE' && covered)
    return {
      ...base,
      titleKey: 'notes.subscription.grace.title',
      bodyKey: until ? 'notes.subscription.grace.body' : 'notes.subscription.grace.bodyNoDate',
      values: until ? { ended: covered, until } : { ended: covered },
    }
  // CA-9: the server sends the last covered day; the cancellation took effect the day after.
  if (cancelled && covered)
    return {
      ...base,
      titleKey: 'notes.subscription.cancelledByFawtir.title',
      bodyKey: 'notes.subscription.cancelledByFawtir.body',
      values: { date: new Date(covered.getFullYear(), covered.getMonth(), covered.getDate() + 1) },
    }
  // A kind (or a date) this screen cannot word: the server's own sentence says what it is.
  return { ...base, titleKey: '', titleText: item.headline, values: {} }
}

/* --------------------------------------------------------------------- store */

type State = {
  /** Whose reminders these are (`tenant:user`), or null when the reader may not read them. */
  owner: string | null
  /** The newest reminders, or null before the first answer. */
  items: readonly SubscriptionNoticeDto[] | null
  /** Unread, counted from the server's unread list (which the server caps at 100). */
  unread: number
  /** The server has no such route: nothing is shown and nothing more is asked. */
  missing: boolean
}

const EMPTY: State = { owner: null, items: null, unread: 0, missing: false }

let state: State = EMPTY
let writes: Promise<unknown> = Promise.resolve()
let edits = 0
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  listeners.forEach((listener) => listener())
}

export function subscribeSubscriptionNotices(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const subscriptionNoticesSnapshot = () => state

const routeMissing = (error: unknown) =>
  error instanceof ApiError && (error.status === 404 || error.status === 405)

/** Never throws: a read that fails leaves what was last read, and an absent route shows nothing. */
async function read(withList: boolean): Promise<void> {
  const owner = state.owner
  if (owner === null || state.missing) return
  for (let pending = writes; ; pending = writes) {
    await pending
    if (pending === writes) break
  }
  const before = edits
  const [list, unread] = await Promise.allSettled([
    withList
      ? loadSubscriptionNotices(subscriptionNoticesPath(false, LIST_LIMIT))
      : Promise.resolve(null),
    loadSubscriptionNotices(subscriptionNoticesPath(true, SUBSCRIPTION_NOTICES_MAX)),
  ])
  if (state.owner !== owner) return
  if (edits !== before) return read(withList)
  const missing = [list, unread].some(
    (answer) => answer.status === 'rejected' && routeMissing(answer.reason),
  )
  if (missing) {
    set({ ...state, items: [], unread: 0, missing: true })
    return
  }
  const rows = (answer: PromiseSettledResult<SubscriptionNoticeDto[] | null>) =>
    answer.status === 'fulfilled' && Array.isArray(answer.value) ? answer.value : null
  set({
    ...state,
    items: rows(list) ?? state.items ?? (withList ? [] : null),
    unread: rows(unread)?.filter((item) => !item.read).length ?? state.unread,
  })
}

export const subscriptionNoticesStore = {
  /** Whose reminders to read; a different reader (or none) starts from nothing. */
  watch(owner: string | null) {
    if (state.owner !== owner) set({ ...EMPTY, owner })
    void read(false)
  },
  refresh() {
    void read(true)
  },
  /** True when the line is one of these reminders (marked read here), false otherwise. */
  markRead(id: string): boolean {
    const item = state.items?.find((entry) => entry.id === id)
    if (!item) return false
    if (item.read) return true
    const owner = state.owner
    edits += 1
    set({
      ...state,
      items: state.items!.map((entry) => (entry.id === id ? { ...entry, read: true } : entry)),
      unread: Math.max(0, state.unread - 1),
    })
    writes = writes
      .then(() => acknowledgeSubscriptionNotice(id))
      .catch(() => {
        if (state.owner === owner) void read(true)
      })
    return true
  },
  /** There is no "mark all" route: each unread reminder on show is acknowledged in turn. */
  markAllRead() {
    const shownUnread = (state.items ?? []).filter((item) => !item.read)
    if (shownUnread.length === 0 && state.unread === 0) return
    const owner = state.owner
    edits += 1
    set({
      ...state,
      items: state.items?.map((item) => (item.read ? item : { ...item, read: true })) ?? null,
      unread: 0,
    })
    writes = writes
      .then(async () => {
        for (const item of shownUnread) await acknowledgeSubscriptionNotice(item.id)
      })
      .catch(() => undefined)
      .then(() => {
        if (state.owner === owner) void read(true)
      })
  },
  has(id: string) {
    return state.items?.some((entry) => entry.id === id) ?? false
  },
  isRead(id: string) {
    return state.items?.find((entry) => entry.id === id)?.read ?? true
  },
  reset() {
    writes = Promise.resolve()
    edits = 0
    set(EMPTY)
  },
}
