import { ConnectionUnavailablePage } from './ConnectionShell'

/**
 * The per-connection mapping screen.
 *
 * The backend keeps one mapping per format for the tenant, not one per connection (see the ERP
 * mapping screens). This screen previously rendered a per-connection mapping from a design-time
 * mock — run counts, watermarks, collected and rejected totals — none of which had ever happened.
 * A tenant reading "3 collected, 1 rejected" would reasonably conclude their invoices were being
 * submitted.
 *
 * So it says what is true instead. The route is kept rather than deleted so an existing bookmark
 * does not 404, and it is off the tab strip so nothing advertises it as a working feature.
 */
export function ConnectionMappingPage() {
  return <ConnectionUnavailablePage />
}
