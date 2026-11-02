import { apiDownload, apiRequest, type ApiDownload } from '../client'
import { fromItemsPage, type ItemsPage, type Page } from '../page'
import { withQuery } from '../query'
import type { CreditNoteStatusDto, CreditNoteUsageDto } from './notes'

/**
 * The Bills endpoints (`BillController`, `ExpenditureApprovalController`),
 * in the shapes the API answers with. Screens use the mappers in `lib/billList.ts`.
 */
export const BILLS_PATH = '/v1/bills'
export const BILL_SUMMARY_PATH = `${BILLS_PATH}/summary`

export type BillFilter =
  | 'NEEDS_ATTENTION'
  | 'ALL'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'ON_HOLD'
  | 'PAID'
  /** Later Peppol copies held as possible duplicates, undecided or confirmed. */
  | 'HELD_DUPLICATE'
export type BillSourceDto = 'PEPPOL' | 'UPLOADED' | 'SCANNED' | 'RECURRING' | 'SELF_BILLED'
export type BillSort = 'NEWEST' | 'DUE_SOONEST' | 'DUE_LATEST' | 'AMOUNT_HIGHEST' | 'AMOUNT_LOWEST' | 'SUPPLIER'
/** Derived on the server by one resolver; never stored. DRAFT never appears in the list. */
export type BillWorkflowState =
  | 'DRAFT'
  | 'NEW'
  | 'MISMATCH'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'ON_HOLD'
  | 'REJECTED'
  | 'IN_PAYMENT_RUN'
  | 'PAID'
  /**
   * A supplier debit note (383) that was refused and that a credit note has fully settled. Shown
   * under the All tab only: never Paid, Needs attention, Awaiting approval or Approved.
   */
  | 'REFUSED_CLOSED'

/** `BillController.BillRow`, the members the list reads. */
export type BillRowDto = {
  id: string
  source: BillSourceDto
  supplierId: string | null
  supplierName: string | null
  /** The sender's Peppol id (`scheme:value`) on a received bill; null on one captured by hand. */
  supplierParticipantId?: string | null
  /** 380 invoice, 381 credit note, 383 debit note, 389 self-billed, 261 self-billed credit note. */
  documentTypeCode: string | null
  supplierBillNumber: string | null
  issueDate: string | null
  dueDate: string | null
  overdue: boolean
  currencyCode: string
  totalIncludingVat: number | null
  vatAmount: number | null
  paidAmount: number
  outstandingAmount: number
  /** The order number the supplier wrote on the bill (IBT-013), not the buyer's match. */
  purchaseOrderReference: string | null
  workflowState: BillWorkflowState
  /**
   * The decision as the server names it ("APPROVED" on a bill people approved, also while it
   * reads `MISMATCH`). Not read by the screens: what is left to approve comes from `readiness`.
   */
  approval?: string
  readiness: {
    state: 'PENDING' | 'READY' | 'REJECTED'
    distinctApprovals: number
    required: number
    autoApproved: boolean
    /**
     * A copy held as a duplicate: the server then reports PENDING and never auto-approved,
     * whatever its amount. Absent from an older server.
     */
    heldAsDuplicate?: boolean
  }
  match: {
    verdict: 'MATCHED' | 'MATCHED_BY_HAND' | 'MISMATCH' | 'NO_ORDER'
    purchaseOrderNumber: string | null
    byHand: boolean
  } | null
  /** The open hold. The duplicate fields are {@link BillHoldDto}'s, absent from an older server. */
  hold:
    | ({ reason: string | null; openedAt: string } & Pick<
        BillHoldDto,
        'duplicateOfBillId' | 'duplicateResolution'
      >)
    | null
  /**
   * Present while the bill is held as a later Peppol copy of another (V493); null otherwise, and
   * absent from a server before it. NOT_DUPLICATE releases the hold, so it is never the
   * resolution here.
   */
  duplicateHold?: BillDuplicateHoldDto | null
  /** The document's UUID as received (Peppol cbc:UUID); null when it has none, absent from an older server. */
  documentUuid?: string | null
  paymentRunReference: string | null
  paidOnTheSpot: boolean
  /** What was typed on the receipt or the bill when it was captured (at most 500 characters). */
  note?: string | null
  /** The self-billed invoice or credit note this payable was raised from; null for any other source. */
  issuedInvoiceId?: string | null
  /**
   * On a supplier debit note (383), its current decision; null on any other document and on a
   * note nobody has decided yet. A REFUSED note is disputed and cannot be paid.
   */
  debitNoteDecision?: 'ACCEPTED' | 'REFUSED' | null
  /**
   * "Overpaid by" (owner's answer 13, 8 Oct 2026): what the supplier still holds of what payments
   * and credits paid beyond the bill. Zero unless overpaid; absent from a server before it.
   */
  overpaidAmount?: number
  /**
   * On a credit note (381, 261): where its credit stands, with the same values and meaning as
   * `status`, `usage` and `balance` on a `GET /credit-notes` row. Null on every other document;
   * absent from a server before it.
   */
  creditNote?: {
    status: CreditNoteStatusDto | string
    usage: CreditNoteUsageDto | string | null
    balance: { applied: number; refunded: number; remaining: number }
  } | null
  /**
   * Whether this document's VAT is in the input VAT figure, and why not when it is out. Absent
   * from a server before it, and then nothing is said about it.
   */
  inputVat?: BillInputVatDto
  /** The Peppol bill this upload certainly duplicates (same supplier VAT number, number and total). Not shown yet. */
  duplicateOf?: string | null
  /** A Peppol bill this one may duplicate (a less certain match, for the user to confirm). Not shown yet. */
  possibleDuplicateOf?: string | null
}

export type DuplicateResolutionDto = 'CONFIRMED_DUPLICATE' | 'NOT_DUPLICATE'

/** The copy's open duplicate hold, as a list row and the detail carry it. */
export type BillDuplicateHoldDto = {
  duplicateOfBillId: string
  duplicateOfBillNumber: string | null
  resolution: 'CONFIRMED_DUPLICATE' | null
  /**
   * Both copies carry the same document UUID. The server then refuses NOT_DUPLICATE
   * (BILL_DUPLICATE_SAME_DOCUMENT_UUID): the copy stays blocked.
   */
  sameDocumentUuid: boolean
}

/** Why a document is in or out of input VAT. Unknown values from a newer server are kept as text. */
export type BillInputVatReasonDto =
  | 'COUNTED'
  | 'DEBIT_NOTE_NOT_ACCEPTED'
  | 'REJECTED'
  | 'NO_SUPPLIER_TAX_INVOICE'
  | 'DUPLICATE_OF_PEPPOL'
  | 'SELF_BILLED_SALE'
  | 'SELF_BILLED_CANCELLED'
  | 'TARGET_NOT_COUNTED'
  | 'NO_OMR_VAT'

export type BillInputVatDto = {
  counted: boolean
  /** The date of the entry currently in force. */
  countedOn: string | null
  reason: BillInputVatReasonDto | string
  vatAmountOmr: number | null
}

/** `BillController.BillSummaryResponse`. */
export type BillSummaryDto = {
  currencyCode: string
  openCount: number
  openTotal: number
  overdueCount: number
  dueThisWeekCount: number
  dueThisWeekTotal: number
  readyToPayCount: number
  readyToPayTotal: number
  /**
   * Refused in our books but still owed: a rejection is our opinion, not a settlement. Rejected
   * bills and refused debit notes together, each not settled in full (JdbcBillProjectionAdapter).
   */
  disputedCount: number
  disputedTotal: number
  /**
   * Supplier debit notes nobody has accepted or refused yet (owner, 10 Oct 2026): not owed until
   * accepted, so outside `openTotal`. Absent from an older server.
   */
  debitNotesAwaitingDecisionCount?: number
  debitNotesAwaitingDecisionTotal?: number
  excludedFromTotals: number
  /**
   * Later Peppol copies held undecided or confirmed a duplicate (V493), left out of every other
   * figure here. Absent from an older server.
   */
  heldDuplicateCount?: number
  heldDuplicateTotal?: number
  needsAttention: { draft: number; new: number; mismatch: number; awaitingApproval: number; total: number; truncated: boolean }
  tabs: {
    needsAttention: number
    all: number
    awaitingApproval: number
    approved: number
    onHold: number
    paid: number
    /**
     * Rows under `filter=HELD_DUPLICATE`. Absent from a server without that filter, which would
     * refuse it, so the tab is offered only when this is sent.
     */
    heldDuplicate?: number
    truncated: boolean
  }
  /** Every bill on the ledger, whatever search and source the tab counts were asked for. */
  totalCount?: number
}

export type BillListQuery = {
  filter: BillFilter
  q: string
  source: BillSourceDto | null
  sort: BillSort
  /**
   * Only this supplier's bills, or every supplier when null. Narrowed by the server, not by the
   * caller over a returned page: a page filtered here would silently drop matches that fell past
   * its boundary.
   */
  supplierId?: string | null
  /** Zero-based. */
  page: number
  pageSize: number
}

/** The request for one page of the list. Also its identity: the same query is the same key. */
export function billListPath(query: BillListQuery): string {
  return withQuery(BILLS_PATH, {
    filter: query.filter === 'ALL' ? undefined : query.filter,
    q: query.q.trim(),
    source: query.source,
    sort: query.sort === 'NEWEST' ? undefined : query.sort,
    supplier_id: query.supplierId ?? null,
    page: query.page,
    page_size: query.pageSize,
  })
}

export type BillExport = ApiDownload & {
  /** The server stopped at its row cap; the file is not every matching bill. */
  truncated: boolean
}

/**
 * The CSV of the bills the list is showing (`invoice.export`): the same tab, search, source and
 * order. No page: the file runs to the server's cap, and says when it stopped there.
 */
export async function exportBills(
  query: Pick<BillListQuery, 'filter' | 'q' | 'source' | 'sort'>,
): Promise<BillExport> {
  const file = await apiDownload(
    withQuery(`${BILLS_PATH}/export.csv`, {
      filter: query.filter === 'ALL' ? undefined : query.filter,
      q: query.q.trim(),
      source: query.source,
      sort: query.sort === 'NEWEST' ? undefined : query.sort,
    }),
  )
  return { ...file, truncated: file.headers.get('X-Fawtir-Export-Truncated') === 'true' }
}

export async function loadBillPage(path: string): Promise<Page<BillRowDto>> {
  return fromItemsPage(await apiRequest<ItemsPage<BillRowDto>>(path))
}

export function loadBillSummary(): Promise<BillSummaryDto> {
  return apiRequest<BillSummaryDto>(BILL_SUMMARY_PATH)
}

/**
 * The summary whose tab counts are counted over the bills a search and a source filter leave:
 * each then equals the `total` of the list under that tab. The money cards and the attention
 * card are the whole ledger's either way. Null with neither, where the plain summary already
 * says it.
 */
export function billTabCountsPath(query: Pick<BillListQuery, 'q' | 'source'>): string | null {
  const q = query.q.trim()
  if (q === '' && query.source === null) return null
  return withQuery(BILL_SUMMARY_PATH, { q, source: query.source })
}

export function loadBillTabCounts(path: string): Promise<BillSummaryDto> {
  return apiRequest<BillSummaryDto>(path)
}

const billPath = (billId: string) => `${BILLS_PATH}/${encodeURIComponent(billId)}`

/** Records this user's approval. With a multi-approver policy the bill may still be awaiting others. */
export function approveBill(billId: string): Promise<unknown> {
  return apiRequest(`${billPath(billId)}/approval/approve`, { method: 'POST', body: {} })
}

/** A rejection in this company's books, with its reason. Nothing is sent to the supplier. */
export function rejectBill(billId: string, reason: string): Promise<unknown> {
  return apiRequest(`${billPath(billId)}/approval/reject`, { method: 'POST', body: { reason } })
}

/**
 * Takes a rejection back (`bill.reopen`, backend V523). It approves nothing: the bill then reads
 * PENDING with no approvals counted, because approvals given before the rejection never come back.
 * A repeat answers the reopen already recorded, so a lost response is safe to send again.
 */
export function reopenBill(billId: string, reason: string): Promise<unknown> {
  return apiRequest(`${billPath(billId)}/approval/reopen`, { method: 'POST', body: { reason } })
}

export function holdBill(billId: string, reason: string): Promise<unknown> {
  return apiRequest(`${billPath(billId)}/hold`, { method: 'POST', body: { reason } })
}

export function releaseBill(billId: string): Promise<unknown> {
  return apiRequest(`${billPath(billId)}/release`, { method: 'POST' })
}

/** `BillController.NudgeView`: accepted, and for how many approvers. Delivery follows. */
export type BillNudgeDto = { billId: string; nudgedOn: string; approvers: number }

/**
 * Reminds the people who can still approve this bill (`invoice.payment.manage` or
 * `invoice.approve`). One a day per bill: a second is refused with `BILL_NUDGE_ALREADY_SENT`.
 */
export function nudgeBillApprover(billId: string): Promise<BillNudgeDto> {
  return apiRequest<BillNudgeDto>(`${billPath(billId)}/approval/nudge`, { method: 'POST' })
}

/** `RecordBillPayment`. The currency must be the bill's own: there is no buy-side exchange rate. */
export type RecordBillPaymentRequest = {
  amount: number
  currency: string
  methodCode: string | null
  paymentReference: string | null
  paymentDate: string
}

/**
 * Records a payment made against a bill (`bill.settle`, `Idempotency-Key`). The bill must
 * be approval-READY: an unapproved one is refused with `BILL_NOT_READY_FOR_PAYMENT`.
 */
export function recordBillPayment(
  billId: string,
  idempotencyKey: string,
  payment: RecordBillPaymentRequest,
): Promise<unknown> {
  return apiRequest(`${billPath(billId)}/payments`, {
    method: 'POST',
    body: payment,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export type BillMatchVerdict = 'MATCHED' | 'MATCHED_BY_HAND' | 'MISMATCH' | 'NO_ORDER'

/**
 * The receiving side's own report of a document it received (om-tdd: a Tax Data Document with
 * reporter role 02 Receiver and the receipt date and time), as the OTA last answered it.
 * TODO(backend): EXPENDITURE.md R.1. Not on any response yet.
 */
export type ReceiptReportDto = {
  status: 'ACCEPTED' | 'SUBMITTED' | 'REJECTED' | 'NOT_SUBMITTED'
  reportedAt: string | null
  tddUuid?: string | null
}

export type BillHoldDto = {
  id: string
  reason: string | null
  openedBy: string | null
  openedAt: string
  releasedBy: string | null
  releasedAt: string | null
  /** On a hold opened on a later Peppol copy: the earlier bill. Absent from an older server. */
  duplicateOfBillId?: string | null
  /** The person's decision once taken. NOT_DUPLICATE released the hold at the same instant. */
  duplicateResolution?: DuplicateResolutionDto | null
  duplicateResolvedBy?: string | null
  duplicateResolvedAt?: string | null
  duplicateResolutionNote?: string | null
}

/** `BillHold.MAXIMUM_RESOLUTION_NOTE_LENGTH`, counted by the server after trimming. */
export const DUPLICATE_NOTE_MAX_LENGTH = 500

/**
 * Decides whether a held copy is a duplicate (`invoice.approve`). CONFIRMED_DUPLICATE keeps it
 * held for good; NOT_DUPLICATE releases it into an ordinary bill. Either is final.
 */
export function resolveDuplicateBill(
  billId: string,
  decision: DuplicateResolutionDto,
  note: string,
): Promise<BillHoldDto> {
  return apiRequest<BillHoldDto>(`${billPath(billId)}/duplicate-resolution`, {
    method: 'POST',
    body: { decision, note },
  })
}

/** `BillController.BillDetail`: the bill as the list shows it, and everything recorded against it. */
export type BillDetailDto = {
  bill: BillRowDto & {
    inboundDeliveryId: string | null
    networkVerified: boolean
    amountDue: number | null
    creditedAmount: number
    complianceObligation: 'REPORTED_BY_SENDER' | 'PENDING_COMPLIANCE_INPUT' | 'NOT_APPLICABLE'
    match: (BillRowDto['match'] & {
      purchaseOrderId: string | null
      goodsReceiptId: string | null
      goodsReceiptNumber: string | null
      summary: string | null
      matchedAt: string | null
    }) | null
  }
  lines: {
    lineNo: number
    description: string | null
    quantity: number | null
    unit: string | null
    unitPrice: number | null
    vatRate: number | null
    lineNet: number | null
    purchaseOrderLineId: string | null
    goodsReceiptId: string | null
    /** IBT-151, CL-04-OM: S, Z, E or O; null on a line captured without one (EXPENDITURE.md R.2). */
    taxCategoryCode?: string | null
    /** IBT-121: VATZR-OM-nn on a Z line, VATEX-OM-nn on an E line. TODO(backend): EXPENDITURE.md R.2. */
    exemptionReasonCode?: string | null
    /** IBT-120: the reason as text, the only one an O line may carry. TODO(backend): EXPENDITURE.md R.2. */
    exemptionReason?: string | null
  }[]
  readiness: BillRowDto['readiness']
  /** Newest first, in commit order (backend V523): kept as sent, never re-sorted by `decidedAt`. */
  approvals: { id: string; decision: 'APPROVED' | 'REJECTED' | 'REOPENED'; reason: string | null; decidedBy: string; decidedAt: string }[]
  hold: BillHoldDto | null
  holdHistory: BillHoldDto[]
  settlement: {
    billTotal: number | null
    paidAmount: number
    creditedAmount: number
    outstandingAmount: number
    currency: string
    paymentState: string
    overdue: boolean
    dueDate: string | null
    /**
     * The early-payment discount a payment run took that still settles part of the bill: neither
     * paid nor credited, so it is never added to `paidAmount`. Zero once the supplier's credit
     * note for it arrives (it moves into `creditedAmount`). Absent from a server before it.
     */
    discountAmount?: number
    /**
     * "Overpaid by" (owner's answer 13, 8 Oct 2026): what payments and credits exceed the bill by,
     * less what the supplier refunded or what was set against another bill as credit. Zero when
     * not overpaid and on a credit note; additive, so `outstandingAmount` stays floored at zero and
     * the bill's totals and VAT never change. Absent from a server before it.
     */
    overpaidAmount?: number
  }
  /**
   * `DISCOUNT` is the early-payment discount a payment run took, read only and listed right after
   * the payment it came with. It settles that much of the bill but is not money paid.
   */
  payments: {
    id: string
    entryType: 'PAYMENT' | 'REVERSAL' | 'DISCOUNT'
    amount: number
    currency: string
    methodCode: string | null
    paymentReference: string | null
    paymentDate: string | null
    occurredAt: string
  }[]
  paymentRunReference: string | null
  /**
   * The early-payment discount a payment run took on this bill; null when none was taken (or its
   * payment was reversed), absent from a server before it. `creditNoteOutstanding` is the part no
   * supplier credit note covers yet, zero once one does.
   */
  discountTaken?: {
    amount: number
    takenOn: string
    paymentRunId: string
    creditNoteId: string | null
    creditNoteOutstanding: number
  } | null
  /**
   * Batch 39 EXP (`BillDetail.peppol`): our side of the Peppol exchange behind a received bill,
   * three separate facts. Null unless the bill came over Peppol, and null for a person limited to
   * some branches; absent from a server before it.
   */
  peppol?: BillPeppolStatusDto | null
  intake: { id: string; source: BillSourceDto; filename: string | null; contentType: string | null; uploadedAt: string } | null
  /**
   * Present exactly when the bill is self-billed: the document this company issued through
   * Fawtir on the supplier's behalf, and the agreement it was issued under. The agreement is
   * null for a document issued before agreements were linked.
   */
  selfBilling?: {
    issuedInvoiceId: string
    invoiceNumber: string | null
    agreementId: string | null
    agreementReference: string | null
  } | null
  compliance: {
    source: BillSourceDto
    networkVerified: boolean
    obligation: BillDetailDto['bill']['complianceObligation']
    /** Absent until the server reports it: the page then says the status is not known. */
    receiptReport?: ReceiptReportDto | null
  }
  activity: {
    at: string | null
    /**
     * The last three are the steps of the self-billed document, on a `SELF_BILLED` bill only, and
     * only from a server that sends them. The two payment run kinds come from a sent run: the
     * rest marked paid without this bill, or the run cancelled because the bank paid nothing;
     * their detail is "{run} · {reason}". The four `OVERPAYMENT_*` kinds say what became of what
     * the bill was overpaid by, or (`OVERPAYMENT_CREDIT_RECEIVED`) of credit from another bill set
     * against this one; their detail is "{amount} {currency} · {reference or the other bill's number}".
     */
    kind:
      | 'ARRIVED'
      | 'CONFIRMED'
      | 'MATCHED'
      | 'APPROVED'
      | 'REJECTED'
      | 'HELD'
      | 'RELEASED'
      | 'PAID'
      | 'REVERSED'
      | 'TAKEN_OUT_OF_PAYMENT_RUN'
      | 'PAYMENT_RUN_CANCELLED'
      | 'OVERPAYMENT_REFUNDED'
      | 'OVERPAYMENT_KEPT_AS_CREDIT'
      | 'OVERPAYMENT_CREDIT_APPLIED'
      | 'OVERPAYMENT_CREDIT_RECEIVED'
      | 'DRAFT_CREATED'
      | 'ISSUED'
      | 'CANCELLED'
      // A person's decision on a held Peppol copy (backend V493): the kinds the server sends on
      // the copy's own record. The activity panel already has words for both.
      | 'NOT_DUPLICATE'
      | 'CONFIRMED_DUPLICATE'
      // A rejection taken back (backend V523); its detail is the reason given.
      | 'REOPENED'
    detail: string | null
    actor: string | null
  }[]
}

export function loadBill(billId: string): Promise<BillDetailDto> {
  return apiRequest<BillDetailDto>(billPath(billId))
}

/** One thing done with what a bill was overpaid by. Append only. */
export type BillOverpaymentSettlementDto = {
  id: string
  billId: string
  kind: 'REFUNDED' | 'KEPT_AS_CREDIT' | 'APPLIED'
  amount: number
  currency: string
  /** The bill the credit was set against; only on `APPLIED`. */
  targetBillId: string | null
  settledOn: string
  /** The supplier's refund reference. */
  reference: string | null
  actorId: string
  occurredAt: string
}

/**
 * `GET /bills/{id}/overpayment` (`invoice.read`). `overpaidAmount` is "Overpaid by": reduced by a
 * refund and by credit set against another bill, never by the decision to keep it.
 * `keptAsCredit` is kept and not used yet (what may be set against a bill); `undecided` is the rest
 * (what may still be kept). All zero when the bill is not overpaid.
 */
export type BillOverpaymentDto = {
  billId: string
  currency: string
  overpaidAmount: number
  keptAsCredit: number
  undecided: number
  refunded: number
  applied: number
  settlements: BillOverpaymentSettlementDto[]
}

/** Each of the three writes answers with the row written and where the bill stands now. */
export type BillOverpaymentActionDto = {
  settlement: BillOverpaymentSettlementDto
  overpayment: BillOverpaymentDto
}

export const billOverpaymentPath = (billId: string) => `${billPath(billId)}/overpayment`

export function loadBillOverpayment(billId: string): Promise<BillOverpaymentDto> {
  return apiRequest<BillOverpaymentDto>(billOverpaymentPath(billId))
}

/**
 * Records money the supplier paid back of what the bill was overpaid by
 * (`bill.settle`). `refundedOn` is the day it arrived, never after today in Muscat.
 */
export function recordOverpaymentRefund(
  billId: string,
  refund: { amount: number; refundedOn: string; reference: string | null },
): Promise<BillOverpaymentActionDto> {
  return apiRequest<BillOverpaymentActionDto>(`${billOverpaymentPath(billId)}/refunds`, {
    method: 'POST',
    body: refund,
  })
}

/**
 * Keeps the excess as credit with the supplier for their next bill (`bill.settle`).
 * Moves no money. With no amount the server keeps all of `undecided`.
 */
export function keepOverpaymentAsCredit(
  billId: string,
  amount: number | null = null,
): Promise<BillOverpaymentActionDto> {
  return apiRequest<BillOverpaymentActionDto>(`${billOverpaymentPath(billId)}/keep-as-credit`, {
    method: 'POST',
    body: amount === null ? {} : { amount },
  })
}

/**
 * Sets credit kept from this bill against another bill of the same supplier and currency
 * (`bill.settle`). With no amount the server applies the largest that fits both.
 */
export function applyOverpaymentCredit(
  billId: string,
  targetBillId: string,
  amount: number | null,
): Promise<BillOverpaymentActionDto> {
  return apiRequest<BillOverpaymentActionDto>(`${billOverpaymentPath(billId)}/apply`, {
    method: 'POST',
    body: amount === null ? { targetBillId } : { targetBillId, amount },
  })
}

/** `BillMatchController.MatchResponse`: what was ordered, received and billed, per line. */
export type BillMatchDto = {
  billId: string
  verdict: BillMatchVerdict | null
  purchaseOrderId: string | null
  purchaseOrderNumber: string | null
  goodsReceiptId: string | null
  goodsReceiptNumber: string | null
  summary: string | null
  byHand: boolean
  matchedAt: string | null
  comparison: {
    description: string | null
    orderedQuantity: number | null
    receivedQuantity: number | null
    billedQuantity: number | null
    unit: string | null
    orderedUnitPrice: number | null
    billedUnitPrice: number | null
  }[]
}

export const billMatchPath = (billId: string) => `${billPath(billId)}/match`

export function loadBillMatch(billId: string): Promise<BillMatchDto> {
  return apiRequest<BillMatchDto>(billMatchPath(billId))
}

/** A match made by hand; the server compares the lines again against the order chosen. */
export function matchBill(billId: string, purchaseOrderId: string): Promise<BillMatchDto> {
  return apiRequest<BillMatchDto>(billMatchPath(billId), { method: 'PUT', body: { purchaseOrderId } })
}

export function unmatchBill(billId: string): Promise<unknown> {
  return apiRequest(billMatchPath(billId), { method: 'DELETE' })
}

export type PurchaseOrderOptionDto = {
  id: string
  number: string | null
  state: string
  orderDate: string | null
  currency: string
  totalGross: number | null
}

/** The supplier's orders, to match a bill to by hand. */
export async function loadSupplierOrders(supplierId: string): Promise<PurchaseOrderOptionDto[]> {
  const page = await apiRequest<{ items: PurchaseOrderOptionDto[] }>(
    withQuery('/v1/purchase-orders', { supplierId, page_size: 100 }),
  )
  return page.items.filter((order) => order.state !== 'DRAFT' && order.state !== 'CANCELLED')
}

/**
 * The document as it came in: the archived Peppol XML, or the file someone uploaded or scanned.
 * Null when the bill has neither (a recurring bill).
 */
export function billOriginalPath(detail: Pick<BillDetailDto, 'intake'> & { bill: { inboundDeliveryId: string | null } }): string | null {
  if (detail.intake) return `${BILLS_PATH}/intake/${encodeURIComponent(detail.intake.id)}/file`
  if (detail.bill.inboundDeliveryId) return `/v1/inbound-invoices/${encodeURIComponent(detail.bill.inboundDeliveryId)}/document`
  return null
}

export function downloadBillOriginal(path: string): Promise<ApiDownload> {
  return apiDownload(path)
}

/** Backend `MessageState`: the transport of our MLS row (typed since batch 39). */
export type MlsTransportState =
  | 'PENDING'
  | 'SENDING'
  | 'SENT_AWAITING_MDN'
  | 'DELIVERED'
  | 'MDN_FAILED'
  | 'RETRY_SCHEDULED'
  | 'DEAD_LETTERED'
  | 'INBOUND_RECEIVED'

/** Backend `TddSubmissionStatus`: C5's receipt of our TDD, never a tax verdict. */
export type TddSubmissionStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'GENERATION_FAILED'
  | 'ACCEPTED'
  | 'DELIVERED_UNCONFIRMED'
  | 'REJECTED'
  | 'TO_DISREGARD'
  | 'DISREGARD_SUBMITTED'
  | 'DEAD_LETTERED'
  | 'NOT_TESTED'

/** `BillController.PeppolStatusView`. */
export type BillPeppolStatusDto = {
  deliveryId: string
  mlsCode: 'AP' | 'AB' | 'RE' | null
  mlsTransportState: MlsTransportState | null
  mlsDeliveredAt: string | null
  tddStatus: TddSubmissionStatus | null
}
