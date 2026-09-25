/**
 * Self-billed invoices (Figma 13:35608).
 *
 * Under a self-billing agreement the buyer raises the invoice on the supplier's behalf,
 * so these documents flow out through our ASP and are reported to the OTA like any other
 * invoice — but they need a signed agreement on file before they can be issued.
 */

export type SelfBillStatus =
  'draft' | 'toBeSent' | 'awaitingConfirmation' | 'disputed' | 'confirmed' | 'paid'

export type SelfBillTabId =
  'all' | 'drafts' | 'toSend' | 'awaiting' | 'disputed' | 'confirmed' | 'paid'

/** Peppol / OTA response, spelled out in the UI. Absent until the document is sent. */
export type SelfBillTransmission = 'accepted' | 'acknowledged' | 'rejected'

/** Tone of the agreement note under the supplier name. */
export type AgreementTone = 'ok' | 'expiring' | 'missing'

export type SelfBillRow = {
  id: string
  supplier: string
  agreementNote: string
  agreementTone: AgreementTone
  issued: string
  due: string
  amount: string
  /** Second line under the amount — either an overdue note or the VAT portion. */
  amountNote: string
  status: SelfBillStatus
  transmission?: SelfBillTransmission
}

export const SELF_BILL_KPI = [
  {
    id: 'raised',
    titleKey: 'selfBilling.kpi.raised',
    icon: 'raised',
    amount: '5,073.050',
    withCurrency: true,
    metaKey: 'selfBilling.kpi.raisedMeta',
  },
  {
    id: 'inputVat',
    titleKey: 'selfBilling.kpi.inputVat',
    icon: 'inputVat',
    amount: '241.575',
    withCurrency: true,
    metaKey: 'selfBilling.kpi.inputVatMeta',
  },
  {
    id: 'awaiting',
    titleKey: 'selfBilling.kpi.awaiting',
    icon: 'awaiting',
    amount: '3',
    withCurrency: false,
    metaKey: 'selfBilling.kpi.awaitingMeta',
  },
  {
    id: 'expiring',
    titleKey: 'selfBilling.kpi.expiring',
    icon: 'expiring',
    amount: '120.400',
    withCurrency: true,
    metaKey: 'selfBilling.kpi.expiringMeta',
    /** Figma prints this meta line in danger red. */
    metaDanger: true,
  },
] as const

export const SELF_BILL_TABS: {
  id: SelfBillTabId
  labelKey: string
  count: number
  danger?: boolean
}[] = [
  { id: 'all', labelKey: 'selfBilling.tabs.all', count: 342 },
  { id: 'drafts', labelKey: 'selfBilling.tabs.drafts', count: 4 },
  { id: 'toSend', labelKey: 'selfBilling.tabs.toSend', count: 6 },
  { id: 'awaiting', labelKey: 'selfBilling.tabs.awaiting', count: 9 },
  { id: 'disputed', labelKey: 'selfBilling.tabs.disputed', count: 2, danger: true },
  { id: 'confirmed', labelKey: 'selfBilling.tabs.confirmed', count: 3 },
  { id: 'paid', labelKey: 'selfBilling.tabs.paid', count: 3 },
]

/** Which statuses each tab gathers. */
export const SELF_BILL_TAB_STATUS: Record<SelfBillTabId, SelfBillStatus[]> = {
  all: [],
  drafts: ['draft'],
  toSend: ['toBeSent'],
  awaiting: ['awaitingConfirmation'],
  disputed: ['disputed'],
  confirmed: ['confirmed'],
  paid: ['paid'],
}

export const SELF_BILL_ROWS: SelfBillRow[] = [
  {
    id: 'SB-0114',
    supplier: 'Al Noor Dates LLC',
    agreementNote: 'Agreement expires in 9 days',
    agreementTone: 'expiring',
    issued: '24 Jul 2026',
    due: '23 Aug 2026',
    amount: '46.200',
    amountNote: '20 days overdue',
    status: 'awaitingConfirmation',
    transmission: 'acknowledged',
  },
  {
    id: 'SB-0113',
    supplier: 'Muscat Roastery Co',
    agreementNote: 'Agreement valid to 31 Dec 2026',
    agreementTone: 'ok',
    issued: '22 Jul 2026',
    due: '21 Aug 2026',
    amount: '842.750',
    amountNote: 'VAT 40.130',
    status: 'confirmed',
    transmission: 'accepted',
  },
  {
    id: 'SB-0112',
    supplier: 'Nizwa Dairy Farms',
    agreementNote: 'Not on Peppol · delivered by email',
    agreementTone: 'ok',
    issued: '21 Jul 2026',
    due: '20 Aug 2026',
    amount: '318.900',
    amountNote: 'VAT 15.185',
    status: 'disputed',
    transmission: 'rejected',
  },
  {
    id: 'SB-0111',
    supplier: 'Sohar Packaging LLC',
    agreementNote: 'Agreement valid to 04 Mar 2027',
    agreementTone: 'ok',
    issued: '20 Jul 2026',
    due: '19 Aug 2026',
    amount: '2,105.000',
    amountNote: 'VAT 100.240',
    status: 'paid',
    transmission: 'accepted',
  },
  {
    id: 'SB-0110',
    supplier: 'Barka Fresh Produce',
    agreementNote: 'Agreement valid to 12 Sep 2026',
    agreementTone: 'ok',
    issued: '19 Jul 2026',
    due: '18 Aug 2026',
    amount: '476.300',
    amountNote: 'VAT 22.680',
    status: 'toBeSent',
  },
  {
    id: 'SB-0109',
    supplier: 'Salalah Coconut Traders',
    agreementNote: 'No signed agreement: cannot be issued',
    agreementTone: 'missing',
    issued: '18 Jul 2026',
    due: '—',
    amount: '89.600',
    amountNote: 'VAT 4.270',
    status: 'draft',
  },
]

export const SELF_BILL_AGREEMENT_COUNT = 12

export const SELF_BILL_PAGE_NUMBERS = [1, 2, 3, 4, '...', 20] as const

export const matchesSelfBillTab = (row: SelfBillRow, tab: SelfBillTabId) => {
  const statuses = SELF_BILL_TAB_STATUS[tab]
  return statuses.length === 0 || statuses.includes(row.status)
}

export const countSelfBillTab = (tab: SelfBillTabId) =>
  SELF_BILL_ROWS.filter((row) => matchesSelfBillTab(row, tab)).length

/** Free-text match across the columns a person would search by. */
export const matchesSelfBillQuery = (row: SelfBillRow, query: string) => {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  return (
    row.id.toLowerCase().includes(needle) ||
    row.supplier.toLowerCase().includes(needle) ||
    row.amount.toLowerCase().includes(needle)
  )
}
