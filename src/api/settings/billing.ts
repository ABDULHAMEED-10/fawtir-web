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

export type PaymentMethod = 'BANK_TRANSFER' | 'CASH' | 'CARD'

export type PaymentStatus =
  | 'SUBMITTED'
  | 'RECEIPT_RECORDED'
  | 'AWAITING_SECOND_APPROVAL'
  /** A signup payment Finance has verified, held until the company is approved (V289). */
  | 'FUNDS_VERIFIED'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'WITHDRAWN'

/** The seller as the bill names it: the version in force when the bill was issued. */
export type SellerOnBillDto = {
  legalNameEn: string
  legalNameAr: string | null
  crNumber: string
  taxIdentificationNumber: string | null
  vatNumber: string | null
  addressEn: string
  addressAr: string | null
}

/**
 * The seller's legal name in the reader's language, the English one when no Arabic name was
 * entered. Null when there is no seller: no name is better than a wrong one.
 */
export function sellerName(seller: SellerOnBillDto | null | undefined, language: string): string | null {
  if (!seller) return null
  return language.startsWith('ar') && seller.legalNameAr ? seller.legalNameAr : seller.legalNameEn
}

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
  /** Null for a bill issued before any seller was entered; absent from older servers. */
  seller?: SellerOnBillDto | null
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

/**
 * Whether one OPEN bill can be paid by card, decided by the server (backend Phase 3C): the bill's
 * purpose, the exact conversion of its final total, and no earlier card money for it under review.
 * `reason` says why not; the screen never works this out itself.
 */
export type CardOptionDto = {
  available: boolean
  purpose: 'NEW_SUBSCRIPTION' | 'SUBSCRIPTION_UPGRADE' | 'SUBSCRIPTION_RENEWAL' | null
  reason:
    | 'CARD_NOT_AVAILABLE'
    | 'PAYMOB_AMOUNT_NOT_REPRESENTABLE'
    | 'CARD_PAYMENT_PURPOSE_NOT_ELIGIBLE'
    | 'CARD_PAYMENT_UNDER_REVIEW'
    | 'BILL_NOT_PAYABLE'
    | null
}

/** `card` is present for an OPEN bill only, and absent from servers before Phase 3C. */
export type BillWithPaymentsDto = { bill: SubscriptionBillDto; payments: SubscriptionPaymentDto[]; card?: CardOptionDto | null }

/** Why bank transfer is or is not open; STORAGE_UNAVAILABLE recovers by itself. */
export type BankTransferStatus = 'AVAILABLE' | 'NOT_OFFERED' | 'NO_ACCOUNT' | 'STORAGE_UNAVAILABLE'

export type BillingOverviewDto = {
  /** The newest twelve; older ones come from {@link loadBillHistory} with {@link nextBillsCursor}. */
  bills: BillWithPaymentsDto[]
  nextBillsCursor: string | null
  beneficiary: BeneficiaryDto | null
  /** `card` is false (or absent, before Phase 3C) whenever card checkout is not switched on. */
  methods: { bankTransfer: boolean; bankTransferStatus: BankTransferStatus; cash: boolean; card?: boolean }
  proofMaximumBytes: number
  /** How a pay-now registrant chose to pay at signup; the pay form opens on it when it is offered. */
  signupMethod?: PaymentMethod | null
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

/**
 * A card payment as the customer may see it. PAID only once the provider-confirmed payment settled
 * the bill on the server; returning from the provider's page never makes it PAID.
 */
export type CardCheckoutStatus = 'PROCESSING' | 'READY' | 'PAID' | 'NOT_COMPLETED' | 'UNDER_REVIEW' | 'REVERSED'

export type CardCheckoutDto = {
  paymentId: string
  billId: string
  status: CardCheckoutStatus
  /** The provider's hosted checkout, only while READY. It carries the checkout's secret: never log it. */
  checkoutUrl: string | null
  expiresAt: string | null
  amount: string
  currency: 'OMR'
}

/** The only host the backend ever sends a customer to; anything else is refused before navigating. */
export const CARD_CHECKOUT_HOST = 'https://oman.paymob.com/'

/**
 * The one way this app leaves for the provider: a full-page navigation, never an iframe or a new
 * window, so the hosted page keeps its own origin. Held in an object so a test can stand in for it.
 */
export const hostedCheckout = {
  open(url: string): void {
    window.location.assign(url)
  },
}

export function isTrustedCheckoutUrl(url: string | null | undefined): url is string {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && `${parsed.origin}/` === CARD_CHECKOUT_HOST && !parsed.username && !parsed.password
  } catch {
    return false
  }
}

/**
 * Opens (or, with the same key, returns) the card checkout for a bill. No body: the server charges the
 * bill's own final total, so nothing the browser holds can change the amount.
 */
export function startCardCheckout(billId: string, idempotencyKey: string): Promise<CardCheckoutDto> {
  return apiRequest<CardCheckoutDto>(`${BILLING_PATH}/bills/${encodeURIComponent(billId)}/card-checkout`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export function loadCardCheckout(paymentId: string, signal?: AbortSignal): Promise<CardCheckoutDto> {
  return apiRequest<CardCheckoutDto>(`${BILLING_PATH}/payments/${encodeURIComponent(paymentId)}/card-checkout`, { signal })
}
