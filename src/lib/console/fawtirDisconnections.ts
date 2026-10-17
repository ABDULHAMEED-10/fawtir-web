import { ApiError, apiRequest } from '../../api'

/**
 * Platform support's side of "Disconnect from Fawtir" (`PlatformFawtirDisconnectionController`,
 * V302). The Fawtara Portal has no API: the customer records their answer in Settings, and support
 * records here what it did or saw on the portal and the Oman SMP. Reading needs the review code,
 * starting and recording need the manage code; the server adds the production PLATFORM realm, MFA
 * on writes and no impersonation.
 */
export const DISCONNECTIONS_READ_PERMISSION = 'platform.smp.operations.review'
export const DISCONNECTIONS_MANAGE_PERMISSION = 'platform.smp.operations.manage'

export const DISCONNECTIONS_PATH = '/v1/platform/fawtir-disconnections'

export type DisconnectionPath = 'ALREADY_DISCONNECTED' | 'ASK_FAWTIR' | 'MOVED_TO_ANOTHER_PROVIDER'
export type DisconnectionStatus =
  'REQUESTED' | 'WAITING_FOR_CUSTOMER_APPROVAL' | 'DISCONNECTED' | 'NOT_COMPLETED' | 'WITHDRAWN'
export type DisconnectionOrigin = 'CUSTOMER' | 'CONSOLE'
export type AskedVia = 'CALL' | 'EMAIL' | 'TAX_AUTHORITY_NOTICE'
export type NextAction =
  | 'RAISE_PORTAL_REQUEST'
  | 'CONFIRM_ON_PORTAL'
  | 'AWAIT_CUSTOMER_APPROVAL'
  | 'REMOVE_FROM_SMP'
  | 'WITHDRAW_PORTAL_REQUEST'
  | 'NONE'
export type DisconnectionStep =
  | 'REQUESTED'
  | 'PORTAL_REQUEST_RAISED'
  | 'CUSTOMER_APPROVED'
  | 'CUSTOMER_REJECTED'
  | 'REQUEST_EXPIRED'
  | 'PORTAL_DISCONNECTION_CONFIRMED'
  | 'PORTAL_NOT_DISCONNECTED'
  | 'WITHDRAWN'
  | 'PORTAL_REQUEST_WITHDRAWN'
  | 'SMP_REMOVED'

/** One row of the queue. `dueAt` is the deadline of `nextAction`, or null where the plan sets none. */
export type DisconnectionQueueItemDto = {
  id: string
  tenantId: string
  companyName: string | null
  path: DisconnectionPath
  status: DisconnectionStatus
  origin: DisconnectionOrigin
  requestedAt: string
  nextAction: NextAction
  dueAt: string | null
  overdue: boolean
}

export type DisconnectionRequestDto = {
  id: string
  tenantId: string
  path: DisconnectionPath
  status: DisconnectionStatus
  origin: DisconnectionOrigin
  requestedAt: string
  requestedBy: string | null
  askedByName: string | null
  askedVia: AskedVia | null
  askedAt: string | null
  reason: string | null
  confirmedCompanyName: string | null
  portalRequestRaisedAt: string | null
  approvalDueAt: string | null
  disconnectedAt: string | null
  smpRemovalDueAt: string | null
  smpRemovedAt: string | null
  notCompletedReason: 'CUSTOMER_REJECTED' | 'EXPIRED' | 'NOT_DISCONNECTED_ON_PORTAL' | null
  closedAt: string | null
  portalWithdrawnAt: string | null
  subscriptionEndsOn: string | null
  version: number
}

export type DisconnectionStepRecordDto = {
  id: string
  step: DisconnectionStep
  statusAfter: DisconnectionStatus
  occurredAt: string
  recordedAt: string
  actorId: string | null
  actorType: 'CUSTOMER' | 'OPERATOR' | 'SYSTEM'
  reference: string | null
  note: string | null
}

export type PlatformDisconnectionDto = {
  request: DisconnectionRequestDto
  nextAction: NextAction
  dueAt: string | null
  overdue: boolean
  /** The customer's 3 days on the portal have run out, even before anyone has recorded it. */
  approvalExpired: boolean
  steps: DisconnectionStepRecordDto[]
}

export const queuePath = (openOnly: boolean) => `${DISCONNECTIONS_PATH}?openOnly=${openOnly}`
export const disconnectionPath = (id: string) => `${DISCONNECTIONS_PATH}/${encodeURIComponent(id)}`
export const companyDisconnectionsPath = (tenantId: string) =>
  `/v1/platform/companies/${encodeURIComponent(tenantId)}/fawtir-disconnections`

export type StartDisconnection = {
  path: DisconnectionPath
  askedByName: string
  askedVia: AskedVia
  askedAt: string
  reason: string
}

/** Starts a request the customer made by phone or e-mail, or records a Tax Authority notice. */
export function startDisconnection(
  tenantId: string,
  body: StartDisconnection,
): Promise<PlatformDisconnectionDto> {
  return apiRequest<PlatformDisconnectionDto>(companyDisconnectionsPath(tenantId), {
    method: 'POST',
    body,
  })
}

export type RecordStep = {
  step: Exclude<DisconnectionStep, 'REQUESTED'>
  occurredAt: string
  reference: string | null
  note: string | null
}

/** Records one step. Recording a step already reflected changes nothing on the server. */
export function recordDisconnectionStep(
  id: string,
  body: RecordStep,
): Promise<PlatformDisconnectionDto> {
  return apiRequest<PlatformDisconnectionDto>(`${disconnectionPath(id)}/steps`, {
    method: 'POST',
    body,
  })
}

/** A request that has not completed: one is live per company at a time. */
export function isLive(status: DisconnectionStatus): boolean {
  return status === 'REQUESTED' || status === 'WAITING_FOR_CUSTOMER_APPROVAL'
}

/**
 * The steps support can record from where the request stands, in the order the form lists them.
 * The same rules the server applies (`FawtirDisconnection.apply`), so the form never offers a step
 * it would refuse; the server still decides, and a refusal re-reads the request.
 *
 * - A request that asked Fawtir to disconnect is raised on the portal, then approved, rejected or
 *   left to expire there (3 days, manual 4.3); a lapsed one can only be recorded as expired.
 * - A company that says it has already left, or a provider move, is confirmed on the portal or
 *   found still connected.
 * - Only a completed disconnection is removed from the SMP (FC-4: a rejected or unanswered request
 *   stays on the SMP).
 * - A withdrawn request that had been raised on the portal is withdrawn there too.
 */
export function stepsOffered(view: PlatformDisconnectionDto): RecordStep['step'][] {
  const { request } = view
  switch (request.status) {
    case 'REQUESTED':
      return request.path === 'ASK_FAWTIR'
        ? ['PORTAL_REQUEST_RAISED', 'WITHDRAWN']
        : ['PORTAL_DISCONNECTION_CONFIRMED', 'PORTAL_NOT_DISCONNECTED', 'WITHDRAWN']
    case 'WAITING_FOR_CUSTOMER_APPROVAL':
      return view.approvalExpired
        ? ['REQUEST_EXPIRED']
        : ['CUSTOMER_APPROVED', 'CUSTOMER_REJECTED', 'WITHDRAWN']
    case 'DISCONNECTED':
      return request.smpRemovedAt === null ? ['SMP_REMOVED'] : []
    case 'WITHDRAWN':
      return request.portalRequestRaisedAt !== null && request.portalWithdrawnAt === null
        ? ['PORTAL_REQUEST_WITHDRAWN']
        : []
    case 'NOT_COMPLETED':
      return []
  }
}

/** Expiry happens at the end of the portal's 3 days, so it carries no date of its own. */
export function stepNeedsDate(step: RecordStep['step']): boolean {
  return step !== 'REQUEST_EXPIRED'
}

/** Today in Muscat as `yyyy-mm-dd`, the latest day a recorded step can carry. */
export function muscatToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(now)
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export function isClockTime(value: string): boolean {
  return TIME.test(value)
}

/** A day and a clock time read in Oman, which keeps one offset all year, as an instant. */
export function muscatInstant(day: string, time: string): string {
  return new Date(`${day}T${time}:00+04:00`).toISOString()
}

const REFUSALS = [
  'disconnection-state-conflict',
  'production-platform-realm-required',
  'impersonation-not-allowed',
]

/**
 * A refusal in our words, as a key under `console.disconnections.refusal`. The server's English
 * detail is never shown. A `400` is a date in the future, or a field the form could not check.
 */
export function refusalKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.problemType && REFUSALS.includes(error.problemType)) {
      return `console.disconnections.refusal.${error.problemType}`
    }
    if (error.status === 400) return 'console.disconnections.refusal.invalid'
    if (error.status === 403) return 'console.disconnections.refusal.forbidden'
    if (error.status === 404) return 'console.disconnections.refusal.notFound'
  }
  return 'console.disconnections.refusal.other'
}
