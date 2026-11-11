import type { InvoiceReceiptQrDto } from '../api/invoices/detail'
import type { ApiRead } from '../hooks/useApiRead'

/**
 * What the invoice preview shows for the receipt QR (QR E-3): the server's payload, or why there is
 * none. Only READY with a payload draws a QR. Every other answer, an unread one and a status this
 * build does not know draw nothing: printing a QR for a business buyer (NOT_APPLICABLE) or one the
 * screen guessed would put a tax QR on paper the server never vouched for.
 */
export type ReceiptQrShown = { payload: string | null; noteKey: string | null }

const NOTES: Record<string, string> = {
  PENDING: 'invoiceDetails.receiptQr.pending',
  NOT_APPLICABLE: 'invoiceDetails.receiptQr.notApplicable',
  NOT_AN_ISSUED_SALE: 'invoiceDetails.receiptQr.notAnIssuedSale',
}

export function receiptQrShown(read: ApiRead<InvoiceReceiptQrDto> | null): ReceiptQrShown {
  if (read === null || read.status === 'loading') return { payload: null, noteKey: null }
  if (read.status === 'failed') return { payload: null, noteKey: 'invoiceDetails.receiptQr.unavailable' }
  const { status, payload } = read.data
  if (status === 'READY') {
    return payload
      ? { payload, noteKey: null }
      : { payload: null, noteKey: 'invoiceDetails.receiptQr.unavailable' }
  }
  return {
    payload: null,
    noteKey: Object.hasOwn(NOTES, status) ? NOTES[status] : 'invoiceDetails.receiptQr.unavailable',
  }
}
