import { ApiError, apiRequest } from '../../api'
import type { SubscriptionStatusDto } from '../../api/settings/subscription'
import type { PaidExtrasOverviewDto } from '../../api/settings/paidExtras'
import { commonFailureMessage, type FormMessage } from '../identity/errors'
import { sortCatalogue, type CatalogueAdminPlan } from './planCatalogue'

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
 * (`platform.billing.manage`), the counting override (`platform.plans.manage`, `If-Match`), and
 * the give-back of documents a platform fault cost the customer (`platform.tenants.manage`).
 */
export const BILLING_READ = 'platform.billing.read'
export const BILLING_MANAGE = 'platform.billing.manage'
export const PLANS_READ = 'platform.plans.read'
export const PLANS_MANAGE = 'platform.plans.manage'
/** The operator's free upgrade (`PUT /platform/companies/{id}/plan`, business rule PC-5). */
export const TENANTS_MANAGE = 'platform.tenants.manage'

/** The server's bounds for the two numeric writes. */
export const TRIAL_EXCEPTION_MAX_DAYS = 90
export const GRANT_MAX_DOCUMENTS = 100_000

const company = (tenantId: string) => `/v1/platform/companies/${encodeURIComponent(tenantId)}`
export const companySubscriptionPath = (tenantId: string) => `${company(tenantId)}/subscription`
export const companyExtraDocumentsPath = (tenantId: string) =>
  `${company(tenantId)}/extra-documents`
export const companyCountingPath = (tenantId: string) =>
  `${company(tenantId)}/received-document-counting`
/** `platform.billing.read`: the company's paid places and ERP add-on, read only (P2-1 §3.14). */
export const companyPaidExtrasPath = (tenantId: string) => `${company(tenantId)}/paid-extras`

/** The add-on's stored state as the console reads it; null when the company never ordered it. */
export type CompanyErpAddonDto = {
  tenantId: string
  status: 'PENDING_PAYMENT' | 'ACTIVE' | 'ENDING' | 'ENDED'
  startedOn: string | null
  endsOn: string | null
  endReason: 'CUSTOMER' | 'PLAN_DOWNGRADE' | null
  /** True when the add-on, not an operator, granted the ERP entitlement. */
  grantedEntitlement: boolean
  changedBy: string
  changedAt: string
  version: number
}

export type CompanyPaidExtrasDto = {
  tenantId: string
  /** The overview the customer sees on Plan and usage. */
  extras: PaidExtrasOverviewDto
  erpAddon: CompanyErpAddonDto | null
}

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
  | 'OPERATOR_PLAN_CHANGED'
  | 'FAWTIR_CANCELLATION_PROPOSED'
  | 'FAWTIR_CANCELLATION_WITHDRAWN'
  | 'CANCELLED_BY_FAWTIR'
  | 'REOPENED_BY_RENEWAL'

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

export type FawtirCancellationCategory = 'ABUSE' | 'FRAUD'

/**
 * Fawtir's cancel-at-once for abuse or fraud (business rules CA-7, CA-9): proposed by one operator,
 * confirmed by a different one or withdrawn. `internalReason` is Fawtir's only; the customer is told
 * `customerMessage`.
 */
export type FawtirCancellationDto = {
  id: string
  tenantId: string
  tenantName: string | null
  status: 'PROPOSED' | 'CONFIRMED' | 'WITHDRAWN'
  category: FawtirCancellationCategory
  internalReason: string
  customerMessage: string
  proposedBy: string
  proposedByName: string | null
  proposedAt: string
  confirmedBy: string | null
  confirmedByName: string | null
  confirmedAt: string | null
  effectiveOn: string | null
  withdrawnBy: string | null
  withdrawnByName: string | null
  withdrawnAt: string | null
  withdrawalReason: string | null
  outcome: { voidedBills: string[]; refundCases: string[] }
}

export type PlatformSubscriptionDto = {
  status: SubscriptionStatusDto
  /** Newest first, at most 200. */
  events: LifecycleEventDto[]
  /** The open proposal, otherwise the cancellation the company stands under now. Absent on older servers. */
  fawtirCancellation?: FawtirCancellationDto | null
  /** Whether cancel-at-once may be proposed and confirmed on this server. Absent on older servers. */
  fawtirCancellationEnabled?: boolean
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

export type GivenBackDocumentDto = { creditId: string; documentId: string; createdAt: string }

export type CompanyExtraDocumentsDto = {
  tenantId: string
  allowance: AllowanceUsageDto
  /** Newest first. */
  credits: ExtraDocumentCreditDto[]
  /** The documents each GIVE_BACK credit covers, newest first; absent from an older server. */
  givenBack?: GivenBackDocumentDto[]
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

/** The server's bounds for a give-back: documents per call, and rows per lookup. */
export const GIVE_BACK_MAX_DOCUMENTS = 1000
export const ISSUED_LOOKUP_LIMIT = 50

export type IssuedDocumentType =
  | 'INVOICE'
  | 'CREDIT_NOTE'
  | 'DEBIT_NOTE'
  | 'SELF_BILLED_INVOICE'
  | 'SELF_BILLED_CREDIT_NOTE'

/** One row of the give-back picker (`GET /platform/companies/{id}/issued-documents`). */
export type IssuedDocumentDto = {
  id: string
  number: string
  type: IssuedDocumentType | (string & {})
  issuedOn: string
  status: string
  /** A give-back already covers it; the server refuses it a second time. */
  alreadyGivenBack: boolean
}

export function issuedDocumentsPath(tenantId: string, number: string): string {
  const query = new URLSearchParams({ limit: String(ISSUED_LOOKUP_LIMIT) })
  const part = number.trim()
  if (part) query.set('number', part)
  return `${company(tenantId)}/issued-documents?${query.toString()}`
}

/**
 * The issued documents a give-back accepts, newest first (`platform.tenants.manage`, the
 * give-back's own permission). A part of the number narrows them.
 */
export function findIssuedDocuments(tenantId: string, number: string): Promise<IssuedDocumentDto[]> {
  return apiRequest(issuedDocumentsPath(tenantId, number))
}

/**
 * Plan v4 §6, AL-F4: documents a Fawtir platform fault cost the customer, given back by a Platform
 * tenant admin with a reason. Exactly that many are added to the current allowance month and end
 * with it; each document once. Never automatic.
 */
export function giveBackDocuments(
  tenantId: string,
  documentIds: string[],
  reason: string,
): Promise<CompanyExtraDocumentsDto> {
  return apiRequest(`${companyExtraDocumentsPath(tenantId)}/give-backs`, {
    method: 'POST',
    body: { documentIds, reason },
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

/** The longest internal reason or customer message the server keeps. */
export const CANCELLATION_TEXT_MAX = 500

export const fawtirCancellationsPath = (tenantId: string) =>
  `${companySubscriptionPath(tenantId)}/fawtir-cancellations`

export function proposeFawtirCancellation(
  tenantId: string,
  category: FawtirCancellationCategory,
  internalReason: string,
  customerMessage: string,
  confirmTenantCode: string,
): Promise<FawtirCancellationDto> {
  return apiRequest(fawtirCancellationsPath(tenantId), {
    method: 'POST',
    body: { category, internalReason, customerMessage, confirmTenantCode },
  })
}

export function confirmFawtirCancellation(
  tenantId: string,
  cancellationId: string,
): Promise<FawtirCancellationDto> {
  return apiRequest(
    `${fawtirCancellationsPath(tenantId)}/${encodeURIComponent(cancellationId)}/confirmation`,
    { method: 'POST' },
  )
}

export function withdrawFawtirCancellation(
  tenantId: string,
  cancellationId: string,
  reason: string,
): Promise<FawtirCancellationDto> {
  return apiRequest(
    `${fawtirCancellationsPath(tenantId)}/${encodeURIComponent(cancellationId)}/withdrawal`,
    { method: 'POST', body: { reason } },
  )
}

/** The operator's upgrade at no charge; the reason is required and kept in the company history (PC-5). */
export function upgradeCompanyPlan(
  tenantId: string,
  planCode: string,
  reason: string,
): Promise<unknown> {
  return apiRequest(`${company(tenantId)}/plan`, { method: 'PUT', body: { planCode, reason } })
}

/**
 * The plans an operator may move a company up to at no charge (business rule PC-5): published plans
 * after the current one in the catalogue's own order. A current plan the catalogue does not list
 * (the default, or Enterprise terms) leaves every other published plan.
 */
export function plansAbove(
  plans: readonly CatalogueAdminPlan[],
  current: string,
): CatalogueAdminPlan[] {
  const ordered = sortCatalogue(plans.filter((plan) => plan.active))
  const at = ordered.findIndex((plan) => plan.code === current)
  return ordered.filter((plan, index) => plan.code !== current && index > at)
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
      case 'give-back-document-unknown':
        return { key: `${K}giveBackUnknown` }
      case 'give-back-document-already-given-back':
        return { key: `${K}giveBackAlready` }
    }
    if (error.status === 403) return { key: `${K}forbidden` }
    if (error.status === 404) return { key: `${K}gone` }
    if (error.status === 400) return { key: `${K}invalid` }
  }
  return commonFailureMessage(error)
}

/**
 * The refusals of the cancel-at-once and free-upgrade writes, in the console's words. Codes the
 * other writes share keep their meaning; a state conflict here means the company already ended.
 */
export function describeStaffActionFailure(error: unknown): FormMessage {
  if (error instanceof ApiError) {
    switch (error.problemType) {
      case 'fawtir-cancellation-not-enabled':
        return { key: `${K}cancellationOff` }
      case 'fawtir-cancellation-already-proposed':
        return { key: `${K}cancellationAlreadyProposed` }
      case 'fawtir-cancellation-not-open':
        return { key: `${K}cancellationNotOpen` }
      case 'same-operator':
        return { key: `${K}sameOperator` }
      case 'subscription-not-tracked':
        return { key: `${K}cancellationNotTracked` }
      case 'subscription-state-conflict':
        return { key: `${K}alreadyEnded` }
      case 'enterprise-plan-managed-by-terms':
        return { key: `${K}enterprisePlan` }
    }
  }
  return describeCompanySubscriptionFailure(error)
}
