export type InvoiceListStatus = 'overdue' | 'awaiting' | 'partial' | 'toSend' | 'paid' | 'draft'

export type InvoiceTabId = 'all' | 'drafts' | 'toSend' | 'awaiting' | 'overdue' | 'paid'

/**
 * Peppol / OTA response codes. Figma prints the raw codes; the UI spells them out.
 *  - `accepted`     (AP) cleared and confirmed by the OTA
 *  - `acknowledged` (AB) accepted, but confirmation is still outstanding
 *  - `rejected`     (RE) refused — the invoice must be corrected and resent
 * Omitted while the invoice has never left the building (draft / not sent).
 */
export type TransmissionState = 'accepted' | 'acknowledged' | 'rejected'

/**
 * Clearance track the invoice follows.
 *
 * Credit and debit notes are not listed here — they have their own sidebar pages — so the
 * split that actually matters on this screen is the one Oman's mandate draws: standard
 * invoices are cleared through Peppol before the buyer sees them, simplified (B2C) ones are
 * issued at the point of sale and reported afterwards.
 */
export type InvoiceKind = 'standard' | 'simplified'

/** How the invoice reached the buyer — drives the Channel filter. */
export type InvoiceChannel = 'peppol' | 'email'

export type InvoiceRow = {
  id: string
  customer: string
  subtitle: string
  issued: string
  due: string
  amount: string
  status: InvoiceListStatus
  transmission?: TransmissionState
  kind: InvoiceKind
  channel: InvoiceChannel
}

/**
 * Reference "today" for the period filter.
 *
 * The seeded rows are dated July 2026, so a real `new Date()` would put every one of them
 * outside "This month" and the list would look broken. The backend will send server-clock
 * ranges with the query; until then this constant stands in for it.
 */
export const LIST_TODAY = '31 Jul 2026'

export type PeriodId = 'thisMonth' | 'lastMonth' | 'last3Months' | 'thisYear' | 'all'

export const PERIOD_OPTIONS: { id: PeriodId; labelKey: string }[] = [
  { id: 'thisMonth', labelKey: 'invoicesPage.filters.period.thisMonth' },
  { id: 'lastMonth', labelKey: 'invoicesPage.filters.period.lastMonth' },
  { id: 'last3Months', labelKey: 'invoicesPage.filters.period.last3Months' },
  { id: 'thisYear', labelKey: 'invoicesPage.filters.period.thisYear' },
  { id: 'all', labelKey: 'invoicesPage.filters.period.all' },
]

export const INVOICE_KIND_OPTIONS: { id: InvoiceKind; labelKey: string }[] = [
  { id: 'standard', labelKey: 'invoicesPage.filters.kind.standard' },
  { id: 'simplified', labelKey: 'invoicesPage.filters.kind.simplified' },
]

export const CHANNEL_OPTIONS: { id: InvoiceChannel; labelKey: string }[] = [
  { id: 'peppol', labelKey: 'invoicesPage.filters.chan.peppol' },
  { id: 'email', labelKey: 'invoicesPage.filters.chan.email' },
]

/** Inclusive start of the window a period covers, measured back from {@link LIST_TODAY}. */
export function periodStart(period: PeriodId, today = new Date(LIST_TODAY)): Date | null {
  const year = today.getFullYear()
  const month = today.getMonth()
  switch (period) {
    case 'thisMonth':
      return new Date(year, month, 1)
    case 'lastMonth':
      return new Date(year, month - 1, 1)
    case 'last3Months':
      return new Date(year, month - 2, 1)
    case 'thisYear':
      return new Date(year, 0, 1)
    default:
      return null
  }
}

/** Exclusive end — only "last month" stops before today. */
export function periodEnd(period: PeriodId, today = new Date(LIST_TODAY)): Date | null {
  if (period !== 'lastMonth') return null
  return new Date(today.getFullYear(), today.getMonth(), 1)
}

export const INVOICE_TABS: {
  id: InvoiceTabId
  labelKey: string
  count: number
  danger?: boolean
}[] = [
  { id: 'all', labelKey: 'invoicesPage.tabs.all', count: 342 },
  { id: 'drafts', labelKey: 'invoicesPage.tabs.drafts', count: 4 },
  { id: 'toSend', labelKey: 'invoicesPage.tabs.toSend', count: 6 },
  { id: 'awaiting', labelKey: 'invoicesPage.tabs.awaiting', count: 9 },
  { id: 'overdue', labelKey: 'invoicesPage.tabs.overdue', count: 2, danger: true },
  { id: 'paid', labelKey: 'invoicesPage.tabs.paid', count: 3 },
]

export const INVOICE_KPI = [
  {
    id: 'outstanding',
    titleKey: 'invoicesPage.kpi.outstanding',
    amount: '217.490',
    metaKey: 'invoicesPage.kpi.outstandingMeta',
    icon: 'outstanding' as const,
  },
  {
    id: 'paid',
    titleKey: 'invoicesPage.kpi.paid',
    amount: '92.400',
    metaKey: 'invoicesPage.kpi.paidMeta',
    icon: 'paid' as const,
  },
  {
    id: 'awaiting',
    titleKey: 'invoicesPage.kpi.awaiting',
    amount: '74.790',
    metaKey: 'invoicesPage.kpi.awaitingMeta',
    icon: 'awaiting' as const,
  },
  {
    id: 'overdue',
    titleKey: 'invoicesPage.kpi.overdue',
    amount: '120.400',
    metaKey: 'invoicesPage.kpi.overdueMeta',
    icon: 'overdue' as const,
  },
]

export const INVOICE_ROWS: InvoiceRow[] = [
  {
    id: 'INV-2043',
    customer: 'Salalah Beach Resort',
    subtitle: 'Al Bahja Coffee (Main)',
    issued: '18 Jul 2026',
    due: '05 Jul 2026',
    amount: '120.400',
    status: 'overdue',
    transmission: 'rejected',
    kind: 'standard',
    channel: 'peppol',
  },
  {
    id: 'INV-2042',
    customer: 'Qurum Business Center',
    subtitle: 'Al Bahja Coffee (Seeb)',
    issued: '18 Jul 2026',
    due: '30 Jul 2026',
    amount: '46.200',
    status: 'awaiting',
    transmission: 'acknowledged',
    kind: 'standard',
    channel: 'peppol',
  },
  {
    id: 'INV-2041',
    customer: 'Muscat Grand Hotel LLC',
    subtitle: 'Ramadan 2026 supply',
    issued: '17 Jul 2026',
    due: '17 Aug 2026',
    amount: '58.590',
    status: 'partial',
    transmission: 'acknowledged',
    kind: 'standard',
    channel: 'peppol',
  },
  {
    id: 'INV-2040',
    customer: 'Bahla Fort Restaurant',
    subtitle: 'Al Bahja Coffee (Main)',
    issued: '17 Jul 2026',
    due: '20 Aug 2026',
    amount: '22.300',
    status: 'toSend',
    transmission: 'acknowledged',
    kind: 'standard',
    channel: 'email',
  },
  {
    id: 'INV-2038',
    customer: 'Al Mouj Marina Café',
    subtitle: 'Not issued yet',
    issued: '16 Jul 2026',
    due: '11 Aug 2026',
    amount: '15.750',
    status: 'paid',
    transmission: 'accepted',
    kind: 'simplified',
    channel: 'email',
  },
  {
    id: 'INV-2039',
    customer: 'Salalah Resort',
    subtitle: 'B2B · Not sent',
    issued: '15 Jul 2026',
    due: '28 Jul 2026',
    amount: '34.100',
    status: 'draft',
    kind: 'standard',
    channel: 'email',
  },
]
