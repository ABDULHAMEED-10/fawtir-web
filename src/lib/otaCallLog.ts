/**
 * The OTA call log: Compliance › Activity › Call log (Figma 154:110659).
 *
 * The traffic behind the submissions table, one row per message. A TDD does not go to the Tax
 * Authority as a REST call: it travels over Peppol to the Authority's endpoint, and the answer
 * comes back as an MLS (Message Level Status) message. So the rows are what we SENT over Peppol
 * (TDDs and invoices, each confirmed by the receiving access point) and the MLS messages we
 * RECEIVED. There is no status polling and nothing is "passed on" by us: an MLS is simply received.
 *
 * TODO(backend): ACTIVITY.md 2.20. The rows are the design's day until a message-log route exists.
 */

/** What became of a message, grouped by what it means rather than by code. */
export type CallResult = 'ok' | 'pending' | 'rejected' | 'noAnswer'

export type OtaCall = {
  id: string
  at: string
  agoKey: string
  agoValues?: Record<string, string | number>
  /** Sent by us over Peppol, or received (an MLS answer). */
  directionKey: 'callLog.direction.sent' | 'callLog.direction.received'
  /** The message: TDD, MLS or the invoice itself (380). */
  path: string
  purposeKey: string
  /** The document the message was about. */
  invoice: string
  tddUuid: string
  /** What came back: the access point's AS4 receipt on a send, the MLS response code on an MLS. */
  status: string
  /** The refusal code the MLS carried, when it carried one. */
  errorCode?: string
  statusLabelKey: string
  /** Seconds to the receipt (a send) or since the report went (an MLS). */
  seconds: number
  speedKey: string
  result: CallResult
  meaningKey: string
  meaningValues?: Record<string, string>
}

export const OTA_CALLS: OtaCall[] = [
  {
    id: 'c1',
    at: '09:48:05',
    agoKey: 'callLog.ago.minutes',
    agoValues: { count: 4 },
    directionKey: 'callLog.direction.received',
    path: 'MLS',
    purposeKey: 'callLog.purpose.mlsAnswer',
    invoice: 'INV-2046',
    tddUuid: 'c41b-7e08-92fd-1a37',
    status: 'AP',
    statusLabelKey: 'callLog.status.accepted',
    seconds: 1.9,
    speedKey: 'callLog.speed.normal',
    result: 'ok',
    meaningKey: 'callLog.meaning.mlsAccepted',
  },
  {
    id: 'c2',
    at: '09:48:03',
    agoKey: 'callLog.ago.minutes',
    agoValues: { count: 5 },
    directionKey: 'callLog.direction.sent',
    path: 'TDD',
    purposeKey: 'callLog.purpose.reportingNewSale',
    invoice: 'INV-2046',
    tddUuid: 'c41b-7e08-92fd-1a37',
    status: 'AS4',
    statusLabelKey: 'callLog.status.receipt',
    seconds: 0.8,
    speedKey: 'callLog.speed.fast',
    result: 'ok',
    meaningKey: 'callLog.meaning.tddDelivered',
  },
  {
    id: 'c3',
    at: '09:41:29',
    agoKey: 'callLog.ago.minutes',
    agoValues: { count: 11 },
    directionKey: 'callLog.direction.received',
    path: 'MLS',
    purposeKey: 'callLog.purpose.mlsAnswer',
    invoice: 'INV-2041',
    tddUuid: '4b17-9ce2-8a04-31df',
    status: 'RE',
    errorCode: 'OTA-E-2041',
    statusLabelKey: '',
    seconds: 2.1,
    speedKey: 'callLog.speed.normal',
    result: 'rejected',
    meaningKey: 'callLog.meaning.noParticipantId',
    meaningValues: { customer: 'Barka Beach Resort' },
  },
  {
    id: 'c4',
    at: '09:41:27',
    agoKey: 'callLog.ago.minutes',
    agoValues: { count: 11 },
    directionKey: 'callLog.direction.sent',
    path: 'TDD',
    purposeKey: 'callLog.purpose.reportingNewSale',
    invoice: 'INV-2041',
    tddUuid: '4b17-9ce2-8a04-31df',
    status: 'AS4',
    statusLabelKey: 'callLog.status.receipt',
    seconds: 0.7,
    speedKey: 'callLog.speed.fast',
    result: 'ok',
    meaningKey: 'callLog.meaning.tddDelivered',
  },
  {
    id: 'c5',
    at: '06:12:44',
    agoKey: 'callLog.ago.hours',
    agoValues: { count: 3 },
    directionKey: 'callLog.direction.sent',
    path: 'TDD',
    purposeKey: 'callLog.purpose.reportingNewSale',
    invoice: 'INV-2044',
    tddUuid: '7f0c-4d91-b3a8-2065',
    status: 'AS4',
    statusLabelKey: 'callLog.status.receipt',
    seconds: 3.4,
    speedKey: 'callLog.speed.slow',
    result: 'pending',
    meaningKey: 'callLog.meaning.noMlsYet',
  },
  {
    id: 'c6',
    at: '06:12:40',
    agoKey: 'callLog.ago.hours',
    agoValues: { count: 3 },
    directionKey: 'callLog.direction.sent',
    path: '380',
    purposeKey: 'callLog.purpose.invoiceToCustomer',
    invoice: 'INV-2044',
    tddUuid: '7f0c-4d91-b3a8-2065',
    status: 'AS4',
    statusLabelKey: 'callLog.status.receipt',
    seconds: 1.2,
    speedKey: 'callLog.speed.normal',
    result: 'ok',
    meaningKey: 'callLog.meaning.invoiceDelivered',
  },
]

/**
 * The day's traffic.
 *
 * The rows above are one page of it; these are the figures the cards print, stated once so the
 * cards and the pagination cannot disagree.
 */
const CALLS_TODAY = 418
const FAILED_TODAY = 13

export const CALL_SUMMARY = {
  callsToday: CALLS_TODAY,
  answeredNormally: CALLS_TODAY - FAILED_TODAY,
  failed: FAILED_TODAY,
  /** Share that came back without timing out or erroring. */
  answeredRate: Math.round(((CALLS_TODAY - FAILED_TODAY) / CALLS_TODAY) * 1000) / 10,
  /** Today's typical round trip, against the normal one. */
  typicalSeconds: 4.2,
  normalSeconds: 0.9,
  slowestSeconds: 31,
  slowestAt: '06:14',
  slowSince: '06:00',
}

export type CallSortKey = 'newest' | 'slowest' | 'problemsFirst'

export const CALL_SORTS: { value: CallSortKey; labelKey: string }[] = [
  { value: 'newest', labelKey: 'callLog.sortOptions.newest' },
  { value: 'slowest', labelKey: 'callLog.sortOptions.slowest' },
  { value: 'problemsFirst', labelKey: 'callLog.sortOptions.problemsFirst' },
]

/** The filter offers the outcomes rather than raw status codes. */
export const CALL_RESULTS: CallResult[] = ['ok', 'pending', 'rejected', 'noAnswer']

export const matchesCallQuery = (call: OtaCall, query: string) => {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  return (
    call.invoice.toLowerCase().includes(needle) ||
    call.tddUuid.toLowerCase().includes(needle) ||
    call.path.toLowerCase().includes(needle) ||
    call.status.toLowerCase().includes(needle)
  )
}

/* ------------------------------------------------------------- one call */

/** A phase of the round trip, for the timing breakdown. */
export type TimingPhase = { id: string; ms: number }

/**
 * One message in full: Compliance › Activity › Call log › Detail (Figma 154:109008).
 *
 * The report we sent over Peppol and the MLS message that answered it. The TDD XML itself is kept
 * with the record (its signed copy is downloaded there), so it is not reproduced here.
 */
export const CALL_DETAIL = {
  id: 'c3',
  at: '09:41:27',
  date: '30 July 2026',
  directionKey: 'callLog.direction.sent' as const,
  path: 'TDD',
  /** The MLS response code that came back. */
  status: 'RE',
  invoice: 'INV-2041',
  attempt: 1,
  attemptsAllowed: 1,
  quotaUsed: 1,
  typeKey: 'callDetail.type.submit',
  answerKey: 'callDetail.answer.refused',

  /** Where the 2.1 seconds went. Their side dominates, which is the point of showing it. */
  timing: [
    { id: 'building', ms: 184 },
    { id: 'connecting', ms: 96 },
    { id: 'sending', ms: 41 },
    { id: 'theirSide', ms: 1770 },
  ] satisfies TimingPhase[],

  request: {
    headers: [
      { key: 'Transport', value: 'Peppol AS4' },
      { key: 'Sender', value: '0248:OM1100392000' },
      { key: 'Receiver', value: 'Fawtara' },
      { key: 'Document', value: 'TDD · type S' },
      { key: 'SBDH instance ID', value: 'sbdh-2041-1' },
      { key: 'AS4 receipt', value: '09:41:27.335' },
    ],
    /** The TDD XML is not repeated here: it is kept with the record. */
    body: [] as string[],
    faultLine: undefined as number | undefined,
  },

  response: {
    headers: [
      { key: 'Message', value: 'MLS (Message Level Status)' },
      { key: 'Response code', value: 'RE' },
      { key: 'Refers to', value: 'sbdh-2041-1' },
      { key: 'Received', value: 'Thu, 30 Jul 2026 09:41:29 GMT' },
    ],
    body: ['RE · OTA-E-2041', 'Buyer endpoint identifier is mandatory.'],
  },

  /** What happened, in order, with the moment each step landed. */
  steps: [
    { id: 'built', at: '09:41:27.014', noteKey: 'callDetail.step.builtNote', state: 'done' },
    {
      id: 'connected',
      at: '09:41:27.198',
      noteKey: 'callDetail.step.connectedNote',
      state: 'done',
    },
    { id: 'sent', at: '09:41:27.294', noteKey: 'callDetail.step.sentNote', state: 'done' },
    {
      id: 'waiting',
      at: '09:41:27.335 – 09:41:29.101',
      noteKey: 'callDetail.step.waitingNote',
      state: 'waiting',
    },
    { id: 'refused', at: '09:41:29.101', noteKey: 'callDetail.step.refusedNote', state: 'failed' },
    { id: 'noRetry', at: '', noteKey: 'callDetail.step.noRetryNote', state: 'idle' },
  ] as { id: string; at: string; noteKey: string; state: 'done' | 'waiting' | 'failed' | 'idle' }[],

  references: {
    requestId: 'sbdh-2041-1',
    traceId: 'mls-5518d0c9e4a1',
    documentUuid: '4b17-9ce2-8a04-31df',
  },

  related: { sameInvoice: 2, sameErrorThisWeek: 3, sameCustomerRefused: 3 },
}

/** The round trip, added up from its phases rather than stated separately. */
export const CALL_TOTAL_MS = CALL_DETAIL.timing.reduce((total, phase) => total + phase.ms, 0)

export const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`
