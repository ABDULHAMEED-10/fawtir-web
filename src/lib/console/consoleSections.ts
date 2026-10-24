import { REVIEW_PERMISSION } from './companyVerification'
import { OWNERS_MANAGE_PERMISSION } from './companyOwners'
import { DISCONNECTIONS_READ_PERMISSION } from './fawtirDisconnections'
import { BILLING_READ_PERMISSION } from './billingPayments'
import { BILLING_READ } from './enterpriseTerms'

/**
 * Console pages that share one sidebar link and show their siblings as tabs (owner, 24 Oct
 * 2026): the lists about companies under Tenants, the lists about money under Billing. Each tab
 * is still its own page at its own address, with the permission its page asks for, so a tab shows
 * exactly when its page would open.
 */
export type ConsoleSectionTab = {
  id: string
  labelKey: string
  to: string
  requires: string
}

export type ConsoleSectionId = 'tenants' | 'billing'

export const CONSOLE_SECTIONS: Record<
  ConsoleSectionId,
  { titleKey: string; tabs: readonly ConsoleSectionTab[] }
> = {
  tenants: {
    titleKey: 'console.sections.tenants.title',
    tabs: [
      {
        id: 'all',
        labelKey: 'console.sections.tenants.all',
        to: '/console/tenants',
        requires: REVIEW_PERMISSION,
      },
      {
        id: 'enterprise',
        labelKey: 'console.sections.tenants.enterprise',
        to: '/console/enterprise',
        // Companies on negotiated Enterprise terms (V348), read under the billing permission.
        requires: BILLING_READ,
      },
      {
        id: 'owners',
        labelKey: 'console.sections.tenants.owners',
        to: '/console/owners',
        requires: OWNERS_MANAGE_PERMISSION,
      },
      {
        id: 'leaving',
        labelKey: 'console.sections.tenants.leaving',
        to: '/console/disconnections',
        // "Disconnect from Fawtir" requests, worked by Platform support (V302).
        requires: DISCONNECTIONS_READ_PERMISSION,
      },
    ],
  },
  billing: {
    titleKey: 'console.sections.billing.title',
    tabs: [
      {
        id: 'payments',
        labelKey: 'console.sections.billing.payments',
        to: '/console/billing/payments',
        // Subscription payments waiting for Platform Finance (V271).
        requires: BILLING_READ_PERMISSION,
      },
      {
        id: 'refunds',
        labelKey: 'console.sections.billing.refunds',
        to: '/console/billing/refunds',
        // Every company's refund cases, Finance's and the super admin's (V423).
        requires: BILLING_READ_PERMISSION,
      },
    ],
  },
}
