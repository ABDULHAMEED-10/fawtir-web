import type { ComponentType } from 'react'
import { ATTENTION_COUNT } from './activity'
import salesIcon from '../assets/dashboard/kpi-sales.svg'
import receivablesIcon from '../assets/dashboard/kpi-receivables.svg'
import payablesIcon from '../assets/dashboard/kpi-payables.svg'
import {
  NavCatalogIcon,
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
}

export type NavItem = {
  id: string
  labelKey: string
  Icon: ComponentType<{ className?: string; active?: boolean }>
  to: string
  badge?: number
  children?: NavChild[]
}

export type NavGroup = {
  id: string
  labelKey: string
  items: NavItem[]
}

export const INCOME_PATHS = [
  '/invoices',
  '/income/self-billing',
  '/income/reminders',
  '/income/periodic',
  '/income/credit-notes',
  '/income/debit-notes',
] as const

export const EXPENDITURE_PATHS = [
  '/expenditure/bills',
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
  '/trade-documents/projects',
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
        badge: 3,
        children: [
          { id: 'invoice', labelKey: 'dashboard.nav.incomeChildren.invoice', to: '/invoices' },
          {
            id: 'selfBilling',
            labelKey: 'dashboard.nav.incomeChildren.selfBilling',
            to: '/income/self-billing',
          },
          {
            id: 'reminders',
            labelKey: 'dashboard.nav.incomeChildren.reminders',
            to: '/income/reminders',
          },
          {
            id: 'periodic',
            labelKey: 'dashboard.nav.incomeChildren.periodic',
            to: '/income/periodic',
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
        children: [
          {
            id: 'bills',
            labelKey: 'dashboard.nav.expenditureChildren.bills',
            to: '/expenditure/bills',
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
          },
          {
            id: 'creditNotes',
            labelKey: 'dashboard.nav.expenditureChildren.creditNotes',
            to: '/expenditure/credit-notes',
          },
          {
            id: 'debitNotes',
            labelKey: 'dashboard.nav.expenditureChildren.debitNotes',
            to: '/expenditure/debit-notes',
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
          {
            id: 'projects',
            labelKey: 'dashboard.nav.tradeDocumentChildren.projects',
            to: '/trade-documents/projects',
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
      },
      {
        id: 'suppliers',
        labelKey: 'dashboard.nav.suppliers',
        Icon: NavSuppliersIcon,
        to: '/suppliers',
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
        children: [
          { id: 'allItems', labelKey: 'dashboard.nav.catalogChildren.allItems', to: '/catalog' },
          {
            id: 'bundles',
            labelKey: 'dashboard.nav.catalogChildren.bundles',
            to: '/catalog/bundles',
          },
          { id: 'stock', labelKey: 'dashboard.nav.catalogChildren.stock', to: '/catalog/stock' },
          {
            id: 'priceRules',
            labelKey: 'dashboard.nav.catalogChildren.priceRules',
            to: '/catalog/rules',
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
        badge: ATTENTION_COUNT,
      },
      {
        id: 'documents',
        labelKey: 'dashboard.nav.documents',
        Icon: NavDocumentsIcon,
        to: '/compliance/documents',
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
        children: [
          { id: 'income', labelKey: 'dashboard.nav.reportChildren.income', to: '/reports/income' },
          {
            id: 'expenditure',
            labelKey: 'dashboard.nav.reportChildren.expenditure',
            to: '/reports/expenditure',
          },
          {
            id: 'cashFlow',
            labelKey: 'dashboard.nav.reportChildren.cashFlow',
            to: '/reports/cash-flow',
          },
          { id: 'vat', labelKey: 'dashboard.nav.reportChildren.vat', to: '/reports/vat-tax' },
          {
            id: 'compliance',
            labelKey: 'dashboard.nav.reportChildren.compliance',
            to: '/reports/compliance',
          },
          { id: 'lists', labelKey: 'dashboard.nav.reportChildren.lists', to: '/reports/lists' },
        ],
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

export const ACCOUNT = {
  name: 'Al Bahja Coffee',
  planKey: 'dashboard.account.premiumPlan',
}

export const USER = {
  name: 'Hafidh Saif',
  roleKey: 'dashboard.account.owner',
  firstName: 'Hafidh',
}

export type InvoiceStatus = 'reported' | 'rejected' | 'sent' | 'draft'

export type RecentInvoice = {
  id: string
  customer: string
  meta: string
  status: InvoiceStatus
  amount: string
}

export const RECENT_INVOICES: RecentInvoice[] = [
  {
    id: 'INV-2043',
    customer: 'Muscat Grand Hotel',
    meta: 'B2B · 18 Jul',
    status: 'reported',
    amount: '1,860',
  },
  {
    id: 'INV-2042',
    customer: 'Walk in Customer',
    meta: 'B2C · 18 Jul',
    status: 'reported',
    amount: '24',
  },
  {
    id: 'INV-2041',
    customer: 'Al Noor Trading LLC',
    meta: 'B2B · 17 Jul',
    status: 'rejected',
    amount: '540',
  },
  {
    id: 'INV-2040',
    customer: 'Bahwan Group',
    meta: 'B2B · 17 Jul',
    status: 'sent',
    amount: '3,120',
  },
  {
    id: 'INV-2039',
    customer: 'Salalah Resort',
    meta: 'B2B · 16 Jul',
    status: 'draft',
    amount: '890',
  },
]

export type RevenueBar = {
  day: string
  value: number
  active?: boolean
  tooltip?: { amount: string; date: string }
}

export const REVENUE_BARS: RevenueBar[] = [
  { day: 'Mon', value: 62 },
  { day: 'Tue', value: 72 },
  { day: 'Wed', value: 72 },
  {
    day: 'Thu',
    value: 100,
    active: true,
    tooltip: { amount: '2,845', date: 'Thu, 12 Jul' },
  },
  { day: 'Fri', value: 72 },
  { day: 'Sat', value: 72 },
  { day: 'Sun', value: 72 },
]

export const KPI = {
  sales: {
    titleKey: 'dashboard.kpi.sales',
    icon: salesIcon,
    amount: '1,240',
    trend: '20%',
    trendLabelKey: 'dashboard.kpi.vsYesterday',
  },
  receivables: {
    titleKey: 'dashboard.kpi.receivables',
    icon: receivablesIcon,
    amount: '14,320',
    badgeKey: 'dashboard.kpi.open',
    badgeValue: '12',
    metaKey: 'dashboard.kpi.overdue',
    metaValue: '3',
  },
  payables: {
    titleKey: 'dashboard.kpi.payables',
    icon: payablesIcon,
    amount: '6,780',
    badgeKey: 'dashboard.kpi.dueSoon',
    badgeValue: '2',
    metaKey: 'dashboard.kpi.suppliers',
    metaValue: '5',
    warning: true,
  },
}

export const COMPLIANCE = {
  accepted: '98.7%',
  reported: 340,
  mls: '99.1%',
  rejected: 2,
  alertCount: 2,
}

export const QUOTA = {
  used: 342,
  total: 1000,
  percent: 34,
  resetLabelKey: 'dashboard.quota.reset',
}

export const VAT = {
  net: '1,180',
  output: '2,360',
  input: '1,180',
}

export const REVENUE = {
  total: '28,450',
  yTicks: ['OMR 3,000', 'OMR 2,000', 'OMR 1,000', 'OMR 0'],
}

export type PeriodOption = 'day' | 'week' | 'month'
