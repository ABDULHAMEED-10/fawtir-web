import { apiRequest } from '..'
import type { MlsTransportState, TddSubmissionStatus } from './bills'

/**
 * One received Peppol document as its delivery record stands (`InboundInvoiceController`
 * `InboundDetailResponse`, `GET /v1/inbound-invoices/{id}`, permission `invoice.read`). The id is
 * the bill's `inboundDeliveryId`.
 *
 * A person limited to some branches gets 404 here for every document, and so does a document held
 * from the company (P4): a received document belongs to no branch, and the server hides it rather
 * than answer empty. A screen therefore reads 404 as "not available to you", never as "not
 * received".
 */
export type InboundInvoiceDto = {
  id: string
  /** BTOM-002, the Invoice UUID: the key of this document's compliance record. */
  correlationId: string
  state: 'AVAILABLE' | 'ACKNOWLEDGED'
  validationPassed: boolean
  /** The validation layer that failed, as a server token; never shown as it stands. */
  validationFailedLayer: string | null
  receivedAt: string | null
  acknowledgedAt: string | null
  /** The status our access point decided for the sender. Decided is not sent: see the next two. */
  mlsCode: 'AP' | 'AB' | 'RE' | null
  /** When the MLS was queued, not when it left. Not read: `mlsDeliveredAt` says that. */
  mlsEmittedAt: string | null
  /**
   * Null when none was queued. Typed by the server since batch 39 (same wire strings); `string`
   * stays so a state added later still reads as "unknown" rather than failing the type.
   */
  mlsTransportState: MlsTransportState | (string & {}) | null
  mlsDeliveredAt: string | null
  /** Batch 39 EXP: the newest leg of the TDD we filed with C5; absent from a server before it. */
  tddStatus?: TddSubmissionStatus | null
}

export function inboundInvoicePath(deliveryId: string): string {
  return `/v1/inbound-invoices/${encodeURIComponent(deliveryId)}`
}

export function loadInboundInvoice(deliveryId: string): Promise<InboundInvoiceDto> {
  return apiRequest<InboundInvoiceDto>(inboundInvoicePath(deliveryId))
}
