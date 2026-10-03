import { ApiError } from '../errors'
import { apiRequest } from '../client'

/**
 * `ParticipantIdStanding`: where a company's Participant ID stands against the taxpayer
 * Participant ID validation policy in force. The server computes it so that no screen re-derives
 * whether an older verification still counts; screens branch on `state` and the booleans only.
 */
export type ParticipantStandingState =
  | 'NOT_SUBMITTED'
  | 'DRAFT'
  | 'AWAITING_REVIEW'
  | 'VERIFIED'
  | 'REVERIFICATION_REQUIRED'
  | 'NO_POLICY_IN_FORCE'
  | 'REJECTED'

/**
 * The verification on record. It names no operator on purpose: the backend answers the same record
 * to the company, which has no need to know who decided.
 */
export type ParticipantVerificationReference = {
  submissionId: string
  submissionVersion: number
  participantScheme: string
  participantValue: string
  policyVersionId: string
  policyVersionNumber: number | null
  verifiedAt: string
}

export type ParticipantIdStanding = {
  state: ParticipantStandingState
  currentPolicySatisfied: boolean
  reverificationRequired: boolean
  reverificationAvailable: boolean
  policyInForce: { id: string; versionNumber: number } | null
  verification: ParticipantVerificationReference | null
}

export const PARTICIPANT_STANDING_PATH = '/v1/peppol/smp/data-submissions/standing'
export const PARTICIPANT_REVERIFICATION_PATH = '/v1/peppol/smp/data-submissions/reverification'

/** The 201 answer: the new submission, of which this screen reads only the standing it carries. */
export type ReverificationResult = { verificationStanding: ParticipantIdStanding }

export function readParticipantStanding(): Promise<ParticipantIdStanding> {
  return apiRequest<ParticipantIdStanding>(PARTICIPANT_STANDING_PATH)
}

/**
 * Asks Fawtir to verify the company's Participant ID again against the policy it was shown.
 *
 * The body is built field by field: `ReverificationRequest` rejects unknown properties, and the
 * candidate is deliberately absent because the server re-verifies the data it already holds. The
 * backend requires `X-Correlation-Id` on this route and the shared client sends none, so one is
 * minted per request, the same way modules mint their `Idempotency-Key`.
 */
export function requestReverification(
  expectedPolicyVersionId: string,
): Promise<ReverificationResult> {
  return apiRequest<ReverificationResult>(PARTICIPANT_REVERIFICATION_PATH, {
    method: 'POST',
    body: { expectedPolicyVersionId },
    headers: { 'X-Correlation-Id': crypto.randomUUID() },
  })
}

/** The refusals this request names by `code`; anything else falls to the shared handling. */
export type ReverificationRefusal =
  | 'POLICY_CHANGED'
  | 'SUBMISSION_IN_PROGRESS'
  | 'REVERIFICATION_NOT_REQUIRED'
  | 'PID_POLICY_NOT_ACTIVE'

const REFUSALS: Record<ReverificationRefusal, number> = {
  POLICY_CHANGED: 409,
  SUBMISSION_IN_PROGRESS: 409,
  REVERIFICATION_NOT_REQUIRED: 409,
  PID_POLICY_NOT_ACTIVE: 400,
}

/**
 * Read from the status and the problem's `code` only. The `detail` is English prose for the logs
 * and is never matched, so a refusal reads the same in Arabic and cannot be misread when its
 * wording changes.
 */
export function reverificationRefusal(error: unknown): ReverificationRefusal | null {
  if (!(error instanceof ApiError) || error.code === null) return null
  const code = error.code as ReverificationRefusal
  return Object.hasOwn(REFUSALS, code) && REFUSALS[code] === error.status ? code : null
}

/** The three refusals after which the standing on screen is known to be out of date. */
export function refusalNeedsReload(refusal: ReverificationRefusal | null): boolean {
  return (
    refusal === 'POLICY_CHANGED' ||
    refusal === 'SUBMISSION_IN_PROGRESS' ||
    refusal === 'REVERIFICATION_NOT_REQUIRED'
  )
}
