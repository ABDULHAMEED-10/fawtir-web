import { apiRequest } from '../client'

/**
 * `/v1/settings/billing` (`SubscriptionBillingController`, backend V271): subscription charge
 * statements and manual payments. Reading needs `tenant.plan.read`, every action
 * `tenant.plan.manage`. A charge is a statement, not a tax invoice. Submitting proof or asking for
 * cash collection never pays a bill: only Fawtir's verification does, so the screen shows these as
 * waiting, never as paid.
 */
export const BILLING_PATH = '/v1/settings/billing'

export type BillStatus = 'OPEN' | 'PENDING_VERIFICATION' | 'PAID' | 'VOID'

export type PaymentMethod = 'BANK_TRANSFER' | 'CASH'

export type PaymentStatus =
  | 'SUBMITTED'
  | 'RECEIPT_RECORDED'
  | 'AWAITING_SECOND_APPROVAL'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'WITHDRAWN'

/** Amounts are three-decimal OMR strings computed by the server. */
export type SubscriptionBillDto = {
  id: string
  number: string
  planCode: string
  planName: string
  billingCycle: 'MONTHLY' | 'ANNUAL'
  periodStartsOn: string
  periodEndsOn: string
  subtotal: string
  vatRate: string
  vatAmount: string
  total: string
  currency: 'OMR'
  taxDocumentStatus: 'NOT_A_TAX_INVOICE'
  status: BillStatus
  dueOn: string
  issuedAt: string
  paidAt: string | null
  appliedPaidThrough: string | null
  voidReason: string | null
  version: number
}

export type SubscriptionPaymentDto = {
  id: string
  billId: string
  method: PaymentMethod
  status: PaymentStatus
  amount: string
  submittedAt: string
  reference: string | null
  customerNote: string | null
  proofContentType: string | null
  receiptNumber: string | null
  receivedAmount: string | null
  receivedAt: string | null
  rejectionReason: string | null
  version: number
}

export type BeneficiaryDto = {
  legalName: string
  bankName: string
  iban: string
  swiftCode: string | null
}

export type BillWithPaymentsDto = { bill: SubscriptionBillDto; payments: SubscriptionPaymentDto[] }

/** Why bank transfer is or is not open; STORAGE_UNAVAILABLE recovers by itself. */
export type BankTransferStatus = 'AVAILABLE' | 'NOT_OFFERED' | 'NO_ACCOUNT' | 'STORAGE_UNAVAILABLE'

export type BillingOverviewDto = {
  /** The newest twelve; older ones come from {@link loadBillHistory} with {@link nextBillsCursor}. */
  bills: BillWithPaymentsDto[]
  nextBillsCursor: string | null
  beneficiary: BeneficiaryDto | null
  methods: { bankTransfer: boolean; bankTransferStatus: BankTransferStatus; cash: boolean }
  proofMaximumBytes: number
}

export type BillPageDto = { bills: BillWithPaymentsDto[]; nextCursor: string | null }

/** The reason prefix the server gives a bill it voided because the terms changed under it. */
export const SUPERSEDED_PREFIX = 'Superseded: '

export function loadBillingOverview(): Promise<BillingOverviewDto> {
  return apiRequest<BillingOverviewDto>(BILLING_PATH)
}

export function loadBillHistory(before: string): Promise<BillPageDto> {
  return apiRequest<BillPageDto>(`${BILLING_PATH}/bills?before=${encodeURIComponent(before)}`)
}

/** Issues the next period's charge, or returns the one already outstanding. */
export function prepareNextBill(): Promise<SubscriptionBillDto> {
  return apiRequest<SubscriptionBillDto>(`${BILLING_PATH}/bills/next`, { method: 'POST' })
}

/**
 * One key per attempt, kept by the caller across retries: a retried submission with the same
 * key returns the first payment instead of creating a second.
 */
export function newPaymentKey(): string {
  return `subscription-payment-${crypto.randomUUID()}`
}

export function submitBankTransfer(
  billId: string,
  proof: File,
  reference: string,
  note: string,
  idempotencyKey: string,
): Promise<SubscriptionPaymentDto> {
  const body = new FormData()
  body.append('proof', proof)
  body.append('reference', reference)
  if (note.trim()) body.append('note', note)
  return apiRequest<SubscriptionPaymentDto>(
    `${BILLING_PATH}/bills/${encodeURIComponent(billId)}/bank-transfer`,
    { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } },
  )
}

export function requestCash(billId: string, note: string, idempotencyKey: string): Promise<SubscriptionPaymentDto> {
  return apiRequest<SubscriptionPaymentDto>(`${BILLING_PATH}/bills/${encodeURIComponent(billId)}/cash-request`, {
    method: 'POST',
    body: { note: note.trim() || null },
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export function withdrawPayment(paymentId: string): Promise<SubscriptionPaymentDto> {
  return apiRequest<SubscriptionPaymentDto>(`${BILLING_PATH}/payments/${encodeURIComponent(paymentId)}/withdrawal`, {
    method: 'POST',
  })
}
