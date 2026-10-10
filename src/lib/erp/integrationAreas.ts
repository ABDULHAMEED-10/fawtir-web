import { hasPermission, type Entitlements } from '../identity/entitlements'

/**
 * The places of Settings › Integration and who may open each (Phase 9). Decides what the strip
 * offers and nothing more: every request is authorised again by the server.
 */
export type IntegrationArea = {
  id: 'overview' | 'connections' | 'bridge' | 'apiPush' | 'mapping' | 'activity' | 'access'
  to: string
  /** Whether a path belongs to this area. */
  owns: (pathname: string) => boolean
  /** Who may open it; `null` for everyone. */
  allowed: ((entitlements: Entitlements) => boolean) | null
}

const starts = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`)

const holds = (entitlements: Entitlements, ...codes: string[]) =>
  codes.every((code) => hasPermission(entitlements, code))
const holdsAny = (entitlements: Entitlements, ...codes: string[]) =>
  codes.some((code) => hasPermission(entitlements, code))

export const INTEGRATION_AREAS: IntegrationArea[] = [
  {
    id: 'overview',
    to: '/settings/erp',
    owns: (p) => p === '/settings/erp',
    // GET /v1/erp/overview needs both: it shows connections and the reports' figures.
    allowed: (e) => holds(e, 'erp.connection.read', 'invoice.read'),
  },
  {
    id: 'connections',
    to: '/settings/erp/connections',
    owns: (p) => starts(p, '/settings/erp/connections'),
    allowed: (e) => holds(e, 'erp.connection.read'),
  },
  {
    id: 'bridge',
    to: '/settings/erp/bridge',
    owns: (p) => starts(p, '/settings/erp/bridge'),
    allowed: (e) => holds(e, 'invoice.submit'),
  },
  {
    id: 'apiPush',
    to: '/settings/erp/api-push',
    owns: (p) => starts(p, '/settings/erp/api-push'),
    allowed: (e) => holds(e, 'admin.settings.manage'),
  },
  {
    id: 'mapping',
    to: '/settings/erp-mapping',
    owns: (p) => starts(p, '/settings/erp-mapping'),
    // The mapping routes accept either since Phase 3 (DEC-B).
    allowed: (e) => holdsAny(e, 'admin.settings.manage', 'mapping.read'),
  },
  {
    id: 'activity',
    to: '/settings/erp/documents',
    owns: (p) =>
      starts(p, '/settings/erp/documents') ||
      starts(p, '/settings/erp/attention') ||
      starts(p, '/settings/erp/runs'),
    allowed: (e) => holds(e, 'invoice.read'),
  },
  {
    id: 'access',
    to: '/settings/erp/access',
    owns: (p) => starts(p, '/settings/erp/access'),
    allowed: null,
  },
]

/** The areas this snapshot may open. A snapshot that could not be read offers Access only. */
export function openAreas(entitlements: Entitlements | null): IntegrationArea[] {
  return INTEGRATION_AREAS.filter(
    (area) => area.allowed === null || (entitlements !== null && area.allowed(entitlements)),
  )
}
