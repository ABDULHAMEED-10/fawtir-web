import { InvoiceDetailsPage } from '../InvoiceDetailsPage'

/**
 * A self-billed invoice is an authored document read from the same endpoints as any other, so its
 * page is the invoice page, exactly as a credit or debit note's is.
 *
 * The Self-billing list links its rows to `/invoices/:id`, so this route is a second door to the
 * same document rather than the way in. It is kept because it is public URL surface.
 *
 * It replaces a screen drawn entirely from a fixture, which promised three things the platform
 * cannot report: a Peppol delivery track (`deliveryState` holds only `NOT_SUBMITTED` or
 * `SENT_MANUALLY`; there is no Peppol delivery state until B4), an OTA acceptance track (no tax
 * verdict exists on the network — SA v1.0.3 §7.1.2, OTA FAQ §3.3 — which is why the Activity
 * screen dropped its own), and a supplier-confirmation track that nothing records.
 *
 * `InvoiceDetailsPage` flips its counterparty labels for a self-billed type, so this reads "Billed
 * by <seller>" rather than "Bill to <customer>".
 */
export function SelfBillDetailPage() {
  return <InvoiceDetailsPage />
}
