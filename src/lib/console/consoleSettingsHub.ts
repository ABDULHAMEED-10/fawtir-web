import { USERS_PERMISSION, OPERATORS_PERMISSION } from './platformOperators'
import { BILLING_MANAGE_PERMISSION, BILLING_READ_PERMISSION } from './billingPayments'
import { COMPANY_CONTACT_READ_PERMISSION } from './companyContact'
import { POLICY_CONSOLE_PERMISSION } from './validationPolicies'
import { READINESS_PERMISSION } from './branchAccessReadiness'
import { PLANS_READ_PERMISSION, PLANS_MANAGE_PERMISSION } from './planCatalogue'

/**
 * The console's Settings page, built like the tenant Settings hub (`/settings`): tabs across the
 * top, one card per area, each card opening its own page with "All settings" to come back
 * (owner, 24 Oct 2026: one place for every setting instead of a link each in the sidebar).
 *
 * Where a card goes and who may see it are the screens' own: `requires` is the permission the
 * page itself asks for, so a card is shown exactly when its page would open.
 */
export const CONSOLE_SETTINGS_TABS = [
  { id: 'all', labelKey: 'console.settingsHub.tab.all' },
  { id: 'plans', labelKey: 'console.settingsHub.tab.plans' },
  { id: 'billing', labelKey: 'console.settingsHub.tab.billing' },
  { id: 'company', labelKey: 'console.settingsHub.tab.company' },
  { id: 'platform', labelKey: 'console.settingsHub.tab.platform' },
  { id: 'records', labelKey: 'console.settingsHub.tab.records' },
] as const

export type ConsoleSettingsTab = (typeof CONSOLE_SETTINGS_TABS)[number]['id']

export const CONSOLE_SETTINGS_PATH = '/console/settings'
/** The platform values that are not prices (the old Console settings page), now one card each. */
export const PLATFORM_VALUES_PATH = '/console/settings/values'

export type ConsoleSettingsCard = {
  id: string
  tab: Exclude<ConsoleSettingsTab, 'all'>
  icon:
    | 'plan'
    | 'bills'
    | 'integration'
    | 'company'
    | 'peppol'
    | 'team'
    | 'roles'
    | 'branches'
    | 'log'
    | 'signing'
  to: string
  /** Every one of these is needed to open the page; none means any operator. */
  requires?: string | readonly string[]
  /** With this too the page can change things; without it, it is read only. */
  manage?: string | readonly string[]
  /** Still a sample screen: the card says "Coming soon" and nothing on it is saved. */
  soon?: boolean
}

const values = (section: string) => `${PLATFORM_VALUES_PATH}?section=${section}`

export const CONSOLE_SETTINGS_CARDS: readonly ConsoleSettingsCard[] = [
  {
    id: 'plans',
    tab: 'plans',
    icon: 'plan',
    to: '/console/plans',
    requires: PLANS_READ_PERMISSION,
    manage: PLANS_MANAGE_PERMISSION,
  },
  { id: 'addons', tab: 'plans', icon: 'integration', to: values('addons'), soon: true },
  { id: 'promotional', tab: 'plans', icon: 'plan', to: values('promotional'), soon: true },
  {
    id: 'billingRules',
    tab: 'billing',
    icon: 'bills',
    to: '/console/billing/settings',
    requires: BILLING_READ_PERMISSION,
    manage: BILLING_MANAGE_PERMISSION,
  },
  { id: 'billingValues', tab: 'billing', icon: 'bills', to: values('billing'), soon: true },
  { id: 'counting', tab: 'billing', icon: 'log', to: values('counting'), soon: true },
  { id: 'overage', tab: 'billing', icon: 'bills', to: values('overage'), soon: true },
  { id: 'payments', tab: 'billing', icon: 'bills', to: values('payments'), soon: true },
  {
    id: 'seller',
    tab: 'company',
    icon: 'company',
    to: '/console/billing/seller',
    requires: BILLING_MANAGE_PERMISSION,
    manage: BILLING_MANAGE_PERMISSION,
  },
  {
    id: 'bankAccount',
    tab: 'company',
    icon: 'bills',
    to: '/console/billing/accounts',
    requires: BILLING_READ_PERMISSION,
    manage: BILLING_MANAGE_PERMISSION,
  },
  {
    id: 'contact',
    tab: 'company',
    icon: 'company',
    to: '/console/company-contact',
    requires: COMPANY_CONTACT_READ_PERMISSION,
    manage: BILLING_MANAGE_PERMISSION,
  },
  {
    id: 'operators',
    tab: 'platform',
    icon: 'team',
    to: '/console/operators',
    requires: [USERS_PERMISSION, OPERATORS_PERMISSION],
  },
  {
    id: 'policies',
    tab: 'platform',
    icon: 'peppol',
    to: '/console/policies',
    requires: POLICY_CONSOLE_PERMISSION,
  },
  {
    id: 'branchAccess',
    tab: 'platform',
    icon: 'branches',
    to: '/console/branch-access',
    requires: READINESS_PERMISSION,
  },
  { id: 'lifecycle', tab: 'platform', icon: 'signing', to: values('lifecycle'), soon: true },
  { id: 'notices', tab: 'platform', icon: 'roles', to: values('notices'), soon: true },
  { id: 'operations', tab: 'platform', icon: 'roles', to: values('operations'), soon: true },
  { id: 'fixed', tab: 'platform', icon: 'peppol', to: values('fixed'), soon: true },
  { id: 'audit', tab: 'records', icon: 'log', to: '/console/audit', soon: true },
]

/** The tab a settings page belongs to, so its tab lights up while it is open. */
export function settingsTabOf(cardId: string): Exclude<ConsoleSettingsTab, 'all'> | undefined {
  return CONSOLE_SETTINGS_CARDS.find((card) => card.id === cardId)?.tab
}

export const asList = (codes: string | readonly string[] | undefined): readonly string[] =>
  codes === undefined ? [] : typeof codes === 'string' ? [codes] : codes
