import { apiRequest } from '../client'
import type { ReceiptReportDto } from './bills'
import { fromItemsPage, type ItemsPage, type Page } from '../page'
import { withQuery } from '../query'

/**
 * Supplier credit notes (`CreditNoteController`) and debit notes (`DebitNoteController`), in the
 * shapes the API answers with (E-15, E-16).
 *
 * **They are not two views of one thing.** A credit note (381, or 261 self-billed) REDUCES what
 * the tenant owes: it has no due date, nothing outstanding and no payment state, and what matters
 * is where the credit went — applied to a bill, or refunded. A debit note (383) INCREASES what is
 * owed and is a payable in its own right, so it carries the due date, the outstanding amount and
 * the overdue flag, and what matters is whether it was accepted at all. Sharing a row type between
 * them would point the money the wrong way on one of the two screens.
 */

export const CREDIT_NOTES_PATH = '/v1/credit-notes'
export const DEBIT_NOTES_PATH = '/v1/debit-notes'
export const CREDIT_NOTE_SUMMARY_PATH = `${CREDIT_NOTES_PATH}/summary`
export const DEBIT_NOTE_SUMMARY_PATH = `${DEBIT_NOTES_PATH}/summary`

export const NOTE_PAGE_SIZE = 20

/** Shared by both lists: where the document came from, and whether the platform vouched for it. */
export type NoteSourceDto = 'PEPPOL' | 'UPLOADED' | 'SCANNED' | 'RECURRING' | 'SELF_BILLED'

export type ApprovalDto = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'

// ─────────────────────────────────────────────────────────────── credit notes

export type CreditNoteStatusDto = 'UNAPPLIED' | 'WAITING_FOR_BILL' | 'APPLIED' | 'REFUNDED'

/** How much of the credit has gone where. Presented positive, like `creditedAmount`. */
export type CreditNoteBalanceDto = {
  applied: number
  refunded: number
  remaining: number
}

/**
 * What the credit lands on, as the supplier stated it.
 *
 * `applied` is derived on the server from `billId` and cannot disagree with it: a note reducing
 * none or several bills names none, because pointing at the first of several would be a claim the
 * ledger does not make.
 */
export type CreditedBillDto = {
  billNumber: string | null
  issueDate: string | null
  documentUuid: string | null
  billId: string | null
  applied: boolean
}

export type CreditNoteRowDto = {
  id: string
  inboundDeliveryId: string | null
  source: NoteSourceDto
  networkVerified: boolean
  supplierId: string | null
  supplierName: string | null
  supplierParticipantId: string | null
  /** 381 supplier credit note, 261 self-billed. */
  documentTypeCode: string | null
  creditNoteNumber: string | null
  issueDate: string | null
  currencyCode: string
  taxCurrencyCode: string | null
  /** IBT-115 on a credit note: the amount credited, positive. */
  creditedAmount: number | null
  vatAmount: number | null
  /** BTOM-032 — why the supplier credited. Mandatory under IBR-023-OM, coded by CL-02-OM. */
  reasonCode: string | null
  /**
   * The finer reason behind the CL-02-OM code, as the app's own reason id (SHORT_DELIVERY,
   * DAMAGED, SURCHARGE…). TODO(backend): EXPENDITURE.md R.3.
   */
  reasonDetail?: string | null
  /** Our own receipt report to the OTA (om-tdd, role 02). TODO(backend): EXPENDITURE.md R.1. */
  receiptReport?: ReceiptReportDto | null
  approval: ApprovalDto
  status: CreditNoteStatusDto
  balance: CreditNoteBalanceDto
  credits: CreditedBillDto
}

export type CreditNoteSummaryDto = {
  currencyCode: string
  usableCount: number
  usableCredit: number
  recoveredThisQuarterCount: number
  recoveredThisQuarter: number
  topSupplier: { supplierId: string | null; supplierName: string | null; noteCount: number } | null
  excludedFromTotals: number
}

export type CreditNoteSettlementDto = {
  id: string
  creditNoteId: string
  /** Null on a refund: the money left the relationship rather than reducing a bill. */
  billId: string | null
  kind: 'APPLIED' | 'REFUNDED'
  amount: number
  paymentReference: string | null
  settledOn: string
  actorId: string | null
  occurredAt: string
}

/** The row written, and where the note stands now that it has been. */
export type CreditNoteActionDto = {
  settlement: CreditNoteSettlementDto
  status: CreditNoteStatusDto
  balance: CreditNoteBalanceDto
}

export function creditNoteListPath(status: CreditNoteStatusDto | 'ALL', page: number, pageSize = NOTE_PAGE_SIZE) {
  return withQuery(CREDIT_NOTES_PATH, {
    // Sent explicitly rather than omitted: the server rejects an unknown value instead of
    // reading it as ALL, and a filter that silently widened would show every note to someone
    // who believed they were looking at the unapplied ones.
    status,
    page,
    page_size: pageSize,
  })
}

export function creditNotePath(id: string) {
  return `${CREDIT_NOTES_PATH}/${id}`
}

export async function loadCreditNotePage(path: string): Promise<Page<CreditNoteRowDto>> {
  return fromItemsPage(await apiRequest<ItemsPage<CreditNoteRowDto>>(path))
}

export function loadCreditNote(id: string): Promise<CreditNoteRowDto> {
  return apiRequest<CreditNoteRowDto>(creditNotePath(id))
}

export function loadCreditNoteSummary(): Promise<CreditNoteSummaryDto> {
  return apiRequest<CreditNoteSummaryDto>(CREDIT_NOTE_SUMMARY_PATH)
}

export function loadCreditNoteSettlements(id: string): Promise<CreditNoteSettlementDto[]> {
  return apiRequest<CreditNoteSettlementDto[]>(`${creditNotePath(id)}/settlements`)
}

/** @param amount null for the largest amount that fits both the credit and the bill. */
export function applyCreditNote(id: string, billId: string, amount: number | null): Promise<CreditNoteActionDto> {
  return apiRequest<CreditNoteActionDto>(`${creditNotePath(id)}/apply`, {
    method: 'POST',
    body: { billId, amount },
  })
}

export function refundCreditNote(
  id: string,
  amount: number,
  paidOn: string,
  paymentReference: string | null,
): Promise<CreditNoteActionDto> {
  return apiRequest<CreditNoteActionDto>(`${creditNotePath(id)}/refund`, {
    method: 'POST',
    body: { amount, paidOn, paymentReference },
  })
}

// ──────────────────────────────────────────────────────────────── debit notes

export type DebitNoteStatusDto = 'UNCHECKED' | 'ACCEPTED' | 'REFUSED'

export type DebitNoteDecisionDto = {
  decision: DebitNoteStatusDto
  reason: string | null
  decidedBy: string | null
  decidedAt: string
}

export type RelatedInvoiceDto = {
  billNumber: string | null
  issueDate: string | null
  documentUuid: string | null
}

export type DebitNoteRowDto = {
  id: string
  inboundDeliveryId: string | null
  source: NoteSourceDto
  networkVerified: boolean
  supplierId: string | null
  supplierName: string | null
  supplierParticipantId: string | null
  debitNoteNumber: string | null
  issueDate: string | null
  dueDate: string | null
  /** The server's judgment, computed at read time. Never recomputed from the date here. */
  overdue: boolean
  currencyCode: string
  taxCurrencyCode: string | null
  totalIncludingVat: number | null
  vatAmount: number | null
  amountDue: number | null
  reasonCode: string | null
  /**
   * The finer reason behind the CL-02-OM code, as the app's own reason id (SHORT_DELIVERY,
   * DAMAGED, SURCHARGE…). TODO(backend): EXPENDITURE.md R.3.
   */
  reasonDetail?: string | null
  /** Our own receipt report to the OTA (om-tdd, role 02). TODO(backend): EXPENDITURE.md R.1. */
  receiptReport?: ReceiptReportDto | null
  approval: ApprovalDto
  paidAmount: number
  creditedAmount: number
  outstandingAmount: number
  paymentState: string
  status: DebitNoteStatusDto
  decidedBy: string | null
  decidedAt: string | null
  decisionReason: string | null
  relatesTo: RelatedInvoiceDto | null
}

export type DebitNoteSummaryDto = {
  currencyCode: string
  needsCheckingCount: number
  needsCheckingTotal: number
  acceptedThisQuarterCount: number
  acceptedThisQuarterTotal: number
  acceptedOpenTotal: number
  rejectedThisYearCount: number
  rejectedThisYearTotal: number
  excludedFromTotals: number
}

export function debitNoteListPath(status: DebitNoteStatusDto | 'ALL', page: number, pageSize = NOTE_PAGE_SIZE) {
  return withQuery(DEBIT_NOTES_PATH, { status, page, page_size: pageSize })
}

export function debitNotePath(id: string) {
  return `${DEBIT_NOTES_PATH}/${id}`
}

export async function loadDebitNotePage(path: string): Promise<Page<DebitNoteRowDto>> {
  return fromItemsPage(await apiRequest<ItemsPage<DebitNoteRowDto>>(path))
}

export function loadDebitNote(id: string): Promise<DebitNoteRowDto> {
  return apiRequest<DebitNoteRowDto>(debitNotePath(id))
}

export function loadDebitNoteSummary(): Promise<DebitNoteSummaryDto> {
  return apiRequest<DebitNoteSummaryDto>(DEBIT_NOTE_SUMMARY_PATH)
}

/** Newest first, so the current decision reads before what it replaced. */
export function loadDebitNoteDecisions(id: string): Promise<DebitNoteDecisionDto[]> {
  return apiRequest<DebitNoteDecisionDto[]>(`${debitNotePath(id)}/decisions`)
}

export function acceptDebitNote(id: string): Promise<DebitNoteDecisionDto> {
  return apiRequest<DebitNoteDecisionDto>(`${debitNotePath(id)}/accept`, { method: 'POST' })
}

/** @param reason mandatory — the server refuses a refusal without one. */
export function refuseDebitNote(id: string, reason: string): Promise<DebitNoteDecisionDto> {
  return apiRequest<DebitNoteDecisionDto>(`${debitNotePath(id)}/refuse`, {
    method: 'POST',
    body: { reason },
  })
}
