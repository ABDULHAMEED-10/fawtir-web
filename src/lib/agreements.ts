/**
 * Self-billing agreements (Figma 13:36034).
 *
 * A supplier must have an active agreement on file before a self-billed invoice can be
 * raised for them — except where the arrangement is statutory (reverse charge), which
 * regulation authorises without a signature.
 */

export type AgreementStatus =
  'active' | 'expiringSoon' | 'awaitingAcceptance' | 'expired' | 'terminated'

export type AgreementTabId =
  'all' | 'active' | 'awaiting' | 'expiringSoon' | 'expired' | 'terminated'

/** `agreed` is a signed bilateral agreement; `statutory` is authorised by regulation. */
export type AgreementKind = 'agreed' | 'statutory'

/** Tone of the small note under the validity dates. */
export type ValidityTone = 'normal' | 'warning' | 'danger'

/** Tone of the footnote under the status pill. */
export type SignatureTone = 'signed' | 'neutral'

export type AgreementRow = {
  id: string
  supplier: string
  vat: string
  /** Peppol reachability line — a badge when true, plain text when not. */
  onPeppol: boolean
  peppolNote?: string
  kind: AgreementKind
  reference: string
  /** Up to two coverage chips; anything beyond is folded into `coverageMore`. */
  coverage: string[]
  coverageMore?: string
  scope: string
  validity: string
  validityNote: string
  validityTone: ValidityTone
  documentCount: string
  documentValue: string
  /** Shown under the document count when the supplier has blocked drafts. */
  documentNote?: string
  status: AgreementStatus
  signatureNote: string
  signatureTone: SignatureTone
}

export const AGREEMENT_ALERT = {
  titleKey: 'agreements.alert.title',
  bodyKey: 'agreements.alert.body',
  actionKey: 'agreements.alert.action',
}

export const AGREEMENT_KPI = [
  {
    id: 'active',
    titleKey: 'agreements.kpi.active',
    icon: 'active',
    amount: '12',
    metaKey: 'agreements.kpi.activeMeta',
    metaTone: 'normal',
  },
  {
    id: 'expiringSoon',
    titleKey: 'agreements.kpi.expiringSoon',
    icon: 'expiringSoon',
    amount: '2',
    metaKey: 'agreements.kpi.expiringSoonMeta',
    metaTone: 'warning',
  },
  {
    id: 'awaiting',
    titleKey: 'agreements.kpi.awaiting',
    icon: 'awaiting',
    amount: '3',
    metaKey: 'agreements.kpi.awaitingMeta',
    metaTone: 'normal',
  },
  {
    id: 'expired',
    titleKey: 'agreements.kpi.expired',
    icon: 'expired',
    amount: '1',
    metaKey: 'agreements.kpi.expiredMeta',
    metaTone: 'danger',
  },
] as const

export const AGREEMENT_TABS: {
  id: AgreementTabId
  labelKey: string
  count: number
  danger?: boolean
}[] = [
  { id: 'all', labelKey: 'agreements.tabs.all', count: 42 },
  { id: 'active', labelKey: 'agreements.tabs.active', count: 4 },
  { id: 'awaiting', labelKey: 'agreements.tabs.awaiting', count: 6 },
  { id: 'expiringSoon', labelKey: 'agreements.tabs.expiringSoon', count: 9 },
  { id: 'expired', labelKey: 'agreements.tabs.expired', count: 1, danger: true },
  { id: 'terminated', labelKey: 'agreements.tabs.terminated', count: 3 },
]

export const AGREEMENT_ROWS: AgreementRow[] = [
  {
    id: 'SBA-2026-004',
    supplier: 'Muscat Roastery Co',
    vat: 'VAT OM1100447102',
    onPeppol: true,
    kind: 'agreed',
    reference: 'SBA-2026-004',
    coverage: ['Coffee & green beans', 'Barista training'],
    scope: 'All branches · OMR',
    validity: 'Until 31 Dec 2026',
    validityNote: 'From 01 Jan 2026 · auto-renews',
    validityTone: 'normal',
    documentCount: '23',
    documentValue: '46.200',
    status: 'active',
    signatureNote: 'agreements.signature.onFile',
    signatureTone: 'signed',
  },
  {
    id: 'SBA-2025-011',
    supplier: 'Al Noor Dates LLC',
    vat: 'VAT OM1100731885',
    onPeppol: true,
    kind: 'agreed',
    reference: 'SBA-2025-011',
    coverage: ['Dates & dried fruit'],
    scope: 'Main, Seeb · OMR',
    validity: 'Until 08 Aug 2026',
    validityNote: 'Expires in 9 days · no auto-renew',
    validityTone: 'warning',
    documentCount: '14',
    documentValue: '9,860.400',
    status: 'expiringSoon',
    signatureNote: 'agreements.signature.onFile',
    signatureTone: 'signed',
  },
  {
    id: 'reverse-charge-bellucci',
    supplier: 'Bellucci Macchine SRL',
    vat: 'VAT OM1100447102',
    onPeppol: false,
    peppolNote: 'Not on Peppol · substitute ID',
    kind: 'statutory',
    reference: 'Reverse charge',
    coverage: ['Import of services', 'Equipment maintenance'],
    scope: 'All branches · EUR → OMR',
    validity: 'No expiry',
    validityNote: 'Authorised by regulation',
    validityTone: 'normal',
    documentCount: '6',
    documentValue: '4,118.750',
    status: 'active',
    signatureNote: 'agreements.signature.notRequired',
    signatureTone: 'neutral',
  },
  {
    id: 'SBA-2026-018',
    supplier: 'Salalah Coconut Traders',
    vat: 'VAT OM1100558214',
    onPeppol: true,
    kind: 'agreed',
    reference: 'SBA-2026-018',
    coverage: ['Coconut products'],
    coverageMore: '+2',
    scope: 'Salalah · OMR',
    validity: 'Not started',
    validityNote: 'Starts on acceptance',
    validityTone: 'normal',
    documentCount: '0',
    documentValue: '',
    documentNote: '1 draft waiting',
    status: 'awaitingAcceptance',
    signatureNote: 'agreements.signature.sentResend',
    signatureTone: 'neutral',
  },
  {
    id: 'SBA-2024-002',
    supplier: 'Nizwa Dairy Farms',
    vat: 'VAT OM1100294736',
    onPeppol: false,
    peppolNote: 'Not on Peppol · substitute ID',
    kind: 'agreed',
    reference: 'SBA-2024-002',
    coverage: ['Dairy & chilled'],
    scope: 'All branches · OMR',
    validity: 'Ended 12 Jul 2026',
    validityNote: 'Expired 18 days ago',
    validityTone: 'danger',
    documentCount: '47',
    documentValue: '31,204.600',
    status: 'expired',
    signatureNote: 'agreements.signature.blocking',
    signatureTone: 'neutral',
  },
  {
    id: 'SBA-2026-007',
    supplier: 'Sohar Packaging LLC',
    vat: 'VAT OM1100640119',
    onPeppol: true,
    kind: 'agreed',
    reference: 'SBA-2026-007',
    coverage: ['Packaging'],
    coverageMore: '+2',
    scope: 'All branches · OMR',
    validity: 'Until 04 Mar 2027',
    validityNote: 'From 05 Mar 2026 · auto-renews',
    validityTone: 'normal',
    documentCount: '31',
    documentValue: '27,915.300',
    status: 'active',
    signatureNote: 'agreements.signature.onFile',
    signatureTone: 'signed',
  },
]

export const AGREEMENT_PAGE_NUMBERS = [1, 2, 3, 4, '...', 20] as const

/** Which statuses each tab gathers. */
export const AGREEMENT_TAB_STATUS: Record<AgreementTabId, AgreementStatus[]> = {
  all: [],
  active: ['active'],
  awaiting: ['awaitingAcceptance'],
  expiringSoon: ['expiringSoon'],
  expired: ['expired'],
  terminated: ['terminated'],
}

export const matchesAgreementTab = (row: AgreementRow, tab: AgreementTabId) => {
  const statuses = AGREEMENT_TAB_STATUS[tab]
  return statuses.length === 0 || statuses.includes(row.status)
}

/** Counts come off the rows, so a tab cannot promise more than it shows. */
export const countAgreementTab = (tab: AgreementTabId) =>
  AGREEMENT_ROWS.filter((row) => matchesAgreementTab(row, tab)).length

export const matchesAgreementQuery = (row: AgreementRow, query: string) => {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  return (
    row.id.toLowerCase().includes(needle) ||
    row.supplier.toLowerCase().includes(needle) ||
    row.reference.toLowerCase().includes(needle)
  )
}
