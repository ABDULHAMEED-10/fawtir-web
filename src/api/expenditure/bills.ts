import { apiRequest } from '../client'
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
  readiness: { state: 'PENDING' | 'READY' | 'REJECTED'; distinctApprovals: number; required: number; autoApproved: boolean }
  match: {
    verdict: 'MATCHED' | 'MISMATCH' | string
    purchaseOrderNumber: string | null
    byHand: boolean
  } | null
  hold: { reason: string | null; openedAt: string } | null
  paymentRunReference: string | null
  paidOnTheSpot: boolean
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
}

export type BillListQuery = {
  filter: BillFilter
  q: string
  source: BillSourceDto | null
  sort: BillSort
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
    page: query.page,
    page_size: query.pageSize,
  })
}

export async function loadBillPage(path: string): Promise<Page<BillRowDto>> {
  return fromItemsPage(await apiRequest<ItemsPage<BillRowDto>>(path))
}

export function loadBillSummary(): Promise<BillSummaryDto> {
  return apiRequest<BillSummaryDto>(BILL_SUMMARY_PATH)
}

/** Records this user's approval. With a multi-approver policy the bill may still be awaiting others. */
export function approveBill(billId: string): Promise<unknown> {
  return apiRequest(`${BILLS_PATH}/${encodeURIComponent(billId)}/approval/approve`, { method: 'POST', body: {} })
}
