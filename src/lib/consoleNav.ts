import type { ComponentType } from 'react'
import {
  NavCustomersIcon,
  NavDocumentsIcon,
  NavReportsIcon,
  NavSettingsIcon,
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
  /** Screens the design has not reached yet still appear, so the shape of the console is honest. */
  soon?: boolean
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
        soon: true,
      },
      {
        id: 'incidents',
        labelKey: 'console.nav.incidents',
        to: '/console/incidents',
        Icon: ConsoleIncidentIcon,
        soon: true,
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
        Icon: NavCustomersIcon,
      },
      {
        id: 'verification',
        labelKey: 'console.nav.verification',
        // The design's route, kept when the screen became company verification.
        to: '/console/onboarding',
        Icon: NavTddIcon,
      },
      {
        id: 'subscriptions',
        labelKey: 'console.nav.subscriptions',
        to: '/console/subscriptions',
        Icon: ConsoleSubscriptionIcon,
      },
      {
        id: 'plans',
        labelKey: 'console.nav.plans',
        to: '/console/plans',
        Icon: ConsolePlansIcon,
      },
    ],
  },
  {
    id: 'platform',
    labelKey: 'console.nav.group.platform',
    items: [
      {
        id: 'operators',
        labelKey: 'console.nav.operators',
        to: '/console/operators',
        Icon: NavCustomersIcon,
      },
      {
        id: 'audit',
        labelKey: 'console.nav.audit',
        to: '/console/audit',
        Icon: NavDocumentsIcon,
        soon: true,
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
