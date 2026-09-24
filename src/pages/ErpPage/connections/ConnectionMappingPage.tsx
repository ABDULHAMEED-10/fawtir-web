import { useParams } from 'react-router-dom'
import { ConnectionFeatureUnavailable } from './connectionParts'

/**
 * The per-connection mapping screen.
 *
 * Phase 2 has no extraction: no runs, no records, no write-back outbox, no scheduler and no
 * checkpoint. This screen previously rendered all of that from a design-time mock — run counts,
 * watermarks, collected and rejected totals — none of which had ever happened. A tenant reading
 * "3 collected, 1 rejected" would reasonably conclude their invoices were being submitted.
 *
 * So it says what is true instead. The route is kept rather than deleted so an existing bookmark
 * does not 404, and it is off the tab strip so nothing advertises it as a working feature.
 */
export function ConnectionMappingPage() {
  const { id } = useParams<{ id: string }>()
  return <ConnectionFeatureUnavailable connectionId={id} />
}
