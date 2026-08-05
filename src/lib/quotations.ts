/**
 * Quotations management (Figma 13:37426).
 *
 * A quotation is the first document in the trade chain, so every row carries a
 * four-step progress tracker — Quote → Order → Deliver → Invoice — showing how far
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

export const QUOTATION_TABS: { id: QuotationTabId; labelKey: string; count: string; tone?: 'danger' }[] =
  [
    { id: 'all', labelKey: 'quotations.tabs.all', count: '32' },
    { id: 'drafts', labelKey: 'quotations.tabs.drafts', count: '4' },
    { id: 'sent', labelKey: 'quotations.tabs.sent', count: '6' },
    { id: 'expiring', labelKey: 'quotations.tabs.expiring', count: '9' },
    { id: 'accepted', labelKey: 'quotations.tabs.accepted', count: '9' },
    { id: 'declined', labelKey: 'quotations.tabs.declined', count: '1', tone: 'danger' },
    { id: 'expired', labelKey: 'quotations.tabs.expired', count: '3' },
  ]

export const QUOTATION_KPI: {
  id: string
  icon: 'open' | 'accepted' | 'winrate' | 'expiring'
  titleKey: string
  amount: string
  metaKey: string
  /** Win rate is a percentage and the expiring card a count — neither shows the OMR mark. */
  showCurrency: boolean
  /** Only the "Open" card carries the leading plus. */
  plus?: boolean
}[] = [
  {
    id: 'open',
    icon: 'open',
    titleKey: 'quotations.kpi.open',
    amount: '22,480.500',
    metaKey: 'quotations.kpi.openMeta',
    showCurrency: true,
    plus: true,
  },
  {
    id: 'accepted',
    icon: 'accepted',
    titleKey: 'quotations.kpi.accepted',
    amount: '14,140.000',
    metaKey: 'quotations.kpi.acceptedMeta',
    showCurrency: true,
  },
  {
    id: 'winrate',
    icon: 'winrate',
    titleKey: 'quotations.kpi.winRate',
    amount: '62%',
    metaKey: 'quotations.kpi.winRateMeta',
    showCurrency: false,
  },
  {
    id: 'expiring',
    icon: 'expiring',
    titleKey: 'quotations.kpi.expiring',
    amount: '2',
    metaKey: 'quotations.kpi.expiringMeta',
    showCurrency: false,
  },
]

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
    branch: 'Ramadan 2026 supply',
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
    branch: 'Al Bahja Coffee (Main)',
    validUntil: '26 Jul 2026',
    validNote: 'Declined — price',
    validNoteTone: 'danger',
    amount: '2,180.000',
    steps: steps('declined'),
    status: 'declined',
  },
  {
    id: 'QUO-0137',
    subject: 'Annual roastery contract',
    customer: 'Qurum Business Center',
    branch: 'Al Bahja Coffee (Seeb)',
    validUntil: '—',
    validNote: '',
    validNoteTone: 'normal',
    amount: '980.000',
    steps: steps('draft'),
    status: 'draft',
  },
]

export const QUOTATION_PAGE_NUMBERS = ['1', '2', '3', '4', '...', '20']
