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

export type CompanyDisconnectionDto = {
  /** What the customer types to confirm. */
  companyName: string
  /** False once a disconnection has completed. */
  connected: boolean
  /** No live request and not disconnected. */
  canRequest: boolean
  /** A live request exists. */
  canWithdraw: boolean
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
