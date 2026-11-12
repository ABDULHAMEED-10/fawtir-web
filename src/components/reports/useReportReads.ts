import { useEntitlements } from '../../hooks/useEntitlements'
import { hasPermission } from '../../lib/identity/entitlements'
import { REQUIRE_SESSION } from '../../lib/session/session'

/**
 * Whether a report page may ask its reads, from the permissions they take (`REPORT_READS`, any one
 * admits). A deep link earned a 403 on every read when the reader held none (IE3-04), so nothing is
 * asked until the entitlements answer says the reader may.
 *
 * A report page renders `ReportShell`, which holds the app shell, so the page itself sits outside
 * the shell's session context: the permission is read from the shared entitlements answer, as
 * CompanyProfilePage and StockPage do (RC5 D-07).
 *
 * `ifRead` hands a path back only when the read may go out (`useApiRead` asks nothing for `null`);
 * `denied` is true once the answer says it may not, for `ReportShell` to draw the notice the 403
 * drew.
 */
export function useReportReads(anyOf: readonly string[]): {
  ifRead: (path: string | null) => string | null
  denied: boolean
} {
  const { entitlements, ready } = useEntitlements()
  const may = entitlements
    ? anyOf.some((code) => hasPermission(entitlements, code))
    : ready && !REQUIRE_SESSION
  return {
    ifRead: (path) => (may ? path : null),
    denied: ready && !may,
  }
}
