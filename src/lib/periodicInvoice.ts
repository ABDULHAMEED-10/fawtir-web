export type PeriodicFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export const PERIODIC_SERIES = {
  title: 'Monthly coffee supply, Muscat Grand Hotel',
  status: 'active' as const,
  cadence: 'Every month on the 18th',
  nextRun: '18 Aug 2026',
  customer: {
    name: 'Muscat Grand Hotel LLC',
    vat: 'VAT OM1100447102 · 0248:OM1100447102',
  },
  subject: 'Monthly coffee supply & barista training',
  poReference: 'PO-88213',
  paymentTerms: 'Net 30 days',
  currency: 'OMR - Omani Rial',
  taxCategory: 'Standard rate · 5%',
  branch: 'Al Bahja Coffee (Main)',
  project: 'Ramadan 2026 supply',
  noteCustomer:
    'Thank you for your continued business. This invoice is issued automatically under our supply agreement.',
  noteInternal: 'Auto-generated from REC series. Confirm stock before each run.',
  items: [
    {
      id: '1',
      description: 'Cappuccino - Large',
      excl: '1.800',
      vat: '5%',
      qty: '12',
      unit: 'EA',
      discount: '0',
      total: '21.600',
    },
    {
      id: '2',
      description: 'Coffee Beans 1kg - House Blend',
      excl: '9.500',
      vat: '5%',
      qty: '4',
      unit: 'KG',
      discount: '10%',
      total: '34.200',
    },
  ],
  totals: {
    excluding: '55.800',
    vat: '2.790',
    total: '58.590',
  },
  generated: [
    {
      id: 'INV-2044',
      meta: 'Issued 18 Jul 2026 · sent via Peppol',
      status: 'partial' as const,
      amount: '58.590',
    },
  ],
  schedule: {
    summary: 'Every month on the 18th, until you stop it.',
    nextIn: 'Next in 23 days',
    frequency: 'monthly' as PeriodicFrequency,
    repeatsOn: 'Day 18 of each month',
    starts: '18 Jul 2026',
    ends: 'Never',
    sendAutomatically: true,
    notifyOnRun: true,
  },
  upcoming: [
    { date: '18 Aug 2026', amount: '58.590' },
    { date: '18 Sep 2026', amount: '58.590' },
    { date: '18 Oct 2026', amount: '58.590' },
    { date: '18 Nov 2026', amount: '58.590' },
  ],
  started: '18 Jul 2026',
  issuedCount: 1,
}

export type PeriodicSeries = typeof PERIODIC_SERIES

/**
 * Blank series for the creation screen. Same shape as PERIODIC_SERIES so the page can
 * render one layout in three modes (create / edit / view) instead of triplicating it.
 */
export const EMPTY_PERIODIC_SERIES: PeriodicSeries = {
  title: '',
  status: 'active',
  cadence: '',
  nextRun: '',
  customer: {
    name: 'Sohar Grand Mall',
    vat: 'VAT OM1100908455 · 0248:OM1100908455',
  },
  subject: 'Quarterly kiosk restock — beans & consumables',
  poReference: 'PO-90417',
  paymentTerms: 'Net 30 days',
  currency: 'OMR - Omani Rial',
  taxCategory: 'Standard rate · 5%',
  branch: 'Al Bahja Coffee (Sohar)',
  project: 'Mall kiosk supply',
  noteCustomer:
    'Issued automatically each quarter under our kiosk supply agreement. Please settle within 30 days.',
  noteInternal: 'New series — confirm the first delivery window with the mall operations team.',
  items: [
    {
      id: '1',
      description: 'Coffee Beans 1kg - House Blend',
      excl: '9.500',
      vat: '5%',
      qty: '20',
      unit: 'KG',
      discount: '5%',
      total: '180.500',
    },
    {
      id: '2',
      description: 'Paper Cups 12oz (sleeve of 50)',
      excl: '2.400',
      vat: '5%',
      qty: '30',
      unit: 'EA',
      discount: '0',
      total: '72.000',
    },
  ],
  totals: { excluding: '252.500', vat: '12.625', total: '265.125' },
  // A series that does not exist yet has no history — both bands stay hidden in create mode.
  generated: [],
  schedule: {
    summary: 'Every quarter on the 1st, until you stop it.',
    nextIn: 'First run in 68 days',
    frequency: 'quarterly',
    repeatsOn: '1st day of each quarter',
    starts: '01 Oct 2026',
    ends: 'Never',
    sendAutomatically: true,
    notifyOnRun: true,
  },
  upcoming: [],
  started: '',
  issuedCount: 0,
}

/* ── Periodic invoices list (Figma 13:39172) ─────────────────────────────── */

export type ScheduleStatus = 'active' | 'onRequest' | 'paused' | 'draft'

export type ScheduleTabId = 'all' | ScheduleStatus

export type ScheduleRow = {
  id: string
  name: string
  /** Second line under the schedule name. */
  reference: string
  customer: string
  frequency: string
  /** Second line under the frequency, e.g. "on the 18th". */
  cadence: string
  /** Em dash when the series has no scheduled run. */
  nextInvoice: string
  nextInvoiceNote?: string
  perInvoice: string
  generated: string
  generatedNote?: string
  status: ScheduleStatus
}

export const SCHEDULE_KPI = [
  {
    id: 'revenue',
    titleKey: 'periodicList.kpi.revenue',
    icon: 'revenue',
    amount: '105.760',
    withCurrency: true,
    suffixKey: 'periodicList.kpi.perMonth',
    metaKey: 'periodicList.kpi.revenueMeta',
  },
  {
    id: 'due',
    titleKey: 'periodicList.kpi.due',
    icon: 'due',
    amount: '84.190',
    withCurrency: true,
    metaKey: 'periodicList.kpi.dueMeta',
  },
  {
    id: 'generated',
    titleKey: 'periodicList.kpi.generated',
    icon: 'generated',
    amount: '84.590',
    withCurrency: true,
    metaKey: 'periodicList.kpi.generatedMeta',
  },
  {
    id: 'attention',
    titleKey: 'periodicList.kpi.attention',
    icon: 'attention',
    amount: '2',
    withCurrency: false,
    metaKey: 'periodicList.kpi.attentionMeta',
  },
] as const

export const SCHEDULE_TABS: { id: ScheduleTabId; labelKey: string; count: number }[] = [
  { id: 'all', labelKey: 'periodicList.tabs.all', count: 6 },
  { id: 'active', labelKey: 'periodicList.tabs.active', count: 3 },
  { id: 'onRequest', labelKey: 'periodicList.tabs.onRequest', count: 1 },
  { id: 'paused', labelKey: 'periodicList.tabs.paused', count: 1 },
  { id: 'draft', labelKey: 'periodicList.tabs.draft', count: 1 },
]

export const SCHEDULE_ROWS: ScheduleRow[] = [
  {
    id: 'monthly-coffee-supply',
    name: 'Monthly coffee supply',
    reference: 'Barista training · PO-88213',
    customer: 'Muscat Grand Hotel LLC',
    frequency: 'Monthly',
    cadence: 'on the 18th',
    nextInvoice: '18 Aug 2026',
    nextInvoiceNote: 'in 24 days',
    perInvoice: '58.590',
    generated: '1 issued',
    generatedNote: 'last 18 Jul',
    status: 'active',
  },
  {
    id: 'weekly-espresso-beans',
    name: 'Weekly espresso beans',
    reference: 'Kitchen restock',
    customer: 'Bahla Fort Restaurant',
    frequency: 'Weekly',
    cadence: 'Saturdays',
    nextInvoice: '01 Aug 2026',
    nextInvoiceNote: 'in 6 days',
    perInvoice: '6.400',
    generated: '8 issued',
    generatedNote: 'last 25 Jul',
    status: 'active',
  },
  {
    id: 'quarterly-kiosk-restock',
    name: 'Quarterly kiosk restock',
    reference: 'Mall kiosk supply',
    customer: 'Sohar Grand Mall',
    frequency: 'Quarterly',
    cadence: '1st of quarter',
    nextInvoice: '01 Oct 2026',
    nextInvoiceNote: 'in 68 days',
    perInvoice: '58.300',
    generated: '3 issued',
    generatedNote: 'last 01 Jul',
    status: 'active',
  },
  {
    id: 'office-catering',
    name: 'Office catering',
    reference: 'Ad-hoc events',
    customer: 'Qurum Business Center',
    frequency: 'On request',
    cadence: 'generate manually',
    nextInvoice: '—',
    perInvoice: '46.200',
    generated: '5 issued',
    generatedNote: 'last 30 Jun',
    status: 'onRequest',
  },
  {
    id: 'ramadan-popup-supply',
    name: 'Ramadan pop-up supply',
    reference: 'Seasonal · resumes Feb',
    customer: 'Nizwa Souq Café',
    frequency: 'Monthly',
    cadence: 'on the 20th',
    nextInvoice: 'Paused',
    perInvoice: '34.100',
    generated: '4 issued',
    generatedNote: 'last 20 Mar',
    status: 'paused',
  },
  {
    id: 'grand-opening-series',
    name: 'Grand opening series',
    reference: 'Not activated yet',
    customer: 'Al Mouj Marina Café',
    frequency: 'Not scheduled',
    cadence: 'set a frequency',
    nextInvoice: '—',
    perInvoice: '15.750',
    generated: 'Not issued',
    status: 'draft',
  },
]

export const SCHEDULE_PAGE_NUMBERS = [1, 2, 3, 4, '...', 20] as const
