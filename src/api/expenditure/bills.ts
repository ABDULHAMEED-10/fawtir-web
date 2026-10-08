import { apiDownload, apiRequest, type ApiDownload } from '../client'
import { fromItemsPage, type ItemsPage, type Page } from '../page'
import { withQuery } from '../query'

/**
 * The Bills endpoints (`BillController`, `ExpenditureApprovalController`),
 * in the shapes the API answers with. Screens use the mappers in `lib/billList.ts`.
 */
export const BILLS_PATH = '/v1/bills'
export const BILL_SUMMARY_PATH = `${BILLS_PATH}/summary`

export type BillFilter = 'NEEDS_ATTENTION' | 'ALL' | 'AWAITING_APPROVAL' | 'APPROVED' | 'ON_HOLD' | 'PAID'
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

/** `BillController.BillRow`, the members the list reads. */
export type BillRowDto = {
  id: string
  source: BillSourceDto
  supplierId: string | null
  supplierName: string | null
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
  readiness: { state: 'PENDING' | 'READY' | 'REJECTED'; distinctApprovals: number; required: number; autoApproved: boolean }
  match: {
    verdict: 'MATCHED' | 'MATCHED_BY_HAND' | 'MISMATCH' | 'NO_ORDER'
    purchaseOrderNumber: string | null
    byHand: boolean
  } | null
  hold: { reason: string | null; openedAt: string } | null
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
  /** Refused in our books but still owed: a rejection is our opinion, not a settlement. */
  disputedCount: number
  disputedTotal: number
  excludedFromTotals: number
  needsAttention: { draft: number; new: number; mismatch: number; awaitingApproval: number; total: number; truncated: boolean }
  tabs: {
    needsAttention: number
    all: number
    awaitingApproval: number
    approved: number
    onHold: number
    paid: number
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
 * Records a payment made against a bill (`invoice.payment.manage`, `Idempotency-Key`). The bill must
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
  approvals: { id: string; decision: 'APPROVED' | 'REJECTED'; reason: string | null; decidedBy: string; decidedAt: string }[]
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
  }
  payments: {
    id: string
    entryType: 'PAYMENT' | 'REVERSAL'
    amount: number
    currency: string
    methodCode: string | null
    paymentReference: string | null
    paymentDate: string | null
    occurredAt: string
  }[]
  paymentRunReference: string | null
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
     * only from a server that sends them.
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
      | 'DRAFT_CREATED'
      | 'ISSUED'
      | 'CANCELLED'
    detail: string | null
    actor: string | null
  }[]
}

export function loadBill(billId: string): Promise<BillDetailDto> {
  return apiRequest<BillDetailDto>(billPath(billId))
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
