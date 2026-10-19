import { ApiError, apiRequest } from '../../api'
import { commonFailureMessage, type FormMessage } from '../identity/errors'
import type { SubscriptionStatusDto } from '../../api/settings/subscription'
import { companySubscriptionPath } from './companySubscription'

/**
 * Billing for a company Fawtir created, and the payment links Fawtir's staff send as a quick
 * card-payment reminder for any company's due bill (P2-8 §3.2, §3.6; D9: card only, valid 7 days). Every route is in the production PLATFORM realm,
 * refuses impersonation, and re-asserts MFA on writes:
 *
 * - `POST /platform/companies/{id}/subscription/start` opens the lifecycle and issues the first bill
 *   (`platform.billing.manage`, with a reason).
 * - `GET /platform/companies/{id}/bills` lists the company's bills (`platform.billing.read`), and
 *   `POST` on the same path raises the next one (`platform.billing.manage`).
 * - `POST|GET /platform/billing/bills/{billId}/pay-links` makes a link (with `Idempotency-Key`) or
 *   lists them; `POST /platform/billing/pay-links/{id}/revocation` revokes one (`If-Match`, reason).
 *
 * The link's address is returned once, in the creation answer. It is never stored here beyond the
 * dialog that shows it, and never logged.
 */
const company = (tenantId: string) => `/v1/platform/companies/${encodeURIComponent(tenantId)}`
const bill = (billId: string) => `/v1/platform/billing/bills/${encodeURIComponent(billId)}`

export const startBillingPath = (tenantId: string) => `${companySubscriptionPath(tenantId)}/start`
export const companyBillsPath = (tenantId: string) => `${company(tenantId)}/bills?limit=25`
export const raiseBillPath = (tenantId: string) => `${company(tenantId)}/bills`
export const payLinksPath = (billId: string) => `${bill(billId)}/pay-links`
export const revokePayLinkPath = (linkId: string) =>
  `/v1/platform/billing/pay-links/${encodeURIComponent(linkId)}/revocation`
export const enterpriseTermsPath = (tenantId: string) => `${company(tenantId)}/enterprise-terms`

export type BillingCycle = 'MONTHLY' | 'ANNUAL'
export type BillStatus = 'OPEN' | 'PENDING_VERIFICATION' | 'PAID' | 'VOID'

/** `SubscriptionBill` as the console reads it; amounts are OMR strings with three decimals. */
export type SubscriptionBillDto = {
  id: string
  number: string
  planName: string | null
  billingCycle: BillingCycle | (string & {}) | null
  periodStartsOn: string | null
  periodEndsOn: string | null
  subtotal: string
  vatRate: string | null
  vatAmount: string
  total: string
  currency: string
  status: BillStatus | (string & {})
  dueOn: string | null
  issuedAt: string
  version: number
}

export type ConsoleBillDto = {
  bill: SubscriptionBillDto
  /** `SUBSCRIPTION` or `EXTRA_DOCUMENTS`. */
  kind: string
}

export type CompanyBillsDto = { items: ConsoleBillDto[]; nextCursor: string | null }

/** A bill a payment link can still be made for. */
export const isOpenBill = (entry: SubscriptionBillDto) => entry.status === 'OPEN'

export type StartBillingRequest = {
  /** Omitted for an Enterprise company, which is billed on its own plan. */
  planCode?: string
  /** Required for a catalogue plan; for Enterprise it defaults to, and must match, the terms. */
  billingCycle?: BillingCycle
  reason: string
}

/** `BillingStarted`: the plan and cycle now held, the subscription status, and the first bill. */
export type StartBillingDto = {
  plan: { planCode: string; planName: string; billingCycle: BillingCycle | null }
  subscription: SubscriptionStatusDto
  bill: SubscriptionBillDto
}

export function startBilling(
  tenantId: string,
  request: StartBillingRequest,
): Promise<StartBillingDto> {
  return apiRequest(startBillingPath(tenantId), { method: 'POST', body: request })
}

export function raiseBill(tenantId: string): Promise<SubscriptionBillDto> {
  return apiRequest(raiseBillPath(tenantId), { method: 'POST' })
}

/** The part of P2-5's Enterprise terms read that starting billing needs. */
export type EnterpriseTermsState = 'TERMS_NOT_SET' | 'TERMS_SET' | 'BILLING_STARTED'

export type EnterpriseQuoteDto = {
  billingCycle: BillingCycle | (string & {})
  amountExclVat: string
  vatRate: string
  vatAmount: string
  amountInclVat: string
  currency: string
}

export type EnterpriseTermsDto = {
  tenantId: string
  state: EnterpriseTermsState
  version: number
  plan: { code: string; nameEn: string; nameAr: string | null } | null
  nextBill: EnterpriseQuoteDto | null
}

export type PayLinkChannel = 'EMAIL' | 'WHATSAPP' | 'COPIED'
export type PayLinkStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED' | 'SUPERSEDED'
export type PayLinkLanguage = 'en' | 'ar'

export type CreatePayLinkRequest = {
  channel: PayLinkChannel
  language: PayLinkLanguage
  payerName?: string
  payerEmail?: string
  payerPhone?: string
}

/**
 * The creation answer (`CreatedPayLink`). `payLinkUrl` and `shareText` carry the token and exist
 * only in this answer: a replay with the same key returns the link with `payLinkUrl: null` and
 * `tokenShownOnce: true`. `emailSent` is set for EMAIL only (false: the sender refused it and the
 * link stays ACTIVE).
 */
export type CreatedPayLinkDto = {
  link: PayLinkDto
  payLinkUrl: string | null
  shareText: string | null
  tokenShownOnce: boolean
  emailSent: boolean | null
  /**
   * `payLinkUrl` is Paymob's own payment page (QuickLink) rather than the Fawtir pay page. A server
   * older than the field omits it: missing reads as false.
   */
  paymobQuickLink?: boolean
}

/** Why the server closed a link itself; any other `closeReason` is an operator's revocation reason. */
export const PAY_LINK_CLOSE_REASONS = [
  'NEW_LINK',
  'BILL_VOIDED',
  'TERMS_CHANGED',
  'DISCONNECTED',
  'TOO_MANY_REJECTED',
  'PAYMOB_LINK_REFUSED',
  'PAYMOB_LINK_UNKNOWN',
] as const

/** One link (`PayLink`); the contact arrives masked (`a***@x.om`, `+968 ****1234`). */
export type PayLinkDto = {
  id: string
  billId: string
  status: PayLinkStatus | (string & {})
  channel: PayLinkChannel | (string & {})
  language: PayLinkLanguage
  tokenHint: string
  recipient: string | null
  createdBy: string
  createdAt: string
  sentAt: string | null
  firstOpenedAt: string | null
  openCount: number
  expiresAt: string
  closedAt: string | null
  closeReason: string | null
  version: number
}

/**
 * `PayLinkSettings`. The route exists only on a server that has payment links (otherwise 404),
 * and `enabled` is `FAWTIR_BILLING_PAY_LINKS_ENABLED`: the console draws nothing about links
 * until a server answers this read, and offers no new link while `enabled` is false.
 */
export type PayLinkSettingsDto = {
  enabled: boolean
  cardEnabled: boolean
  /** Read only: a link is valid 7 days, fixed (D9). There is no route to change it. */
  validityDays: number
  maxValidityDays: number
  settingsVersion: number
  /** New links are Paymob's own payment links (QuickLink). Missing means false. */
  paymobQuickLink?: boolean
}

export const PAY_LINK_SETTINGS_PATH = '/v1/platform/billing/pay-link-settings'

export function createPayLink(
  billId: string,
  request: CreatePayLinkRequest,
  idempotencyKey: string,
): Promise<CreatedPayLinkDto> {
  return apiRequest(payLinksPath(billId), {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: request,
  })
}

export function revokePayLink(link: PayLinkDto, reason: string): Promise<PayLinkDto> {
  return apiRequest(revokePayLinkPath(link.id), {
    method: 'POST',
    headers: { 'If-Match': `"${link.version}"` },
    body: { reason },
  })
}

/** A `wa.me` chat with the server's message; the number keeps only its digits. */
export function whatsappChatUrl(phone: string, message: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
}

const K = 'console.payLinks.refusal.'

/**
 * Every refusal starting billing, raising a bill and the link routes can answer, in the console's
 * words. The server's English `detail` is never shown.
 */
export function describePayLinkFailure(error: unknown): FormMessage {
  if (error instanceof ApiError) {
    switch (error.problemType) {
      case 'subscription-state-conflict':
        return { key: `${K}stateConflict` }
      case 'company-not-verified':
        return { key: `${K}notVerified` }
      case 'disconnected-from-fawtir':
        return { key: `${K}disconnected` }
      case 'enterprise-terms-required':
        return { key: `${K}termsRequired` }
      case 'billing-not-configured':
        return { key: `${K}billingNotConfigured` }
      case 'subscription-change-blocked-by-payment':
        return { key: `${K}paymentBeingChecked` }
      case 'subscription-not-tracked':
        return { key: `${K}notTracked` }
      case 'bill-not-payable':
        return { key: `${K}billNotPayable` }
      case 'bill-stale':
        return { key: `${K}billStale` }
      case 'pay-link-state-conflict':
        return { key: `${K}linkClosed` }
      case 'payment-method-unavailable':
        return { key: `${K}linksOff` }
      case 'production-platform-realm-required':
        return { key: `${K}realm` }
      case 'impersonation-not-allowed':
        return { key: `${K}impersonation` }
    }
    if (error.status === 412) return { key: `${K}linkChanged` }
    if (error.status === 403) return { key: `${K}forbidden` }
    if (error.status === 404) return { key: `${K}gone` }
    if (error.status === 400) return { key: `${K}invalid` }
  }
  return commonFailureMessage(error)
}
