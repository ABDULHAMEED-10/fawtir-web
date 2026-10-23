import { apiRequest } from '../client'

/**
 * Settings › Company profile, danger zone: "Disconnect from Fawtir" (`FawtirDisconnectionController`,
 * V302). Every call needs `admin.settings.manage` and a person; the request and the withdrawal also
 * need the OWNER or ADMIN role (403 `admin-authority-required`) and refuse impersonation
 * (403 `impersonation-not-allowed`).
 *
 * There is no Fawtara Portal API: the customer records their answer here, and Platform support
 * records in the console what it did or saw on the portal and the Oman SMP.
 */
export const FAWTIR_DISCONNECTION_PATH = '/v1/settings/fawtir-disconnection'

/** The answer to "Have you already disconnected from Fawtir on the Fawtara Portal?". */
export type DisconnectionAnswer = 'ALREADY_DISCONNECTED' | 'ASK_FAWTIR' | 'MOVING_TO_ANOTHER_PROVIDER'

export type DisconnectionPath = 'ALREADY_DISCONNECTED' | 'ASK_FAWTIR' | 'MOVED_TO_ANOTHER_PROVIDER'

export type DisconnectionStatus =
  | 'REQUESTED'
  | 'WAITING_FOR_CUSTOMER_APPROVAL'
  | 'DISCONNECTED'
  | 'NOT_COMPLETED'
  | 'WITHDRAWN'

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

export type DisconnectionNotCompletedReason = 'CUSTOMER_REJECTED' | 'EXPIRED' | 'NOT_DISCONNECTED_ON_PORTAL'

export type CompanyDisconnectionStepDto = {
  step: DisconnectionStep
  statusAfter: DisconnectionStatus
  /** When it happened on the portal or the SMP; the date the status line shows. */
  occurredAt: string
  recordedAt: string
  actorType: 'CUSTOMER' | 'OPERATOR' | 'SYSTEM'
}

/** The latest request. Instants are ISO-8601 UTC; `subscriptionEndsOn` is a business date. */
export type CompanyDisconnectionRequestDto = {
  path: DisconnectionPath
  status: DisconnectionStatus
  origin: 'CUSTOMER' | 'CONSOLE'
  askedVia: 'CALL' | 'EMAIL' | 'TAX_AUTHORITY_NOTICE' | null
  requestedAt: string
  portalRequestRaisedAt: string | null
  approvalDueAt: string | null
  /** The customer's 3 days on the portal have run out, even before anyone has recorded it. */
  approvalExpired: boolean
  disconnectedAt: string | null
  smpRemovedAt: string | null
  notCompletedReason: DisconnectionNotCompletedReason | null
  closedAt: string | null
  subscriptionEndsOn: string | null
  steps: CompanyDisconnectionStepDto[]
}

/** Coming back to Fawtir after a completed disconnection (V385). */
export type ReconnectionStatus = 'REQUESTED' | 'ACCEPTED' | 'CONNECTED' | 'NOT_COMPLETED' | 'WITHDRAWN'

export type ReconnectionStep =
  | 'REQUESTED'
  | 'PORTAL_CONNECTION_ACCEPTED'
  | 'CONNECTION_EFFECTIVE'
  | 'PORTAL_REQUEST_NOT_FOUND'
  | 'CONNECTION_DECLINED'
  | 'WITHDRAWN'
  | 'SMP_ADDED'

export type CompanyReconnectionStepDto = {
  step: ReconnectionStep
  statusAfter: ReconnectionStatus
  occurredAt: string
  recordedAt: string
  actorType: 'CUSTOMER' | 'OPERATOR' | 'SYSTEM'
}

/**
 * The latest request to come back to Fawtir. It carries no operator name and no decline reason:
 * those stay Fawtir's own record.
 */
export type CompanyReconnectionDto = {
  status: ReconnectionStatus
  origin: 'CUSTOMER' | 'CONSOLE'
  requestedAt: string
  acceptedAt: string | null
  /** Issuing comes back from here: the later of Fawtir's acceptance and the date chosen on the portal. */
  effectiveFrom: string | null
  /** An accepted connection whose date has come, even before it is recorded as connected. */
  effectiveDue: boolean
  connectedAt: string | null
  smpAddedAt: string | null
  notCompletedReason: 'PORTAL_REQUEST_NOT_FOUND' | 'DECLINED' | null
  closedAt: string | null
  steps: CompanyReconnectionStepDto[]
}

export type CompanyDisconnectionDto = {
  /** What the customer types to confirm: the English legal name (else the company's name). */
  companyName: string
  /**
   * The Arabic legal name, which the server accepts as well. Asked for in Arabic when there is one.
   * Absent from an older server, or null when the company has none: the English name alone then.
   */
  companyNameAr?: string | null
  /** False once a disconnection has completed; true again once a reconnection takes effect. */
  connected: boolean
  /** No live request and not disconnected (true again after a reconnection). */
  canRequest: boolean
  /** A live request exists. */
  canWithdraw: boolean
  /**
   * The company has left, no reconnection is open, and reconnecting is switched on
   * (`FAWTIR_RECONNECTION_ENABLED`). Absent from a server older than V385, which reads as false.
   */
  canReconnect?: boolean
  /** The latest reconnection, or null (or absent) when there has never been one. */
  reconnection?: CompanyReconnectionDto | null
  /**
   * The company has not left, pays yearly, and leaving today would put its whole months left up
   * for a refund review (Business Rules LV-6): access then runs to the paid end only until the
   * refund is decided. Absent from a server older than the field, which reads as false.
   */
  yearlyRefundReview?: boolean
  request: CompanyDisconnectionRequestDto | null
}

export type DisconnectionAnswerResultDto = {
  /** False for `MOVING_TO_ANOTHER_PROVIDER`: nothing is recorded. */
  requestNeeded: boolean
  disconnection: CompanyDisconnectionDto
}

export function loadFawtirDisconnection(): Promise<CompanyDisconnectionDto> {
  return apiRequest<CompanyDisconnectionDto>(FAWTIR_DISCONNECTION_PATH)
}

/**
 * Starts a request, or returns the one already open on the same path. A different answer while one
 * is open, or any answer once the company has left, is 409 `disconnection-state-conflict`; a typed
 * name that is not the company's is 400.
 */
export function requestFawtirDisconnection(
  answer: DisconnectionAnswer,
  companyNameConfirmation: string | null,
): Promise<DisconnectionAnswerResultDto> {
  return apiRequest<DisconnectionAnswerResultDto>(FAWTIR_DISCONNECTION_PATH, {
    method: 'POST',
    body: { answer, companyNameConfirmation },
  })
}

/** Withdraws a request that has not completed. Idempotent. */
export function withdrawFawtirDisconnection(): Promise<CompanyDisconnectionDto> {
  return apiRequest<CompanyDisconnectionDto>(`${FAWTIR_DISCONNECTION_PATH}/withdrawal`, {
    method: 'POST',
  })
}

/**
 * Settings, danger zone: "Coming back to Fawtir" (`FawtirReconnectionController`, V385). Same
 * guards as the disconnection. Both routes answer with the danger zone's status line.
 */
export const FAWTIR_RECONNECTION_PATH = '/v1/settings/fawtir-reconnection'

/**
 * Tells Fawtir the company chose it again on the Fawtara Portal (`confirmed` must be true, 400
 * otherwise). Repeating it while a request is open returns that request. 409
 * `disconnection-state-conflict` when the company has not left, `reconnection-not-open` while
 * reconnecting is switched off.
 */
export function requestFawtirReconnection(): Promise<CompanyDisconnectionDto> {
  return apiRequest<CompanyDisconnectionDto>(FAWTIR_RECONNECTION_PATH, {
    method: 'POST',
    body: { confirmed: true },
  })
}

/**
 * Withdraws a reconnection Fawtir has not accepted yet. Idempotent. 409
 * `reconnection-state-conflict` when nothing is open or Fawtir has already accepted it.
 */
export function withdrawFawtirReconnection(): Promise<CompanyDisconnectionDto> {
  return apiRequest<CompanyDisconnectionDto>(`${FAWTIR_RECONNECTION_PATH}/withdrawal`, {
    method: 'POST',
  })
}
