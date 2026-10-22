import { apiRequest } from '../../api'

/**
 * Refund cases on the console (backend V289, V381, V407, V412, V423). Every company's cases are listed
 * together on the refund queue (`GET /platform/billing/refund-cases`, `platform.billing.read`); a
 * company's own are also read with its payments (`GET /platform/companies/{id}/payments`,
 * `refundCases` on every page, so one row is asked for). By `platform.billing.manage`:
 *
 * - `POST .../subscription/refund-cases/{caseId}/refund` records how the money went back (to the
 *   card, in cash or by bank transfer), a reference and the day, after which the case is REFUNDED and
 *   read-only. Any open case: a Finance case (RF-2: a final rejection, a period paid ahead) at the
 *   amount received; a console case after the server works the suggestion out again for that day and
 *   ends access with the last month not refunded;
 * - console cases only (CA-1, LV-6, RF-1: a company that left Fawtir, yearly `LEFT_FAWTIR_ANNUAL` or
 *   monthly `LEFT_FAWTIR_MONTHLY`, and a customer's cancellation of a yearly subscription,
 *   `CANCELLED_ANNUAL_REMAINING`): `POST .../amount` changes the suggested amount, with a reason;
 * - only a yearly subscription's remaining months (`LEFT_FAWTIR_ANNUAL`, `CANCELLED_ANNUAL_REMAINING`):
 *   `POST .../decline` closes it without a refund, with a reason;
 * - every other case, which is always refunded (V427): `POST .../waive` records that the customer gave
 *   the refund up in writing, with that evidence and its reference.
 *
 * Recording a console case's refund approves it (`approvedOn`, V427): its months and the end of access
 * count from that day, and the money goes out that day or later (`refundedOn`), never before.
 */
const company = (tenantId: string) => `/v1/platform/companies/${encodeURIComponent(tenantId)}`
const refundCase = (tenantId: string, caseId: string) =>
  `${company(tenantId)}/subscription/refund-cases/${encodeURIComponent(caseId)}`

export const companyRefundCasesPath = (tenantId: string) => `${company(tenantId)}/payments?limit=1`

export const REFUND_QUEUE_PATH = '/v1/platform/billing/refund-cases'

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
/** The queue's kind filter: each kind is the reasons it covers. */
export const REFUND_KINDS = {
  SIGNUP_REJECTION: ['FINAL_REJECTION', 'CORRECTION_WINDOW_EXPIRED'],
  PAID_AHEAD: ['CANCELLED_BY_FAWTIR', 'CANCELLED_BY_CUSTOMER'],
  LEFT_FAWTIR: ['LEFT_FAWTIR_ANNUAL', 'LEFT_FAWTIR_MONTHLY'],
  YEARLY_CANCELLATION: ['CANCELLED_ANNUAL_REMAINING'],
} as const
export type RefundKind = keyof typeof REFUND_KINDS
export const REFUND_STATUSES = ['OPEN', 'REFUNDED', 'WITHDRAWN', 'DECLINED', 'WAIVED'] as const
/**
 * A yearly subscription's remaining months: the only refund the super admin may decide against. Every
 * other case is always refunded, and closes without money going back only when the customer gives it up
 * in writing (backend V427).
 */
export const DECLINABLE_REASONS: readonly string[] = [
  'LEFT_FAWTIR_ANNUAL',
  'CANCELLED_ANNUAL_REMAINING',
]

export const REFUND_METHODS = ['CARD', 'CASH', 'BANK_TRANSFER'] as const
export type RefundMethod = (typeof REFUND_METHODS)[number]

export type RefundCaseDto = {
  id: string
  tenantId?: string
  paymentId: string
  /** OMR, three decimals, as a string. */
  amount: string
  /** How the money came in. */
  method: string
  reason: string
  status: 'OPEN' | 'REFUNDED' | 'WITHDRAWN' | 'DECLINED' | 'WAIVED' | (string & {})
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
  /** The day the money went back (V423); absent from a server before it, then `refundedAt` stands. */
  refundedOn?: string | null
  /**
   * The day the super admin approved a console case's refund (V427): its months and the end of access
   * count from it. Null for a Finance case.
   */
  approvedOn?: string | null
  /** Set when WITHDRAWN: the cancellation was withdrawn or the company came back first. */
  withdrawnAt?: string | null
  /** Set when DECLINED: why the super admin closed it without a refund. */
  declineReason?: string | null
  /** Set when WAIVED (V427): the customer's written words giving the refund up, and where they are kept. */
  waivedAt?: string | null
  waiveEvidence?: string | null
  waiveReference?: string | null
}

export type CompanyRefundCasesDto = { refundCases?: RefundCaseDto[] }

export type RefundQueueItemDto = { refundCase: RefundCaseDto; tenantName: string | null }
export type RefundQueuePageDto = { items: RefundQueueItemDto[]; nextCursor: string | null }

/** The queue filtered by kind (all when null) and status (all when null), from `after` when paging. */
export function refundQueuePath(
  kind: RefundKind | null,
  status: (typeof REFUND_STATUSES)[number] | null,
  after?: string | null,
): string {
  const query = new URLSearchParams()
  for (const reason of kind ? REFUND_KINDS[kind] : []) query.append('reason', reason)
  for (const value of status ? [status] : REFUND_STATUSES) query.append('status', value)
  if (after) query.set('after', after)
  return `${REFUND_QUEUE_PATH}?${query.toString()}`
}

export function loadRefundQueuePage(path: string): Promise<RefundQueuePageDto> {
  return apiRequest<RefundQueuePageDto>(path)
}

/** A console case still open: the super admin decides its amount. */
export const settlesHere = (c: RefundCaseDto) =>
  CONSOLE_REASONS.includes(c.reason) && c.status === 'OPEN'

/** Open and a yearly subscription's remaining months: may be closed without a refund. */
export const declinableHere = (c: RefundCaseDto) =>
  DECLINABLE_REASONS.includes(c.reason) && c.status === 'OPEN'

/** Open and always refunded: closes without a refund only when the customer gave it up in writing. */
export const waivableHere = (c: RefundCaseDto) =>
  !DECLINABLE_REASONS.includes(c.reason) && c.status === 'OPEN'

/** Any open case can be marked refunded: a Finance case at its amount, a console case as decided. */
export const refundableHere = (c: RefundCaseDto) => c.status === 'OPEN'

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
  refundedOn: string,
): Promise<RefundCaseDto> {
  return apiRequest(`${refundCase(tenantId, caseId)}/refund`, {
    method: 'POST',
    body: { method, reference, refundedOn },
  })
}

export function declineRefund(
  tenantId: string,
  caseId: string,
  reason: string,
): Promise<RefundCaseDto> {
  return apiRequest(`${refundCase(tenantId, caseId)}/decline`, {
    method: 'POST',
    body: { reason },
  })
}

export function waiveRefund(
  tenantId: string,
  caseId: string,
  evidence: string,
  reference: string,
): Promise<RefundCaseDto> {
  return apiRequest(`${refundCase(tenantId, caseId)}/waive`, {
    method: 'POST',
    body: { evidence, reference },
  })
}
