import { ApiError, apiRequest } from '../../api'

/**
 * Platform support's Oman SMP call for one company (`PlatformSmpParticipantController`, F14): remove
 * it after it left Fawtir, add it back after its reconnection was accepted, without disabling or
 * closing it. The same permissions as the disconnection queue; the server adds the production
 * PLATFORM realm, MFA and no impersonation, and refuses both calls `platform-smp-participant-not-open`
 * while `FAWTIR_PLATFORM_SMP_PARTICIPANT_ENABLED` is off. The latest-request read answers either
 * way, with `enabled`, so the screen can keep recording the step by hand when the calls are off.
 *
 * The SMP call itself runs on the server's operation worker. When the SMP confirms it, the server
 * records SMP_REMOVED or SMP_ADDED on the request; nothing here records the step.
 */
export type SmpCallKind = 'REMOVAL' | 'ADDITION'

/**
 * `FAILED`: the SMP refused it for good; asking again makes a new attempt. `RECONCILIATION_REQUIRED`:
 * the outcome is unknown; it is resolved from the SMP problem operations, never by asking again.
 */
export type SmpCallOutcome = 'PENDING' | 'DONE' | 'FAILED' | 'RECONCILIATION_REQUIRED'

export type SmpCallRequestDto = {
  requestId: string
  kind: SmpCallKind
  disconnectionId: string | null
  reconnectionId: string | null
  attemptNumber: number
  reason: string
  requestedBy: string
  requestedAt: string
  operationId: string
  operationState: string | null
  attemptCount: number
  nextAttemptAt: string | null
  deadlineAt: string | null
  outcome: SmpCallOutcome
}

export type SmpCallStatusDto = { enabled: boolean; latest: SmpCallRequestDto | null }

export type SmpCallAcceptedDto = {
  requestId: string | null
  operationId: string
  operationState: string
  attemptNumber: number
  /** An attempt already queued, done or awaiting reconciliation answered instead of a new one. */
  replayed: boolean
}

/** The server's reason column; the dialog stops typing here. */
export const SMP_CALL_REASON_MAX = 500

const base = (tenantId: string) =>
  `/v1/platform/peppol/smp/tenants/${encodeURIComponent(tenantId)}/participant`

export function smpCallStatusPath(tenantId: string, kind: SmpCallKind, linkId: string): string {
  const query = kind === 'REMOVAL' ? 'disconnectionId' : 'reconnectionId'
  return `${base(tenantId)}/requests/latest?${query}=${encodeURIComponent(linkId)}`
}

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `smp-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Asks the server to make the SMP call. The server keys the operation on the disconnection or
 * reconnection, so a second click answers with the same attempt whatever key is sent.
 */
export function requestSmpCall(
  tenantId: string,
  kind: SmpCallKind,
  linkId: string,
  reason: string,
): Promise<SmpCallAcceptedDto> {
  const key = newKey()
  return apiRequest<SmpCallAcceptedDto>(
    `${base(tenantId)}/${kind === 'REMOVAL' ? 'removal' : 'addition'}`,
    {
      method: 'POST',
      body:
        kind === 'REMOVAL'
          ? { disconnectionId: linkId, reason }
          : { reconnectionId: linkId, reason },
      headers: { 'Idempotency-Key': key, 'X-Correlation-Id': key },
    },
  )
}

const REFUSALS = [
  'platform-smp-participant-not-open',
  'disconnection-state-conflict',
  'reconnection-state-conflict',
  'production-platform-realm-required',
  'impersonation-not-allowed',
]

/** A refusal in our words, as a key under `console.smpCall.refusal`. Never the server's English. */
export function smpCallRefusalKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.problemType && REFUSALS.includes(error.problemType)) {
      return `console.smpCall.refusal.${error.problemType}`
    }
    if (error.status === 400) return 'console.smpCall.refusal.invalid'
    if (error.status === 403) return 'console.disconnections.refusal.forbidden'
    if (error.status === 404) return 'console.disconnections.refusal.notFound'
    if (error.status === 409) return 'console.smpCall.refusal.conflict'
  }
  return 'console.disconnections.refusal.other'
}
