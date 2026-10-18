import { ApiError, apiRequest } from '../../api'
import type { ParticipantIdStanding } from '../../api/peppol/participantStanding'
import { commonFailureMessage, type FormMessage } from '../identity/errors'
import { hasIsoControl, javaTrim } from './evidenceReference'

/**
 * The platform's read and decision on a tenant's Peppol Participant ID submission —
 * `SmpDataBlockerAdministrationController`, `BlockerType.TAXPAYER_PID_CONTRACT`. A tenant files its
 * own candidate on a separate, tenant-scoped surface this console does not call; this module is the
 * reviewer's side only, mirroring the company-verification decision beside it.
 */
export const PLATFORM_SMP_PATH = '/v1/platform/peppol/smp'

/** `SmpDataBlockerModels.SubmissionStatus`, serialised by name. */
export type PidSubmissionStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'REVOKED'
  | 'SUPERSEDED'
  | 'RELEASED'

/** The statuses `verifySubmission` will act on; anything else is read-only here. */
const REVIEWABLE: readonly PidSubmissionStatus[] = ['SUBMITTED', 'PENDING_REVIEW']

export function isReviewable(status: PidSubmissionStatus): boolean {
  return REVIEWABLE.includes(status)
}

/**
 * `SmpDataBlockerModels.TenantSubmission`, the fields this screen reads. The backend carries more
 * (policy ids, verification hash, timestamps) that no card here shows yet.
 */
export type PidSubmission = {
  id: string
  tenantId: string
  status: PidSubmissionStatus
  candidatePidScheme: string
  candidatePidValue: string
  verifiedPidScheme: string | null
  verifiedPidValue: string | null
  reasonCode: string | null
  createdBy: string
  submittedBy: string | null
  optimisticLockVersion: number
  /**
   * Added to the same read without changing any field above: `status` still says what this row
   * is, and only this says whether the company's verification counts under the policy in force.
   * Optional because a backend without it must leave the card exactly as it was.
   */
  verificationStanding?: ParticipantIdStanding | null
}

export function currentSubmissionPath(tenantId: string): string {
  return `${PLATFORM_SMP_PATH}/tenants/${tenantId}/data-submissions/current`
}

/**
 * The reviewer's decision as this screen holds it. An approval carries what the reviewer relied on
 * and why; a rejection carries neither, because `VerificationRequest` ignores both on a rejection
 * and the contract asks for neither there (owner policy 2026-10-18).
 */
export type ParticipantDecision =
  | {
      approved: true
      expectedOptimisticLockVersion: number
      reasonCode: string
      evidenceReference: string
      justification: string
    }
  | { approved: false; expectedOptimisticLockVersion: number; reasonCode: string }

/** `VerificationRequest`: exactly the fields the backend reads, nothing the form only shows. */
export type VerificationRequestBody = {
  expectedOptimisticLockVersion: number
  approved: boolean
  reasonCode: string
  evidenceReference?: string
  justification?: string
}

export function verificationRequestBody(decision: ParticipantDecision): VerificationRequestBody {
  const body: VerificationRequestBody = {
    expectedOptimisticLockVersion: decision.expectedOptimisticLockVersion,
    approved: decision.approved,
    reasonCode: decision.reasonCode.trim(),
  }
  if (decision.approved) {
    // Trimmed the way Java trims, so the value sent is the one `evidenceReferenceError` checked.
    // The justification goes as typed: the backend collapses its whitespace itself.
    body.evidenceReference = javaTrim(decision.evidenceReference)
    body.justification = decision.justification
  }
  return body
}

/**
 * Approves or rejects the tenant's own candidate as submitted — the backend takes no reviewer-typed
 * override (`VerificationRequest` carries no scheme or value), so there is nothing here for a
 * reviewer to edit before deciding; they approve the candidate on record or reject it.
 */
export function verifyParticipant(
  tenantId: string,
  submissionId: string,
  decision: ParticipantDecision,
): Promise<PidSubmission> {
  return apiRequest<PidSubmission>(
    `${PLATFORM_SMP_PATH}/tenants/${tenantId}/data-submissions/${submissionId}/verify`,
    { method: 'POST', body: verificationRequestBody(decision), credentials: 'same-origin' },
  )
}

/** `VerificationRequest.reasonCode`: `@Pattern("[A-Z0-9_-]{3,80}")`, no fixed code list exists yet. */
const REASON_CODE = /^[A-Z0-9_-]{3,80}$/

export function reasonCodeError(value: string): 'required' | 'invalid' | null {
  const trimmed = value.trim()
  if (!trimmed) return 'required'
  return REASON_CODE.test(trimmed) ? null : 'invalid'
}

/** `TransferReason`'s bounds, which the backend holds an approval's justification to. */
export const JUSTIFICATION_MAX_LENGTH = 500
const JUSTIFICATION_MIN_LENGTH = 20
const JUSTIFICATION_MIN_WORDS = 3
const JUSTIFICATION_MIN_DISTINCT = 8

export type JustificationProblem = 'required' | 'invalid' | 'length' | 'words' | 'repetitive'

/**
 * Mirrors `TransferReason`, in its order. Control characters are refused before anything is
 * collapsed, so a line break is refused rather than folded into a space. Once they are gone the only
 * whitespace Java's `trim()` and `\s+` can still meet is the plain space, which is why only spaces
 * are trimmed and collapsed here: JavaScript's own `trim()` would also drop Unicode spaces that the
 * backend counts as characters.
 */
export function justificationError(value: string): JustificationProblem | null {
  if (!value.trim()) return 'required'
  if (hasIsoControl(value)) return 'invalid'
  const collapsed = value.replace(/^ +| +$/g, '').replace(/ +/g, ' ')
  if (collapsed.length < JUSTIFICATION_MIN_LENGTH || collapsed.length > JUSTIFICATION_MAX_LENGTH) {
    return 'length'
  }
  if (collapsed.split(' ').length < JUSTIFICATION_MIN_WORDS) return 'words'
  if (new Set(collapsed.toLowerCase()).size < JUSTIFICATION_MIN_DISTINCT) return 'repetitive'
  return null
}

/**
 * The refusals that say another tenant already claims the identifier (V386). The backend never
 * names that tenant, so neither does the message; a reload cannot clear any of them.
 */
const CLAIM_REFUSALS: ReadonlyMap<string, string> = new Map([
  ['PID_ALREADY_VERIFIED', 'console.verification.participant.alreadyVerified'],
  ['PID_HELD_BY_TEST_BINDING', 'console.verification.participant.heldByTestBinding'],
  ['PID_HELD_BY_MANAGED_REGISTRATION', 'console.verification.participant.heldByManagedRegistration'],
  ['PID_HELD_BY_QUARANTINED_CLAIM', 'console.verification.participant.heldByQuarantinedClaim'],
  ['PID_CLAIM_CONFLICT', 'console.verification.participant.claimConflict'],
  // Not answered by /verify today: the backend raises it when a tenant's new draft would replace a
  // contested verified ID. Kept because `SmpBlockerRefusal` is one vocabulary across these
  // endpoints, and without the entry this 409 would fall through to "reload and look again",
  // which cannot clear a contested claim.
  ['PID_CLAIM_CONTESTED', 'console.verification.participant.claimContested'],
])

/**
 * Same shape of failure as company verification: `409` means the case moved (someone else decided
 * it, or the tenant resubmitted), `403` a missing permission. The four-eyes rule (a submitter cannot
 * verify their own filing) arrives as `409 SELF_VERIFICATION_NOT_ALLOWED`.
 *
 * The backend names its refusals with a `code`, and only that and the status are read here; the
 * problem's `detail` is never matched or shown. A `409` without a code this screen knows, which
 * includes `STALE_VERSION` and `INVALID_STATE`, keeps reading as "reload and look again": the one
 * answer that is right for all of them.
 */
export function describeParticipantFailure(error: unknown): FormMessage {
  if (error instanceof ApiError) {
    if (isPolicyNotActive(error)) return { key: 'console.verification.participant.policyNotActive' }
    if (error.status === 400 && error.code === 'PID_CANDIDATE_REJECTED') {
      return { key: 'console.verification.participant.candidateRejected' }
    }
    if (error.status === 400 && error.code === 'REVIEWER_EVIDENCE_REQUIRED') {
      return { key: 'console.verification.participant.evidenceRefused' }
    }
    if (error.status === 400 && error.code === 'REVIEWER_JUSTIFICATION_REQUIRED') {
      return { key: 'console.verification.participant.justificationRefused' }
    }
    if (error.status === 409) {
      const claim = error.code === null ? undefined : CLAIM_REFUSALS.get(error.code)
      if (claim) return { key: claim }
      if (error.code === 'SELF_VERIFICATION_NOT_ALLOWED') {
        return { key: 'console.verification.participant.ownSubmission' }
      }
      return { key: 'console.verification.participant.conflict' }
    }
    if (error.status === 403) return { key: 'console.verification.participant.forbidden' }
    if (error.status === 404) return { key: 'console.verification.detail.notFound' }
  }
  return commonFailureMessage(error)
}

/**
 * An approval refused because no taxpayer Participant ID validation policy is in force. Told apart
 * from every other refusal because the remedy is elsewhere: on the policy's own screen, not in a
 * retry here. Rejecting needs no policy, so the backend never answers a rejection this way.
 */
export function isPolicyNotActive(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400 && error.code === 'PID_POLICY_NOT_ACTIVE'
}
