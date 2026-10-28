import { USERS_PERMISSION, OPERATORS_PERMISSION } from './platformOperators'
import { BILLING_MANAGE_PERMISSION, BILLING_READ_PERMISSION } from './billingPayments'
import { POLICY_CONSOLE_PERMISSION } from './validationPolicies'
import { READINESS_PERMISSION } from './branchAccessReadiness'
import { PLANS_READ_PERMISSION, PLANS_MANAGE_PERMISSION } from './planCatalogue'
import { CATALOGUE_MANAGE_PERMISSION } from '../../api/platform/businessTypes'

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
/** Seller, bank account and contact details, one page. */
export const FAWTIR_COMPANY_PATH = '/console/settings/company'
/**
 * The old "Console settings" prototype. It keeps its values in the browser only, so a card leads
 * here only for what has no API yet (promotions, the fixed positions); every value the platform
 * really has is set on Plans and rates, Billing rules or Fawtir company details, and its card
 * leads there (owner, 24 Oct 2026).
 */
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
  // Owner, 24 Oct 2026: each value lives where the API sets it; the card leads there.
  {
    id: 'addons',
    tab: 'plans',
    icon: 'integration',
    // The ERP and API add-on price is a field of each plan.
    to: '/console/plans',
    requires: PLANS_READ_PERMISSION,
    manage: PLANS_MANAGE_PERMISSION,
  },
  {
    id: 'counting',
    tab: 'plans',
    icon: 'log',
    // "Count received documents", per plan.
    to: '/console/plans',
    requires: PLANS_READ_PERMISSION,
    manage: PLANS_MANAGE_PERMISSION,
  },
  {
    id: 'overage',
    tab: 'plans',
    icon: 'bills',
    // The price per extra document, per plan.
    to: '/console/plans',
    requires: PLANS_READ_PERMISSION,
    manage: PLANS_MANAGE_PERMISSION,
  },
  // Not built: none at launch (Business Rules).
  { id: 'promotional', tab: 'plans', icon: 'plan', to: values('promotional') },
  {
    id: 'billingRules',
    tab: 'billing',
    icon: 'bills',
    to: '/console/billing/settings',
    requires: BILLING_READ_PERMISSION,
    manage: BILLING_MANAGE_PERMISSION,
  },
  {
    id: 'billingValues',
    tab: 'billing',
    icon: 'bills',
    // VAT on subscription bills is a Billing rules value.
    to: '/console/billing/settings',
    requires: BILLING_READ_PERMISSION,
    manage: BILLING_MANAGE_PERMISSION,
  },
  {
    id: 'payments',
    tab: 'billing',
    icon: 'bills',
    // Card payment on or off, and how long a payment link stays valid.
    to: '/console/billing/settings',
    requires: BILLING_READ_PERMISSION,
    manage: BILLING_MANAGE_PERMISSION,
  },
  {
    id: 'lifecycle',
    tab: 'billing',
    icon: 'signing',
    // Grace days and the trial reminder; the trial itself is switched per plan.
    to: '/console/billing/settings',
    requires: BILLING_READ_PERMISSION,
    manage: BILLING_MANAGE_PERMISSION,
  },
  {
    id: 'notices',
    tab: 'billing',
    icon: 'roles',
    // Renewal and grace reminder days.
    to: '/console/billing/settings',
    requires: BILLING_READ_PERMISSION,
    manage: BILLING_MANAGE_PERMISSION,
  },
  {
    // Seller, bank account and contact details on one page (owner, 24 Oct 2026).
    id: 'company',
    tab: 'company',
    icon: 'company',
    to: FAWTIR_COMPANY_PATH,
    requires: BILLING_READ_PERMISSION,
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
    // The business types and sub types offered at sign-up, and their catalogue templates
    // (Catalogue guide 1A).
    id: 'businessTypes',
    tab: 'platform',
    icon: 'branches',
    to: '/console/settings/business-types',
    requires: CATALOGUE_MANAGE_PERMISSION,
    manage: CATALOGUE_MANAGE_PERMISSION,
  },
  {
    id: 'branchAccess',
    tab: 'platform',
    icon: 'branches',
    to: '/console/branch-access',
    requires: READINESS_PERMISSION,
  },
  {
    id: 'operations',
    tab: 'platform',
    icon: 'roles',
    // A temporary grant or a trial exception is given from the company's own page.
    to: '/console/tenants',
    requires: READINESS_PERMISSION,
    manage: BILLING_MANAGE_PERMISSION,
  },
  // Read-only positions the platform takes; shown on the prototype page for now.
  { id: 'fixed', tab: 'platform', icon: 'peppol', to: values('fixed') },
  { id: 'audit', tab: 'records', icon: 'log', to: '/console/audit' },
]

export const asList = (codes: string | readonly string[] | undefined): readonly string[] =>
  codes === undefined ? [] : typeof codes === 'string' ? [codes] : codes
