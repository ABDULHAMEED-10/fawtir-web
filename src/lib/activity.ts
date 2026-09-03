/**
 * Activity — Compliance › Activity (Figma 131:14102, drawn as "TDD & OTA").
 *
 * Every invoice sent is reported to the Oman Tax Authority as a Tax Data Document. Two things
 * can go wrong and they are independent: the OTA can reject the TDD, and the customer's access
 * point can fail to acknowledge delivery over Peppol. This screen is the record of both.
 *
 * One invoice can produce several submissions — a rejection that is corrected and sent again is
 * two — so the table counts submissions while the acceptance rate counts invoices. That is why
 * 1,643 submissions sit under 1,624 invoices.
 */

/** What the Authority said about a submission. */
export type OtaOutcome = 'accepted' | 'rejected' | 'waiting' | 'superseded'

/** Which reporting flow the document went down. */
export type TddFlow = 'b2bDomestic' | 'b2c' | 'export'

/** Whether the customer's access point acknowledged delivery. */
export type Acknowledgement = 'received' | 'notOnPeppol' | 'noCustomer'

export type Submission = {
  id: string
  invoice: string
  customer: string
  /** Absent on a walk-in sale. */
  customerAmount: string
  /** The TDD UUID the OTA issues; every submission has one. */
  tddUuid: string
  /** The Fawtara reference, once the OTA has accepted it. */
  fawtaraRef?: string
  /** Why there is no Fawtara reference yet. */
  referenceNoteKey?: string
  flow: TddFlow
  /** The Peppol route, or the stand-in ID used when the buyer is not on the network. */
  routeKey: string
  routeValues?: Record<string, string>
  sentDate: string
  sentTime: string
  outcome: OtaOutcome
  /** What the OTA said, in plain words. */
  verdictKey: string
  verdictValues?: Record<string, string>
  acknowledgement: Acknowledgement
  /** A rejection nobody has corrected yet still needs a person. */
  needsAttention?: boolean
}

/** The seven the design draws in full. */
export const SUBMISSIONS: Submission[] = [
  {
    id: 's1',
    invoice: 'INV-2041',
    customer: 'Barka Resort',
    customerAmount: '1,842.000',
    tddUuid: '4b17-9ce2-8a04-31df',
    referenceNoteKey: 'activity.ref.neverAccepted',
    flow: 'b2bDomestic',
    routeKey: 'activity.route.bothOnPeppol',
    routeValues: { flow: '1' },
    sentDate: '30 Jul',
    sentTime: '09:41',
    outcome: 'rejected',
    verdictKey: 'activity.verdict.noPeppolId',
    acknowledgement: 'received',
    needsAttention: true,
  },
  {
    id: 's2',
    invoice: 'INV-2039',
    customer: 'Mouj Marina',
    customerAmount: '604.800',
    tddUuid: '9d31-0af7-52bc-77e1',
    referenceNoteKey: 'activity.ref.neverAccepted',
    flow: 'b2bDomestic',
    routeKey: 'activity.route.bothOnPeppol',
    routeValues: { flow: '1' },
    sentDate: '29 Jul',
    sentTime: '16:08',
    outcome: 'rejected',
    verdictKey: 'activity.verdict.totalMismatch',
    verdictValues: { amount: '0.400' },
    acknowledgement: 'received',
    needsAttention: true,
  },
  {
    id: 's3',
    invoice: 'INV-2044',
    customer: 'Nizwa Café',
    customerAmount: '318.780',
    tddUuid: '7f0c-4d91-b3a8-2065',
    referenceNoteKey: 'activity.ref.waiting',
    flow: 'b2bDomestic',
    routeKey: 'activity.route.bothOnPeppol',
    routeValues: { flow: '1' },
    sentDate: 'today',
    sentTime: '06:12',
    outcome: 'waiting',
    verdictKey: 'activity.verdict.noAnswerYet',
    verdictValues: { elapsed: '3h 40m' },
    acknowledgement: 'received',
  },
  {
    id: 's4',
    invoice: 'INV-2036',
    customer: 'Walk-in customer',
    customerAmount: '4.200',
    tddUuid: '2a88-71ef-c049-13b6',
    fawtaraRef: 'OM-2026-0084398',
    flow: 'b2c',
    routeKey: 'activity.route.standIn',
    routeValues: { id: '997770000099', flow: '7' },
    sentDate: '22 Jun',
    sentTime: '18:33',
    outcome: 'accepted',
    verdictKey: 'activity.verdict.clearedNotDelivered',
    verdictValues: { seconds: '47' },
    acknowledgement: 'noCustomer',
  },
  {
    id: 's5',
    invoice: 'INV-1993',
    customer: 'Barka Resort',
    customerAmount: '1,842.000',
    tddUuid: '6c25-b840-1f97-4ae3',
    referenceNoteKey: 'activity.ref.replacedBy',
    flow: 'b2bDomestic',
    routeKey: 'activity.route.bothOnPeppol',
    routeValues: { flow: '1' },
    sentDate: '8 Jun',
    sentTime: '11:20',
    outcome: 'superseded',
    verdictKey: 'activity.verdict.disregarded',
    acknowledgement: 'received',
  },
  {
    id: 's6',
    invoice: 'INV-2012',
    customer: 'Doha Traders',
    customerAmount: '5,640.000',
    tddUuid: '0e94-af13-6d27-8850',
    fawtaraRef: 'OM-2026-0084201',
    flow: 'export',
    routeKey: 'activity.route.standIn',
    routeValues: { id: '997770000097', flow: '11' },
    sentDate: '14 Jun',
    sentTime: '10:02',
    outcome: 'accepted',
    verdictKey: 'activity.verdict.clearedZeroRated',
    verdictValues: { time: '2m 09s' },
    acknowledgement: 'notOnPeppol',
  },
  {
    id: 's7',
    invoice: 'INV-2043',
    customer: 'Muscat Grand Hotel',
    customerAmount: '496.000',
    tddUuid: '3c9a-1e77-2b04-4f6a',
    fawtaraRef: 'OM-2026-0084412',
    flow: 'b2bDomestic',
    routeKey: 'activity.route.bothOnPeppol',
    routeValues: { flow: '1' },
    sentDate: '28 Jul',
    sentTime: '08:15',
    outcome: 'accepted',
    verdictKey: 'activity.verdict.clearedIn',
    verdictValues: { seconds: '52' },
    acknowledgement: 'received',
  },
]

/* ------------------------------------------------------------- the book */

/**
 * The whole year, which the seven rows above are a page of.
 *
 * These are the figures the cards print. They are stated once here so the cards, the tabs and
 * the pagination cannot disagree — and they are the same 1,624 invoices the Reports › Compliance
 * screen counts, so the two screens tell one story.
 */
export const BOOK = {
  invoices: 1_624,
  acceptedInvoices: 1_577,
  /** Submissions that are still open with the OTA. */
  waiting: 19,
  /** Submissions the OTA disregarded because a corrected version replaced them. */
  superseded: 8,
  /** Rejections nobody has corrected yet — the only ones that need a person. */
  needsAttention: 4,
  /** Delivery acknowledgements that came back inside the window. */
  acknowledged: 1_614,
  averageSeconds: 134,
  previousAverageSeconds: 172,
}

const round1 = (value: number) => Math.round(value * 10) / 10

/**
 * A rejection is a submission, not an invoice, and a corrected invoice produces a second one.
 * Rejections are therefore whatever is left once the accepted, waiting and superseded
 * submissions are taken off the total.
 */
export const SUBMISSION_TOTAL = 1_643
export const REJECTED = SUBMISSION_TOTAL - BOOK.acceptedInvoices - BOOK.waiting - BOOK.superseded

export const ACTIVITY_SUMMARY = {
  submissions: SUBMISSION_TOTAL,
  invoices: BOOK.invoices,
  accepted: BOOK.acceptedInvoices,
  rejected: REJECTED,
  waiting: BOOK.waiting,
  superseded: BOOK.superseded,
  needsAttention: BOOK.needsAttention,

  /** Share of invoices the Authority accepted. */
  acceptanceRate: round1((BOOK.acceptedInvoices / BOOK.invoices) * 100),
  /** Share of deliveries acknowledged inside the window. */
  acknowledgedRate: round1((BOOK.acknowledged / BOOK.invoices) * 100),
  acknowledged: BOOK.acknowledged,
  averageSeconds: BOOK.averageSeconds,
  previousAverageSeconds: BOOK.previousAverageSeconds,
}

/** The badge on the sidebar counts only what a person still has to act on. */
export const ATTENTION_COUNT = BOOK.needsAttention

/** `134` → `2m 14s`. */
export const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`

/* --------------------------------------------------------------------- tabs */

export type ActivityTabId =
  'all' | 'needsAttention' | 'accepted' | 'rejected' | 'waiting' | 'superseded'

export const ACTIVITY_TABS: { id: ActivityTabId; labelKey: string }[] = [
  { id: 'all', labelKey: 'activity.tabs.all' },
  { id: 'needsAttention', labelKey: 'activity.tabs.needsAttention' },
  { id: 'accepted', labelKey: 'activity.tabs.accepted' },
  { id: 'rejected', labelKey: 'activity.tabs.rejected' },
  { id: 'waiting', labelKey: 'activity.tabs.waiting' },
  { id: 'superseded', labelKey: 'activity.tabs.superseded' },
]

/** What each tab counts across the whole book, not just the page on screen. */
export const TAB_TOTALS: Record<ActivityTabId, number> = {
  all: ACTIVITY_SUMMARY.submissions,
  needsAttention: ACTIVITY_SUMMARY.needsAttention,
  accepted: ACTIVITY_SUMMARY.accepted,
  rejected: ACTIVITY_SUMMARY.rejected,
  waiting: ACTIVITY_SUMMARY.waiting,
  superseded: ACTIVITY_SUMMARY.superseded,
}

export const matchesTab = (row: Submission, tab: ActivityTabId) => {
  if (tab === 'all') return true
  if (tab === 'needsAttention') return Boolean(row.needsAttention)
  return row.outcome === tab
}

export const matchesQuery = (row: Submission, query: string) => {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  return (
    row.invoice.toLowerCase().includes(needle) ||
    row.customer.toLowerCase().includes(needle) ||
    row.tddUuid.toLowerCase().includes(needle) ||
    (row.fawtaraRef ?? '').toLowerCase().includes(needle)
  )
}

export const FLOWS: TddFlow[] = ['b2bDomestic', 'b2c', 'export']

/** Sorting the toolbar offers. */
export type ActivitySortKey = 'newest' | 'oldest' | 'invoiceAsc'

export const ACTIVITY_SORTS: { value: ActivitySortKey; labelKey: string }[] = [
  { value: 'newest', labelKey: 'activity.sortOptions.newest' },
  { value: 'oldest', labelKey: 'activity.sortOptions.oldest' },
  { value: 'invoiceAsc', labelKey: 'activity.sortOptions.invoiceAsc' },
]

/**
 * What has to be true before anything can be reported.
 *
 * Shown on the empty state, where the point is that the connection is already working and only
 * a document is missing.
 */
export const CONNECTION_CHECKS = [
  { id: 'vat', values: { vat: 'OM1100392000' } },
  { id: 'peppol', values: { id: '0248:OM1100392000' } },
  { id: 'fawtara', values: { latency: '0.9s', until: 'Mar 2027' } },
]
