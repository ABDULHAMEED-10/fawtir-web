/**
 * Quotations management (Figma 13:37426).
 *
 * A quotation is the first document in the trade chain, so every row carries a
 * four-step progress tracker (Quote, Order, Deliver, Invoice) showing how far
 * the deal has travelled. Only the quote step is reachable until the customer accepts.
 */

import type { StepState, TrackerStep } from '../components/ui'

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'delivering' | 'expiring' | 'declined'

export type QuotationTabId =
  | 'all'
  | 'drafts'
  | 'sent'
  | 'expiring'
  | 'accepted'
  | 'declined'
  | 'expired'

export type QuotationStep = TrackerStep

export type QuotationRow = {
  id: string
  subject: string
  customer: string
  /** The customer record (mock API ids), so an invoice made from the quote can name it. */
  customerId: string
  /** Days of validity left, when the quote is still open. Drives "Expiring soon". */
  daysLeft?: number
  branch: string
  validUntil: string
  /** Sub-line under the date — sand when expiring, red when declined. */
  validNote: string
  validNoteTone: 'normal' | 'warning' | 'danger'
  amount: string
  steps: QuotationStep[]
  status: QuotationStatus
  /** Some rows label the pill with progress ("60% delivered") instead of the status. */
  statusLabel?: string
}

/**
 * Tab counts, the KPI cards and the subtitle are all counted from the rows the page holds, so a
 * tab's number is always the number of rows it shows (the design's figures, 32 in "All" against
 * 24 in the subtitle and 9 expiring against 2 on the card, contradicted each other).
 * TODO(backend): TRADE_DOCUMENTS.md row T.7 (list totals and summary from the server).
 */
export const QUOTATION_TABS: { id: QuotationTabId; labelKey: string; tone?: 'danger' }[] = [
  { id: 'all', labelKey: 'quotations.tabs.all' },
  { id: 'drafts', labelKey: 'quotations.tabs.drafts' },
  { id: 'sent', labelKey: 'quotations.tabs.sent' },
  { id: 'expiring', labelKey: 'quotations.tabs.expiring' },
  { id: 'accepted', labelKey: 'quotations.tabs.accepted' },
  { id: 'declined', labelKey: 'quotations.tabs.declined', tone: 'danger' },
  { id: 'expired', labelKey: 'quotations.tabs.expired' },
]

const TAB_STATUSES: Record<QuotationTabId, QuotationStatus[] | null> = {
  all: null,
  drafts: ['draft'],
  sent: ['sent'],
  expiring: ['expiring'],
  accepted: ['accepted', 'delivering'],
  declined: ['declined'],
  // No stored "expired" status yet: a lapsed quote reads as expired once the API says so.
  expired: [],
}

export function quotationsInTab(rows: QuotationRow[], tab: QuotationTabId): QuotationRow[] {
  const statuses = TAB_STATUSES[tab]
  return statuses === null ? rows : rows.filter((row) => statuses.includes(row.status))
}

export function quotationTabCount(rows: QuotationRow[], tab: QuotationTabId): number {
  return quotationsInTab(rows, tab).length
}

const amountOf = (row: QuotationRow) => Number(row.amount.replace(/,/g, ''))
const money = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

export type QuotationKpi = {
  id: 'open' | 'accepted' | 'winrate' | 'expiring'
  icon: 'open' | 'accepted' | 'winrate' | 'expiring'
  titleKey: string
  amount: string
  metaKey: string
  metaValues: Record<string, string | number>
  /** Win rate is a percentage and the expiring card a count; neither shows the rial sign. */
  showCurrency: boolean
  /** Only the "Open" card carries the leading plus. */
  plus?: boolean
}

/** The four cards and the subtitle, counted from the rows. */
export function quotationSummary(rows: QuotationRow[]) {
  const open = rows.filter((row) => row.status === 'sent' || row.status === 'expiring')
  const won = rows.filter((row) => row.status === 'accepted' || row.status === 'delivering')
  const lost = rows.filter((row) => row.status === 'declined')
  const wonValue = won.reduce((total, row) => total + amountOf(row), 0)
  const lostValue = lost.reduce((total, row) => total + amountOf(row), 0)
  const openValue = open.reduce((total, row) => total + amountOf(row), 0)
  const expiring = rows
    .filter((row) => row.status === 'expiring')
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
  // An accepted quote has turned into an order once its Order step is done.
  const ordered = won.filter((row) => row.steps[1]?.state === 'done').length
  const winRate =
    wonValue + lostValue === 0 ? 0 : Math.round((wonValue / (wonValue + lostValue)) * 100)
  const kpis: QuotationKpi[] = [
    {
      id: 'open',
      icon: 'open',
      titleKey: 'quotations.kpi.open',
      amount: money(openValue),
      metaKey: 'quotations.kpi.openMetaCount',
      metaValues: { count: open.length },
      showCurrency: true,
      plus: true,
    },
    {
      id: 'accepted',
      icon: 'accepted',
      titleKey: 'quotations.kpi.accepted',
      amount: money(wonValue),
      metaKey: 'quotations.kpi.acceptedMetaCount',
      metaValues: { count: ordered },
      showCurrency: true,
    },
    {
      id: 'winrate',
      icon: 'winrate',
      titleKey: 'quotations.kpi.winRate',
      amount: `${winRate}%`,
      metaKey: 'quotations.kpi.winRateMeta',
      metaValues: {},
      showCurrency: false,
    },
    {
      id: 'expiring',
      icon: 'expiring',
      titleKey: 'quotations.kpi.expiring',
      amount: String(expiring.length),
      metaKey: expiring[0] ? 'quotations.kpi.expiringMetaNext' : 'quotations.kpi.expiringMetaNone',
      metaValues: expiring[0]
        ? { subject: expiring[0].subject, count: expiring[0].daysLeft ?? 0 }
        : {},
      showCurrency: false,
    },
  ]
  return { kpis, count: rows.length, openAmount: money(openValue) }
}

const STEP_KEYS = [
  'quotations.step.quote',
  'quotations.step.order',
  'quotations.step.deliver',
  'quotations.step.invoice',
]

/** Builds the four-step tracker from the states of each step, in order. */
function steps(...states: StepState[]): QuotationStep[] {
  return STEP_KEYS.map((labelKey, i) => ({ labelKey, state: states[i] ?? 'future' }))
}

export const QUOTATION_ROWS: QuotationRow[] = [
  {
    id: 'QUO-0142',
    subject: 'Bulk bean supply',
    customer: 'Muscat Grand Hotel LLC',
    customerId: 'c-grand',
    daysLeft: 28,
    // The design printed the subject ("Ramadan 2026 supply") in the branch slot.
    branch: 'Al Bahja Coffee (Main)',
    validUntil: '27 Aug 2026',
    validNote: '28 days left',
    validNoteTone: 'normal',
    amount: '8,420.500',
    steps: steps('current'),
    status: 'sent',
  },
  {
    id: 'QUO-0141',
    subject: 'Seeb store fit-out',
    customer: 'Sohar Grand Mall',
    customerId: 'c-sohar',
    branch: 'Al Bahja Coffee (Seeb)',
    validUntil: '23 Aug 2026',
    validNote: 'Accepted 26 Jul',
    validNoteTone: 'normal',
    amount: '12,900.000',
    steps: steps('done', 'current'),
    status: 'accepted',
  },
  {
    id: 'QUO-0140',
    subject: 'Quarterly bean supply',
    customer: 'Qurum Business Center',
    customerId: 'c-qurum',
    branch: 'Al Bahja Coffee (Seeb)',
    validUntil: '04 Aug 2026',
    validNote: 'Accepted 22 Jul',
    validNoteTone: 'normal',
    amount: '1,240.000',
    steps: steps('done', 'done', 'pending'),
    status: 'delivering',
    statusLabel: '60% delivered',
  },
  {
    id: 'QUO-0139',
    subject: 'Staff training package',
    customer: 'Bahla Fort Restaurant',
    customerId: 'c-bahla',
    daysLeft: 2,
    branch: 'Al Bahja Coffee (Main)',
    validUntil: '01 Aug 2026',
    validNote: 'Expires in 2 days',
    validNoteTone: 'warning',
    amount: '640.000',
    steps: steps('current'),
    status: 'expiring',
  },
  {
    id: 'QUO-0138',
    subject: 'Espresso machine lease',
    customer: 'Nizwa Souq Café',
    customerId: 'c-nizwa',
    branch: 'Al Bahja Coffee (Main)',
    validUntil: '26 Jul 2026',
    validNote: 'Declined: price',
    validNoteTone: 'danger',
    amount: '2,180.000',
    steps: steps('declined'),
    status: 'declined',
  },
  {
    id: 'QUO-0137',
    subject: 'Annual roastery contract',
    customer: 'Qurum Business Center',
    customerId: 'c-qurum',
    branch: 'Al Bahja Coffee (Seeb)',
    validUntil: '—',
    validNote: '',
    validNoteTone: 'normal',
    amount: '980.000',
    steps: steps('draft'),
    status: 'draft',
  },
]

/** Six rows a page, as the design's "Show result: 6". */
export const QUOTATION_PAGE_SIZE = 6
