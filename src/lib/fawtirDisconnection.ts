import type {
  CompanyDisconnectionDto,
  CompanyDisconnectionRequestDto,
  CompanyReconnectionDto,
  ReconnectionStatus,
} from '../api/settings/fawtirDisconnection'
import type { Entitlements } from './identity/entitlements'

/**
 * Who sees "Disconnect from Fawtir": the owner or an Administrator only (Business Rules LV-1). The
 * server checks `admin.settings.manage` and then the role itself (`OWNER` or `ADMIN`), because the
 * permission can be put in a custom role; the screen asks the same two questions so a custom role
 * holding the permission is not offered a button the server would refuse.
 */
export const DISCONNECTION_PERMISSION = 'admin.settings.manage'
const DISCONNECTION_ROLES = ['OWNER', 'ADMIN']

export function canSeeDisconnection(entitlements: Entitlements | null): boolean {
  if (!entitlements) return false
  return (
    entitlements.permissions.includes(DISCONNECTION_PERMISSION) &&
    entitlements.roles.some((role) => DISCONNECTION_ROLES.includes(role.code.toUpperCase()))
  )
}

/** The status line's one sentence (plan v4 §10, "What the customer sees"), as an i18n key under `fawtirDisconnection.line`. */
export type DisconnectionLine =
  | 'removalReceived'
  | 'askReceived'
  | 'approveByDate'
  | 'disconnected'
  | 'notCompleted'
  | 'notDisconnectedOnPortal'
  | 'withdrawn'

/** The status pill's word, as an i18n key under `fawtirDisconnection.status`. */
export type DisconnectionPill = CompanyDisconnectionRequestDto['status']

export type DisconnectionStanding = {
  pill: DisconnectionPill
  line: DisconnectionLine
  /** The instant the line's date comes from, or null when it names none. */
  dateAt: string | null
}

/**
 * Where the latest request stands. A waiting request whose 3 days have run out reads as not
 * completed at once (`approvalExpired`), before anyone has recorded the expiry: the portal has
 * already cancelled it (manual 4.3), and the company is still connected (FC-4).
 */
export function disconnectionStanding(request: CompanyDisconnectionRequestDto): DisconnectionStanding {
  switch (request.status) {
    case 'REQUESTED':
      return request.path === 'ASK_FAWTIR'
        ? { pill: 'REQUESTED', line: 'askReceived', dateAt: request.requestedAt }
        : { pill: 'REQUESTED', line: 'removalReceived', dateAt: request.requestedAt }
    case 'WAITING_FOR_CUSTOMER_APPROVAL':
      return request.approvalExpired
        ? { pill: 'NOT_COMPLETED', line: 'notCompleted', dateAt: request.approvalDueAt }
        : { pill: 'WAITING_FOR_CUSTOMER_APPROVAL', line: 'approveByDate', dateAt: request.approvalDueAt }
    case 'DISCONNECTED':
      return { pill: 'DISCONNECTED', line: 'disconnected', dateAt: request.disconnectedAt }
    case 'NOT_COMPLETED':
      return {
        pill: 'NOT_COMPLETED',
        line:
          request.notCompletedReason === 'NOT_DISCONNECTED_ON_PORTAL'
            ? 'notDisconnectedOnPortal'
            : 'notCompleted',
        dateAt: request.closedAt,
      }
    case 'WITHDRAWN':
      return { pill: 'WITHDRAWN', line: 'withdrawn', dateAt: request.closedAt }
  }
}

/**
 * The reconnection that belongs to the company's current departure, or null. The view carries the
 * latest reconnection whatever its age, so one from an earlier departure (the company came back,
 * then left again) is not this one: it must have been asked for after the latest disconnection
 * completed. Nothing about coming back applies unless the latest request is that completed
 * disconnection.
 */
export function currentReconnection(view: CompanyDisconnectionDto): CompanyReconnectionDto | null {
  const { request } = view
  const reconnection = view.reconnection ?? null
  if (!reconnection || request?.status !== 'DISCONNECTED') return null
  if (request.disconnectedAt && Date.parse(reconnection.requestedAt) < Date.parse(request.disconnectedAt)) {
    return null
  }
  return reconnection
}

/**
 * Whether the danger zone shows "Coming back to Fawtir": the company has left and may tell Fawtir
 * it is coming back (`canReconnect`, false while `FAWTIR_RECONNECTION_ENABLED` is off), or a
 * request to come back exists for this departure. With the switch off and no request, nothing
 * about reconnecting shows.
 */
export function showsComingBack(view: CompanyDisconnectionDto): boolean {
  return view.request?.status === 'DISCONNECTED' && (view.canReconnect === true || currentReconnection(view) !== null)
}

/** The reconnection pill's word, as an i18n key under `fawtirReconnection.status`. */
export type ReconnectionPill = ReconnectionStatus

/** The reconnection line's sentence, as an i18n key under `fawtirReconnection.line`. */
export type ReconnectionLine = 'requested' | 'accepted' | 'connected' | 'notFound' | 'declined' | 'withdrawn'

export type ReconnectionStanding = {
  pill: ReconnectionPill
  line: ReconnectionLine
  dateAt: string | null
}

/**
 * Where coming back stands. An accepted connection whose date has come reads as connected at once
 * (`effectiveDue`), before the sweep records it: issuing is back from that date.
 */
export function reconnectionStanding(reconnection: CompanyReconnectionDto): ReconnectionStanding {
  switch (reconnection.status) {
    case 'REQUESTED':
      return { pill: 'REQUESTED', line: 'requested', dateAt: reconnection.requestedAt }
    case 'ACCEPTED':
      return reconnection.effectiveDue
        ? { pill: 'CONNECTED', line: 'connected', dateAt: reconnection.effectiveFrom }
        : { pill: 'ACCEPTED', line: 'accepted', dateAt: reconnection.effectiveFrom }
    case 'CONNECTED':
      return { pill: 'CONNECTED', line: 'connected', dateAt: reconnection.connectedAt }
    case 'NOT_COMPLETED':
      return {
        pill: 'NOT_COMPLETED',
        line: reconnection.notCompletedReason === 'DECLINED' ? 'declined' : 'notFound',
        dateAt: reconnection.closedAt,
      }
    case 'WITHDRAWN':
      return { pill: 'WITHDRAWN', line: 'withdrawn', dateAt: reconnection.closedAt }
  }
}

/** Today in Muscat as `yyyy-mm-dd`. */
function muscatToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(now)
}

/**
 * Connected again after the paid period ran out (`subscriptionEndsOn` is its last day): issuing
 * needs the normal renewal, whose new period starts on the day it is paid (CA-6).
 */
export function renewalNeeded(request: CompanyDisconnectionRequestDto, now: Date = new Date()): boolean {
  return request.subscriptionEndsOn !== null && request.subscriptionEndsOn < muscatToday(now)
}

/**
 * Plan v4 A3.8, billing screens while disconnected: the company has left Fawtir (a completed
 * disconnection the danger zone offers to come back from) and no reconnection has taken effect, so
 * paying must wait for reconnecting. Same gate as "Coming back to Fawtir" (`showsComingBack`): a
 * server with reconnecting off, or older than V385, reads as nothing to say.
 */
export function mustReconnectBeforePaying(view: CompanyDisconnectionDto): boolean {
  if (!showsComingBack(view)) return false
  const reconnection = currentReconnection(view)
  return reconnection === null || reconnectionStanding(reconnection).pill !== 'CONNECTED'
}
