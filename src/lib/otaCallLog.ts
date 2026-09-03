/**
 * The OTA call log — Compliance › Activity › Call log (Figma 131:16495).
 *
 * Every HTTP request Fawtir has made to the Tax Authority on this account, and what came back.
 * This is the engineer's view underneath the submissions table: when the Authority is slow or
 * silent it is the only place that says so, and it distinguishes "your document was wrong" from
 * "their service did not answer" — which look identical from the invoice screen.
 */

/** How the Authority answered, grouped by what it means rather than by status code. */
export type CallResult = 'ok' | 'pending' | 'rejected' | 'noAnswer'

export type OtaCall = {
  id: string
  at: string
  agoKey: string
  agoValues?: Record<string, string | number>
  method: 'GET' | 'POST'
  path: string
  purposeKey: string
  /** The document the call was about. */
  invoice: string
  tddUuid: string
  /** HTTP status as the Authority returned it. */
  status: number
  /** The Authority's own error code, when it sent one. */
  errorCode?: string
  statusLabelKey: string
  /** Seconds the round trip took. */
  seconds: number
  speedKey: string
  result: CallResult
  meaningKey: string
  meaningValues?: Record<string, string>
}

export const OTA_CALLS: OtaCall[] = [
  {
    id: 'c1',
    at: '09:52:11',
    agoKey: 'callLog.ago.seconds',
    agoValues: { count: 40 },
    method: 'GET',
    path: '/tdd/status',
    purposeKey: 'callLog.purpose.askingDecided',
    invoice: 'INV-2044',
    tddUuid: '7f0c-4d91-b3a8-2065',
    status: 202,
    statusLabelKey: 'callLog.status.stillWithThem',
    seconds: 6.8,
    speedKey: 'callLog.speed.slow',
    result: 'pending',
    meaningKey: 'callLog.meaning.acceptedNoDecision',
  },
  {
    id: 'c2',
    at: '09:48:03',
    agoKey: 'callLog.ago.minutes',
    agoValues: { count: 5 },
    method: 'POST',
    path: '/tdd/submit',
    purposeKey: 'callLog.purpose.reportingNewSale',
    invoice: 'INV-2046',
    tddUuid: 'c41b-7e08-92fd-1a37',
    status: 200,
    statusLabelKey: 'callLog.status.accepted',
    seconds: 1.9,
    speedKey: 'callLog.speed.normal',
    result: 'ok',
    meaningKey: 'callLog.meaning.acceptedWithRef',
    meaningValues: { ref: 'OM-2026-0084451' },
  },
  {
    id: 'c3',
    at: '09:41:27',
    agoKey: 'callLog.ago.minutes',
    agoValues: { count: 11 },
    method: 'POST',
    path: '/tdd/submit',
    purposeKey: 'callLog.purpose.reportingNewSale',
    invoice: 'INV-2041',
    tddUuid: '4b17-9ce2-8a04-31df',
    status: 422,
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
    at: '09:40:55',
    agoKey: 'callLog.ago.minutes',
    agoValues: { count: 12 },
    method: 'POST',
    path: '/mls/acknowledge',
    purposeKey: 'callLog.purpose.passingAck',
    invoice: 'INV-2040',
    tddUuid: 'a8e3-15c6-4470-9bb2',
    status: 200,
    statusLabelKey: 'callLog.status.recorded',
    seconds: 0.7,
    speedKey: 'callLog.speed.fast',
    result: 'ok',
    meaningKey: 'callLog.meaning.deliveryConfirmed',
  },
  {
    id: 'c5',
    at: '06:14:02',
    agoKey: 'callLog.ago.hours',
    agoValues: { count: 3 },
    method: 'POST',
    path: '/tdd/submit',
    purposeKey: 'callLog.purpose.firstTry',
    invoice: 'INV-2044',
    tddUuid: '7f0c-4d91-b3a8-2065',
    status: 504,
    statusLabelKey: 'callLog.status.noAnswer',
    seconds: 31,
    speedKey: 'callLog.speed.timedOut',
    result: 'noAnswer',
    meaningKey: 'callLog.meaning.otaDidNotAnswer',
  },
  {
    id: 'c6',
    at: '06:12:40',
    agoKey: 'callLog.ago.hours',
    agoValues: { count: 3 },
    method: 'POST',
    path: '/tdd/submit',
    purposeKey: 'callLog.purpose.retry',
    invoice: 'INV-2044',
    tddUuid: '7f0c-4d91-b3a8-2065',
    status: 202,
    statusLabelKey: 'callLog.status.takenIn',
    seconds: 3.4,
    speedKey: 'callLog.speed.normal',
    result: 'pending',
    meaningKey: 'callLog.meaning.takenNotDecided',
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
    String(call.status).includes(needle)
  )
}

/* ------------------------------------------------------------- one call */

/** A phase of the round trip, for the timing breakdown. */
export type TimingPhase = { id: string; ms: number }

/**
 * One call in full — Compliance › Activity › Call log › Detail (Figma 131:14844).
 *
 * Shows both halves of the exchange verbatim, because when the Authority refuses something the
 * only way to settle an argument is the actual bytes that went and came back.
 */
export const CALL_DETAIL = {
  id: 'c3',
  at: '09:41:27',
  date: '30 July 2026',
  method: 'POST' as const,
  path: '/tdd/submit',
  status: 422,
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
      { key: 'Endpoint', value: 'https://fawtara.taxoman.gov.om/api/v1/tdd/submit' },
      { key: 'Content-Type', value: 'application/xml; charset=utf-8' },
      { key: 'X-Sender-ID', value: '0248:OM1100392000' },
      { key: 'X-Request-ID', value: 'req_9f31c740ab82' },
      { key: 'Authorization', value: 'Bearer ••••••••  · hidden' },
      { key: 'Body size', value: '4.8 KB' },
    ],
    /** The line the Authority objected to is marked so the viewer can highlight it. */
    body: [
      '<TaxDataDocument xmlns="urn:oman:ota:tdd:1.0">',
      '  <cbc:ID>INV-2041</cbc:ID>',
      '  <cbc:UUID>4b17-9ce2-8a04-31df</cbc:UUID>',
      '  <cbc:IssueDate>2026-07-30</cbc:IssueDate>',
      '  <cbc:DocumentCurrencyCode>OMR</cbc:DocumentCurrencyCode>',
      '',
      '  <cac:AccountingSupplierParty>',
      '    <cbc:EndpointID schemeID="0248">OM1100392000</cbc:EndpointID>',
      '    <cbc:CompanyID>OM1100392000</cbc:CompanyID>',
      '  </cac:AccountingSupplierParty>',
      '',
      '  <cac:AccountingCustomerParty>',
      '    <cbc:EndpointID schemeID=""></cbc:EndpointID>   <!-- empty -->',
      '    <cbc:CompanyID>OM1100558840</cbc:CompanyID>',
      '    <cbc:RegistrationName>Barka Beach Resort LLC</cbc:RegistrationName>',
      '  </cac:AccountingCustomerParty>',
      '',
      '  <cac:TaxTotal>',
      '    <cbc:TaxAmount currencyID="OMR">87.714</cbc:TaxAmount>',
      '  </cac:TaxTotal>',
      '',
      '  <cac:LegalMonetaryTotal>',
      '    <cbc:PayableAmount currencyID="OMR">1842.000</cbc:PayableAmount>',
      '  </cac:LegalMonetaryTotal>',
      '</TaxDataDocument>',
    ],
    /** 1-indexed line the Authority pointed at. */
    faultLine: 13,
  },

  response: {
    headers: [
      { key: 'Status', value: '422 Unprocessable Entity' },
      { key: 'Content-Type', value: 'application/json' },
      { key: 'X-OTA-Trace-ID', value: 'trc_5518d0c9e4a1' },
      { key: 'Date', value: 'Thu, 30 Jul 2026 09:41:29 GMT' },
    ],
    body: [
      '{',
      '  "status": "REJECTED",',
      '  "traceId": "trc_5518d0c9e4a1",',
      '  "documentUuid": "4b17-9ce2-8a04-31df",',
      '  "fawtaraReference": null,',
      '  "errors": [',
      '    {',
      '      "code": "OTA-E-2041",',
      '      "rule": "MISSING_BUYER_ENDPOINT_ID",',
      '      "path": "cac:AccountingCustomerParty/cbc:EndpointID",',
      '      "messageEn": "Buyer endpoint identifier is mandatory.",',
      '      "messageAr": "معرّف نقطة نهاية المشتري إلزامي.",',
      '      "severity": "FATAL"',
      '    }',
      '  ],',
      '  "retryable": false',
      '}',
    ],
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
    requestId: 'req_9f31c740ab82',
    traceId: 'trc_5518d0c9e4a1',
    documentUuid: '4b17-9ce2-8a04-31df',
  },

  related: { sameInvoice: 1, sameErrorThisWeek: 3, sameCustomerRefused: 3 },
}

/** The round trip, added up from its phases rather than stated separately. */
export const CALL_TOTAL_MS = CALL_DETAIL.timing.reduce((total, phase) => total + phase.ms, 0)

export const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`
