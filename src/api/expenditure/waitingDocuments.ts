import { apiRequest, withQuery } from '..'

/**
 * Supplier documents the company may not open yet (`WaitingSupplierDocumentController`,
 * permission `invoice.read`). Each one was received, and is held until the company is active, pays
 * or buys extra documents. The server reports it to the Tax Authority and answers the sender on
 * receipt, but this response carries neither outcome, which can fail (audit A2 F-01 to F-03, F-07),
 * so the screen never says they happened. Only the header facts are returned: no amount, lines or
 * document. Oldest receipt first, which is the order a release opens them in.
 */
export const WAITING_DOCUMENTS_PATH = '/v1/inbound-invoices/waiting'
export const WAITING_COUNT_PATH = '/v1/inbound-invoices/waiting/count'

/** The server's page sizes stop at 200; the list reads one screenful at a time. */
export const WAITING_PAGE_SIZE = 25

export const WAITING_REASONS = [
  'NO_DOCUMENTS_LEFT',
  'SUBSCRIPTION_ENDED',
  'COMPANY_NOT_ACTIVE',
] as const
export type WaitingReason = (typeof WAITING_REASONS)[number]

export type WaitingDocumentType = 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE'

export type WaitingDocumentDto = {
  /** The inbound invoice id it keeps once released; until then every route on it answers 404. */
  id: string
  /** Null for a document received before V310, or one that did not state it. */
  supplierName: string | null
  supplierParticipantId: string | null
  invoiceNumber: string | null
  issueDate: string | null
  receivedAt: string
  documentType: WaitingDocumentType
  reason: WaitingReason
}

/** Every reason is present, zero included. */
export type WaitingByReasonDto = Record<WaitingReason, number>

export type WaitingPageDto = {
  items: WaitingDocumentDto[]
  page: number
  pageSize: number
  /** Items on this page. */
  count: number
  /** Every waiting document, across pages. */
  total: number
  byReason: WaitingByReasonDto
}

export type WaitingCountDto = { total: number; byReason: WaitingByReasonDto }

export function waitingDocumentsPath(page: number, pageSize = WAITING_PAGE_SIZE): string {
  return withQuery(WAITING_DOCUMENTS_PATH, { page, page_size: pageSize })
}

export function loadWaitingDocuments(path: string): Promise<WaitingPageDto> {
  return apiRequest<WaitingPageDto>(path)
}

export function loadWaitingCount(): Promise<WaitingCountDto> {
  return apiRequest<WaitingCountDto>(WAITING_COUNT_PATH)
}
