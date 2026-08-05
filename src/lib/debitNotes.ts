/**
 * Debit notes (Figma 13:36992).
 *
 * A debit note *increases* what the customer owes — the opposite of a credit note —
 * so every amount carries a green "+" prefix and adds to the adjusted invoice's balance.
 */

export type DebitNoteStatus = 'draft' | 'toBeSent' | 'awaitingPayment' | 'overdue' | 'paid'

export type DebitNoteTabId = 'all' | 'drafts' | 'toSend' | 'awaiting' | 'overdue' | 'paid'

/** Tone of the small line under the payment column. */
export type PaymentNoteTone = 'normal' | 'danger'

export type DebitNoteRow = {
  id: string
  reason: string
  adjustsInvoice: string
  customer: string
  branch: string
  issued: string
  amount: string
  payment: string
  paymentNote: string
  paymentNoteTone: PaymentNoteTone
  status: DebitNoteStatus
}

export const DEBIT_NOTE_KPI = [
  {
    id: 'charged',
    titleKey: 'debitNotes.kpi.charged',
    icon: 'charged',
    amount: '69.060',
    /** Figma prints this figure in green with a leading plus. */
    positive: true,
    metaKey: 'debitNotes.kpi.chargedMeta',
    metaTone: 'normal',
  },
  {
    id: 'awaiting',
    titleKey: 'debitNotes.kpi.awaiting',
    icon: 'awaiting',
    amount: '16.070',
    positive: false,
    metaKey: 'debitNotes.kpi.awaitingMeta',
    metaTone: 'normal',
  },
  {
    id: 'collected',
    titleKey: 'debitNotes.kpi.collected',
    icon: 'collected',
    amount: '12.500',
    positive: false,
    metaKey: 'debitNotes.kpi.collectedMeta',
    metaTone: 'normal',
  },
  {
    id: 'overdue',
    titleKey: 'debitNotes.kpi.overdue',
    icon: 'overdue',
    amount: '8.700',
    positive: false,
    danger: true,
    metaKey: 'debitNotes.kpi.overdueMeta',
    metaTone: 'danger',
  },
] as const

export const DEBIT_NOTE_TABS: {
  id: DebitNoteTabId
  labelKey: string
  count: number
  danger?: boolean
}[] = [
  { id: 'all', labelKey: 'debitNotes.tabs.all', count: 32 },
  { id: 'drafts', labelKey: 'debitNotes.tabs.drafts', count: 4 },
  { id: 'toSend', labelKey: 'debitNotes.tabs.toSend', count: 6 },
  { id: 'awaiting', labelKey: 'debitNotes.tabs.awaiting', count: 9 },
  { id: 'overdue', labelKey: 'debitNotes.tabs.overdue', count: 1, danger: true },
  { id: 'paid', labelKey: 'debitNotes.tabs.paid', count: 3 },
]

export const DEBIT_NOTE_ROWS: DebitNoteRow[] = [
  {
    id: 'DBN-0042',
    reason: 'Undercharged',
    adjustsInvoice: 'INV-2044',
    customer: 'Muscat Grand Hotel LLC',
    branch: 'Ramadan 2026 supply',
    issued: '28 Jul 2026',
    amount: '35.910',
    payment: 'Due 27 Aug',
    paymentNote: 'Added to invoice balance',
    paymentNoteTone: 'normal',
    status: 'toBeSent',
  },
  {
    id: 'DBN-0041',
    reason: 'Additional delivery',
    adjustsInvoice: 'INV-2035',
    customer: 'Sohar Grand Mall',
    branch: 'Al Bahja Coffee (Seeb)',
    issued: '21 Jul 2026',
    amount: '8.750',
    payment: 'Due 25 Aug',
    paymentNote: 'In 26 days',
    paymentNoteTone: 'normal',
    status: 'awaitingPayment',
  },
  {
    id: 'DBN-0040',
    reason: 'Freight omitted',
    adjustsInvoice: 'INV-2041',
    customer: 'Qurum Business Center',
    branch: 'Al Bahja Coffee (Seeb)',
    issued: '19 Jul 2026',
    amount: '6.300',
    payment: 'Due 18 Jul',
    paymentNote: '12 days late',
    paymentNoteTone: 'danger',
    status: 'overdue',
  },
  {
    id: 'DBN-0039',
    reason: 'VAT correction',
    adjustsInvoice: 'INV-2033',
    customer: 'Bahla Fort Restaurant',
    branch: 'Al Bahja Coffee (Main)',
    issued: '14 Jul 2026',
    amount: '2.400',
    payment: 'Paid 21 Jul',
    paymentNote: 'Bank transfer',
    paymentNoteTone: 'normal',
    status: 'paid',
  },
  {
    id: 'DBN-0038',
    reason: 'Late payment charge',
    adjustsInvoice: 'INV-2038',
    customer: 'Nizwa Souq Café',
    branch: 'Al Bahja Coffee (Main)',
    issued: '08 Jul 2026',
    amount: '12.500',
    payment: 'Paid 16 Jul',
    paymentNote: 'Cash',
    paymentNoteTone: 'normal',
    status: 'paid',
  },
  {
    id: 'DBN-0037',
    reason: 'Price escalation',
    adjustsInvoice: 'INV-2037',
    customer: 'Qurum Business Center',
    branch: 'Al Bahja Coffee (Seeb)',
    issued: '—',
    amount: '3.200',
    payment: '—',
    paymentNote: '',
    paymentNoteTone: 'normal',
    status: 'draft',
  },
]

export const DEBIT_NOTE_PAGE_NUMBERS = [1, 2, 3, 4, '...', 20] as const
