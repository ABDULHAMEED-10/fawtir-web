import { apiRequest, withQuery } from '..'
import type { MlsTransportState } from './bills'

/**
 * Supplier documents our access point refused on arrival with MLS `RE`
 * (`RejectedSupplierDocumentController`, permission `invoice.read`, batch 39 EXP). They never
 * became a delivery or a bill, so no other read lists them. Only the transport row's header facts
 * come back: not the document (an envelope-discrepancy RE may name another company in it) and not
 * the reason, which went to the sender in the MLS and is theirs to act on.
 *
 * A received transmission belongs to no branch, so a branch-limited caller is refused 403
 * `branch-scope-company-report` (BA-1, BA-2), as on `/waiting` and `/held`. A server before batch
 * 39 answers 404. Newest receipt first.
 */
export const REJECTED_DOCUMENTS_PATH = '/v1/inbound-invoices/rejected'

/** The server's page sizes stop at 200; the list reads one screenful at a time. */
export const REJECTED_PAGE_SIZE = 25

export type RejectedDocumentDto = {
  /** The received transmission's id; nothing else answers to it, so a row is not a link. */
  messageId: string
  /** The SBDH sender as received, `scheme:value`. */
  senderParticipantId: string
  /** A debit note travels as an Invoice and its type code is not on the transport row. */
  documentType: 'INVOICE' | 'CREDIT_NOTE'
  selfBilling: boolean
  receivedAt: string | null
  /** When the single permitted MLS was claimed for RE. */
  rejectedAt: string | null
  mlsCode: 'RE'
  /** Whether our RE reached the sender; null when its row is not there. */
  mlsTransportState: MlsTransportState | (string & {}) | null
  /** Set only once the RE is DELIVERED. */
  mlsDeliveredAt: string | null
}

export type RejectedPageDto = {
  items: RejectedDocumentDto[]
  page: number
  pageSize: number
  /** Items on this page. */
  count: number
  /** Every rejected document, across pages. */
  total: number
}

// The controller reads `page_size`; the EXP hand-off wrote `pageSize`, which it would ignore.
export function rejectedDocumentsPath(page: number, pageSize = REJECTED_PAGE_SIZE): string {
  return withQuery(REJECTED_DOCUMENTS_PATH, { page, page_size: pageSize })
}

export function loadRejectedDocuments(path: string): Promise<RejectedPageDto> {
  return apiRequest<RejectedPageDto>(path)
}
