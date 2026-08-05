export type CustomerKind = 'business' | 'government' | 'consumer'

export type CustomerTabId = 'all' | CustomerKind

/** How the customer receives invoices. Consumers get a QR receipt; B2B/B2G go over Peppol. */
export type PeppolState = 'onPeppol' | 'notConnected' | 'qrReceipt'

/** Receivable state drives the colour of the amount cell. */
export type ReceivableState = 'overdue' | 'attention' | 'settled'

export type CustomerRow = {
  id: string
  name: string
  /** Second line under the name — VAT number for business, channel note for gov/consumer. */
  subtitle: string
  initials: string
  kind: CustomerKind
  contactName: string
  contactEmail: string
  location: string
  peppol: PeppolState
  invoiceCount: number
  /** Omitted when the customer has nothing outstanding. */
  amount?: string
  amountNote?: string
  /** Interpolated into `amountNote` when the note mentions a number of days. */
  amountNoteDays?: number
  state: ReceivableState
}

export const CUSTOMER_KPI = [
  {
    id: 'receivables',
    titleKey: 'customersPage.kpi.receivables',
    icon: 'receivables',
    amount: '217.490',
    withCurrency: true,
    metaKey: 'customersPage.kpi.receivablesMeta',
  },
  {
    id: 'overdue',
    titleKey: 'customersPage.kpi.overdue',
    icon: 'overdue',
    amount: '120.400',
    withCurrency: true,
    metaKey: 'customersPage.kpi.overdueMeta',
  },
  {
    id: 'customers',
    titleKey: 'customersPage.kpi.customers',
    icon: 'customers',
    amount: '8',
    withCurrency: false,
    metaKey: 'customersPage.kpi.customersMeta',
  },
  {
    id: 'peppol',
    titleKey: 'customersPage.kpi.peppolReady',
    icon: 'peppol',
    amount: '8',
    withCurrency: false,
    suffixKey: 'customersPage.kpi.ofTwelve',
    metaKey: 'customersPage.kpi.peppolMeta',
  },
] as const

export const CUSTOMER_TABS: { id: CustomerTabId; labelKey: string; count: number }[] = [
  { id: 'all', labelKey: 'customersPage.tabs.all', count: 8 },
  { id: 'business', labelKey: 'customersPage.tabs.business', count: 6 },
  { id: 'government', labelKey: 'customersPage.tabs.government', count: 1 },
  { id: 'consumer', labelKey: 'customersPage.tabs.consumer', count: 1 },
]

export const CUSTOMER_ROWS: CustomerRow[] = [
  {
    id: 'salalah-beach-resort',
    name: 'Salalah Beach Resort',
    subtitle: 'VAT OM1100582341',
    initials: 'SB',
    kind: 'business',
    contactName: 'Mariam Al Hinai',
    contactEmail: 'mariam@salalahbeach.om',
    location: 'Salalah, Oman',
    peppol: 'onPeppol',
    invoiceCount: 2,
    amount: '120.400',
    amountNote: 'customersPage.note.daysOverdue',
    amountNoteDays: 20,
    state: 'overdue',
  },
  {
    id: 'qurum-business-center',
    name: 'Qurum Business Center',
    subtitle: 'VAT OM1100337812',
    initials: 'QB',
    kind: 'business',
    contactName: 'Salim Al Farsi',
    contactEmail: 'accounts@qurumbc.om',
    location: 'Muscat, Oman',
    peppol: 'onPeppol',
    invoiceCount: 4,
    amount: '46.200',
    amountNote: 'customersPage.note.daysOverdue',
    amountNoteDays: 12,
    state: 'attention',
  },
  {
    id: 'muscat-grand-hotel',
    name: 'Muscat Grand Hotel LLC',
    subtitle: 'VAT OM1100447102',
    initials: 'MG',
    kind: 'business',
    contactName: 'Dana Al Balushi',
    contactEmail: 'dana@muscatgrand.om',
    location: 'Muscat, Oman',
    peppol: 'onPeppol',
    invoiceCount: 3,
    amount: '28.590',
    amountNote: 'customersPage.note.partiallyPaid',
    state: 'attention',
  },
  {
    id: 'bahla-fort-restaurant',
    name: 'Bahla Fort Restaurant',
    subtitle: 'VAT OM1100771290',
    initials: 'BF',
    kind: 'business',
    contactName: 'Khalid Al Amri',
    contactEmail: 'khalid@bahlafort.om',
    location: 'Bahla, Oman',
    peppol: 'notConnected',
    invoiceCount: 1,
    amount: '22.300',
    amountNote: 'customersPage.note.awaitingSend',
    state: 'attention',
  },
  {
    id: 'ministry-of-tourism',
    name: 'Ministry of Tourism',
    subtitle: 'B2G · via Peppol',
    initials: 'MT',
    kind: 'government',
    contactName: 'Procurement Office',
    contactEmail: 'procurement@mot.gov.om',
    location: 'Muscat, Oman',
    peppol: 'onPeppol',
    invoiceCount: 2,
    state: 'settled',
  },
  {
    id: 'ahmed-al-rawahi',
    name: 'Ahmed Al Rawahi',
    subtitle: 'B2C · QR receipt',
    initials: 'AR',
    kind: 'consumer',
    contactName: 'Ahmed Al Rawahi',
    contactEmail: 'ahmed.r@gmail.com',
    location: 'Muscat, Oman',
    peppol: 'qrReceipt',
    invoiceCount: 1,
    state: 'settled',
  },
]

export const CUSTOMER_PAGE_NUMBERS = [1, 2, 3, 4, '...', 20] as const
