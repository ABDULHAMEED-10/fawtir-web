import { apiDownload, apiRequest } from '../../api'
import type { PaymentMethod, PaymentStatus, SubscriptionBillDto } from '../../api/settings/billing'

/**
 * Platform finance on subscription payments (`PlatformBillingController`, backend V271). Every
 * decision sends `If-Match` with the version read; the server also requires MFA, refuses
 * impersonation and the person who submitted, recorded or already verified the payment.
 */
export const BILLING_READ_PERMISSION = 'platform.billing.read'
export const BILLING_EVIDENCE_PERMISSION = 'platform.billing.evidence.read'
export const BILLING_CASH_PERMISSION = 'platform.billing.cash.record'
export const BILLING_VERIFY_PERMISSION = 'platform.billing.verify'
export const BILLING_MANAGE_PERMISSION = 'platform.billing.manage'

export const PAYMENTS_PATH = '/v1/platform/billing/payments'
export const BENEFICIARIES_PATH = '/v1/platform/billing/beneficiaries'

export type PlatformPaymentDto = {
  id: string
  tenantId: string
  /** Null for a payment made with the application: its first bill is issued at activation (V289). */
  billId: string | null
  kind?: 'BILL' | 'SIGNUP'
  method: PaymentMethod
  status: PaymentStatus
  amount: string
  submittedBy: string
  submittedAt: string
  reference: string | null
  customerNote: string | null
  proofSha256: string | null
  proofContentType: string | null
  proofSizeBytes: number | null
  receiptNumber: string | null
  receivedAmount: string | null
  receivedAt: string | null
  collectorName: string | null
  receiptRecordedBy: string | null
  verifiedBy: string | null
  requiresSecondApproval: boolean | null
  thresholdApplied: string | null
  secondApprovedBy: string | null
  rejectionReason: string | null
  confirmedVia: 'STAFF' | 'PROVIDER' | null
  version: number
}

/** Every kind the backend records in a payment's history (`PaymentEvent.Kind`); each has a label. */
export const PAYMENT_EVENT_KINDS = [
  'BILL_ISSUED',
  'BILL_VOIDED',
  'BILL_PAID',
  'PAYMENT_SUBMITTED',
  'PAYMENT_WITHDRAWN',
  'CASH_RECEIPT_RECORDED',
  'PAYMENT_VERIFIED',
  'PAYMENT_SECOND_APPROVED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_REJECTED',
  'PROOF_READ',
  'CARD_CHECKOUT_OPENED',
  'CARD_CHECKOUT_CLOSED',
  'PAYMENT_REVERSAL_RECORDED',
  'SIGNUP_FUNDS_VERIFIED',
  'SIGNUP_PAYMENT_ALLOCATED',
  'REFUND_CASE_OPENED',
] as const

export type PaymentEventDto = {
  id: string
  paymentId: string | null
  kind: string
  details: Record<string, unknown>
  actorId: string
  occurredAt: string
}

export type QueueItemDto = { payment: PlatformPaymentDto; bill: SubscriptionBillDto | null; tenantName: string | null }

/** Oldest first, fifty at a time; pass {@link nextCursor} as `after` for the next page. */
export type QueuePageDto = { items: QueueItemDto[]; nextCursor: string | null }

export function loadQueuePage(after: string): Promise<QueuePageDto> {
  return apiRequest<QueuePageDto>(`${PAYMENTS_PATH}?after=${encodeURIComponent(after)}`)
}

export type PaymentDetailDto = QueueItemDto & { history: PaymentEventDto[] }

export type BeneficiaryRecordDto = {
  id: string
  legalName: string
  bankName: string
  iban: string
  swiftCode: string | null
  status: 'PENDING_CONFIRMATION' | 'ACTIVE' | 'RETIRED'
  reason: string
  createdBy: string
  createdAt: string
  confirmedBy: string | null
  version: number
}

const decision = (version: number) => ({ 'If-Match': `"${version}"` })

export const paymentPath = (id: string) => `${PAYMENTS_PATH}/${encodeURIComponent(id)}`

export function verifyPayment(id: string, version: number): Promise<PaymentDetailDto> {
  return apiRequest(`${paymentPath(id)}/verification`, { method: 'POST', headers: decision(version) })
}

export function approvePaymentSecond(id: string, version: number): Promise<PaymentDetailDto> {
  return apiRequest(`${paymentPath(id)}/second-approval`, { method: 'POST', headers: decision(version) })
}

export function rejectPayment(id: string, version: number, reason: string): Promise<PaymentDetailDto> {
  return apiRequest(`${paymentPath(id)}/rejection`, {
    method: 'POST',
    headers: decision(version),
    body: { reason },
  })
}

export function recordCashReceipt(
  id: string,
  version: number,
  receipt: { receiptNumber: string; receivedAmount: string; receivedAt: string; collectorName: string },
): Promise<PaymentDetailDto> {
  return apiRequest(`${paymentPath(id)}/cash-receipt`, { method: 'POST', headers: decision(version), body: receipt })
}

/** The proof as a file; the server audits every read. */
export function downloadProof(id: string) {
  return apiDownload(`${paymentPath(id)}/proof`)
}

export function proposeBeneficiary(account: {
  legalName: string
  bankName: string
  iban: string
  swiftCode: string
  reason: string
}): Promise<BeneficiaryRecordDto> {
  return apiRequest(BENEFICIARIES_PATH, {
    method: 'POST',
    body: { ...account, swiftCode: account.swiftCode.trim() || null },
  })
}

export function confirmBeneficiary(id: string, version: number): Promise<BeneficiaryRecordDto> {
  return apiRequest(`${BENEFICIARIES_PATH}/${encodeURIComponent(id)}/confirmation`, {
    method: 'POST',
    headers: decision(version),
  })
}

export function retireBeneficiary(id: string, version: number): Promise<BeneficiaryRecordDto> {
  return apiRequest(`${BENEFICIARIES_PATH}/${encodeURIComponent(id)}/retirement`, {
    method: 'POST',
    headers: decision(version),
  })
}
