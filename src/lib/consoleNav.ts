import type { ComponentType } from 'react'
import {
  NavCatalogIcon,
  NavDashboardIcon,
  NavDocumentsIcon,
  NavExpenditureIcon,
  NavSuppliersIcon,
  NavTddIcon,
} from '../layouts/AppShell/navIcons'
import {
  ConsoleIncidentIcon,
  ConsolePlansIcon,
  ConsoleQueueIcon,
  ConsoleSubscriptionIcon,
} from '../layouts/ConsoleShell/consoleIcons'

type IconProps = { className?: string; active?: boolean }

export type ConsoleNavItem = {
  id: string
  labelKey: string
  to: string
  Icon: ComponentType<IconProps>
  /**
   * Shown only to an operator holding every listed code: the same requirement the screen's own
   * ConsoleShell enforces, so the menu never offers a page that answers "no access". The server
   * enforces it on every call regardless.
   */
  requires?: string | readonly string[]
  /** Pages with no link of their own that light this one up (a tab of this page). */
  alsoActiveOn?: readonly string[]
}

export type ConsoleNavGroup = {
  id: string
  labelKey: string
  items: ConsoleNavItem[]
}

/**
 * The Fawtir console's own navigation (Figma 143:17005).
 *
 * Nothing to do with a tenant's sidebar — this is the view from inside the platform. Two screens
 * are designed; the rest are listed because leaving them out would misrepresent what the console
 * is, and they lead to an honest "not built yet" rather than silently to the home page.
 */
export const CONSOLE_NAV: ConsoleNavGroup[] = [
  {
    id: 'running',
    labelKey: 'console.nav.group.running',
    items: [
      {
        id: 'operations',
        labelKey: 'console.nav.operations',
        to: '/console',
        Icon: NavDashboardIcon,
      },
      {
        id: 'queue',
        labelKey: 'console.nav.queue',
        to: '/console/queue',
        Icon: ConsoleQueueIcon,
      },
      {
        id: 'incidents',
        labelKey: 'console.nav.incidents',
        to: '/console/incidents',
        Icon: ConsoleIncidentIcon,
      },
    ],
  },
  {
    id: 'customers',
    labelKey: 'console.nav.group.customers',
    items: [
      {
        id: 'tenants',
        labelKey: 'console.nav.tenants',
        to: '/console/tenants',
        requires: 'platform.tenants.manage',
        // Companies without an Owner is a Tenants tab with no link of its own.
        alsoActiveOn: ['/console/owners'],
        Icon: NavSuppliersIcon,
      },
      {
        id: 'verification',
        labelKey: 'console.nav.verification',
        // The design's route, kept when the screen became company verification.
        to: '/console/onboarding',
        requires: 'platform.tenants.manage',
        Icon: NavTddIcon,
      },
      {
        id: 'enterprise',
        labelKey: 'console.nav.enterprise',
        to: '/console/enterprise',
        // Companies on negotiated Enterprise terms (V348), read under the billing permission.
        requires: 'platform.billing.read',
        Icon: NavDocumentsIcon,
      },
      {
        id: 'disconnections',
        labelKey: 'console.nav.disconnections',
        to: '/console/disconnections',
        // "Disconnect from Fawtir" requests, worked by Platform support (V302).
        requires: 'platform.smp.operations.review',
        Icon: ConsoleQueueIcon,
      },
    ],
  },
  {
    id: 'billing',
    labelKey: 'console.nav.group.billing',
    items: [
      {
        id: 'payments',
        labelKey: 'console.nav.payments',
        to: '/console/billing/payments',
        // Subscription payments waiting for Platform Finance (V271).
        requires: 'platform.billing.read',
        Icon: NavExpenditureIcon,
      },
      {
        id: 'refunds',
        labelKey: 'console.nav.refunds',
        to: '/console/billing/refunds',
        // Every company's refund cases, Finance's and the super admin's (V423).
        requires: 'platform.billing.read',
        Icon: ConsoleSubscriptionIcon,
      },
      {
        id: 'plans',
        labelKey: 'console.nav.plans',
        to: '/console/plans',
        // Also a Settings card; here because it is opened often (owner, 24 Oct 2026).
        requires: 'platform.plans.read',
        Icon: ConsolePlansIcon,
      },
      {
        id: 'erpExtraction',
        labelKey: 'console.nav.erpExtraction',
        // The Add-ons section of the platform values page: ERP extraction price and which plans
        // offer it (owner, 24 Oct 2026: one click from the sidebar).
        to: '/console/settings/values?section=addons',
        Icon: NavCatalogIcon,
      },
    ],
  },
  // No ERP group. Its two screens, add-on requests and templates, drew a story fixture, and the
  // approval there changed nothing real. A tenant's ERP access is granted and revoked from the
  // tenant's own page, against the platform entitlement API.
  // Operators, validation policies, the audit log, billing rules and Fawtir's own details live in
  // Console › Settings (owner, 24 Oct 2026); the bottom Settings link opens it.
]

/** Every console route, for the router and for the "not built yet" pages. */
export const CONSOLE_ITEMS = CONSOLE_NAV.flatMap((group) => group.items)
