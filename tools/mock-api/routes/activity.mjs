/**
 * Compliance > Activity (ComplianceActivityController): the ledger, its summary, one document's
 * record, a resubmission and the ledger export, in the shapes `src/api/compliance/activity.ts`
 * expects. The first six rows are the ones the frame (Figma 154:109992) draws; the rest pad the
 * book so the pager and every tab have something to show.
 *
 * The optional fields the frame needs and the wire does not carry yet (amount, tdd_uuid,
 * fawtara_reference, superseded_by, scenario, summary.superseded) are filled here so the screen can
 * be checked against the design; see the backend asks doc, section 2.
 */

const uuid = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const PAGE_SIZE_DEFAULT = 25

/** Today in the mock, so "Today" and "3h 40m and no answer" read as the frame does. */
const NOW = new Date()
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600_000).toISOString()
const at = (iso, plusSeconds) =>
  new Date(new Date(iso).getTime() + plusSeconds * 1000).toISOString()

function row({
  n,
  number,
  counterparty,
  amount,
  when,
  b2c = false,
  direction = 'ISSUED',
  tddAck,
  tddStatus = 'SUBMITTED',
  reason = null,
  clearedIn = 52,
  invoiceAck = 'AP',
  tddUuid,
  fawtara = null,
  supersededBy = null,
  scenario = { flow: 1, stand_in_id: null },
  variant = 'B2B',
  attention = false,
  resubmit = false,
  documentKind = 'INVOICE',
  typeCode = '380',
  participantId = null,
  customizationId = 'urn:peppol:pint:billing-1@om-1',
  scope = 'D',
  vatRate = 0.05,
}) {
  const submitted = at(when, 3)
  const received = direction === 'RECEIVED'
  return {
    invoice_uuid: uuid(n),
    direction,
    document_kind: documentKind,
    document_type_code: typeCode,
    invoice_number: number,
    counterparty,
    occurred_at: when,
    validated_at: at(when, 1),
    b2c,
    transport_state: 'SENT',
    invoice_leg: {
      ack: invoiceAck,
      ack_at: invoiceAck === 'NONE' ? null : at(when, 70),
      reason: null,
    },
    tdd_leg: {
      variant,
      status: tddStatus,
      validated_at: at(when, 1),
      sla_deadline: at(when, 24 * 3600),
      submitted_at: submitted,
      sla_met: tddAck === 'NONE' ? null : true,
      ack: tddAck,
      ack_at: tddAck === 'NONE' ? null : at(submitted, clearedIn),
      reason,
    },
    attention,
    links: {
      // A received bill is not one of our invoices, so there is no `/invoices` record to open.
      document: received ? null : `/api/v1/invoices/${uuid(n)}`,
      tdd_xml: `/api/v1/invoices/${uuid(n)}/tdd`,
      resubmit: resubmit ? `/api/v1/invoices/${uuid(n)}/tdd/resubmit` : null,
    },
    amount,
    currency_code: 'OMR',
    tdd_uuid: tddUuid,
    fawtara_reference: fawtara,
    superseded_by: supersededBy,
    scenario,
    // TODO(backend) fields (ACTIVITY.md 2.25 to 2.27): the TDOM-04/05 receipt moment on a received
    // document, the other side's participant ID and the document's CustomizationID.
    received_at: received ? when : null,
    counterparty_participant_id: participantId,
    customization_id: customizationId,
    // TODO(backend) fields (ACTIVITY.md 2.31, 2.32, 2.34): the TDD type (S sent), our role on the
    // TDD (01 seller, 02 receiver; TDT-010), the TDD scope (D domestic; IP or INP for an export)
    // and the invoice total VAT (IBT-110).
    tdd_type: 'S',
    reporter_role: received ? '02' : '01',
    tdd_scope: scope,
    tax_amount: Math.round((amount - amount / (1 + vatRate)) * 1000) / 1000,
  }
}

const FEATURED = [
  row({
    n: 1,
    number: 'INV-2041',
    counterparty: 'Barka Resort',
    amount: 1842,
    when: '2026-09-24T05:41:00Z',
    tddAck: 'RE',
    tddStatus: 'REJECTED',
    reason: 'The customer has no Peppol ID on their record.',
    tddUuid: '4b17-9ce2-8a04-31df',
    // No Peppol ID, so the invoice could not reach the customer's access point either.
    invoiceAck: 'NONE',
    attention: true,
    resubmit: true,
  }),
  row({
    n: 2,
    number: 'INV-2039',
    counterparty: 'Mouj Marina',
    amount: 604.8,
    when: '2026-09-23T12:08:00Z',
    tddAck: 'RE',
    tddStatus: 'REJECTED',
    reason: "The total doesn't equal the lines added up, out by 0.400.",
    tddUuid: '9d31-0af7-52bc-77e1',
    attention: true,
    resubmit: true,
  }),
  row({
    n: 3,
    number: 'INV-2044',
    counterparty: 'Nizwa Café',
    amount: 318.78,
    when: hoursAgo(3.67),
    tddAck: 'NONE',
    tddUuid: '7f0c-4d91-b3a8-2065',
  }),
  row({
    n: 4,
    number: 'INV-2036',
    counterparty: 'Walk-in customer',
    amount: 4.2,
    when: '2026-09-22T14:33:00Z',
    b2c: true,
    variant: 'B2C',
    tddAck: 'AP',
    clearedIn: 47,
    invoiceAck: 'NONE',
    tddUuid: '2a88-71ef-c049-13b6',
    fawtara: 'OM-2026-0084398',
    scenario: { flow: 7, stand_in_id: '997770000099' },
  }),
  row({
    n: 5,
    number: 'INV-1993',
    counterparty: 'Barka Resort',
    amount: 1842,
    when: '2026-09-08T07:20:00Z',
    tddAck: 'RE',
    tddStatus: 'SUPERSEDED',
    tddUuid: '6c25-b840-1f97-4ae3',
    supersededBy: '6c25-b840-1f97-5b02',
  }),
  row({
    n: 6,
    number: 'INV-2012',
    counterparty: 'Doha Traders',
    amount: 5640,
    when: '2026-09-14T06:02:00Z',
    variant: 'EXPORT',
    tddAck: 'AP',
    clearedIn: 129,
    invoiceAck: 'NONE',
    tddUuid: '0e94-af13-6d27-8850',
    fawtara: 'OM-2026-0084201',
    // An export is reported under TDD scope IP or INP, not with a stand-in ID (997770000097 is
    // not a PINT-OM stand-in; only 997770000099 is published). Zero-rated, so no VAT.
    scenario: { flow: 11, stand_in_id: null },
    scope: 'INP',
    vatRate: 0,
  }),
]

/**
 * The two other invoices the same cause turned down this week (Figma 154:108616): the customer has
 * no Peppol ID. The frame drew these as received by the customer, which a customer with no Peppol
 * ID cannot be, so their invoice leg carries no acknowledgement.
 */
const SAME_CAUSE = [
  ['INV-2042', 612.5, '2026-09-24T07:10:00Z', '5d02-81aa-3c7e-90b4', 7],
  ['INV-2040', 580.5, '2026-09-23T09:55:00Z', '1e6b-4f20-a9d3-6c18', 8],
].map(([number, amount, when, tddUuid, n]) =>
  row({
    n,
    number,
    counterparty: 'Barka Resort',
    amount,
    when,
    tddAck: 'RE',
    tddStatus: 'REJECTED',
    reason: 'The customer has no Peppol ID on their record.',
    tddUuid,
    invoiceAck: 'NONE',
    attention: true,
    resubmit: true,
  }),
)

const CUSTOMERS = [
  ['Muscat Grand Hotel', 496],
  ['Sohar Coffee House', 761.04],
  ['Al Mouj Marina', 604.8],
  ['Nizwa Souq Café', 318.78],
  ['Barka Beach Resort', 1204],
  ['Salalah Bakery', 92.4],
]

const TAKEN = new Set(['INV-2012', 'INV-1993'])
const NUMBERS = Array.from({ length: 40 }, (_, i) => `INV-${2035 - i}`).filter((n) => !TAKEN.has(n))

const FILLER = Array.from({ length: 34 }, (_, i) => {
  const [counterparty, amount] = CUSTOMERS[i % CUSTOMERS.length]
  const waiting = false
  // One report delivered without confirmation (MLS AB): its own state, never counted as accepted.
  const unconfirmed = i === 1
  return row({
    n: 100 + i,
    number: NUMBERS[i],
    counterparty,
    amount,
    when: at('2026-09-21T06:00:00Z', -i * 9 * 3600),
    tddAck: waiting ? 'NONE' : unconfirmed ? 'AB' : 'AP',
    clearedIn: 40 + ((i * 17) % 120),
    tddUuid: `${(0x3c9a + i).toString(16)}-1e77-2b04-${(0x4f6a + i * 7).toString(16)}`,
    fawtara: waiting ? null : `OM-2026-00${84100 + i}`,
  })
})

/**
 * Bills and notes suppliers sent us over Peppol: the receiving side's provider reports each one as
 * a TDD with the receipt date and time (PINT-OM TDD, TDT-010 = 02 Receiver, TDOM-04/05). The
 * numbers are the Expenditure mocks' (bills.mjs, supplierNotes.mjs).
 */
const RECEIVED = [
  row({
    n: 200,
    number: 'MR-INV-8821',
    counterparty: 'Muscat Roastery Co',
    participantId: '0248:OM1100581904',
    amount: 2354.31,
    when: '2026-09-20T08:00:00Z',
    direction: 'RECEIVED',
    tddAck: 'AP',
    tddStatus: 'ACCEPTED',
    clearedIn: 61,
    tddUuid: 'b812-3f0a-6e21-9c47',
    fawtara: 'OM-2026-0084122',
  }),
  row({
    n: 201,
    number: 'MR-INV-8755',
    counterparty: 'Muscat Roastery Co',
    participantId: '0248:OM1100581904',
    amount: 1165.5,
    when: '2026-08-30T06:40:00Z',
    direction: 'RECEIVED',
    tddAck: 'AP',
    tddStatus: 'ACCEPTED',
    clearedIn: 58,
    tddUuid: 'b7c4-11d9-40ae-2f63',
    fawtara: 'OM-2026-0083655',
  }),
  row({
    n: 202,
    number: 'AND-CN-0442',
    counterparty: 'Al Noor Dates LLC',
    participantId: '0248:OM1100690233',
    amount: 84.9,
    when: '2026-07-30T09:20:00Z',
    direction: 'RECEIVED',
    documentKind: 'CREDIT_NOTE',
    typeCode: '381',
    tddAck: 'AP',
    tddStatus: 'ACCEPTED',
    clearedIn: 44,
    tddUuid: 'a95e-7c02-d318-4b0f',
    fawtara: 'OM-2026-0082917',
  }),
]

const ITEMS = [
  ...FEATURED,
  ...FILLER.slice(0, 3),
  RECEIVED[0],
  FILLER[3],
  ...SAME_CAUSE,
  ...FILLER.slice(4),
  ...RECEIVED.slice(1),
]

/**
 * A report we replaced (TDD type R) is listed under Superseded only: the ack filters and the
 * summary count the live report of each document. INV-1993's live report is its accepted V2.
 */
const liveAck = (item) => (item.tdd_leg?.status === 'SUPERSEDED' ? 'AP' : item.tdd_leg?.ack)

function inWindow(item, query) {
  const day = item.occurred_at.slice(0, 10)
  const from = query.get('from')
  const to = query.get('to')
  return (!from || day >= from) && (!to || day <= to)
}

function matches(item, query) {
  const tdd = query.get('tdd_ack')
  const status = query.get('tdd_status')
  const direction = query.get('direction')
  const kind = query.get('document_kind')
  const number = (query.get('invoice_number') ?? '').toLowerCase()
  if (query.get('attention') === 'true' && !item.attention) return false
  if (status && item.tdd_leg?.status !== status) return false
  if (tdd && (item.tdd_leg?.status === 'SUPERSEDED' || item.tdd_leg?.ack !== tdd)) return false
  if (kind && item.document_kind !== kind) return false
  if (!inWindow(item, query)) return false
  if (direction && item.direction !== direction) return false
  if (number && !(item.invoice_number ?? '').toLowerCase().includes(number)) return false
  return true
}

function listPage(query) {
  const page = Number(query.get('page') ?? 0)
  const size = Number(query.get('page_size') ?? PAGE_SIZE_DEFAULT)
  const found = ITEMS.filter((item) => matches(item, query))
  return {
    items: found.slice(page * size, page * size + size),
    page,
    page_size: size,
    has_more: (page + 1) * size < found.length,
  }
}

function counts(items, pick) {
  const out = { ap: 0, ab: 0, re: 0, none: 0 }
  for (const item of items) {
    const ack = pick(item)
    if (!ack) continue
    out[ack.toLowerCase()] += 1
  }
  return out
}

function summary(query) {
  if (!query.get('from') || !query.get('to')) {
    return { status: 400, body: { title: 'from and to are required', status: 400 } }
  }
  if (process.env.ACTIVITY_EMPTY) {
    return {
      from: query.get('from'),
      to: query.get('to'),
      documents: 0,
      tdd_ack: { ap: 0, ab: 0, re: 0, none: 0 },
      invoice_ack: { ap: 0, ab: 0, re: 0, none: 0 },
      dead_lettered: 0,
      attention: 0,
      sla: { met: 0, missed: 0, pending: 0 },
      median_minutes_to_tdd_ack: null,
      superseded: 0,
    }
  }
  // The figures follow the Direction filter (ACTIVITY.md 2.33), so sent and received never mix.
  const direction = query.get('direction')
  const items = direction ? ITEMS.filter((item) => item.direction === direction) : ITEMS
  return {
    from: query.get('from'),
    to: query.get('to'),
    documents: items.length,
    tdd_ack: counts(items, liveAck),
    invoice_ack: counts(items, (item) =>
      item.b2c || item.direction === 'RECEIVED' ? null : item.invoice_leg.ack,
    ),
    dead_lettered: 0,
    attention: items.filter((item) => item.attention).length,
    sla: {
      met: items.filter((item) => item.tdd_leg?.sla_met === true).length,
      missed: 0,
      pending: items.filter((item) => item.tdd_leg?.sla_met === null).length,
    },
    median_minutes_to_tdd_ack: 2.23,
    superseded: items.filter((item) => item.tdd_leg?.status === 'SUPERSEDED').length,
    previous_median_minutes_to_tdd_ack: 2.87,
  }
}

/** INV-1993's record as the detail frame (154:111026) tells it: refused, corrected, accepted. */
function detail(id) {
  const item = ITEMS.find((entry) => entry.invoice_uuid === id)
  if (!item) return { status: 404, body: { title: 'Not found', status: 404 } }
  const lineage =
    item.invoice_number === 'INV-1993'
      ? [
          {
            id: 'tdd-1993-1',
            variant: 'B2B',
            status: 'SUPERSEDED',
            validated_at: '2026-09-08T07:20:04Z',
            sla_deadline: '2026-09-09T07:20:04Z',
            submitted_at: '2026-09-08T07:20:07Z',
            sla_met: true,
            failure_reason:
              'Two lines were marked zero-rated but carried VAT at 5%. The report was refused because the category and the rate disagree.',
            transmission_id: 'tx-1993-1',
            tdd_uuid: '6c25-b840-1f97-4ae3',
            error_code: 'OTA-E-1122',
            fawtara_reference: null,
            tdd_type: 'S',
          },
          {
            id: 'tdd-1993-2',
            variant: 'B2B',
            status: 'ACKNOWLEDGED',
            validated_at: '2026-09-09T04:41:10Z',
            sla_deadline: '2026-09-10T04:41:10Z',
            submitted_at: '2026-09-09T04:41:12Z',
            sla_met: true,
            failure_reason: null,
            transmission_id: 'tx-1993-2',
            tdd_uuid: '6c25-b840-1f97-5b02',
            error_code: null,
            fawtara_reference: 'OM-2026-0083907',
            // The corrected report we sent to replace V1.
            tdd_type: 'R',
          },
        ]
      : [
          {
            id: `tdd-${item.invoice_number}`,
            variant: item.tdd_leg?.variant ?? 'B2B',
            status: item.tdd_leg?.status ?? 'SUBMITTED',
            validated_at: item.tdd_leg?.validated_at ?? null,
            sla_deadline: item.tdd_leg?.sla_deadline ?? null,
            submitted_at: item.tdd_leg?.submitted_at ?? null,
            sla_met: item.tdd_leg?.sla_met ?? null,
            failure_reason: item.tdd_leg?.reason ?? null,
            transmission_id: null,
            tdd_uuid: item.tdd_uuid,
            // The design's code for a missing buyer Peppol ID; other refusals carry none here.
            error_code:
              item.tdd_leg?.ack === 'RE' && /peppol id/i.test(item.tdd_leg?.reason ?? '')
                ? 'OTA-E-2041'
                : null,
            fawtara_reference: item.fawtara_reference,
          },
        ]
  const summaryRow =
    item.invoice_number === 'INV-1993'
      ? {
          ...item,
          tdd_leg: {
            ...item.tdd_leg,
            status: 'ACKNOWLEDGED',
            ack: 'AP',
            ack_at: '2026-09-09T04:43:05Z',
            submitted_at: '2026-09-09T04:41:12Z',
          },
          invoice_leg: { ack: 'AP', ack_at: '2026-09-09T10:02:31Z', reason: null },
          tdd_uuid: '6c25-b840-1f97-5b02',
          fawtara_reference: 'OM-2026-0083907',
          superseded_by: null,
          counterparty: 'Barka Beach Resort',
          counterparty_participant_id: '0248:OM1100558840',
        }
      : item
  return {
    invoice_uuid: id,
    summary: summaryRow,
    tdd_lineage: lineage,
    // On a received document the MLS replies are ours to them, not theirs to us.
    mls:
      item.direction === 'RECEIVED'
        ? []
        : [
            {
              channel: 'INVOICE',
              ack: 'AB',
              received_at: at(item.occurred_at, 288),
              sender: '0248:OM1100558840',
              sbdh_instance_identifier: 'sbdh-1',
              reason: null,
            },
            {
              channel: 'INVOICE',
              ack: summaryRow.invoice_leg.ack,
              received_at: summaryRow.invoice_leg.ack_at,
              sender: '0248:OM1100558840',
              sbdh_instance_identifier: 'sbdh-2',
              reason: null,
            },
          ],
    transmissions: [],
  }
}

export default [
  { match: '/api/v1/compliance/activity/summary', reply: ({ query }) => summary(query) },
  {
    match: '/api/v1/compliance/activity',
    reply: ({ query }) =>
      process.env.ACTIVITY_EMPTY
        ? { items: [], page: 0, page_size: 25, has_more: false }
        : listPage(query),
  },
  { match: /^\/api\/v1\/compliance\/activity\/([^/]+)$/, reply: ({ params }) => detail(params[0]) },
  {
    method: 'POST',
    match: /^\/api\/v1\/invoices\/([^/]+)\/tdd\/resubmit$/,
    reply: () => ({ status: 202, body: { accepted: true } }),
  },
]
