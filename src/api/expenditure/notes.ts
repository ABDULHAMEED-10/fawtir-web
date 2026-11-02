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

/** `SupplierNoteSort`, on both lists. NEWEST is the server's default and is not sent. */
export type NoteSortDto = 'NEWEST' | 'AMOUNT_HIGHEST' | 'AMOUNT_LOWEST' | 'SUPPLIER'

/**
 * The search box, the supplier filter and the sort, as both lists send them. `q` matches the
 * note's number, the supplier's name or Peppol id, and the bill it names; the server takes at
 * most 200 characters.
 */
export type NoteListQuery = { q: string; supplierId: string | null; sort: NoteSortDto }

export const NOTE_QUERY_MAX = 200

const ANY_NOTE: NoteListQuery = { q: '', supplierId: null, sort: 'NEWEST' }

function noteListParams(query: NoteListQuery) {
  return {
    q: query.q.trim().slice(0, NOTE_QUERY_MAX),
    supplier_id: query.supplierId,
    sort: query.sort === 'NEWEST' ? undefined : query.sort,
  }
}

/**
 * The summary whose tab counts are counted over the notes a search and a supplier filter leave,
 * as the Bills list does: each then equals the `total` of the list under that tab. The cards
 * are the whole ledger's either way. Null with neither, where the plain summary already says it.
 */
function tabCountsPath(summaryPath: string, query: Pick<NoteListQuery, 'q' | 'supplierId'>) {
  const q = query.q.trim().slice(0, NOTE_QUERY_MAX)
  if (q === '' && query.supplierId === null) return null
  return withQuery(summaryPath, { q, supplier_id: query.supplierId })
}

/** Shared by both lists: where the document came from, and whether the platform vouched for it. */
export type NoteSourceDto = 'PEPPOL' | 'UPLOADED' | 'SCANNED' | 'RECURRING' | 'SELF_BILLED'

export type ApprovalDto = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'

// ─────────────────────────────────────────────────────────────── credit notes

export type CreditNoteStatusDto = 'UNAPPLIED' | 'WAITING_FOR_BILL' | 'APPLIED' | 'REFUNDED'

/**
 * Backend #477: how much of the credit has gone (applied or refunded). `status` says only whether
 * any is left, so a partly used note is still UNAPPLIED; this tells it from an unused one.
 */
export type CreditNoteUsageDto = 'NOT_USED' | 'PARTLY_USED' | 'FULLY_USED'

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
   * The words beside the CL-02-OM code, as typed when the note was uploaded; null when none were
   * given or the note came over Peppol. Older rows may hold the app's own reason ids
   * (SHORT_DELIVERY, DAMAGED…), which still read as their labels.
   */
  reasonDetail?: string | null
  /** Our own receipt report to the OTA (om-tdd, role 02). TODO(backend): EXPENDITURE.md R.1. */
  receiptReport?: ReceiptReportDto | null
  /** When the note was recorded: projected from Peppol, or confirmed from an upload. */
  receivedAt?: string | null
  /** The upload the note was confirmed from, whose file is `GET /v1/bills/intake/{id}/file`. */
  intakeId?: string | null
  approval: ApprovalDto
  status: CreditNoteStatusDto
  /** Absent from a server before backend #477: then read from `balance`. */
  usage?: CreditNoteUsageDto | null
  balance: CreditNoteBalanceDto
  credits: CreditedBillDto
  /**
   * Backend #784: a later Peppol copy of a note already on file, held as a possible or confirmed
   * duplicate. `status` still reads from the balance, but the note credits nothing and `/apply`
   * and `/refund` refuse it (409 CREDIT_NOTE_HELD_AS_DUPLICATE). Absent from an older server.
   */
  heldAsDuplicate?: boolean
}

export type CreditNoteSummaryDto = {
  currencyCode: string
  usableCount: number
  usableCredit: number
  recoveredThisQuarterCount: number
  recoveredThisQuarter: number
  topSupplier: { supplierId: string | null; supplierName: string | null; noteCount: number } | null
  excludedFromTotals: number
  /** Notes per tab of the list, narrowed by the list's `q` and `supplier_id` when sent. */
  tabs: {
    all: number
    unapplied: number
    waitingForBill: number
    applied: number
    refunded: number
  }
}

export type CreditNoteSettlementDto = {
  id: string
  creditNoteId: string
  /** Null on a refund: the money left the relationship rather than reducing a bill. */
  billId: string | null
  /** The supplier's number on `billId`; null on a refund, absent from an older server. */
  billNumber?: string | null
  /** The document type of `billId` (380, 383...); null on a refund, absent from an older server. */
  billDocumentTypeCode?: string | null
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
  usage?: CreditNoteUsageDto | null
  balance: CreditNoteBalanceDto
}

export function creditNoteListPath(
  status: CreditNoteStatusDto | 'ALL',
  page: number,
  query: NoteListQuery = ANY_NOTE,
  pageSize = NOTE_PAGE_SIZE,
) {
  return withQuery(CREDIT_NOTES_PATH, {
    // Sent explicitly rather than omitted: the server rejects an unknown value instead of
    // reading it as ALL, and a filter that silently widened would show every note to someone
    // who believed they were looking at the unapplied ones.
    status,
    ...noteListParams(query),
    page,
    page_size: pageSize,
  })
}

export function creditNoteTabCountsPath(query: Pick<NoteListQuery, 'q' | 'supplierId'>) {
  return tabCountsPath(CREDIT_NOTE_SUMMARY_PATH, query)
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

/** @param path the plain summary, or {@link creditNoteTabCountsPath} for narrowed counts. */
export function loadCreditNoteSummary(
  path = CREDIT_NOTE_SUMMARY_PATH,
): Promise<CreditNoteSummaryDto> {
  return apiRequest<CreditNoteSummaryDto>(path)
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

/** A key for one refund the person means to record (16-128 of `[A-Za-z0-9._:-]`). */
export function newCreditNoteRefundKey(): string {
  return `credit-refund-${crypto.randomUUID()}`
}

/**
 * Records that the supplier refunded the note (`bill.settle`). The `Idempotency-Key` is optional
 * on the server, so a retry without one records a second refund that still fits the credit; the
 * same key and body within 24 hours answer the first refund instead (backend P0, 2026-10-31).
 */
export function refundCreditNote(
  id: string,
  idempotencyKey: string,
  amount: number,
  paidOn: string,
  paymentReference: string | null,
): Promise<CreditNoteActionDto> {
  return apiRequest<CreditNoteActionDto>(`${creditNotePath(id)}/refund`, {
    method: 'POST',
    body: { amount, paidOn, paymentReference },
    headers: { 'Idempotency-Key': idempotencyKey },
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
  /**
   * The bill on file the note adds to, for the screens to link to (as `credits.billId` on a
   * credit note); null when the server cannot name exactly one.
   */
  billId?: string | null
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
  /** When the note was recorded: projected from Peppol, or confirmed from an upload. */
  receivedAt?: string | null
  /** The server's judgment, computed at read time. Never recomputed from the date here. */
  overdue: boolean
  currencyCode: string
  taxCurrencyCode: string | null
  totalIncludingVat: number | null
  vatAmount: number | null
  amountDue: number | null
  reasonCode: string | null
  /**
   * The words beside the CL-02-OM code, as typed when the note was uploaded; null when none were
   * given or the note came over Peppol. Older rows may hold the app's own reason ids
   * (SURCHARGE, LATE_FEE…), which still read as their labels.
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
  /** Who took the current decision, by name; null while unchecked or once they have left. */
  decidedByName?: string | null
  decidedAt: string | null
  decisionReason: string | null
  relatesTo: RelatedInvoiceDto | null
  /**
   * A later Peppol copy held as a possible duplicate (V493), decided on its own bill record.
   * Accepting it is refused (409 DEBIT_NOTE_HELD_AS_DUPLICATE); refusing it is not: a refusal is
   * a separate decision that leaves the duplicate check open. Absent from an older server.
   */
  heldAsDuplicate?: boolean
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
  /** Notes per tab of the list, narrowed by the list's `q` and `supplier_id` when sent. */
  tabs: { all: number; unchecked: number; accepted: number; refused: number }
}

export function debitNoteListPath(
  status: DebitNoteStatusDto | 'ALL',
  page: number,
  query: NoteListQuery = ANY_NOTE,
  pageSize = NOTE_PAGE_SIZE,
) {
  return withQuery(DEBIT_NOTES_PATH, {
    status,
    ...noteListParams(query),
    page,
    page_size: pageSize,
  })
}

export function debitNoteTabCountsPath(query: Pick<NoteListQuery, 'q' | 'supplierId'>) {
  return tabCountsPath(DEBIT_NOTE_SUMMARY_PATH, query)
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

/** @param path the plain summary, or {@link debitNoteTabCountsPath} for narrowed counts. */
export function loadDebitNoteSummary(path = DEBIT_NOTE_SUMMARY_PATH): Promise<DebitNoteSummaryDto> {
  return apiRequest<DebitNoteSummaryDto>(path)
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
