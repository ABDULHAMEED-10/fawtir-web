import type { ComponentType } from 'react'
import {
  NavDashboardIcon,
  NavExpenditureIcon,
  NavSuppliersIcon,
  NavTddIcon,
} from '../layouts/AppShell/navIcons'
import { ConsoleIncidentIcon, ConsoleQueueIcon } from '../layouts/ConsoleShell/consoleIcons'

import type { ConsoleSectionId } from './console/consoleSections'

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
  /**
   * A link that stands for a section of tabbed pages (Tenants, Billing; owner, 24 Oct 2026): shown
   * when any of its tabs would open, it leads to the first such tab and is lit on all of them.
   */
  section?: ConsoleSectionId
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
        // Sample data until connected to the server (owner, 24 Oct 2026).
        soon: true,
        labelKey: 'console.nav.operations',
        to: '/console',
        Icon: NavDashboardIcon,
      },
      {
        id: 'queue',
        // Sample data until connected to the server (owner, 24 Oct 2026).
        soon: true,
        labelKey: 'console.nav.queue',
        to: '/console/queue',
        Icon: ConsoleQueueIcon,
      },
      {
        id: 'incidents',
        // Sample data until connected to the server (owner, 24 Oct 2026).
        soon: true,
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
        // All companies, Enterprise, Without an Owner and Leaving, as tabs.
        section: 'tenants',
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
        id: 'billing',
        labelKey: 'console.nav.billing',
        to: '/console/billing/payments',
        Icon: NavExpenditureIcon,
        // Subscription payments and refund cases, as tabs.
        section: 'billing',
      },
    ],
  },
  // No ERP group. Its two screens, add-on requests and templates, drew a story fixture, and the
  // approval there changed nothing real. A tenant's ERP access is granted and revoked from the
  // tenant's own page, against the platform entitlement API.
  // Operators, validation policies, the audit log, plans and rates and every billing value now
  // live in Console › Settings (owner, 24 Oct 2026); the bottom Settings link opens it.
]

/** Every console route, for the router and for the "not built yet" pages. */
export const CONSOLE_ITEMS = CONSOLE_NAV.flatMap((group) => group.items)
