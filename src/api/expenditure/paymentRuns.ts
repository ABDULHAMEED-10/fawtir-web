import { apiDownload, apiRequest, type ApiDownload } from '../client'
import { withQuery } from '../query'

/**
 * Payment runs (`PaymentRunController`) and the accounts money leaves from
 * (`PayerBankAccountController`). A run is DRAFT until it has a payment date, SCHEDULED until its
 * bank file is made, then EXPORTED and finally PAID; DRAFT and SCHEDULED runs can be cancelled.
 */
export const PAYMENT_RUNS_PATH = '/v1/payment-runs'
export const PAYER_ACCOUNTS_PATH = '/v1/payer-bank-accounts'

export type PaymentRunState = 'DRAFT' | 'SCHEDULED' | 'EXPORTED' | 'PAID' | 'CANCELLED'
export type PaymentRunFormat = 'BANK_MUSCAT_CSV' | 'PAIN_001' | 'PRINTED_LIST'

export type PaymentRunDto = {
  id: string
  reference: string
  state: PaymentRunState
  paymentDate: string | null
  payerAccountId: string | null
  runReference: string | null
  format: PaymentRunFormat | null
  currency: string
  billsTotal: number
  discountTotal: number
  netTotal: number
  exportedAt: string | null
  paidAt: string | null
  cancelledAt: string | null
  createdAt: string
  version: number
}

export type PaymentRunItemDto = {
  id: string
  billId: string
  supplierId: string | null
  supplierName: string | null
  supplierBillNumber: string | null
  issueDate: string | null
  dueDate: string | null
  amount: number
  discountTaken: number
  outstanding: number
}

export type PaymentRunDetailDto = { run: PaymentRunDto; items: PaymentRunItemDto[] }

/** A bill a run could take now, priced for the run's payment date. */
export type PaymentRunCandidateDto = {
  billId: string
  supplierId: string | null
  supplierName: string | null
  supplierBillNumber: string | null
  issueDate: string | null
  dueDate: string | null
  outstanding: number
  discount: number
  amount: number
}

export type BlockedReasonCode = 'ON_HOLD' | 'MISMATCH' | 'REJECTED' | 'AWAITING_APPROVALS'

export type PaymentRunBlockedDto = {
  billId: string
  supplierBillNumber: string | null
  supplierId: string | null
  supplierName: string | null
  dueDate: string | null
  outstanding: number
  reasonCodes: BlockedReasonCode[]
  approvalsGiven: number | null
  approvalsRequired: number | null
}

export type PayerAccountDto = { id: string; name: string; iban: string; bic: string | null; active: boolean }

export type RunDetails = {
  paymentDate?: string | null
  payerAccountId?: string | null
  runReference?: string | null
  format?: PaymentRunFormat | null
}

export const runsListPath = (state: PaymentRunState | null) => withQuery(PAYMENT_RUNS_PATH, { state: state ?? undefined })
export const runPath = (id: string) => `${PAYMENT_RUNS_PATH}/${encodeURIComponent(id)}`

export function loadRuns(path: string): Promise<PaymentRunDto[]> {
  return apiRequest<PaymentRunDto[]>(path)
}

export function loadRun(id: string): Promise<PaymentRunDetailDto> {
  return apiRequest<PaymentRunDetailDto>(runPath(id))
}

/** `invoice.payment.manage`. A run given a payment date starts SCHEDULED. */
export function createRun(details: RunDetails & { currency: string }): Promise<PaymentRunDto> {
  return apiRequest<PaymentRunDto>(PAYMENT_RUNS_PATH, { method: 'POST', body: details })
}

/** Replaces all four details; changing the date re-prices early-payment discounts. */
export function updateRun(id: string, details: Required<RunDetails>): Promise<PaymentRunDetailDto> {
  return apiRequest<PaymentRunDetailDto>(runPath(id), { method: 'PUT', body: details })
}

export function addToRun(id: string, billIds: string[]): Promise<PaymentRunDetailDto> {
  return apiRequest<PaymentRunDetailDto>(`${runPath(id)}/items`, { method: 'POST', body: { billIds } })
}

export function removeFromRun(id: string, billId: string): Promise<PaymentRunDetailDto> {
  return apiRequest<PaymentRunDetailDto>(`${runPath(id)}/items/${encodeURIComponent(billId)}`, { method: 'DELETE' })
}

/** A run's own candidates, or — before the run exists — those of a run in `currency` paying on `paymentDate`. */
export function candidatesPath(runId: string | null, currency: string, paymentDate: string | null): string {
  return runId ? `${runPath(runId)}/candidates` : withQuery(`${PAYMENT_RUNS_PATH}/candidates`, { currency, payment_date: paymentDate ?? undefined })
}

export function loadCandidates(path: string): Promise<PaymentRunCandidateDto[]> {
  return apiRequest<PaymentRunCandidateDto[]>(path)
}

export function blockedPath(runId: string | null, currency: string): string {
  return runId ? `${runPath(runId)}/blocked` : withQuery(`${PAYMENT_RUNS_PATH}/blocked`, { currency })
}

export function loadBlocked(path: string): Promise<PaymentRunBlockedDto[]> {
  return apiRequest<PaymentRunBlockedDto[]>(path)
}

/** `invoice.export`. Makes the bank file; a SCHEDULED run becomes EXPORTED, an EXPORTED one is made again. */
export function exportRun(id: string): Promise<ApiDownload> {
  return apiDownload(`${runPath(id)}/export`, { method: 'POST' })
}

export function markRunPaid(id: string): Promise<PaymentRunDto> {
  return apiRequest<PaymentRunDto>(`${runPath(id)}/mark-paid`, { method: 'POST' })
}

export function cancelRun(id: string): Promise<PaymentRunDto> {
  return apiRequest<PaymentRunDto>(`${runPath(id)}/cancel`, { method: 'POST' })
}

export function loadPayerAccounts(): Promise<PayerAccountDto[]> {
  return apiRequest<PayerAccountDto[]>(PAYER_ACCOUNTS_PATH)
}

/** `admin.settings.manage`. The IBAN is checked by shape and MOD-97 check digits. */
export function createPayerAccount(account: { name: string; iban: string; bic: string | null }): Promise<PayerAccountDto> {
  return apiRequest<PayerAccountDto>(PAYER_ACCOUNTS_PATH, { method: 'POST', body: account })
}
