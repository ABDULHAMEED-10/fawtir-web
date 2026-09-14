import { ApiError, apiRequest } from '../../api'
import { commonFailureMessage, type FormMessage } from '../identity/errors'

/**
 * The platform company-review surface: reads on `PlatformCompanyReviewController`, decisions on
 * `TenantController`. Every endpoint is guarded by this one permission server-side; the console
 * checks it only to decide what to offer.
 */
export const REVIEW_PERMISSION = 'platform.tenants.manage'
export const COMPANIES_PATH = '/v1/platform/companies'
export const VERIFICATION_ROUTE = '/console/onboarding'

/** The design's list size; the backend accepts 1–200 and defaults to 25. */
export const QUEUE_PAGE_SIZE = 25

/** `CompanyVerificationStatus`. */
export type VerificationStatus = 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED'

/** `CompanyProfileHistoryEvent`. */
export type HistoryEvent =
  | 'PROFILE_SUBMITTED'
  | 'PROFILE_UPDATED'
  | 'PROFILE_RESUBMITTED'
  | 'PROFILE_VERIFIED'
  | 'PROFILE_REJECTED'

/** `CompanyVerificationMethod`. */
export type VerificationMethod = 'MANUAL_ATTESTATION'

/** `CompanyVerificationRejectionReason`. */
export type RejectionReason =
  | 'COMPANY_PROFILE_MISMATCH'
  | 'TAX_IDENTITY_EVIDENCE_MISSING'
  | 'COMMERCIAL_REGISTRATION_EVIDENCE_MISSING'
  | 'REGISTERED_ADDRESS_EVIDENCE_MISSING'
  | 'EVIDENCE_REQUIRES_REVIEW'

/** `shared.domain.enums.TenantStatus`, serialised by name. */
export type TenantStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED'

/** `TenantIdentityStatus`. */
export type IdentityStatus = 'PENDING' | 'READY'

/**
 * `PlatformCompanyReview.Summary`. Instants arrive as ISO-8601 strings. The company fields are
 * empty until the registrant finishes signing up (see `isSubmitted`).
 */
export type CompanySummary = {
  tenantId: string
  tenantCode: string
  tenantName: string
  legalName: string | null
  country: string | null
  verificationStatus: VerificationStatus
  tenantStatus: TenantStatus | null
  profileRevision: number
  submittedAt: string | null
  decidedAt: string | null
}

/** `PlatformCompanyReview.SummaryPage`: the page the backend chose, with its exact totals. */
export type CompanySummaryPage = {
  items: CompanySummary[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

/** `PlatformCompanyReview.SignupAdministrator`: absent for administratively provisioned tenants. */
export type SignupAdministrator = {
  userId: string
  signInEnabled: boolean
  emailVerified: boolean
}

/** `PlatformCompanyReview.Detail`. */
export type CompanyDetail = {
  tenantId: string
  tenantCode: string
  tenantName: string
  legalName: string | null
  taxNumber: string | null
  commercialRegistrationNumber: string | null
  country: string | null
  registeredAddress: string | null
  timezone: string | null
  verificationStatus: VerificationStatus
  verificationMethod: VerificationMethod | null
  rejectionReason: RejectionReason | null
  tenantStatus: TenantStatus | null
  identityStatus: IdentityStatus | null
  profileRevision: number
  /** The value a decision must quote back. Unused while this screen is read-only. */
  expectedRevision: number
  submittedAt: string | null
  submittedBy: string | null
  decidedAt: string | null
  decidedBy: string | null
  attestationReference: string | null
  evidenceReference: string | null
  evidenceRecorded: boolean
  signupAdministrator: SignupAdministrator | null
  createdAt: string
  updatedAt: string
}

/** `PlatformCompanyReview.HistoryEntry`, oldest first. */
export type HistoryEntry = {
  event: HistoryEvent
  profileRevision: number
  verificationStatus: VerificationStatus | null
  verificationMethod: VerificationMethod | null
  rejectionReason: RejectionReason | null
  attestationReference: string | null
  evidenceReference: string | null
  performedBy: string | null
  occurredAt: string
}

/** The queue's tabs, and the backend `status` each one asks for. `all` sends none. */
export const QUEUE_TABS = ['pending', 'verified', 'rejected', 'all'] as const
export type QueueTab = (typeof QUEUE_TABS)[number]

const STATUS_FOR_TAB: Record<QueueTab, VerificationStatus | null> = {
  pending: 'PENDING_VERIFICATION',
  verified: 'VERIFIED',
  rejected: 'REJECTED',
  all: null,
}

export function isQueueTab(value: unknown): value is QueueTab {
  return typeof value === 'string' && (QUEUE_TABS as readonly string[]).includes(value)
}

/**
 * The backend puts a registration in this queue as soon as its account exists, before the
 * registrant has finished signing up (backend gap: no submitted filter). Only a submission time
 * tells the two apart, and the frontend must not filter on it: that would make the backend's page
 * counts and totals wrong.
 */
export function isSubmitted(company: Pick<CompanySummary, 'submittedAt'>): boolean {
  return company.submittedAt !== null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A route segment the backend would refuse as malformed (400) is answered locally as not found. */
export function isCompanyId(value: string | undefined): value is string {
  return value !== undefined && UUID.test(value)
}

/** `page` is zero-based, as the backend counts. The backend fixes the order: newest submission first. */
export function queuePath(tab: QueueTab, page: number): string {
  const params = new URLSearchParams()
  const status = STATUS_FOR_TAB[tab]
  if (status) params.set('status', status)
  params.set('page', String(page))
  params.set('size', String(QUEUE_PAGE_SIZE))
  return `${COMPANIES_PATH}?${params.toString()}`
}

export function companyPath(tenantId: string): string {
  return `${COMPANIES_PATH}/${tenantId}`
}

export function historyPath(tenantId: string): string {
  return `${COMPANIES_PATH}/${tenantId}/verification-history`
}

/** Every `CompanyVerificationRejectionReason`, in the backend's order. */
export const REJECTION_REASONS: readonly RejectionReason[] = [
  'COMPANY_PROFILE_MISMATCH',
  'TAX_IDENTITY_EVIDENCE_MISSING',
  'COMMERCIAL_REGISTRATION_EVIDENCE_MISSING',
  'REGISTERED_ADDRESS_EVIDENCE_MISSING',
  'EVIDENCE_REQUIRES_REVIEW',
]

/**
 * What a reviewer may pick. The backend stores any content type; the picker offers the documents a
 * company's registration evidence actually comes as. The size is core's
 * `fawtir.tenant.company-evidence.maximum-bytes` default — a deployment's gateway may cap uploads
 * lower, which answers `413` and is reported as too large.
 */
export const EVIDENCE_ACCEPT = '.pdf,.png,.jpg,.jpeg'
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024

/**
 * `ManualCompanyVerificationRequest.attestationReference`: `@Size(max = 100)` and
 * `@Pattern("^[A-Za-z0-9._/-]+$")`, checked on the trimmed value the service stores.
 */
const ATTESTATION_REFERENCE = /^[A-Za-z0-9._/-]{1,100}$/

export function attestationReferenceError(value: string): 'required' | 'invalid' | null {
  const trimmed = value.trim()
  if (!trimmed) return 'required'
  return ATTESTATION_REFERENCE.test(trimmed) ? null : 'invalid'
}

/** `EvidenceUploadResponse`: the reference and digest are minted by the backend, never computed here. */
export type EvidenceUpload = {
  evidenceReference: string
  evidenceSha256: string
  profileRevision: number
  sizeBytes: number
  filename: string | null
}

/** `CompanyVerificationResult`. */
export type VerificationDecision = {
  tenantId: string
  verificationStatus: VerificationStatus
  verificationMethod: VerificationMethod | null
  tenantStatus: TenantStatus | null
  decidedAt: string | null
}

/**
 * Files evidence against the company's current profile revision. Each upload mints a new
 * reference; the attestation names the one it relies on, so replacing a file is just uploading
 * again.
 */
export function uploadEvidence(tenantId: string, file: File): Promise<EvidenceUpload> {
  const body = new FormData()
  body.append('file', file)
  return apiRequest<EvidenceUpload>(`${COMPANIES_PATH}/${tenantId}/verification-evidence`, {
    method: 'POST',
    body,
    credentials: 'same-origin',
  })
}

/**
 * Verifies the company. `expectedRevision` is the detail's own value, quoted back so a profile
 * corrected after the reviewer read it is refused (`409`) instead of approved unseen.
 */
export function attestCompany(
  tenantId: string,
  decision: { expectedRevision: number; attestationReference: string; evidence: EvidenceUpload },
): Promise<VerificationDecision> {
  return apiRequest<VerificationDecision>(
    `/v1/tenants/${tenantId}/company-verification/manual-attestation`,
    {
      method: 'POST',
      body: {
        expectedRevision: decision.expectedRevision,
        attestationReference: decision.attestationReference.trim(),
        evidenceReference: decision.evidence.evidenceReference,
        evidenceSha256: decision.evidence.evidenceSha256,
      },
      credentials: 'same-origin',
    },
  )
}

export function rejectCompany(
  tenantId: string,
  decision: { expectedRevision: number; reason: RejectionReason },
): Promise<VerificationDecision> {
  return apiRequest<VerificationDecision>(`/v1/tenants/${tenantId}/company-verification/rejection`, {
    method: 'POST',
    body: { expectedRevision: decision.expectedRevision, reason: decision.reason },
    credentials: 'same-origin',
  })
}

/**
 * What a refused upload or decision means to the reviewer.
 *
 * The statuses carry the meaning; the backend's English sentences are never shown. `409` covers
 * every "the case moved" refusal — a corrected profile, a decision already taken, evidence filed
 * against an older revision — which the backend does not tell apart by type, so the answer is the
 * same for all: reload and look again. `403` covers both a missing permission and the four-eyes
 * rule (the reviewer submitted the registration), which share one problem type.
 */
export function describeDecisionFailure(error: unknown): FormMessage {
  if (error instanceof ApiError) {
    if (error.status === 409) return { key: 'console.verification.decision.conflict' }
    if (error.status === 403) return { key: 'console.verification.decision.forbidden' }
    if (error.status === 404) return { key: 'console.verification.detail.notFound' }
    if (error.status === 413) return { key: 'console.verification.decision.tooLarge' }
  }
  return commonFailureMessage(error)
}

/** Router state the queue hands its rows, so the detail's way back returns to the same page. */
export type QueueReturn = { queueSearch: string }

export function queueReturnOf(state: unknown): string {
  if (typeof state !== 'object' || state === null) return ''
  const search = (state as Record<string, unknown>).queueSearch
  return typeof search === 'string' && search.startsWith('?') ? search : ''
}
