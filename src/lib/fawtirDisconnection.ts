import type { CompanyDisconnectionRequestDto } from '../api/settings/fawtirDisconnection'
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
