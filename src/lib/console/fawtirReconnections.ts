import { ApiError, apiRequest } from '../../api'

/**
 * Platform support's side of coming back to Fawtir after a completed disconnection
 * (`PlatformFawtirReconnectionController`, V385). The same permissions as the disconnection queue:
 * reading needs the review code, starting and recording need the manage code; the server adds the
 * production PLATFORM realm, MFA on writes and no impersonation.
 *
 * Nothing here acts on the Fawtara Portal or the Oman SMP. Support accepts the connection on the
 * portal and adds the company back to the SMP outside the console, then records it here.
 */
export const RECONNECTIONS_PATH = '/v1/platform/fawtir-reconnections'

export type ReconnectionStatus =
  'REQUESTED' | 'ACCEPTED' | 'CONNECTED' | 'NOT_COMPLETED' | 'WITHDRAWN'
export type ReconnectionOrigin = 'CUSTOMER' | 'CONSOLE'
/** How support learned of it; `PORTAL_NOTICE` is the connect request seen on the Fawtara Portal. */
export type ReconnectionAskedVia = 'CALL' | 'EMAIL' | 'PORTAL_NOTICE'
export type ReconnectionNextAction = 'ACCEPT_ON_PORTAL' | 'ADD_TO_SMP' | 'NONE'
export type ReconnectionStep =
  | 'REQUESTED'
  | 'PORTAL_CONNECTION_ACCEPTED'
  | 'CONNECTION_EFFECTIVE'
  | 'PORTAL_REQUEST_NOT_FOUND'
  | 'CONNECTION_DECLINED'
  | 'WITHDRAWN'
  | 'SMP_ADDED'

/**
 * One row of the queue. `dueAt` is the SMP add deadline, 3 Oman business days after the acceptance
 * (manual 7.5.1); the plan sets none for accepting on the portal.
 */
export type ReconnectionQueueItemDto = {
  id: string
  tenantId: string
  companyName: string | null
  status: ReconnectionStatus
  origin: ReconnectionOrigin
  requestedAt: string
  nextAction: ReconnectionNextAction
  dueAt: string | null
  overdue: boolean
  /** An accepted connection whose date has come, even before the sweep records it. */
  effectiveDue: boolean
}

export type ReconnectionRequestDto = {
  id: string
  tenantId: string
  disconnectionId: string
  status: ReconnectionStatus
  origin: ReconnectionOrigin
  requestedAt: string
  requestedBy: string | null
  askedByName: string | null
  askedVia: ReconnectionAskedVia | null
  askedAt: string | null
  note: string | null
  acceptedAt: string | null
  effectiveFrom: string | null
  connectedAt: string | null
  smpAddDueAt: string | null
  smpAddedAt: string | null
  notCompletedReason: 'PORTAL_REQUEST_NOT_FOUND' | 'DECLINED' | null
  /** Support's own record; never shown or mailed to the customer. */
  declineReason: string | null
  closedAt: string | null
  /** Connecting withdrew the end of the subscription the disconnection had scheduled. */
  subscriptionResumed: boolean
  version: number
}

export type ReconnectionStepRecordDto = {
  id: string
  step: ReconnectionStep
  statusAfter: ReconnectionStatus
  occurredAt: string
  recordedAt: string
  actorId: string | null
  actorType: 'CUSTOMER' | 'OPERATOR' | 'SYSTEM'
  reference: string | null
  note: string | null
}

export type PlatformReconnectionDto = {
  request: ReconnectionRequestDto
  nextAction: ReconnectionNextAction
  dueAt: string | null
  overdue: boolean
  effectiveDue: boolean
  steps: ReconnectionStepRecordDto[]
}

export const reconnectionQueuePath = (openOnly: boolean) =>
  `${RECONNECTIONS_PATH}?openOnly=${openOnly}`
export const reconnectionPath = (id: string) => `${RECONNECTIONS_PATH}/${encodeURIComponent(id)}`
export const companyReconnectionsPath = (tenantId: string) =>
  `/v1/platform/companies/${encodeURIComponent(tenantId)}/fawtir-reconnections`

export type StartReconnection = {
  askedVia: ReconnectionAskedVia
  /** Required unless `askedVia` is `PORTAL_NOTICE`. */
  askedByName: string | null
  askedAt: string
  note: string | null
}

/**
 * Starts a reconnection for a company that has left, on its call or e-mail or on the connect
 * request support saw on the portal. Repeating it while one is open returns it. 409
 * `disconnection-state-conflict` when the company has not left; `reconnection-not-open` while
 * reconnecting is switched off.
 */
export function startReconnection(
  tenantId: string,
  body: StartReconnection,
): Promise<PlatformReconnectionDto> {
  return apiRequest<PlatformReconnectionDto>(companyReconnectionsPath(tenantId), {
    method: 'POST',
    body,
  })
}

export type RecordableReconnectionStep = Exclude<
  ReconnectionStep,
  'REQUESTED' | 'CONNECTION_EFFECTIVE'
>

export type RecordReconnectionStep = {
  step: RecordableReconnectionStep
  occurredAt: string
  /** `PORTAL_CONNECTION_ACCEPTED` only: the date the company chose on the portal; omitted means now. */
  effectiveFrom?: string
  reference: string | null
  note: string | null
  /** `CONNECTION_DECLINED` only, and required there. */
  declineReason?: string
}

/** Records one step. Recording a step already reflected changes nothing on the server. */
export function recordReconnectionStep(
  id: string,
  body: RecordReconnectionStep,
): Promise<PlatformReconnectionDto> {
  return apiRequest<PlatformReconnectionDto>(`${reconnectionPath(id)}/steps`, {
    method: 'POST',
    body,
  })
}

export function isReconnectionLive(status: ReconnectionStatus): boolean {
  return status === 'REQUESTED' || status === 'ACCEPTED'
}

/**
 * The steps support can record from where the request stands, as the server allows them
 * (`FawtirReconnection.apply`); the server still decides, and a refusal re-reads the request.
 *
 * - A request waiting for Fawtir is accepted on the portal, found missing there, declined (with a
 *   reason), or withdrawn on the customer's behalf.
 * - Once accepted, the company is added back to the Oman SMP; that is recorded here only.
 * - The effective date's arrival is recorded by the system, never by support.
 */
export function reconnectionStepsOffered(
  view: PlatformReconnectionDto,
): RecordableReconnectionStep[] {
  const { request } = view
  switch (request.status) {
    case 'REQUESTED':
      return [
        'PORTAL_CONNECTION_ACCEPTED',
        'PORTAL_REQUEST_NOT_FOUND',
        'CONNECTION_DECLINED',
        'WITHDRAWN',
      ]
    case 'ACCEPTED':
    case 'CONNECTED':
      return request.smpAddedAt === null ? ['SMP_ADDED'] : []
    case 'NOT_COMPLETED':
    case 'WITHDRAWN':
      return []
  }
}

const REFUSALS = [
  'reconnection-state-conflict',
  'reconnection-not-open',
  'disconnection-state-conflict',
  'production-platform-realm-required',
  'impersonation-not-allowed',
]

/**
 * A refusal in our words, as a key under `console.reconnections.refusal` (or the disconnection
 * queue's shared sentences for the generic ones). The server's English detail is never shown.
 */
export function reconnectionRefusalKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.problemType && REFUSALS.includes(error.problemType)) {
      return `console.reconnections.refusal.${error.problemType}`
    }
    if (error.status === 400) return 'console.reconnections.refusal.invalid'
    if (error.status === 403) return 'console.disconnections.refusal.forbidden'
    if (error.status === 404) return 'console.disconnections.refusal.notFound'
  }
  return 'console.disconnections.refusal.other'
}
