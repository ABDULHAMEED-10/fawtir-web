/**
 * Income › credit and debit notes: the sales notes of Al Bahja Coffee, in the shapes
 * `src/api/invoices/{list,detail,drafts}.ts` expect, plus the invoices they correct, their
 * customers, and the draft → issue round trip the composer makes.
 *
 * Every figure is derived from the lines (5% VAT, three decimals, half-up), never typed.
 */

const TODAY = '2026-09-25'

const CUSTOMERS = {
  'c-mgh': { name: 'Muscat Grand Hotel LLC', vat: 'OM1100447102', peppol: 'ACTIVE' },
  'c-sgm': { name: 'Sohar Grand Mall', vat: 'OM1100512890', peppol: 'ACTIVE' },
  'c-qbc': { name: 'Qurum Business Center', vat: 'OM1100230077', peppol: 'ACTIVE' },
  'c-bfr': { name: 'Bahla Fort Restaurant', vat: 'OM1100778120', peppol: 'PENDING_VERIFICATION' },
  'c-nsc': { name: 'Nizwa Souq Café', vat: 'OM1100645331', peppol: 'ACTIVE' },
  'c-sbr': { name: 'Salalah Beach Resort', vat: 'OM1100902244', peppol: 'ACTIVE' },
  'c-spl': { name: 'Sohar Port Logistics', vat: 'OM1100999001', peppol: 'ACTIVE' },
}

const BRANCHES = [
  {
    id: 'b-main',
    code: 'MAIN',
    name: 'Al Bahja Coffee (Main)',
    type: 'HEAD_OFFICE',
    city: 'Muscat',
  },
  { id: 'b-seeb', code: 'SEEB', name: 'Al Bahja Coffee (Seeb)', type: 'BRANCH', city: 'Seeb' },
]

const round3 = (value) => Math.round((value + Number.EPSILON) * 1000) / 1000

function line(
  lineNumber,
  description,
  unitCode,
  quantity,
  unitPrice,
  discountValue = 0,
  productId = null,
) {
  return {
    lineNumber,
    productId,
    productCode: productId ? productId.toUpperCase() : null,
    description,
    unitCode,
    quantity,
    unitPrice,
    discountType: 'PERCENTAGE',
    discountValue,
    taxCategoryCode: 'S5',
    en16931Category: 'S',
    taxRate: 5,
    exemptionReason: null,
  }
}

function totalsOf(lines) {
  let subtotal = 0
  let discount = 0
  let taxable = 0
  let vat = 0
  for (const l of lines) {
    const gross = round3(l.quantity * l.unitPrice)
    const off = round3(gross * (l.discountValue / 100))
    const net = round3(gross - off)
    subtotal += gross
    discount += off
    taxable += net
    vat += round3(net * (l.taxRate / 100))
  }
  return {
    subtotal: round3(subtotal),
    itemLevelDiscount: round3(discount),
    headerDiscount: 0,
    totalDiscount: round3(discount),
    taxableAmount: round3(taxable),
    vatAmount: round3(vat),
    totalAmount: round3(taxable + vat),
    payableRoundingAmount: 0,
    outputScale: 3,
  }
}

const daysBetween = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

/** One authored document, as `InvoiceResponse` answers it, with its receivable beside it. */
function doc({
  id,
  type,
  number,
  customerId,
  branchId = 'b-main',
  state = 'ISSUED',
  delivery = 'SENT_MANUALLY',
  issueDate = null,
  dueDate = null,
  lines,
  reason = null,
  subject = null,
  note = null,
  po = null,
  correctionOf = null,
  paid = 0,
  credited = 0,
  terms = { code: 'NET30', label: 'Net 30 days' },
}) {
  const issued = state !== 'DRAFT'
  const totals = issued ? totalsOf(lines) : null
  const receivableKind = type === 'INVOICE' || type === 'DEBIT_NOTE'
  const outstanding =
    totals && receivableKind ? Math.max(0, round3(totals.totalAmount - paid - credited)) : null
  const paymentState =
    !issued || state !== 'ISSUED' || !receivableKind
      ? 'NOT_APPLICABLE'
      : outstanding === 0
        ? 'PAID'
        : paid > 0
          ? 'PARTIALLY_PAID'
          : 'UNPAID'
  const overdue =
    paymentState !== 'PAID' &&
    paymentState !== 'NOT_APPLICABLE' &&
    dueDate !== null &&
    dueDate < TODAY
  return {
    id,
    type,
    correctionOfInvoiceId: correctionOf,
    version: issued ? 2 : 0,
    authoringState: state,
    deliveryState: state === 'ISSUED' ? delivery : 'NOT_SUBMITTED',
    deliveryBlocker: null,
    customerId,
    branchId,
    currency: 'OMR',
    vatMode: 'EXCLUSIVE',
    invoiceNumber: issued ? number : null,
    issueDate: issued ? issueDate : null,
    dueDate: issued ? dueDate : null,
    issuedAt: issued && issueDate ? `${issueDate}T07:03:00Z` : null,
    details: {
      deliveryDate: null,
      subject,
      purchaseOrderReference: po,
      customerVisibleNote: note,
      paymentTerms: terms,
      paymentMethod: null,
      correctionReasonCode: reason,
      buyerReference: null,
      contractReference: null,
      transactionType: 'FULL_TAX',
      transactionSubtypes: [],
      invoicingPeriod: null,
    },
    headerDiscount: { type: 'PERCENTAGE', value: 0 },
    lines,
    totals,
    // Row-only members the list reads.
    customerName: CUSTOMERS[customerId].name,
    payment: {
      state: paymentState,
      overdue,
      daysOverdue: overdue ? daysBetween(dueDate, TODAY) : null,
      paidAmount: receivableKind && issued ? paid : null,
      creditedAmount: receivableKind && issued ? credited : null,
      outstandingAmount: outstanding,
    },
    // The receivable read, kept beside the document.
    _receivable: {
      documentTotal: totals ? totals.totalAmount : null,
      paidAmount: paid,
      creditedAmount: credited,
      outstandingAmount: outstanding,
      currency: 'OMR',
      paymentState,
      overdue,
      dueDate,
    },
    _paid: paid,
  }
}

// The invoices the notes correct. INV-2044 was paid and then credited in full by CRN-0087, so
// the credit overshoots what was owed (a refund of 7.320); INV-2046 is the part-paid one the
// debit note DBN-0043 adjusts and the composer starts from.
const INVOICES = [
  doc({
    id: 'inv-2044',
    type: 'INVOICE',
    number: 'INV-2044',
    customerId: 'c-mgh',
    issueDate: '2026-07-18',
    dueDate: '2026-08-17',
    po: 'PO-88213',
    subject: 'Ramadan 2026 supply',
    lines: [
      line(1, 'Cappuccino — Large', 'EA', 12, 1.8, 0, 'p-cap-l'),
      line(2, 'Coffee Beans 1kg — H Blend', 'KGM', 4, 9.5, 10, 'p-beans-h'),
    ],
    paid: 30,
    credited: 35.91,
  }),
  doc({
    id: 'inv-2046',
    type: 'INVOICE',
    number: 'INV-2046',
    customerId: 'c-mgh',
    issueDate: '2026-08-18',
    dueDate: '2026-09-17',
    po: 'PO-88240',
    lines: [
      line(1, 'Cappuccino — Large', 'EA', 12, 1.8, 0, 'p-cap-l'),
      line(2, 'Coffee Beans 1kg — House Blend', 'KGM', 4, 9.5, 10, 'p-beans-house'),
    ],
    paid: 30,
  }),
  doc({
    id: 'inv-2035',
    type: 'INVOICE',
    number: 'INV-2035',
    customerId: 'c-sgm',
    branchId: 'b-seeb',
    issueDate: '2026-07-02',
    dueDate: '2026-08-01',
    lines: [line(1, 'Cappuccino — Large', 'EA', 40, 1.8, 0, 'p-cap-l')],
    paid: 75.6,
  }),
  doc({
    id: 'inv-2041',
    type: 'INVOICE',
    number: 'INV-2041',
    customerId: 'c-qbc',
    branchId: 'b-seeb',
    issueDate: '2026-07-11',
    dueDate: '2026-08-10',
    lines: [line(1, 'Cold brew concentrate 1L', 'LTR', 24, 1, 0, 'p-cold-brew')],
    paid: 25.2,
  }),
  doc({
    id: 'inv-2033',
    type: 'INVOICE',
    number: 'INV-2033',
    customerId: 'c-bfr',
    issueDate: '2026-06-28',
    dueDate: '2026-07-28',
    lines: [line(1, 'Espresso beans 250g', 'PK', 30, 0.6, 0, 'p-esp-250')],
    paid: 18.9,
  }),
  doc({
    id: 'inv-2038',
    type: 'INVOICE',
    number: 'INV-2038',
    customerId: 'c-nsc',
    issueDate: '2026-07-05',
    dueDate: '2026-08-04',
    lines: [line(1, 'Event catering — coffee bar', 'HUR', 8, 2.975, 0, 'p-catering')],
    paid: 24.99,
  }),
  doc({
    id: 'inv-2037',
    type: 'INVOICE',
    number: 'INV-2037',
    customerId: 'c-sbr',
    issueDate: '2026-07-04',
    dueDate: '2026-08-03',
    lines: [line(1, 'Coffee Beans 1kg — H Blend', 'KGM', 10, 9.5, 0, 'p-beans-h')],
    paid: 99.75,
  }),
  doc({
    id: 'inv-2042',
    type: 'INVOICE',
    number: 'INV-2042',
    customerId: 'c-spl',
    issueDate: '2026-07-14',
    dueDate: '2026-08-13',
    lines: [line(1, 'Cold brew concentrate 1L', 'LTR', 12, 1, 0, 'p-cold-brew')],
    paid: 0,
  }),
]

const CREDIT_NOTES = [
  doc({
    id: 'crn-0087',
    type: 'CREDIT_NOTE',
    number: 'CRN-0087',
    customerId: 'c-mgh',
    correctionOf: 'inv-2044',
    issueDate: '2026-09-22',
    dueDate: '2026-09-22',
    delivery: 'NOT_SUBMITTED',
    reason: 'QTY',
    subject: 'RMA-0142',
    po: 'PO-88213',
    note: '4 kg of H Blend returned on 22 Sep due to a quality issue. Credited in full including VAT.',
    lines: [line(1, 'Coffee Beans 1kg — H Blend', 'KGM', 4, 9.5, 10, 'p-beans-h')],
  }),
  doc({
    id: 'crn-0086',
    type: 'CREDIT_NOTE',
    number: 'CRN-0086',
    customerId: 'c-qbc',
    branchId: 'b-seeb',
    correctionOf: 'inv-2041',
    issueDate: '2026-09-19',
    dueDate: '2026-09-19',
    reason: 'VAL',
    lines: [line(1, 'Cold brew concentrate 1L', 'LTR', 6, 1, 0, 'p-cold-brew')],
  }),
  doc({
    id: 'crn-0085',
    type: 'CREDIT_NOTE',
    number: 'CRN-0085',
    customerId: 'c-nsc',
    correctionOf: 'inv-2038',
    issueDate: '2026-09-14',
    dueDate: '2026-09-14',
    reason: 'CAN',
    lines: [line(1, 'Event catering — coffee bar', 'HUR', 4, 2.975, 0, 'p-catering')],
  }),
  doc({
    id: 'crn-0084',
    type: 'CREDIT_NOTE',
    number: null,
    customerId: 'c-sbr',
    correctionOf: 'inv-2037',
    state: 'DRAFT',
    reason: 'OTH',
    lines: [line(1, 'Goodwill discount', 'EA', 1, 3.048)],
  }),
  doc({
    id: 'crn-0083',
    type: 'CREDIT_NOTE',
    number: 'CRN-0083',
    customerId: 'c-sgm',
    branchId: 'b-seeb',
    correctionOf: 'inv-2035',
    issueDate: '2026-09-11',
    dueDate: '2026-09-11',
    reason: 'QTY',
    lines: [line(1, 'Cappuccino — Large', 'EA', 5, 1.7, 0, 'p-cap-l')],
  }),
  doc({
    id: 'crn-0082',
    type: 'CREDIT_NOTE',
    number: 'CRN-0082',
    customerId: 'c-bfr',
    correctionOf: 'inv-2033',
    issueDate: '2026-09-08',
    dueDate: '2026-09-08',
    reason: 'VAL',
    lines: [line(1, 'Espresso beans 250g', 'PK', 4, 0.6, 0, 'p-esp-250')],
  }),
  doc({
    id: 'crn-0081',
    type: 'CREDIT_NOTE',
    number: 'CRN-0081',
    customerId: 'c-spl',
    correctionOf: 'inv-2042',
    state: 'CANCELLED',
    issueDate: '2026-08-28',
    dueDate: '2026-08-28',
    reason: 'OTH',
    lines: [line(1, 'Freight charged twice', 'EA', 1, 4)],
  }),
  ...['c-mgh', 'c-sgm', 'c-qbc', 'c-bfr', 'c-nsc', 'c-sbr', 'c-spl'].map((customerId, index) =>
    doc({
      id: `crn-00${80 - index}`,
      type: 'CREDIT_NOTE',
      number: `CRN-00${80 - index}`,
      customerId,
      correctionOf: 'inv-2044',
      issueDate: `2026-08-${String(24 - index * 3).padStart(2, '0')}`,
      dueDate: `2026-08-${String(24 - index * 3).padStart(2, '0')}`,
      reason: ['VAL', 'QTY', 'OTH'][index % 3],
      lines: [line(1, 'Cappuccino — Large', 'EA', 2 + index, 1.8, 0, 'p-cap-l')],
    }),
  ),
]

const DEBIT_NOTES = [
  doc({
    id: 'dbn-0043',
    type: 'DEBIT_NOTE',
    number: 'DBN-0043',
    customerId: 'c-mgh',
    correctionOf: 'inv-2046',
    issueDate: '2026-09-23',
    dueDate: '2026-10-23',
    delivery: 'NOT_SUBMITTED',
    reason: 'VAL',
    subject: 'CA-2026-03',
    po: 'PO-88240',
    note: 'House Blend was invoiced at the old contract rate of 9.500/kg. The rate agreed from 1 September is 10.250/kg, so this note charges the 0.750/kg difference on 4 kg.',
    lines: [line(1, 'Coffee Beans 1kg — House Blend', 'KGM', 4, 0.75, 0, 'p-beans-house')],
  }),
  doc({
    id: 'dbn-0041',
    type: 'DEBIT_NOTE',
    number: 'DBN-0041',
    customerId: 'c-sgm',
    branchId: 'b-seeb',
    correctionOf: 'inv-2035',
    issueDate: '2026-09-18',
    dueDate: '2026-10-18',
    reason: 'QTY',
    lines: [line(1, 'Additional delivery — beans', 'KGM', 10, 0.85, 0, 'p-beans-h')],
  }),
  doc({
    id: 'dbn-0040',
    type: 'DEBIT_NOTE',
    number: 'DBN-0040',
    customerId: 'c-qbc',
    branchId: 'b-seeb',
    correctionOf: 'inv-2041',
    issueDate: '2026-08-14',
    dueDate: '2026-09-13',
    reason: 'OTH',
    lines: [line(1, 'Freight omitted from invoice', 'EA', 1, 6)],
  }),
  doc({
    id: 'dbn-0039',
    type: 'DEBIT_NOTE',
    number: 'DBN-0039',
    customerId: 'c-bfr',
    correctionOf: 'inv-2033',
    issueDate: '2026-08-20',
    dueDate: '2026-09-19',
    reason: 'VAT',
    lines: [line(1, 'VAT correction — standard rate applied', 'EA', 1, 2.4)],
    paid: 2.52,
  }),
  doc({
    id: 'dbn-0038',
    type: 'DEBIT_NOTE',
    number: 'DBN-0038',
    customerId: 'c-nsc',
    correctionOf: 'inv-2038',
    issueDate: '2026-08-10',
    dueDate: '2026-09-09',
    reason: 'OTH',
    lines: [line(1, 'Late payment charge', 'EA', 1, 12)],
    paid: 12.6,
  }),
  doc({
    id: 'dbn-0037',
    type: 'DEBIT_NOTE',
    number: null,
    customerId: 'c-qbc',
    branchId: 'b-seeb',
    correctionOf: 'inv-2041',
    state: 'DRAFT',
    reason: 'VAL',
    lines: [line(1, 'Price escalation — cold brew', 'LTR', 8, 0.4, 0, 'p-cold-brew')],
  }),
  doc({
    id: 'dbn-0036',
    type: 'DEBIT_NOTE',
    number: 'DBN-0036',
    customerId: 'c-spl',
    correctionOf: 'inv-2042',
    state: 'CANCELLED',
    issueDate: '2026-08-05',
    dueDate: '2026-09-04',
    reason: 'OTH',
    lines: [line(1, 'Handling fee', 'EA', 1, 3)],
  }),
  ...['c-mgh', 'c-sgm', 'c-qbc', 'c-bfr', 'c-nsc', 'c-sbr'].map((customerId, index) =>
    doc({
      id: `dbn-00${35 - index}`,
      type: 'DEBIT_NOTE',
      number: `DBN-00${35 - index}`,
      customerId,
      correctionOf: 'inv-2044',
      issueDate: `2026-07-${String(28 - index * 3).padStart(2, '0')}`,
      dueDate: `2026-08-${String(27 - index * 3).padStart(2, '0')}`,
      reason: ['VAL', 'QTY', 'OTH'][index % 3],
      lines: [line(1, 'Surcharge — weekend delivery', 'EA', 1 + index, 1.5)],
      paid: round3((1 + index) * 1.5 * 1.05),
    }),
  ),
]

const DOCS = new Map([...INVOICES, ...CREDIT_NOTES, ...DEBIT_NOTES].map((d) => [d.id, d]))
const numberOf = (id) => DOCS.get(id)?.invoiceNumber ?? null

const PAYMENTS = new Map(
  [...DEBIT_NOTES, ...INVOICES]
    .filter((d) => d._paid > 0)
    .map((d) => [
      d.id,
      [
        {
          id: `pay-${d.id}`,
          entryType: 'PAYMENT',
          reversalOfPaymentId: null,
          amount: d._paid,
          currency: 'OMR',
          methodCode: '30',
          paymentReference: `TRF-${d.invoiceNumber}`,
          paymentDate: d.dueDate && d.dueDate < TODAY ? d.dueDate : '2026-09-21',
          occurredAt: '2026-09-21T09:12:00Z',
        },
      ],
    ]),
)

const ATTACHMENTS = new Map([
  [
    'crn-0087',
    [
      {
        id: 'att-1',
        filename: 'RMA-0142-return-note.pdf',
        contentType: 'application/pdf',
        byteSize: 184320,
        sha256: 'a'.repeat(64),
        attachedAt: '2026-09-22T06:40:00Z',
      },
    ],
  ],
])

const INTERNAL_NOTES = new Map([
  [
    'crn-0087',
    'Return inspected by warehouse. Refund of 7.320 to be paid to the client bank account on file.',
  ],
  [
    'dbn-0043',
    'Rate change signed off by Hafidh on 20 Sep. Flagged to Aisha to reprice the remaining Ramadan supply schedule so this does not recur.',
  ],
])

function historyOf(d) {
  const entries = []
  const at = (date, time) => `${date}T${time}:00Z`
  const created = d.issueDate ?? '2026-09-24'
  entries.push({
    id: `${d.id}-1`,
    eventType: 'DRAFT_CREATED',
    outcome: 'SUCCEEDED',
    invoiceVersion: 0,
    changedFieldsHash: null,
    actorId: 'u-nasser',
    occurredAt: at(created, '06:58'),
  })
  if (d.authoringState !== 'DRAFT') {
    entries.push({
      id: `${d.id}-2`,
      eventType:
        d.type === 'CREDIT_NOTE'
          ? 'CREDIT_NOTE_ISSUED'
          : d.type === 'DEBIT_NOTE'
            ? 'DEBIT_NOTE_ISSUED'
            : 'ISSUED',
      outcome: 'SUCCEEDED',
      invoiceVersion: 1,
      changedFieldsHash: null,
      actorId: 'u-nasser',
      occurredAt: at(d.issueDate, '07:03'),
    })
  }
  if (d.deliveryState === 'SENT_MANUALLY')
    entries.push({
      id: `${d.id}-3`,
      eventType: 'MARKED_SENT_MANUALLY',
      outcome: 'SUCCEEDED',
      invoiceVersion: 2,
      changedFieldsHash: null,
      actorId: 'u-nasser',
      occurredAt: at(d.issueDate, '07:22'),
    })
  if (d._paid > 0)
    entries.push({
      id: `${d.id}-4`,
      eventType: 'PAYMENT_RECORDED',
      outcome: 'SUCCEEDED',
      invoiceVersion: 2,
      changedFieldsHash: null,
      actorId: 'u-nasser',
      occurredAt: '2026-09-21T09:12:00Z',
    })
  if (d.authoringState === 'CANCELLED')
    entries.push({
      id: `${d.id}-5`,
      eventType: 'CANCELLED',
      outcome: 'SUCCEEDED',
      invoiceVersion: 3,
      changedFieldsHash: null,
      actorId: 'u-nasser',
      occurredAt: at(d.issueDate, '11:40'),
    })
  return { entries: entries.reverse(), truncated: false, limit: 200 }
}

/** `InvoiceResponse` as the list and the detail read it: the document, plus the row members. */
function publicView(d) {
  const { _receivable, _paid, ...rest } = d
  return {
    ...rest,
    correctionOfInvoiceNumber: rest.correctionOfInvoiceId
      ? numberOf(rest.correctionOfInvoiceId)
      : null,
  }
}

function listReply(query) {
  const states = (query.get('state') ?? '').split(',').filter(Boolean)
  const payment = query.get('payment')
  const type = query.get('type')
  const q = (query.get('q') ?? '').trim().toLowerCase()
  const from = query.get('from')
  const to = query.get('to')
  const correctionOf = query.get('correction_of_invoice_id')
  const sort = query.get('sort') ?? 'UPDATED'
  const page = Number(query.get('page') ?? 0)
  const size = Number(query.get('size') ?? 20)
  let rows = [...DOCS.values()]
  if (type) rows = rows.filter((d) => d.type === type)
  if (states.length > 0) rows = rows.filter((d) => states.includes(d.authoringState))
  if (payment === 'AWAITING')
    rows = rows.filter(
      (d) =>
        (d.payment.state === 'UNPAID' || d.payment.state === 'PARTIALLY_PAID') &&
        !d.payment.overdue,
    )
  if (payment === 'OVERDUE') rows = rows.filter((d) => d.payment.overdue)
  if (payment === 'PAID') rows = rows.filter((d) => d.payment.state === 'PAID')
  if (correctionOf) rows = rows.filter((d) => d.correctionOfInvoiceId === correctionOf)
  if (from) rows = rows.filter((d) => d.issueDate && d.issueDate >= from)
  if (to) rows = rows.filter((d) => d.issueDate && d.issueDate <= to)
  if (q)
    rows = rows.filter((d) =>
      [d.invoiceNumber, d.customerName, numberOf(d.correctionOfInvoiceId)].some(
        (v) => v && v.toLowerCase().includes(q),
      ),
    )
  const amount = (d) => d.totals?.totalAmount ?? 0
  const byDate = (a, b) => (b.issueDate ?? '9999').localeCompare(a.issueDate ?? '9999')
  const sorters = {
    UPDATED: byDate,
    ISSUED_NEWEST: byDate,
    ISSUED_OLDEST: (a, b) => -byDate(a, b),
    DUE_SOONEST: (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
    AMOUNT_HIGHEST: (a, b) => amount(b) - amount(a),
    AMOUNT_LOWEST: (a, b) => amount(a) - amount(b),
    CUSTOMER: (a, b) => a.customerName.localeCompare(b.customerName),
  }
  rows.sort(sorters[sort] ?? byDate)
  const content = rows.slice(page * size, page * size + size).map(publicView)
  return {
    content,
    page,
    number: page,
    size,
    totalElements: rows.length,
    totalPages: Math.ceil(rows.length / size),
  }
}

let nextDraft = 1
let nextNumber = { CREDIT_NOTE: 88, DEBIT_NOTE: 44 }

function draftFrom(kind, invoiceId, body) {
  const invoice = DOCS.get(invoiceId)
  const id = `note-draft-${nextDraft++}`
  const created = doc({
    id,
    type: kind,
    number: null,
    customerId: body.customerId ?? invoice?.customerId ?? 'c-mgh',
    branchId: body.branchId ?? 'b-main',
    state: 'DRAFT',
    correctionOf: invoiceId,
    reason: body.details?.correctionReasonCode ?? null,
    subject: body.details?.subject ?? null,
    note: body.details?.customerVisibleNote ?? null,
    po: body.details?.purchaseOrderReference ?? null,
    lines: (body.lines ?? []).map((l, i) => ({
      ...line(
        i + 1,
        l.description,
        l.unitCode,
        l.quantity,
        l.unitPrice,
        l.discount?.value ?? 0,
        l.productId || null,
      ),
      taxRate: l.taxCategory?.rate ?? 5,
    })),
  })
  DOCS.set(id, created)
  return created
}

function draftView(d) {
  const view = publicView(d)
  return {
    ...view,
    lines: view.lines.map((l) => ({
      ...l,
      productId: l.productId ?? '',
      productCode: l.productCode ?? '',
    })),
  }
}

const ENTITLEMENTS = {
  userId: 'u-nasser',
  username: 'nasser.alhabsi',
  tenantId: 't-fawtir',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: [
    'invoice.read',
    'invoice.write',
    'invoice.draft',
    'invoice.issue',
    'invoice.cancel',
    'invoice.export',
    'invoice.approve',
    'invoice.payment.manage',
    'invoice.internal-note.read',
    'invoice.attachment.manage',
    'creditnote.create',
    'debitnote.create',
    'customer.read',
    'supplier.read',
    'product.read',
    'admin.settings.manage',
  ],
  scopes: [],
  featureFlags: {},
}

export default [
  // A full tenant session, so every gate on these screens opens (module routes win over the static one).
  { match: '/api/v1/me/entitlements', reply: () => ENTITLEMENTS },
  { match: '/api/v1/branches', reply: () => BRANCHES },
  {
    match: /^\/api\/v1\/customers\/([^/]+)$/,
    reply: ({ params }) => {
      const c = CUSTOMERS[params[0]]
      if (!c) return { status: 404 }
      return {
        id: params[0],
        type: 'BUSINESS',
        displayName: c.name,
        profile: {
          details: { vatRegistrationNumber: c.vat },
          contact: null,
          deliveryPreferences: null,
          invoiceAddress: null,
        },
        peppolDelivery: c.peppol,
        status: 'ACTIVE',
        updatedAt: '2026-08-01T00:00:00Z',
      }
    },
  },
  { match: '/api/v1/authored-invoices', reply: ({ query }) => listReply(query) },
  {
    match: /^\/api\/v1\/authored-invoices\/([^/]+)$/,
    reply: ({ params }) => {
      const d = DOCS.get(params[0])
      return d ? publicView(d) : { status: 404 }
    },
  },
  {
    match: /^\/api\/v1\/authored-invoices\/([^/]+)\/receivable$/,
    reply: ({ params }) => DOCS.get(params[0])?._receivable ?? { status: 404 },
  },
  {
    match: /^\/api\/v1\/authored-invoices\/([^/]+)\/payments$/,
    reply: ({ params }) => PAYMENTS.get(params[0]) ?? [],
  },
  {
    match: /^\/api\/v1\/authored-invoices\/([^/]+)\/attachments$/,
    reply: ({ params }) => ATTACHMENTS.get(params[0]) ?? [],
  },
  {
    match: /^\/api\/v1\/authored-invoices\/([^/]+)\/history$/,
    reply: ({ params }) => (DOCS.has(params[0]) ? historyOf(DOCS.get(params[0])) : { status: 404 }),
  },
  {
    match: /^\/api\/v1\/authored-invoices\/([^/]+)\/internal-note$/,
    reply: ({ params }) => ({ internalNote: INTERNAL_NOTES.get(params[0]) ?? null }),
  },
  { match: /^\/api\/v1\/authored-invoices\/([^/]+)\/reminders$/, reply: () => [] },
  {
    match: /^\/api\/v1\/authored-invoices\/([^/]+)\/reminders\/preview$/,
    reply: ({ params }) => ({
      invoiceId: params[0],
      invoiceNumber: numberOf(params[0]),
      verdict: 'NO_RUNG_TODAY',
      rung: null,
      recipient: 'accounts@muscatgrand.om',
      language: 'en',
      subject: null,
      body: null,
    }),
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/authored-invoices\/([^/]+)\/(credit|debit)-notes$/,
    reply: ({ params, body }) => ({
      status: 201,
      body: draftView(
        draftFrom(params[1] === 'credit' ? 'CREDIT_NOTE' : 'DEBIT_NOTE', params[0], body ?? {}),
      ),
    }),
  },
  {
    match: /^\/api\/v1\/invoice-drafts\/([^/]+)$/,
    reply: ({ params }) => (DOCS.has(params[0]) ? draftView(DOCS.get(params[0])) : { status: 404 }),
  },
  {
    method: 'PUT',
    match: /^\/api\/v1\/invoice-drafts\/([^/]+)$/,
    reply: ({ params, body }) => {
      const current = DOCS.get(params[0])
      if (!current) return { status: 404 }
      const updated = draftFrom(current.type, current.correctionOfInvoiceId, body?.draft ?? {})
      DOCS.delete(updated.id)
      const kept = { ...updated, id: current.id, version: current.version + 1 }
      DOCS.set(current.id, kept)
      return draftView(kept)
    },
  },
  {
    method: 'DELETE',
    match: /^\/api\/v1\/invoice-drafts\/([^/]+)$/,
    reply: ({ params }) => {
      const current = DOCS.get(params[0])
      if (!current) return { status: 404 }
      const discarded = { ...current, authoringState: 'DISCARDED' }
      DOCS.set(current.id, discarded)
      return draftView(discarded)
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/invoice-drafts\/([^/]+)\/preview$/,
    reply: ({ params }) => {
      const d = DOCS.get(params[0])
      if (!d) return { status: 404 }
      const totals = totalsOf(d.lines)
      return { currency: 'OMR', lines: [], totals }
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/invoice-drafts\/([^/]+)\/issue$/,
    reply: ({ params, body }) => {
      const current = DOCS.get(params[0])
      if (!current) return { status: 404 }
      const number = `${current.type === 'CREDIT_NOTE' ? 'CRN' : 'DBN'}-00${nextNumber[current.type]++}`
      const issued = doc({
        id: current.id,
        type: current.type,
        number,
        customerId: current.customerId,
        branchId: current.branchId,
        state: 'ISSUED',
        delivery: 'NOT_SUBMITTED',
        issueDate: body?.issueDate ?? TODAY,
        dueDate: body?.dueDate ?? TODAY,
        correctionOf: current.correctionOfInvoiceId,
        reason: current.details.correctionReasonCode,
        subject: current.details.subject,
        note: current.details.customerVisibleNote,
        po: current.details.purchaseOrderReference,
        lines: current.lines,
      })
      DOCS.set(current.id, issued)
      return publicView(issued)
    },
  },
]
