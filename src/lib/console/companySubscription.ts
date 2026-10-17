import { ApiError, apiRequest } from '../../api'
import type { SubscriptionStatusDto } from '../../api/settings/subscription'
import { commonFailureMessage, type FormMessage } from '../identity/errors'

/**
 * One company's subscription as the console operates it, on the platform routes the backend
 * already serves (`PlatformSubscriptionController`, `PlatformExtraDocumentsController`,
 * `PlatformReceivedDocumentCountingController`). Every read is fenced to a non-impersonating
 * session in the production PLATFORM realm; every write also re-asserts MFA and is audited with
 * the operator's reason.
 *
 * Reads: the lifecycle and its events (`platform.billing.read`), the allowance and extra-document
 * credits (`platform.billing.read`), and the received-document counting override
 * (`platform.plans.read`). Writes: a trial exception and a temporary grant
 * (`platform.billing.manage`), and the counting override (`platform.plans.manage`, `If-Match`).
 */
export const BILLING_READ = 'platform.billing.read'
export const BILLING_MANAGE = 'platform.billing.manage'
export const PLANS_READ = 'platform.plans.read'
export const PLANS_MANAGE = 'platform.plans.manage'

/** The server's bounds for the two numeric writes. */
export const TRIAL_EXCEPTION_MAX_DAYS = 90
export const GRANT_MAX_DOCUMENTS = 100_000

const company = (tenantId: string) => `/v1/platform/companies/${encodeURIComponent(tenantId)}`
export const companySubscriptionPath = (tenantId: string) => `${company(tenantId)}/subscription`
export const companyExtraDocumentsPath = (tenantId: string) =>
  `${company(tenantId)}/extra-documents`
export const companyCountingPath = (tenantId: string) =>
  `${company(tenantId)}/received-document-counting`

export type LifecycleEventKind =
  | 'TRIAL_STARTED'
  | 'TRIAL_GRANTED'
  | 'TRIAL_EXTENDED'
  | 'PAID_PERIOD_EXTENDED'
  | 'AUTO_RENEW_CHANGED'
  | 'CANCELLATION_SCHEDULED'
  | 'CANCELLATION_WITHDRAWN'
  | 'DOWNGRADE_SCHEDULED'
  | 'DOWNGRADE_WITHDRAWN'
  | 'DOWNGRADE_APPLIED'

export type LifecycleEventDto = {
  id: string
  tenantId: string
  /** A kind this screen does not know yet is shown under a generic label, never as its code. */
  kind: LifecycleEventKind | (string & {})
  details: Record<string, unknown> | null
  reason: string | null
  /** Only the id is recorded; names arrive with the console history read. */
  actorId: string | null
  occurredAt: string
}

export type PlatformSubscriptionDto = {
  status: SubscriptionStatusDto
  /** Newest first, at most 200. */
  events: LifecycleEventDto[]
}

export type AllowanceUsageDto = {
  periodStart: string
  periodEnd: string
  resetsOn: string
  planDocuments: number
  extraDocuments: number
  totalAllowance: number
  issued: number
  resubmissions: number
  received: number
  receivedHidden: number
  used: number
  planUsed: number
  extraUsed: number
  left: number
  warningPercent: 80 | 90 | 100 | null
  issuingAllowed: boolean
  extrasExpireOn: string
}

export type ExtraDocumentCreditDto = {
  id: string
  source: 'PURCHASE' | 'GRANT' | 'GIVE_BACK' | (string & {})
  status: 'PENDING' | 'ACTIVE' | 'CANCELLED' | (string & {})
  documents: number
  netAmount: string | null
  startsOn: string | null
  expiresOn: string | null
  reason: string | null
  createdBy: string | null
  createdAt: string
}

export type CompanyExtraDocumentsDto = {
  tenantId: string
  allowance: AllowanceUsageDto
  /** Newest first. */
  credits: ExtraDocumentCreditDto[]
}

export type CountingOverrideDto = {
  id: string
  version: number
  /** Null when the override was withdrawn: the company follows its plan's setting again. */
  countsReceived: boolean | null
  effectiveFrom: string
  reason: string
  createdBy: string | null
  createdAt: string
}

export type CompanyCountingDto = {
  tenantId: string
  enterprise: boolean
  planCode: string
  /** 0 before the first override. */
  version: number
  monthStartedOn: string
  countsReceivedNow: boolean
  nextSubscriptionOn: string
  countsReceivedFromNext: boolean
  /** Newest first. */
  history: CountingOverrideDto[]
}

/** What the operator picks for an Enterprise company; `follow` withdraws the override. */
export type CountingChoice = 'on' | 'off' | 'follow'

export function countingChoiceOf(counting: CompanyCountingDto): CountingChoice {
  const latest = counting.history[0]
  if (!latest || latest.countsReceived === null) return 'follow'
  return latest.countsReceived ? 'on' : 'off'
}

export function grantTrialException(
  tenantId: string,
  days: number,
  reason: string,
): Promise<PlatformSubscriptionDto> {
  return apiRequest(`${companySubscriptionPath(tenantId)}/trial-exception`, {
    method: 'POST',
    body: { days, reason },
  })
}

export function grantExtraDocuments(
  tenantId: string,
  documents: number,
  expiresOn: string | null,
  reason: string,
): Promise<CompanyExtraDocumentsDto> {
  return apiRequest(`${companyExtraDocumentsPath(tenantId)}/grants`, {
    method: 'POST',
    body: { documents, expiresOn, reason },
  })
}

export function setCompanyCounting(
  tenantId: string,
  version: number,
  choice: CountingChoice,
  reason: string,
): Promise<CompanyCountingDto> {
  return apiRequest(companyCountingPath(tenantId), {
    method: 'PUT',
    headers: { 'If-Match': `"${version}"` },
    body: { countsReceived: choice === 'follow' ? null : choice === 'on', reason },
  })
}

const K = 'console.companySubscription.refusal.'

/**
 * Every refusal these writes can answer, in the console's words. The server's English `detail`
 * is never shown. A 403 that is neither the realm nor impersonation is a lapsed MFA or missing
 * permission, which the screen cannot tell apart.
 */
export function describeCompanySubscriptionFailure(error: unknown): FormMessage {
  if (error instanceof ApiError) {
    switch (error.problemType) {
      case 'subscription-not-tracked':
        return { key: `${K}notTracked` }
      case 'subscription-state-conflict':
        return { key: `${K}alreadyPaid` }
      case 'subscription-change-blocked-by-payment':
        return { key: `${K}paymentBeingChecked` }
      case 'received-counting-override-not-enterprise':
        return { key: `${K}notEnterprise` }
      case 'received-counting-version-conflict':
        return { key: `${K}countingConflict` }
      case 'production-platform-realm-required':
        return { key: `${K}realm` }
      case 'impersonation-not-allowed':
        return { key: `${K}impersonation` }
    }
    if (error.status === 403) return { key: `${K}forbidden` }
    if (error.status === 404) return { key: `${K}gone` }
    if (error.status === 400) return { key: `${K}invalid` }
  }
  return commonFailureMessage(error)
}
