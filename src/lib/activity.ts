/**
 * Activity — Compliance › Activity.
 *
 * Everything that has happened to a document on its way through the two networks it has to
 * satisfy: Peppol, which carries it to the other party, and the Oman Tax Authority, which has to
 * accept the Tax Data Document before the invoice is legally reported.
 *
 * The two are separate journeys and either can fail on its own — a bill can reach the customer
 * over Peppol and still be rejected by the OTA — so every event records which network it belongs
 * to and what that network said. Nothing here is a status the user sets; it is all what the
 * outside world did.
 */

/** The two networks a document passes through. */
export type Channel = 'peppol' | 'ota'

/** What the network said. */
export type Outcome = 'cleared' | 'waiting' | 'attention' | 'failed'

/** Which way the document was going. */
export type Direction = 'outbound' | 'inbound'

/** Every kind of document that generates activity. */
export type DocumentKind =
  'standardInvoice' | 'simplifiedInvoice' | 'creditNote' | 'debitNote' | 'selfBilled' | 'bill'

export type ActivityEvent = {
  id: string
  /** The document this happened to. */
  document: string
  documentKind: DocumentKind
  /** Who it went to, or came from. */
  party: string
  direction: Direction
  channel: Channel
  /** What step of the journey this was. */
  stepKey: string
  detailKey: string
  detailValues?: Record<string, string>
  outcome: Outcome
  /** When it happened, newest first in the list. */
  at: string
  day: string
  /** The OTA's own identifier, once it has issued one. */
  fawtaraUuid?: string
  /** How many times it has been tried. */
  attempt?: number
  /** Offered when something can still be done about it. */
  actionKey?: string
}

/**
 * A working day of traffic.
 *
 * The mix is deliberate: both directions, all six document kinds, and both networks, because the
 * point of the screen is that a single document can be fine on one and stuck on the other.
 */
export const ACTIVITY: ActivityEvent[] = [
  {
    id: 'e1',
    document: 'INV-2044',
    documentKind: 'standardInvoice',
    party: 'Nizwa Souq Café',
    direction: 'outbound',
    channel: 'ota',
    stepKey: 'activity.step.tddFiled',
    detailKey: 'activity.detail.waitingOta',
    detailValues: { minutes: '3' },
    outcome: 'waiting',
    at: '09:41',
    day: 'today',
    attempt: 1,
  },
  {
    id: 'e2',
    document: 'INV-2044',
    documentKind: 'standardInvoice',
    party: 'Nizwa Souq Café',
    direction: 'outbound',
    channel: 'peppol',
    stepKey: 'activity.step.sentOverPeppol',
    detailKey: 'activity.detail.deliveredTo',
    detailValues: { id: '0248:OM1100882140' },
    outcome: 'cleared',
    at: '09:40',
    day: 'today',
  },
  {
    id: 'e3',
    document: 'DN-0091',
    documentKind: 'debitNote',
    party: 'Gulf Cold Logistics',
    direction: 'inbound',
    channel: 'peppol',
    stepKey: 'activity.step.arrivedOverPeppol',
    detailKey: 'activity.detail.heldForReview',
    outcome: 'attention',
    at: '08:12',
    day: 'today',
    actionKey: 'activity.action.review',
  },
  {
    id: 'e4',
    document: 'INV-2043',
    documentKind: 'standardInvoice',
    party: 'Muscat Grand Hotel',
    direction: 'outbound',
    channel: 'ota',
    stepKey: 'activity.step.tddRejected',
    detailKey: 'activity.detail.buyerVatUnknown',
    outcome: 'attention',
    at: '07:55',
    day: 'today',
    attempt: 1,
    actionKey: 'activity.action.fixAndResend',
  },
  {
    id: 'e5',
    document: 'SI-0912',
    documentKind: 'simplifiedInvoice',
    party: 'Counter sale',
    direction: 'outbound',
    channel: 'ota',
    stepKey: 'activity.step.tddFiled',
    detailKey: 'activity.detail.acceptedIn',
    detailValues: { seconds: '2' },
    outcome: 'cleared',
    at: '07:30',
    day: 'today',
    fawtaraUuid: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
  },
  {
    id: 'e6',
    document: 'MR-INV-8821',
    documentKind: 'bill',
    party: 'Muscat Roastery Co',
    direction: 'inbound',
    channel: 'peppol',
    stepKey: 'activity.step.arrivedOverPeppol',
    detailKey: 'activity.detail.matchedToOrder',
    detailValues: { po: 'PO-0031' },
    outcome: 'cleared',
    at: '16:22',
    day: 'yesterday',
  },
  {
    id: 'e7',
    document: 'MR-INV-8821',
    documentKind: 'bill',
    party: 'Muscat Roastery Co',
    direction: 'inbound',
    channel: 'ota',
    stepKey: 'activity.step.receiverTddFiled',
    detailKey: 'activity.detail.acceptedIn',
    detailValues: { seconds: '3' },
    outcome: 'cleared',
    at: '16:23',
    day: 'yesterday',
    fawtaraUuid: '9f2b7c10-5a41-42e8-9c33-6d1b0a77e004',
  },
  {
    id: 'e8',
    document: 'CN-0118',
    documentKind: 'creditNote',
    party: 'Barka Beach Resort',
    direction: 'outbound',
    channel: 'peppol',
    stepKey: 'activity.step.sentOverPeppol',
    detailKey: 'activity.detail.deliveredTo',
    detailValues: { id: '0248:OM1100447301' },
    outcome: 'cleared',
    at: '14:05',
    day: 'yesterday',
  },
  {
    id: 'e9',
    document: 'INV-2038',
    documentKind: 'standardInvoice',
    party: 'Al Mouj Marina',
    direction: 'outbound',
    channel: 'ota',
    stepKey: 'activity.step.tddResent',
    detailKey: 'activity.detail.acceptedOnRetry',
    outcome: 'cleared',
    at: '11:48',
    day: 'yesterday',
    attempt: 2,
    fawtaraUuid: '3c9a1e77-2b04-4f6a-9de1-88b2c4f10a55',
  },
  {
    id: 'e10',
    document: 'INV-2038',
    documentKind: 'standardInvoice',
    party: 'Al Mouj Marina',
    direction: 'outbound',
    channel: 'ota',
    stepKey: 'activity.step.tddRejected',
    detailKey: 'activity.detail.roundingMismatch',
    outcome: 'failed',
    at: '11:31',
    day: 'yesterday',
    attempt: 1,
  },
  {
    id: 'e11',
    document: 'SB-0044',
    documentKind: 'selfBilled',
    party: 'Sohar Packaging LLC',
    direction: 'outbound',
    channel: 'peppol',
    stepKey: 'activity.step.sentOverPeppol',
    detailKey: 'activity.detail.deliveredTo',
    detailValues: { id: '0248:OM1100628391' },
    outcome: 'cleared',
    at: '10:02',
    day: 'yesterday',
  },
  {
    id: 'e12',
    document: 'SB-0044',
    documentKind: 'selfBilled',
    party: 'Sohar Packaging LLC',
    direction: 'outbound',
    channel: 'ota',
    stepKey: 'activity.step.tddFiled',
    detailKey: 'activity.detail.acceptedIn',
    detailValues: { seconds: '4' },
    outcome: 'cleared',
    at: '10:03',
    day: 'yesterday',
    fawtaraUuid: 'b7e4d221-9a35-4c18-8f02-1e5a6c9b7d33',
  },
]

/* ------------------------------------------------------------------ derived */

const isAttention = (event: ActivityEvent) => event.outcome === 'attention'

/**
 * The badge on the sidebar.
 *
 * It counts what a person still has to do something about, so a rejection that was already
 * resent successfully does not keep asking for attention.
 */
export const ATTENTION_COUNT = ACTIVITY.filter(isAttention).length

export const ACTIVITY_SUMMARY = {
  total: ACTIVITY.length,
  cleared: ACTIVITY.filter((event) => event.outcome === 'cleared').length,
  waiting: ACTIVITY.filter((event) => event.outcome === 'waiting').length,
  attention: ATTENTION_COUNT,
  today: ACTIVITY.filter((event) => event.day === 'today').length,
  /** How many separate documents the day's traffic covers. */
  documents: new Set(ACTIVITY.map((event) => event.document)).size,
  peppol: ACTIVITY.filter((event) => event.channel === 'peppol').length,
  ota: ACTIVITY.filter((event) => event.channel === 'ota').length,
  /** Everything the OTA has finished with, accepted or not. */
  otaSettled: ACTIVITY.filter((event) => event.channel === 'ota' && event.outcome !== 'waiting')
    .length,
  otaAccepted: ACTIVITY.filter((event) => event.channel === 'ota' && event.outcome === 'cleared')
    .length,
}

/** Share of OTA filings the Authority accepted, out of those it has answered. */
export const OTA_ACCEPTANCE = ACTIVITY_SUMMARY.otaSettled
  ? Math.round((ACTIVITY_SUMMARY.otaAccepted / ACTIVITY_SUMMARY.otaSettled) * 100)
  : 100

/* --------------------------------------------------------------------- tabs */

export type ActivityTabId = 'all' | 'attention' | 'waiting' | 'cleared'

export const ACTIVITY_TABS: { id: ActivityTabId; labelKey: string }[] = [
  { id: 'all', labelKey: 'activity.tabs.all' },
  { id: 'attention', labelKey: 'activity.tabs.attention' },
  { id: 'waiting', labelKey: 'activity.tabs.waiting' },
  { id: 'cleared', labelKey: 'activity.tabs.cleared' },
]

export const matchesTab = (event: ActivityEvent, tab: ActivityTabId) => {
  if (tab === 'all') return true
  return event.outcome === tab
}

export const countTab = (tab: ActivityTabId) =>
  ACTIVITY.filter((event) => matchesTab(event, tab)).length

/** The document kinds, for the filter. */
export const DOCUMENT_KINDS: DocumentKind[] = [
  'standardInvoice',
  'simplifiedInvoice',
  'creditNote',
  'debitNote',
  'selfBilled',
  'bill',
]
