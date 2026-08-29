export type CreditNoteListStatus = 'toSend' | 'refundDue' | 'applied' | 'refunded' | 'draft'

export type CreditNoteTabId = 'all' | 'drafts' | 'toSend' | 'refundDue' | 'applied' | 'refunded'

export type CreditNoteRefund =
  | { kind: 'amount'; amount: string; hintKey: string }
  | { kind: 'applied'; hintKey: string }
  | { kind: 'none' }

export type CreditNoteRow = {
  id: string
  reason: string
  reverses: string
  customer: string
  subtitle: string
  issued: string
  creditAmount: string
  refund: CreditNoteRefund
  status: CreditNoteListStatus
}

export const CREDIT_NOTE_TABS: {
  id: CreditNoteTabId
  labelKey: string
  count: number
  danger?: boolean
}[] = [
  { id: 'all', labelKey: 'creditNotesPage.tabs.all', count: 342 },
  { id: 'drafts', labelKey: 'creditNotesPage.tabs.drafts', count: 4 },
  { id: 'toSend', labelKey: 'creditNotesPage.tabs.toSend', count: 6 },
  { id: 'refundDue', labelKey: 'creditNotesPage.tabs.refundDue', count: 9 },
  { id: 'applied', labelKey: 'creditNotesPage.tabs.applied', count: 2, danger: true },
  { id: 'refunded', labelKey: 'creditNotesPage.tabs.refunded', count: 3 },
]

export const CREDIT_NOTE_KPI = [
  {
    id: 'credited',
    titleKey: 'creditNotesPage.kpi.credited',
    amount: '69.060',
    metaKey: 'creditNotesPage.kpi.creditedMeta',
    icon: 'credited' as const,
  },
  {
    id: 'refundDue',
    titleKey: 'creditNotesPage.kpi.refundDue',
    amount: '16.070',
    metaKey: 'creditNotesPage.kpi.refundDueMeta',
    icon: 'refundDue' as const,
  },
  {
    id: 'applied',
    titleKey: 'creditNotesPage.kpi.applied',
    amount: '8.700',
    metaKey: 'creditNotesPage.kpi.appliedMeta',
    icon: 'applied' as const,
  },
  {
    id: 'refunded',
    titleKey: 'creditNotesPage.kpi.refunded',
    amount: '12.500',
    metaKey: 'creditNotesPage.kpi.refundedMeta',
    icon: 'refunded' as const,
  },
]

/** Temporary sample rows from Figma 23:688 — replace when API is ready. */
export const CREDIT_NOTE_ROWS: CreditNoteRow[] = [
  {
    id: 'CRN-0087',
    reason: 'Returned goods',
    reverses: 'INV-2044',
    customer: 'Muscat Grand Hotel LLC',
    subtitle: 'Ramadan 2026 supply',
    issued: '25 Jul 2026',
    creditAmount: '35.910',
    refund: { kind: 'amount', amount: '7.320', hintKey: 'creditNotesPage.refund.due' },
    status: 'toSend',
  },
  {
    id: 'CRN-0083',
    reason: 'Returned goods',
    reverses: 'INV-2035',
    customer: 'Sohar Grand Mall',
    subtitle: 'Al Bahja Coffee (Seeb)',
    issued: '21 Jul 2026',
    creditAmount: '8.750',
    refund: { kind: 'amount', amount: '8.750', hintKey: 'creditNotesPage.refund.due' },
    status: 'refundDue',
  },
  {
    id: 'CRN-0086',
    reason: 'Price correction',
    reverses: 'INV-2041',
    customer: 'Qurum Business Center',
    subtitle: 'Al Bahja Coffee (Seeb)',
    issued: '19 Jul 2026',
    creditAmount: '6.300',
    refund: { kind: 'applied', hintKey: 'creditNotesPage.refund.offset' },
    status: 'applied',
  },
  {
    id: 'CRN-0082',
    reason: 'Price correction',
    reverses: 'INV-2033',
    customer: 'Bahla Fort Restaurant',
    subtitle: 'Al Bahja Coffee (Main)',
    issued: '14 Jul 2026',
    creditAmount: '2.400',
    refund: { kind: 'applied', hintKey: 'creditNotesPage.refund.offset' },
    status: 'applied',
  },
  {
    id: 'CRN-0085',
    reason: 'Order cancelled',
    reverses: 'INV-2038',
    customer: 'Nizwa Souq Café',
    subtitle: 'Al Bahja Coffee (Main)',
    issued: '08 Jul 2026',
    creditAmount: '12.500',
    refund: { kind: 'amount', amount: '12.500', hintKey: 'creditNotesPage.refund.refundedOn' },
    status: 'refunded',
  },
  {
    id: 'CRN-0084',
    reason: 'Goodwill discount',
    reverses: 'INV-2037',
    customer: 'Salalah Beach Resort',
    subtitle: 'Al Bahja Coffee (Main)',
    issued: '—',
    creditAmount: '3.200',
    refund: { kind: 'none' },
    status: 'draft',
  },
]

/** Which statuses each tab gathers. */
export const CREDITNOTE_TAB_STATUS: Record<CreditNoteTabId, CreditNoteListStatus[]> = {
  all: [],
  drafts: ['draft'],
  toSend: ['toSend'],
  refundDue: ['refundDue'],
  applied: ['applied'],
  refunded: ['refunded'],
}

export const matchesCreditNoteTab = (row: CreditNoteRow, tab: CreditNoteTabId) => {
  const statuses = CREDITNOTE_TAB_STATUS[tab]
  return statuses.length === 0 || statuses.includes(row.status)
}

/** Counts come off the rows, so a tab cannot promise more than it shows. */
export const countCreditNoteTab = (tab: CreditNoteTabId) =>
  CREDIT_NOTE_ROWS.filter((row) => matchesCreditNoteTab(row, tab)).length

export const matchesCreditNoteQuery = (row: CreditNoteRow, query: string) => {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  return row.id.toLowerCase().includes(needle) || row.customer.toLowerCase().includes(needle)
}
