import { ApiError, apiRequest } from '../../api'
import { commonFailureMessage, type FormMessage } from '../identity/errors'

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
}

export function currentSubmissionPath(tenantId: string): string {
  return `${PLATFORM_SMP_PATH}/tenants/${tenantId}/data-submissions/current`
}

/**
 * Approves or rejects the tenant's own candidate as submitted — the backend takes no reviewer-typed
 * override (`VerificationRequest` carries no scheme or value), so there is nothing here for a
 * reviewer to edit before deciding; they approve the candidate on record or reject it.
 */
export function verifyParticipant(
  tenantId: string,
  submissionId: string,
  decision: { expectedOptimisticLockVersion: number; approved: boolean; reasonCode: string },
): Promise<PidSubmission> {
  return apiRequest<PidSubmission>(
    `${PLATFORM_SMP_PATH}/tenants/${tenantId}/data-submissions/${submissionId}/verify`,
    {
      method: 'POST',
      body: {
        expectedOptimisticLockVersion: decision.expectedOptimisticLockVersion,
        approved: decision.approved,
        reasonCode: decision.reasonCode.trim(),
      },
      credentials: 'same-origin',
    },
  )
}

/** `VerificationRequest.reasonCode`: `@Pattern("[A-Z0-9_-]{3,80}")`, no fixed code list exists yet. */
const REASON_CODE = /^[A-Z0-9_-]{3,80}$/

export function reasonCodeError(value: string): 'required' | 'invalid' | null {
  const trimmed = value.trim()
  if (!trimmed) return 'required'
  return REASON_CODE.test(trimmed) ? null : 'invalid'
}

/**
 * Same shape of failure as company verification: `409` means the case moved (someone else decided
 * it, or the tenant resubmitted), `403` a missing permission or the four-eyes rule (a submitter
 * cannot verify their own filing). A distinct `409` also covers the Participant ID already being
 * verified for another tenant — the backend cannot tell that apart from a stale revision by status
 * code alone, so both read the same way: reload and look again.
 */
export function describeParticipantFailure(error: unknown): FormMessage {
  if (error instanceof ApiError) {
    if (error.status === 409) return { key: 'console.verification.participant.conflict' }
    if (error.status === 403) return { key: 'console.verification.participant.forbidden' }
    if (error.status === 404) return { key: 'console.verification.detail.notFound' }
  }
  return commonFailureMessage(error)
}
