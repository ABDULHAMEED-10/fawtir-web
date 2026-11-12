import type { ComponentType } from 'react'
import type { Feature } from './plans'
import { REPORT_READS } from '../api/reports/reports'
import {
  NavCatalogIcon,
  NavStockIcon,
  NavCustomersIcon,
  NavDashboardIcon,
  NavDocumentsIcon,
  NavExpenditureIcon,
  NavInvoicesIcon,
  NavPosIcon,
  NavReportsIcon,
  NavSettingsIcon,
  NavSuppliersIcon,
  NavTddIcon,
} from '../layouts/AppShell/navIcons'

export type NavChild = {
  id: string
  labelKey: string
  to: string
  /** The permission the destination's first read needs; the entry is hidden from anyone without it. */
  requires?: string
  /**
   * As `requires`, for a destination whose reads admit any one of several permissions (a
   * controller's `@RequiresPermission` with more than one code): the entry shows with one of them.
   */
  requiresAny?: readonly string[]
  /**
   * The plan feature the destination is part of. Unlike `requires`, a plan that lacks it does
   * not hide the entry: it shows greyed with a lock and leads to the upgrade nudge.
   */
  feature?: Feature
  /**
   * A live count drawn at the end of the entry, in the sidebar's own badge. `billReminders` is
   * the reader's unread bill reminders, the number on the bell ("a count on the bell and on the
   * Bills tab", Reminders 163:21448).
   */
  count?: 'billReminders'
}

export type NavItem = {
  id: string
  labelKey: string
  Icon: ComponentType<{ className?: string; active?: boolean }>
  to: string
  badge?: number
  children?: NavChild[]
  /** As on `NavChild`. A group whose every child is hidden is hidden too. */
  requires?: string
  /** As on `NavChild`; a group's feature locks each of its children. */
  feature?: Feature
  /**
   * The prototype module the entry opens (`DemoModule`). While that module is hidden outright
   * (`prototypeHidden`, R6) the entry, children and all, is left out of the navigation.
   */
  prototype?: string
}

export type NavGroup = {
  id: string
  labelKey: string
  items: NavItem[]
}

export const INCOME_PATHS = [
  '/invoices',
  '/income/reminders',
  '/income/periodic',
  '/income/credit-notes',
  '/income/debit-notes',
] as const

export const EXPENDITURE_PATHS = [
  '/expenditure/bills',
  '/expenditure/self-billing',
  '/expenditure/payments',
  '/expenditure/recurring-bills',
  '/expenditure/reminders',
  '/expenditure/credit-notes',
  '/expenditure/debit-notes',
] as const

export const TRADE_DOCUMENT_PATHS = [
  '/trade-documents/quotations',
  '/trade-documents/order-forms',
  '/trade-documents/delivery-notes',
] as const

export const DASHBOARD_NAV: NavGroup[] = [
  {
    id: 'main',
    labelKey: 'dashboard.nav.main',
    items: [
      {
        id: 'dashboard',
        labelKey: 'dashboard.nav.dashboard',
        Icon: NavDashboardIcon,
        to: '/dashboard',
      },
      { id: 'pos', labelKey: 'dashboard.nav.pos', Icon: NavPosIcon, to: '/pos' },
      {
        id: 'income',
        labelKey: 'dashboard.nav.income',
        Icon: NavInvoicesIcon,
        to: '/invoices',
        requires: 'invoice.read',
        children: [
          { id: 'invoice', labelKey: 'dashboard.nav.incomeChildren.invoice', to: '/invoices' },
          {
            id: 'reminders',
            labelKey: 'dashboard.nav.incomeChildren.reminders',
            to: '/income/reminders',
          },
          {
            id: 'periodic',
            labelKey: 'dashboard.nav.incomeChildren.periodic',
            to: '/income/periodic',
            feature: 'recurringInvoices',
          },
          {
            id: 'creditNotes',
            labelKey: 'dashboard.nav.incomeChildren.creditNotes',
            to: '/income/credit-notes',
          },
          {
            id: 'debitNotes',
            labelKey: 'dashboard.nav.incomeChildren.debitNotes',
            to: '/income/debit-notes',
          },
        ],
      },
      {
        id: 'expenditure',
        labelKey: 'dashboard.nav.expenditure',
        Icon: NavExpenditureIcon,
        to: '/expenditure/bills',
        // Bills, payments, recurring bills and reminders are all guarded by invoice.* codes.
        requires: 'invoice.read',
        children: [
          {
            id: 'bills',
            labelKey: 'dashboard.nav.expenditureChildren.bills',
            to: '/expenditure/bills',
            count: 'billReminders',
          },
          {
            // A self-billed invoice is a purchase written on the supplier's behalf (owner decision
            // 6 Oct 2026: the Figma placement under Income was a design slip).
            id: 'selfBilling',
            labelKey: 'dashboard.nav.expenditureChildren.selfBilling',
            to: '/expenditure/self-billing',
            feature: 'selfBilling',
          },
          {
            id: 'payments',
            labelKey: 'dashboard.nav.expenditureChildren.payments',
            to: '/expenditure/payments',
          },
          {
            id: 'recurringBills',
            labelKey: 'dashboard.nav.expenditureChildren.recurringBills',
            to: '/expenditure/recurring-bills',
            feature: 'recurringBills',
          },
          {
            id: 'creditNotes',
            labelKey: 'dashboard.nav.expenditureChildren.creditNotes',
            to: '/expenditure/credit-notes',
            feature: 'supplierNotes',
          },
          {
            id: 'debitNotes',
            labelKey: 'dashboard.nav.expenditureChildren.debitNotes',
            to: '/expenditure/debit-notes',
            feature: 'supplierNotes',
          },
          {
            id: 'reminders',
            labelKey: 'dashboard.nav.expenditureChildren.reminders',
            to: '/expenditure/reminders',
          },
        ],
      },
      {
        // Quotations, order forms and delivery notes run in both directions — sale and
        // purchase — so they sit apart from Income and Expenditure rather than under either.
        id: 'tradeDocuments',
        labelKey: 'dashboard.nav.tradeDocuments',
        Icon: NavDocumentsIcon,
        to: '/trade-documents/quotations',
        feature: 'tradeDocuments',
        prototype: 'tradeDocuments',
        children: [
          {
            id: 'quotations',
            labelKey: 'dashboard.nav.tradeDocumentChildren.quotations',
            to: '/trade-documents/quotations',
          },
          {
            id: 'orderForms',
            labelKey: 'dashboard.nav.tradeDocumentChildren.orderForms',
            to: '/trade-documents/order-forms',
          },
          {
            id: 'deliveryNotes',
            labelKey: 'dashboard.nav.tradeDocumentChildren.deliveryNotes',
            to: '/trade-documents/delivery-notes',
          },
        ],
      },
    ],
  },
  {
    id: 'contacts',
    labelKey: 'dashboard.nav.contacts',
    items: [
      {
        id: 'customers',
        labelKey: 'dashboard.nav.customers',
        Icon: NavCustomersIcon,
        to: '/customers',
        requires: 'customer.read',
      },
      {
        id: 'suppliers',
        labelKey: 'dashboard.nav.suppliers',
        Icon: NavSuppliersIcon,
        to: '/suppliers',
        requires: 'supplier.read',
      },
    ],
  },
  {
    id: 'catalog',
    labelKey: 'dashboard.nav.catalogStock',
    items: [
      {
        id: 'catalog',
        labelKey: 'dashboard.nav.catalog',
        Icon: NavCatalogIcon,
        to: '/catalog',
        requires: 'product.read',
        children: [
          { id: 'allItems', labelKey: 'dashboard.nav.catalogChildren.allItems', to: '/catalog' },
          {
            id: 'groups',
            labelKey: 'dashboard.nav.catalogChildren.groups',
            to: '/catalog/groups',
          },
          {
            id: 'bundles',
            labelKey: 'dashboard.nav.catalogChildren.bundles',
            to: '/catalog/bundles',
          },
          {
            id: 'priceRules',
            labelKey: 'dashboard.nav.catalogChildren.priceRules',
            to: '/catalog/rules',
          },
        ],
      },
      {
        id: 'stock',
        labelKey: 'dashboard.nav.stock',
        Icon: NavStockIcon,
        to: '/stock',
        requires: 'stock.read',
      },
    ],
  },
  {
    id: 'insights',
    labelKey: 'dashboard.nav.insights',
    items: [
      {
        id: 'reports',
        labelKey: 'dashboard.nav.reports',
        Icon: NavReportsIcon,
        to: '/reports/income',
        // Each report hides from a reader its reads would refuse (IE3-04): a Cashier holds none of
        // them, so the whole group goes, as a group with every child hidden does.
        children: [
          {
            id: 'income',
            labelKey: 'dashboard.nav.reportChildren.income',
            to: '/reports/income',
            requiresAny: REPORT_READS.income,
          },
          {
            id: 'expenditure',
            labelKey: 'dashboard.nav.reportChildren.expenditure',
            to: '/reports/expenditure',
            requiresAny: REPORT_READS.expenditure,
          },
          {
            id: 'cashFlow',
            labelKey: 'dashboard.nav.reportChildren.cashFlow',
            to: '/reports/cash-flow',
            requiresAny: REPORT_READS.cashFlow,
          },
          {
            id: 'vat',
            labelKey: 'dashboard.nav.reportChildren.vat',
            to: '/reports/vat-tax',
            requiresAny: REPORT_READS.vat,
          },
          {
            id: 'compliance',
            labelKey: 'dashboard.nav.reportChildren.compliance',
            to: '/reports/compliance',
            requiresAny: REPORT_READS.compliance,
          },
          {
            id: 'lists',
            labelKey: 'dashboard.nav.reportChildren.lists',
            to: '/reports/lists',
            requiresAny: REPORT_READS.lists,
          },
        ],
      },
    ],
  },
  {
    id: 'compliance',
    labelKey: 'dashboard.nav.compliance',
    items: [
      {
        id: 'activity',
        labelKey: 'dashboard.nav.tddOta',
        Icon: NavTddIcon,
        to: '/compliance/activity',
        // The ledger and the archive both take `invoice.read` (ComplianceActivityController,
        // ComplianceDocumentsController), which a Cashier lacks (IE3-04).
        requires: 'invoice.read',
      },
      {
        id: 'documents',
        labelKey: 'dashboard.nav.documents',
        Icon: NavDocumentsIcon,
        to: '/compliance/documents',
        requires: 'invoice.read',
      },
    ],
  },
]

export const SETTINGS_NAV: NavItem = {
  id: 'settings',
  labelKey: 'dashboard.nav.settings',
  Icon: NavSettingsIcon,
  to: '/settings',
}
