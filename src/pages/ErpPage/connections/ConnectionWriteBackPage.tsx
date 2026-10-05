import { ConnectionUnavailablePage } from './ConnectionShell'

/**
 * The per-connection write-back screen.
 *
 * The backend has no write-back outbox: nothing writes an outcome back to the ERP. This screen
 * previously rendered one from a design-time mock — run counts, watermarks, collected and rejected
 * totals — none of which had ever happened. A tenant reading "3 collected, 1 rejected" would
 * reasonably conclude their invoices were being submitted.
 *
 * So it says what is true instead. The route is kept rather than deleted so an existing bookmark
 * does not 404, and it is off the tab strip so nothing advertises it as a working feature.
 */
export function ConnectionWriteBackPage() {
  return <ConnectionUnavailablePage />
}
