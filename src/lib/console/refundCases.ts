import { apiRequest } from '../../api'

/**
 * A company's refund cases on the console (backend V289, V381, V407, V412). They are read with the
 * company's payments (`GET /platform/companies/{id}/payments`, `refundCases` on every page, so one
 * row is asked for). Finance pays most of them outside Fawtir; the super admin settles here the ones
 * the Business Rules leave to the console (CA-1, LV-6, RF-1): a company that left Fawtir, yearly
 * (`LEFT_FAWTIR_ANNUAL`) or monthly with a period paid ahead (`LEFT_FAWTIR_MONTHLY`), and a customer's
 * cancellation of a yearly subscription (`CANCELLED_ANNUAL_REMAINING`), by `platform.billing.manage`:
 *
 * - `POST .../subscription/refund-cases/{caseId}/amount` changes the suggested amount, with a reason;
 * - `POST .../subscription/refund-cases/{caseId}/refund` records how the money went back (to the
 *   card, in cash or by bank transfer), after which the case is REFUNDED and read-only.
 */
const company = (tenantId: string) => `/v1/platform/companies/${encodeURIComponent(tenantId)}`
const refundCase = (tenantId: string, caseId: string) =>
  `${company(tenantId)}/subscription/refund-cases/${encodeURIComponent(caseId)}`

export const companyRefundCasesPath = (tenantId: string) => `${company(tenantId)}/payments?limit=1`

export const REFUND_REASONS = [
  'FINAL_REJECTION',
  'CORRECTION_WINDOW_EXPIRED',
  'CANCELLED_BY_FAWTIR',
  'CANCELLED_BY_CUSTOMER',
  'LEFT_FAWTIR_ANNUAL',
  'LEFT_FAWTIR_MONTHLY',
  'CANCELLED_ANNUAL_REMAINING',
] as const
/** Decided and recorded by the super admin here; the others Finance pays outside Fawtir. */
export const CONSOLE_REASONS: readonly string[] = [
  'LEFT_FAWTIR_ANNUAL',
  'LEFT_FAWTIR_MONTHLY',
  'CANCELLED_ANNUAL_REMAINING',
]
export const REFUND_METHODS = ['CARD', 'CASH', 'BANK_TRANSFER'] as const
export type RefundMethod = (typeof REFUND_METHODS)[number]

export type RefundCaseDto = {
  id: string
  paymentId: string
  /** OMR, three decimals, as a string. */
  amount: string
  /** How the money came in. */
  method: string
  reason: string
  status: 'OPEN' | 'REFUNDED' | 'WITHDRAWN' | (string & {})
  openedAt: string
  /** The fields below are console cases only; absent from a server before V412. */
  disconnectionId?: string | null
  suggestedAmount?: string | null
  monthsRefunded?: number | null
  amountReason?: string | null
  amountAdjustedAt?: string | null
  refundMethod?: RefundMethod | (string & {}) | null
  refundedAt?: string | null
  refundReference?: string | null
  /** Set when WITHDRAWN: the cancellation was withdrawn or the company came back first. */
  withdrawnAt?: string | null
}

export type CompanyRefundCasesDto = { refundCases?: RefundCaseDto[] }

/** Only these are settled in Fawtir, and only while open. */
export const settlesHere = (c: RefundCaseDto) =>
  CONSOLE_REASONS.includes(c.reason) && c.status === 'OPEN'

export function adjustRefundAmount(
  tenantId: string,
  caseId: string,
  amount: number,
  reason: string,
): Promise<RefundCaseDto> {
  return apiRequest(`${refundCase(tenantId, caseId)}/amount`, {
    method: 'POST',
    body: { amount, reason },
  })
}

export function recordRefund(
  tenantId: string,
  caseId: string,
  method: RefundMethod,
  reference: string | null,
): Promise<RefundCaseDto> {
  return apiRequest(`${refundCase(tenantId, caseId)}/refund`, {
    method: 'POST',
    body: { method, reference },
  })
}
