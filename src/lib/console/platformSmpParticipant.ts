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
 * the outcome is unknown; support tries again, or does it by hand and records it (with evidence).
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

/**
 * What the server offers now (option C). `REMOVE` and `ADD_BACK` make the SMP call;
 * `RECORD_REMOVAL`, `RECORD_ADDITION` and `CONFIRM_REGISTRATION` are support's record of a change
 * the console's call did not make, which never calls the SMP.
 */
export type SmpAction =
  'REMOVE' | 'RECORD_REMOVAL' | 'ADD_BACK' | 'RECORD_ADDITION' | 'CONFIRM_REGISTRATION'

export type SmpNotice = 'ACCEPTED_BACK' | 'CHANGE_PENDING' | 'NEVER_REMOVED' | 'ALREADY_ABSENT'

export type SmpCallStatusDto = {
  enabled: boolean
  latest: SmpCallRequestDto | null
  /** The fields below come from servers with option C; a missing field means off. */
  overrideEnabled?: boolean
  callable?: boolean
  notCallableReason?: string | null
  actions?: SmpAction[]
  registrationState?: string | null
  notice?: SmpNotice | null
}

/** The server's offered actions, or `null` from a server that does not say (before option C). */
export function offeredActions(status: SmpCallStatusDto): SmpAction[] | null {
  return Array.isArray(status.actions) ? status.actions : null
}

export type SmpOverrideKind = 'REMOVED' | 'ADDED' | 'CONFIRMED'
export type SmpOverrideChannel = 'FAWTARA_PORTAL' | 'OTA_SUPPORT' | 'OTHER'
export const SMP_OVERRIDE_CHANNELS: SmpOverrideChannel[] = [
  'FAWTARA_PORTAL',
  'OTA_SUPPORT',
  'OTHER',
]
export const SMP_OVERRIDE_REFERENCE_MAX = 200

/** The record each offered action opens. */
export const OVERRIDE_KIND: Partial<Record<SmpAction, SmpOverrideKind>> = {
  RECORD_REMOVAL: 'REMOVED',
  RECORD_ADDITION: 'ADDED',
  CONFIRM_REGISTRATION: 'CONFIRMED',
}

export type SmpOverrideBody = {
  kind: SmpOverrideKind
  disconnectionId?: string
  reconnectionId?: string
  /** The Oman date, `yyyy-mm-dd`. */
  occurredOn: string
  channel: SmpOverrideChannel
  reason: string
  /** Required evidence, such as an OTA ticket number. */
  reference: string
}

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

/**
 * Records a removal, add-back or confirmation the console's call did not make. Never calls the
 * SMP; the server moves the company's SMP registration with the step and answers with the new
 * status. A repeat after success is refused (already recorded), so it cannot record twice.
 */
export function recordSmpOverride(
  tenantId: string,
  body: SmpOverrideBody,
): Promise<SmpCallStatusDto> {
  return apiRequest<SmpCallStatusDto>(`${base(tenantId)}/overrides`, { method: 'POST', body })
}

const REFUSALS = [
  'platform-smp-participant-not-open',
  'platform-smp-override-not-open',
  'disconnection-state-conflict',
  'reconnection-state-conflict',
  'production-platform-realm-required',
  'impersonation-not-allowed',
]

/** A refusal in our words, as a key under `console.smpCall.refusal`. Never the server's English. */
export function smpCallRefusalKey(error: unknown, what: 'call' | 'record' = 'call'): string {
  if (error instanceof ApiError) {
    if (error.problemType && REFUSALS.includes(error.problemType)) {
      return `console.smpCall.refusal.${error.problemType}`
    }
    if (error.status === 400)
      return what === 'record'
        ? 'console.smpCall.refusal.invalidRecord'
        : 'console.smpCall.refusal.invalid'
    if (error.status === 403) return 'console.disconnections.refusal.forbidden'
    if (error.status === 404) return 'console.disconnections.refusal.notFound'
    if (error.status === 409)
      return what === 'record'
        ? 'console.smpCall.refusal.recordConflict'
        : 'console.smpCall.refusal.conflict'
  }
  return 'console.disconnections.refusal.other'
}
