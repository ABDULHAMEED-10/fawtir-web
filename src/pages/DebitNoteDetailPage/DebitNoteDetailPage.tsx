import { InvoiceDetailsPage } from '../InvoiceDetailsPage'

/** A debit note is its own receivable, so its page is the invoice page: payments, balance and timeline included. */
export function DebitNoteDetailPage() {
  return <InvoiceDetailsPage />
}
