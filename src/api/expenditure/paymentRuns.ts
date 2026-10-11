import { apiDownload, apiRequest, type ApiDownload } from '../client'
import { withQuery } from '../query'

/**
 * Payment runs (`PaymentRunController`) and the accounts money leaves from
 * (`PayerBankAccountController`). A run is DRAFT until it has a payment date, SCHEDULED until its
 * bank file is made, then EXPORTED and finally PAID; DRAFT and SCHEDULED runs can be cancelled.
 * The payment date is optional, a planned date only (owner, 10 Oct 2026): `paymentDate` is sent
 * null when it is left out or cleared.
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
  /**
   * Backend #477, on a list row: what was marked paid and what was taken out, null unless the run
   * is PAID (`takenOutTotal` 0 when nothing was). Absent from an older server. `netTotal` stays
   * the planned total. `takenOutTotal` is what the taken-out bills still owe, without the
   * early-payment discount (owner, 10 Oct 2026), as the run page's "taken out" figure.
   */
  paidTotal?: number | null
  takenOutTotal?: number | null
  exportedAt: string | null
  paidAt: string | null
  /**
   * Backend #480, on a list row: the day the run's bills were paid, as chosen in Mark as paid;
   * null unless the run is PAID, absent from an older server. `paymentDate` stays the date the run
   * was planned for. The run's detail carries it beside `run` (`PaymentRunDetailDto.paidOn`).
   */
  paidOn?: string | null
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
  /**
   * Set when the bill was taken out as the rest of a sent run was marked paid: the run paid
   * nothing for it. Absent from a server from before the sent-run exits.
   */
  takenOut?: {
    at: string
    actor: string | null
    reason: string
    /**
     * What the bill still owes now, without the early-payment discount the run had priced it
     * with: it was not paid, so none was taken (owner, 10 Oct 2026). Absent from an older server.
     */
    owedNow?: number | null
  } | null
  /**
   * On a live run (DRAFT, SCHEDULED or EXPORTED; EXPORTED only on a server before #476), why
   * marking this bill paid would be refused now; the mark-paid dialog ticks it to be taken out.
   * Null when it can be paid, absent from an older server.
   */
  markPaidBlock?: { code: MarkPaidBlockCode; owedNow: number | null } | null
  /**
   * The supplier's bank details changed after this bill was added to the run (owner, 10 Oct 2026):
   * the run warns to check them before paying. Absent from an older server.
   */
  supplierBankDetailsChangedSinceAdded?: boolean | null
}

export type MarkPaidBlockCode =
  | 'PAYMENT_RUN_AMOUNT_CHANGED'
  | 'PAYMENT_RUN_DEBIT_NOTE_REFUSED'
  | 'PAYMENT_RUN_BILL_SETTLED'
  /** Backend #476: held after it joined (any live run), or rejected after it joined (before a file). */
  | 'PAYMENT_RUN_BILL_ON_HOLD'
  | 'PAYMENT_RUN_BILL_NOT_READY'
  /** Backend #480: a supplier debit note nobody has accepted yet is not payable (10 Oct 2026). */
  | 'PAYMENT_RUN_DEBIT_NOTE_NOT_ACCEPTED'

export type PaymentRunActivityKind =
  | 'CREATED'
  | 'EXPORTED'
  | 'PAID'
  | 'CANCELLED'
  | 'TAKEN_OUT'
  | 'CANCELLED_BANK_PAID_NOTHING'

/** One line of the run's timeline, newest first. */
export type PaymentRunActivityDto = {
  at: string
  kind: PaymentRunActivityKind
  reason: string | null
  actor: string | null
  billId: string | null
  supplierBillNumber: string | null
}

export type PaymentRunDetailDto = {
  run: PaymentRunDto
  /**
   * Backend #480: the day the run's bills were paid, as chosen in Mark as paid; null unless the
   * run is PAID, absent from an older server.
   */
  paidOn?: string | null
  items: PaymentRunItemDto[]
  /** Absent from a server from before the sent-run exits. */
  activity?: PaymentRunActivityDto[]
  /**
   * Null until the bank file is first made; then whether it is kept, so "Download again" returns
   * it byte for byte (false: a run exported before files were kept). Absent from older servers.
   */
  fileStored?: boolean | null
  /**
   * Suppliers whose IBAN today differs from the one the kept file pays, in the file's order.
   * Empty when none changed or no file is kept; absent from older servers.
   */
  bankDetailsChangedSinceFile?: { supplierId: string; supplierName: string | null }[]
}

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

/**
 * DEBIT_NOTE_REFUSED: a supplier debit note (383) whose current decision is REFUSED.
 * DEBIT_NOTE_NOT_ACCEPTED (backend #480): one nobody has accepted or refused yet.
 */
export type BlockedReasonCode =
  | 'ON_HOLD'
  | 'MISMATCH'
  | 'REJECTED'
  | 'AWAITING_APPROVALS'
  | 'DEBIT_NOTE_REFUSED'
  | 'DEBIT_NOTE_NOT_ACCEPTED'

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

/** A bill of a sent run the bank did not pay, left unpaid when the rest is marked paid. */
export type TakeOut = { billId: string; reason: string }

/**
 * `invoice.payment.manage`. DRAFT, SCHEDULED or EXPORTED -> PAID (DRAFT and SCHEDULED since
 * backend #476; no bank file is needed). With `takeOut`, the named bills are left unpaid and the
 * rest is marked paid. `paymentDate` (owner, 10 Oct 2026) is the day the suppliers were paid, never
 * in the future; the server refuses a future one. With neither, no body is sent, as before.
 */
export function markRunPaid(
  id: string,
  takeOut: TakeOut[] = [],
  paymentDate?: string,
): Promise<PaymentRunDto> {
  const body = {
    ...(paymentDate ? { paymentDate } : {}),
    ...(takeOut.length > 0 ? { takeOut } : {}),
  }
  return apiRequest<PaymentRunDto>(`${runPath(id)}/mark-paid`, {
    method: 'POST',
    ...(Object.keys(body).length > 0 ? { body } : {}),
  })
}

/**
 * `invoice.payment.manage`. A draft or scheduled run is cancelled with no body. A sent (EXPORTED)
 * run is cancelled only on the person's word that the bank paid nothing, with a reason.
 */
export function cancelRun(id: string, bankPaidNothing?: { reason: string }): Promise<PaymentRunDto> {
  return apiRequest<PaymentRunDto>(`${runPath(id)}/cancel`, {
    method: 'POST',
    ...(bankPaidNothing ? { body: { bankPaidNothing: true, reason: bankPaidNothing.reason } } : {}),
  })
}

export function loadPayerAccounts(): Promise<PayerAccountDto[]> {
  return apiRequest<PayerAccountDto[]>(PAYER_ACCOUNTS_PATH)
}

/** `admin.settings.manage`. The IBAN is checked by shape and MOD-97 check digits. */
export function createPayerAccount(account: { name: string; iban: string; bic: string | null }): Promise<PayerAccountDto> {
  return apiRequest<PayerAccountDto>(PAYER_ACCOUNTS_PATH, { method: 'POST', body: account })
}
