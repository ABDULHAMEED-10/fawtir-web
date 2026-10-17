import { loadPlanOverview, type AllowanceUsageDto } from '../api/settings/plan'
import type { Note } from './notifications'
import { formatCount } from './format'

/**
 * The allowance warnings in the app (Business Rules AL-8): at 80%, 90% and 100% of the month's
 * documents, plan and extras together. Received documents move the count too, so a warning can
 * come from incoming supplier invoices alone. The 100% warning says plainly that issuing stops and
 * received documents are held until extra documents are bought.
 *
 * The threshold is the server's own (`allowance.warningPercent` on `GET /v1/settings/plan`), never
 * worked out here. The server keeps no in-app notice of it (it e-mails the administrators), so
 * the bell's line is built from that figure and its "read" mark is kept in this browser only.
 * TODO(backend): SETTINGS.md row 5.8, a server-side in-app allowance notice the bell can read and
 * acknowledge like the subscription reminders.
 *
 * The warnings are for the owner and the administrators only (AL-8). Today anyone who may read the
 * plan sees the line, because `warningPercent` is sent to every such reader and nothing on the
 * session names the owner. TODO(backend): once the plan read sends `warningPercent` (or its own
 * notice) to the owner and administrators only, this follows it with no change here.
 */

export type QuotaWarning = { percent: 80 | 90 | 100; used: number; allowance: number }

/** The warning the server says has been reached, or null below 80%. */
export function quotaWarningOf(allowance: AllowanceUsageDto | null | undefined): QuotaWarning | null {
  const percent = allowance?.warningPercent
  if (percent !== 80 && percent !== 90 && percent !== 100) return null
  return { percent, used: allowance!.used, allowance: allowance!.totalAllowance }
}

export const quotaWarningTitleKey = (warning: QuotaWarning) =>
  warning.percent === 100 ? 'quotaWarning.full.title' : 'quotaWarning.near.title'

export const quotaWarningBodyKey = (warning: QuotaWarning) =>
  warning.percent === 100 ? 'quotaWarning.full.body' : 'quotaWarning.near.body'

/**
 * One line per period, threshold and allowance: buying extras raises the allowance, so running out
 * again afterwards is a new warning rather than one already read.
 */
export function quotaNoteId(allowance: AllowanceUsageDto, warning: QuotaWarning): string {
  return `quota:${allowance.periodStart}:${allowance.totalAllowance}:${warning.percent}`
}

export function quotaNote(allowance: AllowanceUsageDto, warning: QuotaWarning): Note {
  return {
    id: quotaNoteId(allowance, warning),
    group: 'today',
    tone: warning.percent === 100 ? 'danger' : 'warning',
    icon: 'quota',
    titleKey: quotaWarningTitleKey(warning),
    bodyKey: quotaWarningBodyKey(warning),
    values: {
      percent: warning.percent,
      used: formatCount(warning.used),
      allowance: formatCount(warning.allowance),
    },
    when: { at: '' },
    actions: [
      { id: 'plan', labelKey: 'quotaWarning.openPlan', kind: 'primary', to: '/settings/plan' },
    ],
    unread: true,
  }
}

/* --------------------------------------------------------------------- store */

type State = {
  /** Whose bell (`tenant:user`), or null when the reader may not read the plan. */
  owner: string | null
  note: Note | null
  read: boolean
}

const EMPTY: State = { owner: null, note: null, read: true }

let state: State = EMPTY
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  listeners.forEach((listener) => listener())
}

export function subscribeQuotaNotice(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const quotaNoticeSnapshot = () => state

const storageKey = (owner: string) => `fawtir.quotaNotice.read.${owner}`

/** The browser may refuse storage (private window, blocked site data): the line is then unread. */
function readMark(owner: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(owner))
  } catch {
    return null
  }
}

function writeMark(owner: string, id: string) {
  try {
    window.localStorage.setItem(storageKey(owner), id)
  } catch {
    // Kept for this visit only.
  }
}

/** Never throws: a plan that cannot be read leaves the bell as it was. */
async function read(): Promise<void> {
  const owner = state.owner
  if (owner === null) return
  try {
    const overview = await loadPlanOverview()
    if (state.owner !== owner) return
    const allowance = overview.allowance ?? null
    const warning = quotaWarningOf(allowance)
    const note = allowance && warning ? quotaNote(allowance, warning) : null
    set({ ...state, note, read: note === null || readMark(owner) === note.id })
  } catch {
    // Nothing to add.
  }
}

export const quotaNoticeStore = {
  watch(owner: string | null) {
    if (state.owner !== owner) set({ ...EMPTY, owner })
    void read()
  },
  /** True when the line is the allowance warning (marked read here), false otherwise. */
  markRead(id: string): boolean {
    if (state.note?.id !== id || state.owner === null) return false
    if (!state.read) {
      writeMark(state.owner, id)
      set({ ...state, read: true })
    }
    return true
  },
  markAllRead() {
    if (state.note && state.owner !== null && !state.read) {
      writeMark(state.owner, state.note.id)
      set({ ...state, read: true })
    }
  },
  reset() {
    set(EMPTY)
  },
}
