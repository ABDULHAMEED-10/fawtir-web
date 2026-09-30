import { apiDownload, apiRequest, type ApiDownload } from '../client'

/**
 * Self-billing agreements (`SelfBillingAgreementController`, I-12).
 *
 * **Self-billing inverts who issues.** The tenant is the *buyer* and writes the invoice on the
 * seller's behalf (SRS Ch6 Scenario 7). So `customerId` on these routes names the **seller**, and
 * the document the tenant issues creates a debt the tenant owes. Copy on these screens has to say
 * "seller" where the rest of Income says "customer", or it reads backwards.
 *
 * **Two permissions, and the split is the point.** The tenant records the agreement
 * (`selfbilling.agreement.manage`, needed to *read* as well as write); a Fawtir reviewer verifies
 * the counterparty's participant identity (`platform.selfbilling.counterparty.verify`, which is
 * platform-reserved and can never be granted to a tenant). Zain's decision of 2026-08-27 was that
 * Fawtir verifies the claimed identity rather than accepting the tenant's claim — so verification
 * is a state the tenant waits on, never a button.
 *
 * **The agreement gates issuance, not drafting.** A draft against a seller with no agreement is
 * created happily; issuing then refuses. That is why this screen matters: it is the only place the
 * authority to issue can be seen or changed.
 *
 * **No edit, no delete.** The reference and dates are fixed once opened; only the lifecycle posts
 * act, and a renewal withdraws the agreement and opens its successor in one step. And there is deliberately no `EXPIRED` status — a lapsed `effectiveTo` is derived and
 * never stored, so nothing server-side will ever say "expiring soon".
 */

export const AGREEMENTS_PATH = '/v1/self-billing-agreements'

export type AgreementStatusDto = 'PENDING_ACTIVATION' | 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN'

/** `UNVERIFIED` until a platform reviewer accepts the identity; issuance refuses until then. */
export type SellerAssuranceDto = 'UNVERIFIED' | 'COUNTERPARTY_VERIFIED'

export type AgreementDto = {
  id: string
  /** The **seller** this tenant self-bills. No name travels with it — the screen joins it. */
  customerId: string
  agreementReference: string
  status: AgreementStatusDto
  sellerIdentityAssurance: SellerAssuranceDto
  /** `scheme:value` a self-billed document will carry as its SELLER, or null while unverified. */
  verifiedParticipant: string | null
  verifiedAt: string | null
  effectiveFrom: string
  effectiveTo: string | null
  withdrawnAt: string | null
  withdrawalReason: string | null
  version: number
  /**
   * The self-billed documents issued under this agreement (invoices less credit notes). Answered
   * by the two reads; null on the lifecycle responses, absent from an API that predates it.
   * `total` is null when the documents span currencies, `currency` null when there are none.
   */
  documents?: { count: number; total: number | null; currency: string | null } | null
  /**
   * The supplier's drafts issuing would refuse today because of this agreement. Null on a withdrawn
   * agreement and on the lifecycle responses. `total` is always null: a draft is priced at issue.
   */
  blockedDrafts?: { count: number; total: number | null } | null
}

export const AGREEMENT_REFERENCE_MAX = 100
export const WITHDRAWAL_REASON_MAX = 500

/** A bare array — unpaged, unfiltered, `effectiveFrom` descending, withdrawn rows included. */
export function loadAgreements(): Promise<AgreementDto[]> {
  return apiRequest<AgreementDto[]>(AGREEMENTS_PATH)
}

export function agreementPath(agreementId: string): string {
  return `${AGREEMENTS_PATH}/${encodeURIComponent(agreementId)}`
}

export function loadAgreement(agreementId: string): Promise<AgreementDto> {
  return apiRequest<AgreementDto>(agreementPath(agreementId))
}

export type OpenAgreementBody = {
  customerId: string
  agreementReference: string
  effectiveFrom: string
  /** Open-ended when null. */
  effectiveTo: string | null
}

export function openAgreement(body: OpenAgreementBody): Promise<AgreementDto> {
  return apiRequest<AgreementDto>(AGREEMENTS_PATH, { method: 'POST', body })
}

export function activateAgreement(agreementId: string): Promise<AgreementDto> {
  return apiRequest<AgreementDto>(`${agreementPath(agreementId)}/activation`, { method: 'POST' })
}

export function suspendAgreement(agreementId: string): Promise<AgreementDto> {
  return apiRequest<AgreementDto>(`${agreementPath(agreementId)}/suspension`, { method: 'POST' })
}

/** Terminal. The body is required even when the reason is not — `{}` at minimum. */
export function withdrawAgreement(agreementId: string, reason: string | null): Promise<AgreementDto> {
  return apiRequest<AgreementDto>(`${agreementPath(agreementId)}/withdrawal`, {
    method: 'POST',
    body: { reason: reason && reason.trim() !== '' ? reason.trim() : null },
  })
}

export type RenewAgreementBody = {
  agreementReference: string
  effectiveFrom: string
  /** Open-ended when null. */
  effectiveTo: string | null
}

/**
 * Withdraws the agreement and opens its successor for the same supplier in one transaction; the
 * new one starts PENDING_ACTIVATION and unverified (D4). A withdrawn agreement is refused with
 * `SELF_BILLING_AGREEMENT_WITHDRAWN`.
 */
export function renewAgreement(agreementId: string, body: RenewAgreementBody): Promise<AgreementDto> {
  return apiRequest<AgreementDto>(`${agreementPath(agreementId)}/renewal`, { method: 'POST', body })
}

/** Every agreement, as the list shows it, as CSV. */
export function exportAgreements(): Promise<ApiDownload> {
  return apiDownload(`${AGREEMENTS_PATH}/export.csv`)
}
