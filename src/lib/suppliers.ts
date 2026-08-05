/**
 * Suppliers are the mirror of customers: here the business is corner 4 (the buyer) in
 * Oman's 5-corner Peppol model, so invoices arrive *from* the supplier via their ASP,
 * and money flows out. Hence payables rather than receivables, and bank details that
 * matter up front because we pay them.
 */

export type SupplierKind = 'business' | 'government'

export type SupplierTabId = 'all' | SupplierKind | 'selfBilling'

/** How invoices arrive from this supplier. */
export type SupplierChannel = 'onPeppol' | 'notConnected' | 'selfBilled'

export type PayableState = 'overdue' | 'dueSoon' | 'settled'

export type SupplierRow = {
  id: string
  name: string
  subtitle: string
  initials: string
  kind: SupplierKind
  contactName: string
  contactEmail: string
  location: string
  channel: SupplierChannel
  billCount: number
  amount?: string
  amountNote?: string
  amountNoteDays?: number
  state: PayableState
}

export const SUPPLIER_KPI = [
  {
    id: 'payables',
    titleKey: 'suppliersPage.kpi.payables',
    icon: 'payables',
    amount: '6.780',
    withCurrency: true,
    metaKey: 'suppliersPage.kpi.payablesMeta',
  },
  {
    id: 'overdue',
    titleKey: 'suppliersPage.kpi.overdue',
    icon: 'overdue',
    amount: '1.240',
    withCurrency: true,
    metaKey: 'suppliersPage.kpi.overdueMeta',
  },
  {
    id: 'suppliers',
    titleKey: 'suppliersPage.kpi.suppliers',
    icon: 'suppliers',
    amount: '5',
    withCurrency: false,
    metaKey: 'suppliersPage.kpi.suppliersMeta',
  },
  {
    id: 'peppol',
    titleKey: 'suppliersPage.kpi.peppolReady',
    icon: 'peppol',
    amount: '4',
    withCurrency: false,
    suffixKey: 'suppliersPage.kpi.ofFive',
    metaKey: 'suppliersPage.kpi.peppolMeta',
  },
] as const

export const SUPPLIER_TABS: { id: SupplierTabId; labelKey: string; count: number }[] = [
  { id: 'all', labelKey: 'suppliersPage.tabs.all', count: 5 },
  { id: 'business', labelKey: 'suppliersPage.tabs.business', count: 4 },
  { id: 'government', labelKey: 'suppliersPage.tabs.government', count: 1 },
  { id: 'selfBilling', labelKey: 'suppliersPage.tabs.selfBilling', count: 1 },
]

export const SUPPLIER_ROWS: SupplierRow[] = [
  {
    id: 'oman-coffee-roasters',
    name: 'Oman Coffee Roasters LLC',
    subtitle: 'VAT OM1100294417',
    initials: 'OC',
    kind: 'business',
    contactName: 'Yousuf Al Harthy',
    contactEmail: 'accounts@omancoffee.om',
    location: 'Muscat, Oman',
    channel: 'onPeppol',
    billCount: 6,
    amount: '2.410',
    amountNote: 'suppliersPage.note.daysOverdue',
    amountNoteDays: 9,
    state: 'overdue',
  },
  {
    id: 'gulf-packaging',
    name: 'Gulf Packaging Co.',
    subtitle: 'VAT OM1100663520',
    initials: 'GP',
    kind: 'business',
    contactName: 'Noora Al Kindi',
    contactEmail: 'billing@gulfpack.om',
    location: 'Sohar, Oman',
    channel: 'onPeppol',
    billCount: 3,
    amount: '1.860',
    amountNote: 'suppliersPage.note.dueInDays',
    amountNoteDays: 5,
    state: 'dueSoon',
  },
  {
    id: 'al-madina-logistics',
    name: 'Al Madina Logistics',
    subtitle: 'VAT OM1100118904',
    initials: 'AL',
    kind: 'business',
    contactName: 'Hamed Al Balushi',
    contactEmail: 'finance@almadinalog.om',
    location: 'Muscat, Oman',
    channel: 'selfBilled',
    billCount: 4,
    amount: '1.320',
    amountNote: 'suppliersPage.note.dueInDays',
    amountNoteDays: 18,
    state: 'dueSoon',
  },
  {
    id: 'nizwa-dairy',
    name: 'Nizwa Dairy Supplies',
    subtitle: 'VAT OM1100530772',
    initials: 'ND',
    kind: 'business',
    contactName: 'Aisha Al Riyami',
    contactEmail: 'aisha@nizwadairy.om',
    location: 'Nizwa, Oman',
    channel: 'notConnected',
    billCount: 2,
    amount: '1.190',
    amountNote: 'suppliersPage.note.awaitingApproval',
    state: 'dueSoon',
  },
  {
    id: 'muscat-municipality',
    name: 'Muscat Municipality',
    subtitle: 'B2G · via Peppol',
    initials: 'MM',
    kind: 'government',
    contactName: 'Licensing Office',
    contactEmail: 'licensing@mm.gov.om',
    location: 'Muscat, Oman',
    channel: 'onPeppol',
    billCount: 1,
    state: 'settled',
  },
]

export const SUPPLIER_PAGE_NUMBERS = [1, 2, 3, 4, '...', 20] as const
