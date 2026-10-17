import type { ComponentType } from 'react'
import {
  NavCustomersIcon,
  NavDocumentsIcon,
  NavInvoicesIcon,
  NavReportsIcon,
  NavSettingsIcon,
  NavTddIcon,
} from '../layouts/AppShell/navIcons'
import {
  ConsoleIncidentIcon,
  ConsolePlansIcon,
  ConsoleQueueIcon,
} from '../layouts/ConsoleShell/consoleIcons'

type IconProps = { className?: string; active?: boolean }

export type ConsoleNavItem = {
  id: string
  labelKey: string
  to: string
  Icon: ComponentType<IconProps>
  /** Screens the design has not reached yet still appear, so the shape of the console is honest. */
  soon?: boolean
  /**
   * Shown only to an operator holding every listed code: the same requirement the screen's own
   * ConsoleShell enforces, so the menu never offers a page that answers "no access". The server
   * enforces it on every call regardless.
   */
  requires?: string | readonly string[]
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
        Icon: NavReportsIcon,
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
        Icon: NavCustomersIcon,
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
        id: 'plans',
        labelKey: 'console.nav.plans',
        to: '/console/plans',
        Icon: ConsolePlansIcon,
        // Plans and rates are the platform's own prices: never shown to a tenant, and only to an
        // operator the catalogue's read permission covers.
        requires: 'platform.plans.read',
      },
      {
        id: 'enterprise',
        labelKey: 'console.nav.enterprise',
        to: '/console/enterprise',
        Icon: ConsolePlansIcon,
        // Companies on negotiated Enterprise terms (V348), read under the billing permission.
        requires: 'platform.billing.read',
      },
      {
        id: 'disconnections',
        labelKey: 'console.nav.disconnections',
        to: '/console/disconnections',
        Icon: ConsoleQueueIcon,
        // "Disconnect from Fawtir" requests, worked by Platform support (V302).
        requires: 'platform.smp.operations.review',
      },
      {
        id: 'payments',
        labelKey: 'console.nav.payments',
        to: '/console/billing/payments',
        Icon: ConsoleQueueIcon,
        // Subscription payments waiting for Platform Finance (V271).
        requires: 'platform.billing.read',
      },
      {
        id: 'bankAccounts',
        labelKey: 'console.nav.bankAccounts',
        to: '/console/billing/accounts',
        Icon: ConsolePlansIcon,
        requires: 'platform.billing.read',
      },
      {
        id: 'billingSettings',
        labelKey: 'console.nav.billingSettings',
        to: '/console/billing/settings',
        Icon: NavSettingsIcon,
        requires: 'platform.billing.read',
      },
      {
        id: 'seller',
        labelKey: 'console.nav.seller',
        to: '/console/billing/seller',
        Icon: NavDocumentsIcon,
        // The seller routes are read and changed under the manage permission alone (contract).
        requires: 'platform.billing.manage',
      },
    ],
  },
  // No ERP group. Its two screens, add-on requests and templates, drew a story fixture, and the
  // approval there changed nothing real. A tenant's ERP access is granted and revoked from the
  // tenant's own page, against the platform entitlement API.
  {
    id: 'platform',
    labelKey: 'console.nav.group.platform',
    items: [
      {
        id: 'operators',
        labelKey: 'console.nav.operators',
        to: '/console/operators',
        requires: ['admin.users.manage', 'platform.operators.manage'],
        Icon: NavCustomersIcon,
      },
      {
        id: 'policies',
        labelKey: 'console.nav.policies',
        to: '/console/policies',
        requires: 'platform.support',
        Icon: NavInvoicesIcon,
      },
      {
        id: 'audit',
        labelKey: 'console.nav.audit',
        to: '/console/audit',
        Icon: NavDocumentsIcon,
      },
      {
        id: 'consoleSettings',
        labelKey: 'console.nav.settings',
        to: '/console/settings',
        Icon: NavSettingsIcon,
      },
    ],
  },
]

/** Every console route, for the router and for the "not built yet" pages. */
export const CONSOLE_ITEMS = CONSOLE_NAV.flatMap((group) => group.items)
