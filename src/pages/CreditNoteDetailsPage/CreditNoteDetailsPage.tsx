import { InvoiceDetailsPage } from '../InvoiceDetailsPage'

/**
 * A credit note is an authored document like an invoice, read from the same endpoints; the invoice
 * page already shows its type, lines, totals and timeline, so a note's page is that page.
 */
export function CreditNoteDetailsPage() {
  return <InvoiceDetailsPage />
}
