/**
 * Expenditure › Bills: Al Bahja Coffee's supplier bills, in the shapes `src/api/expenditure/bills.ts`
 * and `billIntake.ts` expect. The list, its summary, one bill opened (lines, match, payments,
 * activity), the uploads and receipts waiting for their details, the supplier search and record
 * behind the intake form, and the reference data the guarded shell loads.
 *
 * Every summary figure is derived from the rows, never typed, so the cards and the tabs agree.
 * Dates are September 2026; "today" is the 25th.
 */

const TODAY = '2026-09-25'

const SUPPLIERS = {
  's-mrc': {
    name: 'Muscat Roastery Co',
    vat: 'OM1100447102',
    iban: 'OM90 0018 0000 6283 2290',
    bank: 'Bank Muscat',
  },
  's-and': {
    name: 'Al Noor Dates LLC',
    vat: 'OM1100771290',
    iban: 'OM43 0020 0000 1177 4481',
    bank: 'Bank Dhofar',
  },
  's-spl': {
    name: 'Sohar Packaging LLC',
    vat: 'OM1100628391',
    iban: 'OM21 0018 0000 6283 9100',
    bank: 'Bank Muscat',
  },
  's-nhs': { name: 'Nizwa Hardware Store', vat: 'OM1100773310', iban: null, bank: null },
  's-gcl': {
    name: 'Gulf Cold Logistics',
    vat: 'OM1100582341',
    iban: 'OM77 0030 0000 5823 4100',
    bank: 'NBO',
  },
  's-mfl': { name: 'Muscat Fuel LLC', vat: 'OM1100118820', iban: null, bank: null },
  's-afm': { name: 'Al Fayha Market', vat: 'OM1100207140', iban: null, bank: null },
  's-ooc': {
    name: 'Oman Oil Marketing',
    vat: 'OM1100033001',
    iban: 'OM11 0010 0000 0330 0100',
    bank: 'Bank Muscat',
  },
  's-sst': { name: 'Sohar Stationery', vat: 'OM1100948000', iban: null, bank: null },
  's-ntl': {
    name: 'Nizwa Telecom LLC',
    vat: 'OM1100550210',
    iban: 'OM55 0018 0000 5502 1000',
    bank: 'Bank Muscat',
  },
}

const round3 = (value) => Math.round((value + Number.EPSILON) * 1000) / 1000
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
const shift = (iso, days) =>
  new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10)

/** One bill row. `lines` drive the totals; the state and the match are stated. */
function bill(id, supplierId, number, issued, dueDays, lines, extra = {}) {
  const supplier = supplierId ? SUPPLIERS[supplierId] : null
  const net = round3(lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0))
  const vat = round3(
    lines.reduce((sum, l) => sum + (l.quantity * l.unitPrice * (l.vatRate ?? 0)) / 100, 0),
  )
  const total = round3(net + vat)
  const paid = extra.paidAmount ?? 0
  const credited = extra.creditedAmount ?? 0
  // The early-payment discount a payment run took settles the bill too, but is not paid.
  const discounted = extra.discountTaken?.amount ?? 0
  const isCredit = extra.documentTypeCode === '381' || extra.documentTypeCode === '261'
  const outstanding = round3(Math.max(0, total - paid - credited - discounted))
  const dueDate = dueDays === null ? null : shift(issued, dueDays)
  const state = extra.workflowState ?? 'NEW'
  const overdue =
    dueDate !== null &&
    dueDate < TODAY &&
    outstanding > 0 &&
    state !== 'PAID' &&
    state !== 'REJECTED' &&
    !isCredit
  const readiness =
    extra.readiness ??
    (state === 'APPROVED' || state === 'IN_PAYMENT_RUN' || state === 'PAID'
      ? { state: 'READY', distinctApprovals: 1, required: 1, autoApproved: total < 500 }
      : state === 'REJECTED'
        ? { state: 'REJECTED', distinctApprovals: 0, required: 1, autoApproved: false }
        : { state: 'PENDING', distinctApprovals: 0, required: 1, autoApproved: false })
  return {
    id,
    source: extra.source ?? 'PEPPOL',
    supplierId,
    supplierName: supplier ? supplier.name : (extra.supplierName ?? null),
    documentTypeCode: extra.documentTypeCode ?? '380',
    supplierBillNumber: number,
    issueDate: issued,
    dueDate,
    overdue,
    currencyCode: extra.currencyCode ?? 'OMR',
    totalIncludingVat: total,
    vatAmount: vat,
    paidAmount: paid,
    outstandingAmount: outstanding,
    purchaseOrderReference: extra.purchaseOrderReference ?? null,
    workflowState: state,
    readiness,
    match: extra.match ?? null,
    hold: extra.hold ?? null,
    paymentRunReference: extra.paymentRunReference ?? null,
    paidOnTheSpot: extra.paidOnTheSpot ?? false,
    // A debit note's (383) current decision; null on every other document (EXPENDITURE.md 1.24).
    debitNoteDecision: extra.debitNoteDecision ?? null,
    // On a credit note (381, 261), where its credit stands, as a `GET /credit-notes` row says it;
    // null on every other document. Unless stated, nothing of it has been used yet.
    creditNote: isCredit
      ? (extra.creditNote ?? {
          status: 'UNAPPLIED',
          usage: 'NOT_USED',
          balance: { applied: 0, refunded: 0, remaining: total },
        })
      : null,
    // Kept beside the row for the detail; the list ignores them.
    _lines: lines,
    _extra: extra,
  }
}

const L = (description, quantity, unit, unitPrice, vatRate = 5, tax = null) => ({
  description,
  quantity,
  unit,
  unitPrice,
  vatRate,
  // CL-04-OM category and its reason (VATZR-OM-nn on Z, VATEX-OM-nn on E): EXPENDITURE.md R.2.
  taxCategoryCode: tax?.category ?? null,
  exemptionReasonCode: tax?.code ?? null,
  exemptionReason: tax?.text ?? null,
})
/** A zero-rated or exempt line at 0%, with the reason code it must carry. */
const Z = (description, quantity, unit, unitPrice, code) =>
  L(description, quantity, unit, unitPrice, 0, { category: 'Z', code })
const E = (description, quantity, unit, unitPrice, code) =>
  L(description, quantity, unit, unitPrice, 0, { category: 'E', code })
const matched = (po, verdict = 'MATCHED', byHand = false) => ({
  verdict,
  purchaseOrderNumber: po,
  byHand,
})

/** Newest first, as the server orders NEWEST. The five rows the frame draws come first. */
const BILLS = [
  bill(
    'b-mr-8821',
    's-mrc',
    'MR-INV-8821',
    '2026-09-20',
    30,
    [L('Green beans, Yirgacheffe', 300, 'KG', 7.4), L('Jute sacks, 25 kg', 12, 'EA', 1.85)],
    {
      match: matched('PO-0031'),
      inboundDeliveryId: 'd-8821',
    },
  ),
  bill(
    'b-and-3382',
    's-and',
    'AND-INV-3382',
    '2026-09-19',
    30,
    [L('Khalas dates, 5 kg box', 63, 'BX', 14.1)],
    {
      workflowState: 'MISMATCH',
      match: matched('PO-0029', 'MISMATCH'),
      inboundDeliveryId: 'd-3382',
    },
  ),
  bill(
    'b-sp-1140',
    's-spl',
    'SP-INV-1140',
    '2026-09-15',
    14,
    [
      L('Kraft coffee bags 1 kg, printed', 8000, 'EA', 0.24),
      L('Kraft coffee bags 250 g, printed', 12000, 'EA', 0.0892),
    ],
    {
      source: 'UPLOADED',
      workflowState: 'AWAITING_APPROVAL',
      readiness: { state: 'PENDING', distinctApprovals: 0, required: 1, autoApproved: false },
      match: matched('PO-0031', 'MATCHED_BY_HAND', true),
    },
  ),
  bill(
    'b-gcl-2288',
    's-gcl',
    'GCL-2288',
    '2026-09-08',
    30,
    [L('Cold-chain delivery, Muscat to Nizwa', 2, 'EA', 196)],
    {
      workflowState: 'ON_HOLD',
      match: { verdict: 'NO_ORDER', purchaseOrderNumber: null, byHand: false },
      hold: { reason: 'Two deliveries billed twice', openedAt: '2026-09-13T07:40:00Z' },
      inboundDeliveryId: 'd-2288',
    },
  ),
  bill('b-mfl-11820', 's-mfl', '11820', '2026-09-18', null, [L('Diesel 40 L', 1, 'EA', 14.095)], {
    source: 'SCANNED',
    workflowState: 'PAID',
    paidAmount: 14.8,
    paidOnTheSpot: true,
    match: { verdict: 'NO_ORDER', purchaseOrderNumber: null, byHand: false },
  }),
  bill(
    'b-ooc-5510',
    's-ooc',
    'OOC-5510',
    '2026-09-01',
    14,
    [L('Generator diesel, 400 L', 400, 'LTR', 0.29)],
    {
      workflowState: 'APPROVED',
      match: { verdict: 'NO_ORDER', purchaseOrderNumber: null, byHand: false },
      inboundDeliveryId: 'd-5510',
    },
  ),
  bill(
    'b-ntl-0912',
    's-ntl',
    'NTL-2026-0912',
    '2026-08-28',
    21,
    [L('Fibre line, Nizwa branch, September', 1, 'EA', 38)],
    {
      source: 'RECURRING',
      workflowState: 'APPROVED',
    },
  ),
  bill(
    'b-mr-8790',
    's-mrc',
    'MR-INV-8790',
    '2026-09-10',
    30,
    [L('Green beans, Sidamo', 120, 'KG', 6.9)],
    {
      workflowState: 'APPROVED',
      match: matched('PO-0027'),
      inboundDeliveryId: 'd-8790',
    },
  ),
  bill(
    'b-and-3360',
    's-and',
    'AND-INV-3360',
    '2026-09-05',
    30,
    [
      L('Fard dates, 3 kg box', 40, 'BX', 8.2),
      Z('Fresh Khalas dates, loose', 25, 'KG', 1.6, 'VATZR-OM-01'),
      E('Cargo insurance, Nizwa run', 1, 'EA', 6.5, 'VATEX-OM-01'),
    ],
    {
      workflowState: 'APPROVED',
      match: matched('PO-0025'),
      inboundDeliveryId: 'd-3360',
    },
  ),
  bill(
    'b-spl-1102',
    's-spl',
    'SP-INV-1102',
    '2026-08-20',
    30,
    [L('Paper cups 12 oz, printed', 20000, 'EA', 0.031)],
    {
      source: 'UPLOADED',
      workflowState: 'APPROVED',
      paidAmount: 300,
      match: matched('PO-0021'),
    },
  ),
  bill(
    'b-gcl-2240',
    's-gcl',
    'GCL-2240',
    '2026-08-15',
    30,
    [L('Cold-chain delivery, Sohar', 1, 'EA', 210)],
    {
      workflowState: 'APPROVED',
      match: { verdict: 'NO_ORDER', purchaseOrderNumber: null, byHand: false },
      inboundDeliveryId: 'd-2240',
    },
  ),
  bill(
    'b-ooc-5488',
    's-ooc',
    'OOC-5488',
    '2026-08-12',
    14,
    [L('Generator diesel, 300 L', 300, 'LTR', 0.29)],
    {
      workflowState: 'APPROVED',
      match: { verdict: 'NO_ORDER', purchaseOrderNumber: null, byHand: false },
      inboundDeliveryId: 'd-5488',
    },
  ),
  bill(
    'b-mr-8755',
    's-mrc',
    'MR-INV-8755',
    '2026-08-30',
    30,
    [L('Green beans, Yirgacheffe', 150, 'KG', 7.4)],
    {
      workflowState: 'IN_PAYMENT_RUN',
      paymentRunReference: 'RUN-2026-14',
      match: matched('PO-0023'),
      inboundDeliveryId: 'd-8755',
    },
  ),
  bill(
    'b-and-3301',
    's-and',
    'AND-CN-0442',
    '2026-09-12',
    null,
    [L('Returned: Khalas dates, 5 kg box', 3, 'BX', 14.1)],
    {
      documentTypeCode: '381',
      workflowState: 'APPROVED',
      match: { verdict: 'NO_ORDER', purchaseOrderNumber: null, byHand: false },
      inboundDeliveryId: 'd-0442',
    },
  ),
  // A debit note refused and then closed by the supplier's credit note: nothing is owed on it, and
  // it reads "Refused · closed by credit note" under All, never under Paid.
  bill(
    'b-gcl-dn-0093',
    's-gcl',
    'GCL-DN-0093',
    '2026-09-08',
    21,
    [L('Waiting-time surcharge, Salalah', 1, 'EA', 40)],
    {
      documentTypeCode: '383',
      workflowState: 'REFUSED_CLOSED',
      debitNoteDecision: 'REFUSED',
      creditedAmount: 42,
      match: { verdict: 'NO_ORDER', purchaseOrderNumber: null, byHand: false },
    },
  ),
  bill(
    'b-gcl-cn-0094',
    's-gcl',
    'GCL-CN-0094',
    '2026-09-15',
    null,
    [L('Cancels debit note GCL-DN-0093', 1, 'EA', 40)],
    {
      documentTypeCode: '381',
      workflowState: 'APPROVED',
      creditNote: {
        status: 'APPLIED',
        usage: 'FULLY_USED',
        balance: { applied: 42, refunded: 0, remaining: 0 },
      },
      match: { verdict: 'NO_ORDER', purchaseOrderNumber: null, byHand: false },
    },
  ),
  bill(
    'b-gcl-2201',
    's-gcl',
    'GCL-2201',
    '2026-09-02',
    30,
    [L('Service charge, August', 1, 'EA', 95)],
    {
      workflowState: 'REJECTED',
      match: { verdict: 'NO_ORDER', purchaseOrderNumber: null, byHand: false },
      inboundDeliveryId: 'd-2201',
    },
  ),
  bill('b-sst-9480', 's-sst', '9480', '2026-09-16', null, [L('Print paper, ink', 1, 'EA', 9.029)], {
    source: 'SCANNED',
    workflowState: 'PAID',
    paidAmount: 9.48,
    paidOnTheSpot: true,
    match: { verdict: 'NO_ORDER', purchaseOrderNumber: null, byHand: false },
  }),
  bill(
    'b-mr-8702',
    's-mrc',
    'MR-INV-8702',
    '2026-08-01',
    30,
    [L('Green beans, Sidamo', 200, 'KG', 6.9)],
    {
      workflowState: 'PAID',
      // Paid by a payment run that took the supplier's 2% early-payment discount; the supplier's
      // credit note for it has not arrived yet (EXPENDITURE.md row 2.20).
      paidAmount: 1420.02,
      discountTaken: {
        amount: 28.98,
        takenOn: '2026-08-10',
        paymentRunId: 'run-2026-11',
        paymentReference: 'RUN-2026-11',
        creditNoteId: null,
      },
      match: matched('PO-0019'),
      inboundDeliveryId: 'd-8702',
    },
  ),
  bill(
    'b-spl-1080',
    's-spl',
    'SP-INV-1080',
    '2026-07-28',
    30,
    [
      L('Kraft coffee bags 1 kg, printed', 2000, 'EA', 0.24),
      L('Kraft coffee bags 250 g, printed', 1500, 'EA', 0.088),
    ],
    {
      source: 'UPLOADED',
      workflowState: 'PAID',
      paidAmount: 642.6,
      match: matched('PO-0018'),
    },
  ),
  bill(
    'b-ntl-0812',
    's-ntl',
    'NTL-2026-0812',
    '2026-07-28',
    21,
    [L('Fibre line, Nizwa branch, August', 1, 'EA', 38)],
    {
      source: 'RECURRING',
      workflowState: 'PAID',
      // Paid twice, once by hand and once by the bank's standing order: "Overpaid by" 39.900,
      // which the page can refund, keep as credit and set against NTL-2026-0912.
      paidAmount: 79.8,
      paidTwice: true,
    },
  ),
  bill(
    'b-and-3290',
    's-and',
    'AND-INV-3290',
    '2026-07-20',
    30,
    [L('Khalas dates, 5 kg box', 50, 'BX', 14.1)],
    {
      workflowState: 'PAID',
      paidAmount: 740.25,
      match: matched('PO-0016'),
      inboundDeliveryId: 'd-3290',
    },
  ),
  bill('b-afm-20714', 's-afm', '20714', '2026-09-22', null, [L('Milk, sugar', 1, 'EA', 44.667)], {
    source: 'SCANNED',
    workflowState: 'PAID',
    paidAmount: 46.9,
    paidOnTheSpot: true,
    match: { verdict: 'NO_ORDER', purchaseOrderNumber: null, byHand: false },
  }),
  bill(
    'b-sb-0007',
    's-and',
    'SB-2026-0007',
    '2026-09-14',
    30,
    [L('Self-billed: dates supplied to Seeb', 20, 'BX', 14.1)],
    {
      source: 'SELF_BILLED',
      documentTypeCode: '389',
      workflowState: 'APPROVED',
      match: { verdict: 'NO_ORDER', purchaseOrderNumber: null, byHand: false },
    },
  ),
  bill(
    'b-gcl-2150',
    's-gcl',
    'GCL-2150',
    '2026-08-05',
    21,
    [L('Cold-chain delivery, Salalah', 1, 'EA', 320)],
    {
      workflowState: 'APPROVED',
      match: { verdict: 'NO_ORDER', purchaseOrderNumber: null, byHand: false },
      inboundDeliveryId: 'd-2150',
    },
  ),
]

/** Uploads and receipts nobody has confirmed: the design's "Draft, confirm details" rows. */
const INTAKES = [
  intake('i-nhs-4471', 'SCANNED', 'IMG_4471.jpg', 'image/svg+xml', 1_228_800, {
    supplierName: 'Nizwa Hardware Store',
    supplierVatNumber: 'OM1100773310',
    billNumber: '4471',
    issueDate: '2026-09-23',
    total: 28.4,
    vat: 1.35,
    lines: [
      {
        description: 'Wire brush x2',
        quantity: 1,
        unitPrice: 6.4,
        vatRate: 5,
        amount: 6.4,
        confident: true,
      },
      {
        description: 'Sealant tube',
        quantity: 1,
        unitPrice: 4.9,
        vatRate: 5,
        amount: 4.9,
        confident: true,
      },
      {
        description: 'Drain cover',
        quantity: 1,
        unitPrice: 15.75,
        vatRate: 5,
        amount: 15.75,
        confident: true,
      },
    ],
    confidence: { supplierName: true, billNumber: true, issueDate: true, total: true },
  }),
  intake('i-sp-1151', 'UPLOADED', 'SP-INV-1151.pdf', 'image/svg+xml', 253_952, {
    supplierName: 'Sohar Packaging LLC',
    supplierVatNumber: 'OM1100628391',
    billNumber: 'SP-INV-1151',
    issueDate: '2026-09-21',
    dueDate: '2026-10-01',
    currency: 'OMR',
    net: 612,
    vat: 30.6,
    total: 642.6,
    lines: [
      {
        description: 'Kraft coffee bags 1kg, printed',
        quantity: 2000,
        unitPrice: 0.24,
        vatRate: 5,
        amount: 480,
        confident: true,
      },
      {
        description: 'Kraft coffee bags 250g, printed',
        quantity: 1500,
        unitPrice: 0.088,
        vatRate: 5,
        amount: 132,
        confident: true,
      },
      {
        description: 'Pallet handling',
        quantity: 1,
        unitPrice: null,
        vatRate: null,
        amount: null,
        confident: false,
      },
    ],
    confidence: {
      supplierName: true,
      billNumber: true,
      issueDate: true,
      total: true,
      dueDate: false,
    },
  }),
  intake('i-taxi-4472', 'SCANNED', 'IMG_4472.jpg', 'image/svg+xml', 819_200, {}),
]

function intake(id, source, filename, contentType, byteSize, read) {
  return {
    id,
    source,
    filename,
    contentType,
    byteSize,
    sha256: id.replace(/-/g, '').padEnd(64, '0'),
    documentTypeCode: null,
    extractionStatus: 'NONE',
    extracted: {
      supplierName: read.supplierName ?? null,
      supplierVatNumber: read.supplierVatNumber ?? null,
      billNumber: read.billNumber ?? null,
      issueDate: read.issueDate ?? null,
      dueDate: read.dueDate ?? null,
      currency: read.currency ?? null,
      net: read.net ?? null,
      vat: read.vat ?? null,
      total: read.total ?? null,
      lines: read.lines ?? [],
      confidence: read.confidence ?? {},
    },
    confirmedBillId: null,
    workflowState: 'DRAFT',
    uploadedAt: '2026-09-24T06:12:00Z',
  }
}

/* ------------------------------------------------------------------ the list */

const OPEN = new Set([
  'NEW',
  'MISMATCH',
  'AWAITING_APPROVAL',
  'APPROVED',
  'ON_HOLD',
  'IN_PAYMENT_RUN',
])
const isCredit = (row) => row.documentTypeCode === '381' || row.documentTypeCode === '261'

const FILTERS = {
  NEEDS_ATTENTION: (row) => ['NEW', 'MISMATCH', 'AWAITING_APPROVAL'].includes(row.workflowState),
  ALL: () => true,
  AWAITING_APPROVAL: (row) => row.workflowState === 'AWAITING_APPROVAL',
  APPROVED: (row) => row.workflowState === 'APPROVED' || row.workflowState === 'IN_PAYMENT_RUN',
  ON_HOLD: (row) => row.workflowState === 'ON_HOLD',
  PAID: (row) => row.workflowState === 'PAID',
}

const SORTS = {
  NEWEST: () => 0,
  DUE_SOONEST: (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
  DUE_LATEST: (a, b) => (b.dueDate ?? '').localeCompare(a.dueDate ?? ''),
  AMOUNT_HIGHEST: (a, b) => (b.totalIncludingVat ?? 0) - (a.totalIncludingVat ?? 0),
  AMOUNT_LOWEST: (a, b) => (a.totalIncludingVat ?? 0) - (b.totalIncludingVat ?? 0),
  SUPPLIER: (a, b) => (a.supplierName ?? '').localeCompare(b.supplierName ?? ''),
}

const publicRow = ({ _lines, _extra, ...row }) => ({
  ...row,
  overpaidAmount: overpaidOf({ ...row, _extra }),
})

/**
 * What was done with what bills were overpaid by (`BillOverpaymentSettlement`), oldest first.
 * Starts empty; the three POSTs below append to it.
 */
const OVERPAYMENTS = []

/** "Overpaid by": paid and credited beyond the bill, less what was refunded or used elsewhere. */
function overpaidOf(row) {
  if (isCredit(row)) return 0
  const credited = row._extra?.creditedAmount ?? 0
  const excess = round3(Math.max(0, row.paidAmount + credited - (row.totalIncludingVat ?? 0)))
  const settled = OVERPAYMENTS.filter(
    (entry) => entry.billId === row.id && entry.kind !== 'KEPT_AS_CREDIT',
  ).reduce((total, entry) => total + entry.amount, 0)
  return round3(Math.max(0, excess - settled))
}

function overpaymentReply(row) {
  const own = OVERPAYMENTS.filter((entry) => entry.billId === row.id)
  const of = (kind) =>
    round3(own.filter((entry) => entry.kind === kind).reduce((t, entry) => t + entry.amount, 0))
  const overpaid = overpaidOf(row)
  const kept = round3(Math.min(overpaid, Math.max(0, of('KEPT_AS_CREDIT') - of('APPLIED'))))
  return {
    billId: row.id,
    currency: row.currencyCode,
    overpaidAmount: overpaid,
    keptAsCredit: kept,
    undecided: round3(overpaid - kept),
    refunded: of('REFUNDED'),
    applied: of('APPLIED'),
    settlements: own,
  }
}

const refused = (error, extra = {}) => ({
  status: 400,
  body: { type: 'https://api.fawtir.om/problems/expenditure-refused', error, ...extra },
})

function settle(row, kind, amount, extra = {}) {
  const today = new Date().toISOString()
  const entry = {
    id: `op-${OVERPAYMENTS.length + 1}`,
    billId: row.id,
    kind,
    amount: round3(amount),
    currency: row.currencyCode,
    targetBillId: null,
    settledOn: today.slice(0, 10),
    reference: null,
    actorId: 'u-demo',
    occurredAt: today,
    ...extra,
  }
  OVERPAYMENTS.push(entry)
  return { settlement: entry, overpayment: overpaymentReply(row) }
}

function listReply(query) {
  const filter = FILTERS[query.get('filter') ?? 'ALL'] ?? FILTERS.ALL
  const q = (query.get('q') ?? '').trim().toLowerCase()
  const source = query.get('source')
  const supplierId = query.get('supplier_id')
  const sort = SORTS[query.get('sort') ?? 'NEWEST'] ?? SORTS.NEWEST
  const page = Number(query.get('page') ?? 0)
  const pageSize = Number(query.get('page_size') ?? 10)
  const rows = BILLS.filter(filter)
    .filter((row) => !source || row.source === source)
    .filter((row) => !supplierId || row.supplierId === supplierId)
    .filter(
      (row) =>
        !q ||
        (row.supplierName ?? '').toLowerCase().includes(q) ||
        (row.supplierBillNumber ?? '').toLowerCase().includes(q) ||
        (row.match?.purchaseOrderNumber ?? '').toLowerCase().includes(q),
    )
    .sort(sort)
  const items = rows.slice(page * pageSize, (page + 1) * pageSize).map(publicRow)
  return { items, page, pageSize, count: items.length, total: rows.length, truncated: false }
}

function summaryReply() {
  // A supplier debit note (383) nobody has accepted or refused is not owed until accepted (owner,
  // 10 Oct 2026): it leaves Total payable and is counted on its own.
  const undecided = (row) => row.documentTypeCode === '383' && row.debitNoteDecision == null
  const awaitingDecision = BILLS.filter(
    (row) => OPEN.has(row.workflowState) && !isCredit(row) && undecided(row),
  )
  const open = BILLS.filter(
    (row) => OPEN.has(row.workflowState) && !isCredit(row) && !undecided(row),
  )
  const weekEnd = shift(TODAY, 7)
  const dueThisWeek = open.filter(
    (row) => row.dueDate && row.dueDate >= TODAY && row.dueDate <= weekEnd,
  )
  const ready = open.filter((row) => row.workflowState === 'APPROVED')
  const disputed = BILLS.filter((row) => row.workflowState === 'REJECTED')
  const count = (state) => BILLS.filter((row) => row.workflowState === state).length
  const sum = (rows) => round3(rows.reduce((total, row) => total + row.outstandingAmount, 0))
  return {
    currencyCode: 'OMR',
    openCount: open.length,
    openTotal: sum(open),
    overdueCount: open.filter((row) => row.overdue).length,
    dueThisWeekCount: dueThisWeek.length,
    dueThisWeekTotal: sum(dueThisWeek),
    readyToPayCount: ready.length,
    readyToPayTotal: sum(ready),
    disputedCount: disputed.length,
    disputedTotal: sum(disputed),
    debitNotesAwaitingDecisionCount: awaitingDecision.length,
    debitNotesAwaitingDecisionTotal: sum(awaitingDecision),
    excludedFromTotals: 0,
    needsAttention: {
      draft: INTAKES.filter((entry) => entry.confirmedBillId === null).length,
      new: count('NEW'),
      mismatch: count('MISMATCH'),
      awaitingApproval: count('AWAITING_APPROVAL'),
      total: count('NEW') + count('MISMATCH') + count('AWAITING_APPROVAL'),
      truncated: false,
    },
    tabs: {
      needsAttention: BILLS.filter(FILTERS.NEEDS_ATTENTION).length,
      all: BILLS.length,
      awaitingApproval: BILLS.filter(FILTERS.AWAITING_APPROVAL).length,
      approved: BILLS.filter(FILTERS.APPROVED).length,
      onHold: BILLS.filter(FILTERS.ON_HOLD).length,
      paid: BILLS.filter(FILTERS.PAID).length,
      truncated: false,
    },
  }
}

/* ---------------------------------------------------------------- one bill */

const ORDERS = {
  'PO-0031': {
    id: 'po-0031',
    number: 'PO-0031',
    orderDate: '2026-09-11',
    receipt: { id: 'gr-0087', number: 'GRN-0087', receivedOn: '2026-09-19' },
  },
  'PO-0029': {
    id: 'po-0029',
    number: 'PO-0029',
    orderDate: '2026-09-09',
    receipt: { id: 'gr-0085', number: 'GRN-0085', receivedOn: '2026-09-18' },
  },
  'PO-0027': {
    id: 'po-0027',
    number: 'PO-0027',
    orderDate: '2026-09-01',
    receipt: { id: 'gr-0081', number: 'GRN-0081', receivedOn: '2026-09-09' },
  },
  'PO-0025': {
    id: 'po-0025',
    number: 'PO-0025',
    orderDate: '2026-08-27',
    receipt: { id: 'gr-0079', number: 'GRN-0079', receivedOn: '2026-09-04' },
  },
  'PO-0023': {
    id: 'po-0023',
    number: 'PO-0023',
    orderDate: '2026-08-21',
    receipt: { id: 'gr-0075', number: 'GRN-0075', receivedOn: '2026-08-29' },
  },
  'PO-0021': {
    id: 'po-0021',
    number: 'PO-0021',
    orderDate: '2026-08-11',
    receipt: { id: 'gr-0070', number: 'GRN-0070', receivedOn: '2026-08-19' },
  },
  'PO-0019': {
    id: 'po-0019',
    number: 'PO-0019',
    orderDate: '2026-07-22',
    receipt: { id: 'gr-0066', number: 'GRN-0066', receivedOn: '2026-07-31' },
  },
  'PO-0018': {
    id: 'po-0018',
    number: 'PO-0018',
    orderDate: '2026-07-18',
    receipt: { id: 'gr-0064', number: 'GRN-0064', receivedOn: '2026-07-27' },
  },
  'PO-0016': {
    id: 'po-0016',
    number: 'PO-0016',
    orderDate: '2026-07-10',
    receipt: { id: 'gr-0060', number: 'GRN-0060', receivedOn: '2026-07-19' },
  },
}

function detailReply(row) {
  const lines = row._lines
  const extra = row._extra
  const order = row.match?.purchaseOrderNumber ? ORDERS[row.match.purchaseOrderNumber] : null
  const net = round3(row.totalIncludingVat - row.vatAmount)
  // A refused debit note a credit note closed is settled in full, as a paid bill is.
  const paid = row.workflowState === 'PAID' || row.workflowState === 'REFUSED_CLOSED'
  const payments =
    row.paidAmount > 0 && extra.paidTwice
      ? [1, 2].map((n) => ({
          id: `pay-${row.id}-${n}`,
          entryType: 'PAYMENT',
          amount: round3(row.paidAmount / 2),
          currency: row.currencyCode,
          methodCode: '30',
          paymentReference: `TRF-${row.supplierBillNumber}-${n}`,
          paymentDate: shift(row.issueDate, 10 + n),
          occurredAt: `${shift(row.issueDate, 10 + n)}T09:30:00Z`,
        }))
      : row.paidAmount > 0
        ? [
            {
              id: `pay-${row.id}`,
              entryType: 'PAYMENT',
              amount: row.paidAmount,
              currency: row.currencyCode,
              methodCode: row.paidOnTheSpot ? '10' : '30',
              paymentReference: row.paidOnTheSpot ? null : `TRF-${row.supplierBillNumber}`,
              paymentDate: row.paidOnTheSpot ? row.issueDate : shift(row.issueDate, 12),
              occurredAt: `${row.paidOnTheSpot ? row.issueDate : shift(row.issueDate, 12)}T09:30:00Z`,
            },
          ]
        : []
  // The discount a payment run took reads right after the payment it came with: not cash, so no
  // method, and listed only while its payment stands.
  const discount = extra.discountTaken ?? null
  if (discount && payments.length > 0) {
    payments[0].paymentDate = discount.takenOn
    payments[0].occurredAt = `${discount.takenOn}T09:30:00Z`
    payments[0].paymentReference = discount.paymentReference
    payments.push({
      id: `dsc-${row.id}`,
      entryType: 'DISCOUNT',
      amount: discount.amount,
      currency: row.currencyCode,
      methodCode: null,
      paymentReference: discount.paymentReference,
      paymentDate: discount.takenOn,
      occurredAt: `${discount.takenOn}T09:30:00Z`,
    })
  }
  const creditNoteOutstanding = discount && !discount.creditNoteId ? discount.amount : 0
  const arrivedAt = `${row.issueDate}T08:11:00Z`
  const activity = []
  // What became of an overpayment, newest first, in the server's "{amount} {currency} · {other}".
  for (const entry of [...OVERPAYMENTS].reverse()) {
    const received = entry.targetBillId === row.id
    if (entry.billId !== row.id && !received) continue
    const other = received
      ? findBill(entry.billId)?.supplierBillNumber
      : entry.kind === 'APPLIED'
        ? findBill(entry.targetBillId)?.supplierBillNumber
        : entry.reference
    activity.push({
      at: entry.occurredAt,
      kind: received
        ? 'OVERPAYMENT_CREDIT_RECEIVED'
        : {
            REFUNDED: 'OVERPAYMENT_REFUNDED',
            KEPT_AS_CREDIT: 'OVERPAYMENT_KEPT_AS_CREDIT',
            APPLIED: 'OVERPAYMENT_CREDIT_APPLIED',
          }[entry.kind],
      detail: `${entry.amount.toFixed(3)} ${entry.currency}${other ? ` · ${other}` : ''}`,
      actor: 'u-demo',
    })
  }
  if (paid)
    activity.push({
      at: payments[0].occurredAt,
      kind: 'PAID',
      detail: `${row.paidAmount.toFixed(3)} ${row.currencyCode}`,
      actor: 'u-nasser',
    })
  if (row.hold)
    activity.push({
      at: row.hold.openedAt,
      kind: 'HELD',
      detail: row.hold.reason,
      actor: 'u-hafidh',
    })
  if (row.readiness.state === 'READY' && !row.readiness.autoApproved) {
    activity.push({
      at: shift(row.issueDate, 2) + 'T10:05:00Z',
      kind: 'APPROVED',
      detail: null,
      actor: 'u-hafidh',
    })
  }
  if (row.readiness.state === 'REJECTED') {
    activity.push({
      at: shift(row.issueDate, 3) + 'T11:20:00Z',
      kind: 'REJECTED',
      detail: 'Service already billed on GCL-2150',
      actor: 'u-hafidh',
    })
  }
  if (row.match) {
    activity.push({
      at: `${row.issueDate}T08:12:00Z`,
      kind: 'MATCHED',
      detail:
        row.match.verdict === 'MISMATCH'
          ? `MISMATCH — 3 boxes more than we received on ${order?.receipt.number}`
          : row.match.verdict === 'NO_ORDER'
            ? 'NO_ORDER'
            : `MATCHED — Quantities and prices agree with ${order?.number} and ${order?.receipt.number}`,
      actor: null,
    })
  }
  if (row.source === 'UPLOADED' || row.source === 'SCANNED') {
    activity.push({
      at: `${row.issueDate}T08:20:00Z`,
      kind: 'CONFIRMED',
      detail: null,
      actor: 'u-yusuf',
    })
  }
  activity.push({
    at: arrivedAt,
    kind: 'ARRIVED',
    detail: `${row.source} ${row.supplierBillNumber}`,
    actor: null,
  })

  return {
    bill: {
      ...publicRow(row),
      inboundDeliveryId: extra.inboundDeliveryId ?? null,
      networkVerified: row.source === 'PEPPOL',
      amountDue: row.outstandingAmount,
      creditedAmount: extra.creditedAmount ?? 0,
      complianceObligation:
        row.source === 'PEPPOL' ? 'REPORTED_BY_SENDER' : 'PENDING_COMPLIANCE_INPUT',
      match: row.match
        ? {
            ...row.match,
            purchaseOrderId: order?.id ?? null,
            goodsReceiptId: order?.receipt.id ?? null,
            goodsReceiptNumber: order?.receipt.number ?? null,
            summary:
              row.match.verdict === 'MISMATCH'
                ? 'The bill charges 63 boxes; 60 were ordered and 60 received.'
                : row.match.verdict === 'NO_ORDER'
                  ? null
                  : 'Quantities and prices agree with the order and the receipt.',
            matchedAt: row.match.verdict === 'NO_ORDER' ? null : `${row.issueDate}T08:12:00Z`,
          }
        : null,
    },
    lines: lines.map((line, index) => ({
      lineNo: index + 1,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      vatRate: line.vatRate,
      taxCategoryCode: line.taxCategoryCode ?? null,
      exemptionReasonCode: line.exemptionReasonCode ?? null,
      exemptionReason: line.exemptionReason ?? null,
      lineNet: round3(line.quantity * line.unitPrice),
      purchaseOrderLineId: order ? `${order.id}-l${index + 1}` : null,
      goodsReceiptId: order?.receipt.id ?? null,
    })),
    readiness: row.readiness,
    approvals:
      row.readiness.state === 'READY' && !row.readiness.autoApproved
        ? [
            {
              id: `ap-${row.id}`,
              decision: 'APPROVED',
              reason: null,
              decidedBy: 'u-hafidh',
              decidedAt: shift(row.issueDate, 2) + 'T10:05:00Z',
            },
          ]
        : row.readiness.state === 'REJECTED'
          ? [
              {
                id: `ap-${row.id}`,
                decision: 'REJECTED',
                reason: 'Service already billed on GCL-2150',
                decidedBy: 'u-hafidh',
                decidedAt: shift(row.issueDate, 3) + 'T11:20:00Z',
              },
            ]
          : [],
    hold: row.hold
      ? {
          id: `h-${row.id}`,
          reason: row.hold.reason,
          openedBy: 'u-hafidh',
          openedAt: row.hold.openedAt,
          releasedBy: null,
          releasedAt: null,
        }
      : null,
    holdHistory: [],
    settlement: {
      billTotal: row.totalIncludingVat,
      paidAmount: row.paidAmount,
      creditedAmount: extra.creditedAmount ?? 0,
      outstandingAmount: row.outstandingAmount,
      currency: row.currencyCode,
      paymentState: paid ? 'PAID' : row.paidAmount > 0 ? 'PARTIALLY_PAID' : 'UNPAID',
      overdue: row.overdue,
      dueDate: row.dueDate,
      // Moves into creditedAmount once the supplier's credit note for it arrives.
      discountAmount: creditNoteOutstanding,
      overpaidAmount: overpaidOf(row),
    },
    payments,
    paymentRunReference: row.paymentRunReference,
    discountTaken: discount
      ? {
          amount: discount.amount,
          takenOn: discount.takenOn,
          paymentRunId: discount.paymentRunId,
          creditNoteId: discount.creditNoteId,
          creditNoteOutstanding,
        }
      : null,
    intake:
      row.source === 'UPLOADED' || row.source === 'SCANNED'
        ? {
            id: `i-${row.id}`,
            source: row.source,
            filename: `${row.supplierBillNumber}.${row.source === 'SCANNED' ? 'jpg' : 'pdf'}`,
            contentType: row.source === 'SCANNED' ? 'image/jpeg' : 'application/pdf',
            uploadedAt: arrivedAt,
          }
        : null,
    compliance: {
      source: row.source,
      networkVerified: row.source === 'PEPPOL',
      obligation: row.source === 'PEPPOL' ? 'REPORTED_BY_SENDER' : 'PENDING_COMPLIANCE_INPUT',
      // Our own receipt report (om-tdd, reporter role 02): EXPENDITURE.md R.1. One bill still
      // waits on the Tax Authority so the screen shows that state too.
      receiptReport:
        row.source !== 'PEPPOL'
          ? null
          : row.id === 'b-and-3382'
            ? { status: 'SUBMITTED', reportedAt: null, tddUuid: `tdd-${row.id}` }
            : {
                status: 'ACCEPTED',
                reportedAt: `${row.issueDate}T08:14:00Z`,
                tddUuid: `tdd-${row.id}`,
              },
    },
    activity,
    _net: net,
  }
}

function matchReply(row) {
  const order = row.match?.purchaseOrderNumber ? ORDERS[row.match.purchaseOrderNumber] : null
  const mismatch = row.match?.verdict === 'MISMATCH'
  return {
    billId: row.id,
    verdict: row.match?.verdict ?? null,
    purchaseOrderId: order?.id ?? null,
    purchaseOrderNumber: order?.number ?? null,
    goodsReceiptId: order?.receipt.id ?? null,
    goodsReceiptNumber: order?.receipt.number ?? null,
    summary: mismatch
      ? 'The bill charges 63 boxes; 60 were ordered and 60 received.'
      : order
        ? 'Quantities and prices agree with the order and the receipt.'
        : null,
    byHand: row.match?.byHand ?? false,
    matchedAt: order ? `${row.issueDate}T08:12:00Z` : null,
    comparison: order
      ? row._lines.map((line) => ({
          description: line.description,
          orderedQuantity: mismatch ? line.quantity - 3 : line.quantity,
          receivedQuantity: mismatch ? line.quantity - 3 : line.quantity,
          billedQuantity: line.quantity,
          unit: line.unit,
          orderedUnitPrice: line.unitPrice,
          billedUnitPrice: line.unitPrice,
        }))
      : [],
  }
}

/* -------------------------------------------------- the files behind intakes */

/** An SVG "document" so the preview has a picture: the printed bill the design draws. */
function billSheetSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="700" viewBox="0 0 520 700" font-family="Urbanist, Arial, sans-serif">
<rect width="520" height="700" fill="#ffffff"/>
<text x="36" y="56" font-size="18" font-weight="700" fill="#151c2d">Sohar Packaging LLC</text>
<text x="36" y="78" font-size="11" fill="#5c6270">Industrial Area 4, Sohar</text>
<text x="36" y="96" font-size="11" fill="#5c6270">VAT OM1100628391</text>
<text x="484" y="56" font-size="13" font-weight="700" fill="#151c2d" text-anchor="end">TAX INVOICE</text>
<text x="484" y="78" font-size="11" fill="#5c6270" text-anchor="end">No. SP-INV-1151</text>
<text x="484" y="96" font-size="11" fill="#5c6270" text-anchor="end">Date 21 Sep 2026</text>
<line x1="36" y1="118" x2="484" y2="118" stroke="#eceef2"/>
<text x="36" y="144" font-size="9" fill="#8a8e96" letter-spacing="1">BILLED TO</text>
<text x="36" y="164" font-size="11" fill="#5c6270">Al Bahja Coffee LLC</text>
<text x="36" y="180" font-size="11" fill="#5c6270">Souq Street, Nizwa</text>
<text x="36" y="196" font-size="11" fill="#5c6270">VAT OM1100392000</text>
<text x="36" y="236" font-size="9" fill="#8a8e96" letter-spacing="1">DESCRIPTION</text>
<text x="330" y="236" font-size="9" fill="#8a8e96" text-anchor="end" letter-spacing="1">QTY</text>
<text x="400" y="236" font-size="9" fill="#8a8e96" text-anchor="end" letter-spacing="1">RATE</text>
<text x="484" y="236" font-size="9" fill="#8a8e96" text-anchor="end" letter-spacing="1">AMOUNT</text>
<line x1="36" y1="246" x2="484" y2="246" stroke="#eceef2"/>
<text x="36" y="270" font-size="11" fill="#2c3342">Kraft coffee bags 1kg, printed</text>
<text x="330" y="270" font-size="11" fill="#2c3342" text-anchor="end">2,000</text>
<text x="400" y="270" font-size="11" fill="#2c3342" text-anchor="end">0.240</text>
<text x="484" y="270" font-size="11" fill="#2c3342" text-anchor="end">480.000</text>
<line x1="36" y1="284" x2="484" y2="284" stroke="#f3f3f3"/>
<text x="36" y="308" font-size="11" fill="#2c3342">Kraft coffee bags 250g, printed</text>
<text x="330" y="308" font-size="11" fill="#2c3342" text-anchor="end">1,500</text>
<text x="400" y="308" font-size="11" fill="#2c3342" text-anchor="end">0.088</text>
<text x="484" y="308" font-size="11" fill="#2c3342" text-anchor="end">132.000</text>
<line x1="36" y1="322" x2="484" y2="322" stroke="#f3f3f3"/>
<text x="36" y="346" font-size="11" fill="#2c3342">Pallet handling</text>
<text x="330" y="346" font-size="11" fill="#2c3342" text-anchor="end">1</text>
<text x="400" y="346" font-size="11" fill="#2c3342" text-anchor="end">n/a</text>
<text x="484" y="346" font-size="11" fill="#2c3342" text-anchor="end">n/a</text>
<line x1="36" y1="360" x2="484" y2="360" stroke="#f3f3f3"/>
<text x="360" y="400" font-size="11" fill="#5c6270" text-anchor="end">Subtotal</text>
<text x="484" y="400" font-size="11" fill="#2c3342" text-anchor="end">612.000</text>
<text x="360" y="424" font-size="11" fill="#5c6270" text-anchor="end">VAT 5%</text>
<text x="484" y="424" font-size="11" fill="#2c3342" text-anchor="end">30.600</text>
<line x1="300" y1="440" x2="484" y2="440" stroke="#151c2d"/>
<text x="360" y="464" font-size="13" font-weight="700" fill="#151c2d" text-anchor="end">Total</text>
<text x="484" y="464" font-size="13" font-weight="700" fill="#151c2d" text-anchor="end">642.600</text>
<line x1="36" y1="500" x2="484" y2="500" stroke="#eceef2"/>
<text x="36" y="526" font-size="9" fill="#8a8e96" letter-spacing="1">TERMS</text>
<text x="36" y="546" font-size="11" fill="#5c6270">Payment within 10 days of invoice date. Bank Muscat,</text>
<text x="36" y="562" font-size="11" fill="#5c6270">IBAN OM90 0018 0000 6283 91.</text>
</svg>`
}

function receiptSvg(merchant, lines, subtotal, vat, total, number, date) {
  const rows = lines
    .map(
      ([label, amount], index) =>
        `<text x="28" y="${196 + index * 22}" font-size="12" fill="#2c3342">${label}</text><text x="212" y="${196 + index * 22}" font-size="12" fill="#2c3342" text-anchor="end">${amount}</text>`,
    )
    .join('')
  const base = 196 + lines.length * 22 + 18
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="${base + 150}" viewBox="0 0 240 ${base + 150}" font-family="Urbanist, Arial, sans-serif">
<rect width="240" height="${base + 150}" fill="#ffffff"/>
<text x="120" y="40" font-size="13" font-weight="700" fill="#151c2d" text-anchor="middle" letter-spacing="1.5">${merchant}</text>
<text x="120" y="62" font-size="10" fill="#8a8e96" text-anchor="middle">Souq Road, Nizwa</text>
<text x="120" y="80" font-size="10" fill="#8a8e96" text-anchor="middle">VAT OM1100773310</text>
<line x1="28" y1="100" x2="212" y2="100" stroke="#d0d2d5" stroke-dasharray="3 3"/>
<text x="28" y="126" font-size="11" fill="#2c3342">Receipt</text><text x="212" y="126" font-size="11" fill="#2c3342" text-anchor="end">${number}</text>
<text x="28" y="146" font-size="11" fill="#2c3342">${date}</text><text x="212" y="146" font-size="11" fill="#2c3342" text-anchor="end">10:14</text>
<line x1="28" y1="166" x2="212" y2="166" stroke="#d0d2d5" stroke-dasharray="3 3"/>
${rows}
<line x1="28" y1="${base - 8}" x2="212" y2="${base - 8}" stroke="#d0d2d5" stroke-dasharray="3 3"/>
<text x="28" y="${base + 16}" font-size="11" fill="#2c3342">Subtotal</text><text x="212" y="${base + 16}" font-size="11" fill="#2c3342" text-anchor="end">${subtotal}</text>
<text x="28" y="${base + 36}" font-size="11" fill="#b9bcc4">VAT 5%</text><text x="212" y="${base + 36}" font-size="11" fill="#b9bcc4" text-anchor="end">${vat}</text>
<text x="28" y="${base + 60}" font-size="13" font-weight="700" fill="#151c2d">TOTAL</text><text x="212" y="${base + 60}" font-size="13" font-weight="700" fill="#151c2d" text-anchor="end">${total}</text>
<line x1="28" y1="${base + 80}" x2="212" y2="${base + 80}" stroke="#d0d2d5" stroke-dasharray="3 3"/>
<text x="120" y="${base + 106}" font-size="10" fill="#8a8e96" text-anchor="middle" letter-spacing="1">PAID, CASH</text>
<text x="120" y="${base + 126}" font-size="10" fill="#8a8e96" text-anchor="middle">Thank you</text>
</svg>`
}

const FILES = {
  'i-nhs-4471': receiptSvg(
    'NIZWA HARDWARE',
    [
      ['Wire brush x2', '6.400'],
      ['Sealant tube', '4.900'],
      ['Drain cover', '15.750'],
    ],
    '27.050',
    '1.350',
    '28.400',
    '4471',
    '23/09/2026',
  ),
  'i-sp-1151': billSheetSvg(),
  'i-taxi-4472': receiptSvg(
    'MWASALAT TAXI',
    [['Nizwa to Muscat', '22.000']],
    '22.000',
    '0.000',
    '22.000',
    '0918',
    '24/09/2026',
  ),
}

/** A raw (non-JSON) answer: the scratchpad server copy serves `raw` as the body. */
const raw = (body, contentType, filename) => ({
  status: 200,
  headers: {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${filename}"`,
  },
  raw: body,
})

/* --------------------------------------------------------------- suppliers */

function supplierRow(id) {
  const supplier = SUPPLIERS[id]
  return {
    id,
    displayName: supplier.name,
    vatNumber: supplier.vat,
    status: 'ACTIVE',
    registeredOnPeppol: Boolean(supplier.iban),
    receivingChannel: supplier.iban ? 'PEPPOL' : 'PAPER',
    health: supplier.iban ? [] : ['NO_BANK_DETAILS'],
    owed: 0,
    currencyCode: 'OMR',
  }
}

function supplierDetail(id) {
  const supplier = SUPPLIERS[id]
  return {
    profile: {
      id,
      type: 'BUSINESS',
      displayName: supplier.name,
      legalName: supplier.name,
      vatNumber: supplier.vat,
      registeredForVat: true,
      registeredOnPeppol: Boolean(supplier.iban),
      participantScheme: '0248',
      participantValue: supplier.vat,
      participantId: `0248:${supplier.vat}`,
      defaultCurrency: 'OMR',
      defaultTaxCategory: 'S5',
      paymentTerms: 'NET30',
      defaultPaymentMethod: '30',
      bankDetails: supplier.iban
        ? {
            beneficiaryName: supplier.name,
            iban: supplier.iban,
            bic: 'BMUSOMRX',
            bankName: supplier.bank,
            changedAt: null,
            confirmedAt: '2026-06-01T08:00:00Z',
          }
        : // As the backend does: no account on file is an object of nulls, never null.
          {
            beneficiaryName: null,
            iban: null,
            bic: null,
            bankName: null,
            changedAt: null,
            confirmedAt: null,
          },
      contactPerson: 'Accounts',
      roleTitle: null,
      emailRecipients: [],
      telephone: null,
      mobilePhone: null,
      preferredLanguage: 'en',
      receivingChannel: supplier.iban ? 'PEPPOL' : 'PAPER',
      requiresApprovalBeforePayment: true,
      earlyPaymentDiscountPercent: id === 's-mrc' ? 2 : null,
      earlyPaymentDiscountDays: id === 's-mrc' ? 7 : null,
      commercialRegistrationNumber: null,
      notes: null,
      supplierCategory: null,
      selfBillingAgreement: id === 's-and',
      health: supplier.iban ? [] : ['NO_BANK_DETAILS'],
      supplierSince: '2025-03-01',
      switchedOffAt: null,
      status: 'ACTIVE',
      customerStatus: null,
      version: 3,
    },
    invoiceAddress: null,
    sameAsInvoicingAddress: true,
    deliveryAddress: null,
  }
}

function supplierOverview(id) {
  const rows = BILLS.filter((row) => row.supplierId === id && !isCredit(row))
  const open = rows.filter((row) => OPEN.has(row.workflowState))
  const bucket = (filter) => {
    const inBucket = open.filter(filter)
    return {
      amount: round3(inBucket.reduce((sum, row) => sum + row.outstandingAmount, 0)),
      bills: inBucket.length,
      nextDue:
        inBucket
          .map((row) => row.dueDate)
          .filter(Boolean)
          .sort()[0] ?? null,
    }
  }
  const soon = shift(TODAY, 7)
  const paidRows = rows.filter((row) => row.workflowState === 'PAID')
  return {
    tabs: {
      bills: rows.length,
      payments: paidRows.length,
      orders: Object.values(ORDERS).length,
      documents: 2,
    },
    match: {
      agreed: rows.filter((row) => row.match?.verdict === 'MATCHED').length,
      orderBacked: rows.filter((row) => row.match && row.match.verdict !== 'NO_ORDER').length,
      summary: null,
    },
    usualLeadTimeDays: 8,
    payables: {
      currencyCode: 'OMR',
      notDue: bucket((row) => row.workflowState !== 'ON_HOLD' && row.dueDate && row.dueDate > soon),
      dueSoon: bucket(
        (row) =>
          row.workflowState !== 'ON_HOLD' &&
          row.dueDate &&
          row.dueDate >= TODAY &&
          row.dueDate <= soon,
      ),
      late: bucket((row) => row.workflowState !== 'ON_HOLD' && row.overdue),
      onHold: bucket((row) => row.workflowState === 'ON_HOLD'),
      everLate: false,
      total: round3(open.reduce((sum, row) => sum + row.outstandingAmount, 0)),
      overpaidTotal: round3(rows.reduce((sum, row) => sum + overpaidOf(row), 0)),
    },
  }
}

const ORDER_OPTIONS = (supplierId) =>
  Object.values(ORDERS)
    .filter(
      (order) =>
        BILLS.some(
          (row) => row.supplierId === supplierId && row.match?.purchaseOrderNumber === order.number,
        ) ||
        (supplierId === 's-spl' && order.number === 'PO-0031'),
    )
    .map((order) => ({
      id: order.id,
      number: order.number,
      state: 'RECEIVED',
      orderDate: order.orderDate,
      wantedBy: null,
      currency: 'OMR',
      totalGross: 2354.31,
    }))

/* ---------------------------------------------------------------------- */

const findBill = (id) => BILLS.find((row) => row.id === id)
const notFound = (error) => ({
  status: 404,
  body: { type: 'https://api.fawtir.om/problems/not-found', error },
})

export default [
  {
    match: '/api/v1/reference-data',
    reply: () => ({
      taxCategories: [
        {
          code: 'S5',
          en16931Category: 'S',
          rate: '5',
          exemptionReasonRequired: false,
          active: true,
        },
        {
          code: 'Z0',
          en16931Category: 'Z',
          rate: '0',
          exemptionReasonRequired: false,
          active: true,
        },
        {
          code: 'E0',
          en16931Category: 'E',
          rate: '0',
          exemptionReasonRequired: true,
          active: true,
        },
        {
          code: 'O0',
          en16931Category: 'O',
          rate: '0',
          exemptionReasonRequired: true,
          active: true,
        },
        {
          code: 'AE0',
          en16931Category: 'AE',
          rate: '0',
          exemptionReasonRequired: true,
          active: true,
        },
        {
          code: 'G0',
          en16931Category: 'G',
          rate: '0',
          exemptionReasonRequired: true,
          active: true,
        },
      ],
      units: ['EA', 'KGM', 'LTR', 'BG', 'BX', 'SA', 'PK', 'HUR', 'DAY', 'MTR'].map((code) => ({
        code,
        active: true,
      })),
      paymentTerms: [
        { code: 'NET0', netDays: 0, active: true },
        { code: 'NET7', netDays: 7, active: true },
        { code: 'NET14', netDays: 14, active: true },
        { code: 'NET30', netDays: 30, active: true },
        { code: 'NET45', netDays: 45, active: true },
        { code: 'NET60', netDays: 60, active: true },
      ],
      paymentMethods: ['30', '10', '20', '48', '68'].map((code) => ({ code, active: true })),
    }),
  },

  { match: '/api/v1/bills/summary', reply: summaryReply },
  { match: '/api/v1/bills', reply: ({ query }) => listReply(query) },

  // Intakes: the list of unconfirmed ones, one by id, its bytes, corrections, discard, confirm.
  {
    match: '/api/v1/bills/intake',
    reply: ({ query }) => {
      const items = INTAKES.filter((entry) => entry.confirmedBillId === null)
      return {
        items,
        page: Number(query.get('page') ?? 0),
        pageSize: Number(query.get('page_size') ?? 20),
        count: items.length,
      }
    },
  },
  {
    method: 'POST',
    match: '/api/v1/bills/intake',
    reply: ({ query }) => ({
      status: 201,
      body: intake(
        `i-new-${Date.now()}`,
        query.get('source') ?? 'UPLOADED',
        'upload.pdf',
        'application/pdf',
        120_000,
        {},
      ),
    }),
  },
  {
    match: /^\/api\/v1\/bills\/intake\/([^/]+)\/file$/,
    reply: ({ params }) => {
      const found = INTAKES.find((entry) => entry.id === params[0])
      if (!found || !FILES[found.id]) return notFound('BILL_INTAKE_NOT_FOUND')
      return raw(FILES[found.id], 'image/svg+xml', found.filename)
    },
  },
  {
    match: /^\/api\/v1\/bills\/intake\/([^/]+)$/,
    reply: ({ params }) =>
      INTAKES.find((entry) => entry.id === params[0]) ?? notFound('BILL_INTAKE_NOT_FOUND'),
  },
  {
    method: 'PUT',
    match: /^\/api\/v1\/bills\/intake\/([^/]+)$/,
    reply: ({ params, body }) => {
      const found = INTAKES.find((entry) => entry.id === params[0])
      if (!found) return notFound('BILL_INTAKE_NOT_FOUND')
      if (body?.extracted)
        found.extracted = {
          ...found.extracted,
          ...body.extracted,
          confidence: Object.fromEntries(Object.keys(body.extracted).map((k) => [k, true])),
        }
      return found
    },
  },
  {
    method: 'DELETE',
    match: /^\/api\/v1\/bills\/intake\/([^/]+)$/,
    reply: ({ params }) => {
      const index = INTAKES.findIndex((entry) => entry.id === params[0])
      if (index !== -1) INTAKES.splice(index, 1)
      return { status: 204 }
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/bills\/intake\/([^/]+)\/confirm$/,
    reply: ({ params, body }) => {
      const found = INTAKES.find((entry) => entry.id === params[0])
      if (!found) return notFound('BILL_INTAKE_NOT_FOUND')
      if (found.confirmedBillId)
        return {
          status: 409,
          body: {
            type: 'https://api.fawtir.om/problems/resource-conflict',
            error: 'BILL_INTAKE_ALREADY_CONFIRMED',
          },
        }
      const id = `b-${found.id}`
      const supplierId = body?.supplierId && SUPPLIERS[body.supplierId] ? body.supplierId : null
      const lines = (body?.lines ?? []).map((line) =>
        L(line.description, line.quantity, line.unit, line.unitPrice, line.vatRate),
      )
      const row = bill(
        id,
        supplierId,
        body?.billNumber ?? null,
        body?.issueDate ?? TODAY,
        body?.dueDate ? daysBetween(body.issueDate, body.dueDate) : null,
        lines.length > 0 ? lines : [L('As typed', 1, null, (body?.total ?? 0) - (body?.vat ?? 0))],
        {
          source: found.source,
          supplierName: body?.supplierName ?? null,
          workflowState: body?.paidOnTheSpot ? 'PAID' : 'NEW',
          paidAmount: body?.paidOnTheSpot ? body.total : 0,
          paidOnTheSpot: Boolean(body?.paidOnTheSpot),
          match: { verdict: 'NO_ORDER', purchaseOrderNumber: null, byHand: false },
        },
      )
      BILLS.unshift(row)
      found.confirmedBillId = id
      return {
        status: 201,
        body: {
          id,
          supplierBillNumber: row.supplierBillNumber,
          totalIncludingVat: row.totalIncludingVat,
          currencyCode: 'OMR',
        },
      }
    },
  },

  // One bill, its match, and the decisions on it.
  {
    match: /^\/api\/v1\/bills\/([^/]+)\/match$/,
    reply: ({ params }) => {
      const row = findBill(params[0])
      return row ? matchReply(row) : notFound('BILL_NOT_FOUND')
    },
  },
  {
    method: 'PUT',
    match: /^\/api\/v1\/bills\/([^/]+)\/match$/,
    reply: ({ params, body }) => {
      const row = findBill(params[0])
      if (!row) return notFound('BILL_NOT_FOUND')
      const order = Object.values(ORDERS).find((entry) => entry.id === body?.purchaseOrderId)
      row.match = {
        verdict: 'MATCHED_BY_HAND',
        purchaseOrderNumber: order?.number ?? null,
        byHand: true,
      }
      if (row.workflowState === 'MISMATCH') row.workflowState = 'NEW'
      return matchReply(row)
    },
  },
  {
    method: 'DELETE',
    match: /^\/api\/v1\/bills\/([^/]+)\/match$/,
    reply: ({ params }) => {
      const row = findBill(params[0])
      if (row) row.match = { verdict: 'NO_ORDER', purchaseOrderNumber: null, byHand: false }
      return { status: 204 }
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/bills\/([^/]+)\/approval\/approve$/,
    reply: ({ params }) => {
      const row = findBill(params[0])
      if (!row) return notFound('BILL_NOT_FOUND')
      row.workflowState = 'APPROVED'
      row.readiness = { state: 'READY', distinctApprovals: 1, required: 1, autoApproved: false }
      return {}
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/bills\/([^/]+)\/approval\/reject$/,
    reply: ({ params, body }) => {
      const row = findBill(params[0])
      if (!row) return notFound('BILL_NOT_FOUND')
      if (!body?.reason)
        return {
          status: 400,
          body: {
            type: 'https://api.fawtir.om/problems/approval-failed',
            error: 'APPROVAL_REJECTION_REASON_REQUIRED',
          },
        }
      row.workflowState = 'REJECTED'
      row.readiness = { state: 'REJECTED', distinctApprovals: 0, required: 1, autoApproved: false }
      return {}
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/bills\/([^/]+)\/hold$/,
    reply: ({ params, body }) => {
      const row = findBill(params[0])
      if (!row) return notFound('BILL_NOT_FOUND')
      row.workflowState = 'ON_HOLD'
      row.hold = { reason: body?.reason ?? null, openedAt: new Date().toISOString() }
      return {}
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/bills\/([^/]+)\/release$/,
    reply: ({ params }) => {
      const row = findBill(params[0])
      if (!row) return notFound('BILL_NOT_FOUND')
      row.workflowState = row.readiness.state === 'READY' ? 'APPROVED' : 'NEW'
      row.hold = null
      return {}
    },
  },
  {
    match: /^\/api\/v1\/bills\/([^/]+)$/,
    reply: ({ params }) => {
      const row = findBill(params[0])
      return row ? detailReply(row) : notFound('BILL_NOT_FOUND')
    },
  },

  // Settling an overpaid bill: the supplier's refund, keeping it as credit, using that credit.
  {
    match: /^\/api\/v1\/bills\/([^/]+)\/overpayment$/,
    reply: ({ params }) => {
      const row = findBill(params[0])
      return row ? overpaymentReply(row) : notFound('BILL_NOT_FOUND')
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/bills\/([^/]+)\/overpayment\/refunds$/,
    reply: ({ params, body }) => {
      const row = findBill(params[0])
      if (!row) return notFound('BILL_NOT_FOUND')
      const standing = overpaymentReply(row)
      if (standing.overpaidAmount <= 0) return refused('BILL_NOT_OVERPAID')
      if (!(body?.amount > 0)) return refused('BILL_OVERPAYMENT_AMOUNT_INVALID')
      if (body.amount > standing.overpaidAmount) return refused('BILL_OVERPAYMENT_EXCEEDS_OVERPAID')
      if (!body.refundedOn) return refused('BILL_OVERPAYMENT_DATE_REQUIRED')
      if (body.refundedOn > new Date().toISOString().slice(0, 10))
        return refused('BILL_OVERPAYMENT_DATE_IN_FUTURE')
      return settle(row, 'REFUNDED', body.amount, {
        settledOn: body.refundedOn,
        reference: body.reference ?? null,
      })
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/bills\/([^/]+)\/overpayment\/keep-as-credit$/,
    reply: ({ params, body }) => {
      const row = findBill(params[0])
      if (!row) return notFound('BILL_NOT_FOUND')
      const standing = overpaymentReply(row)
      if (standing.overpaidAmount <= 0) return refused('BILL_NOT_OVERPAID')
      const amount = body?.amount ?? standing.undecided
      if (!(amount > 0) || amount > standing.undecided)
        return refused('BILL_OVERPAYMENT_KEEP_EXCEEDS_OVERPAID')
      return settle(row, 'KEPT_AS_CREDIT', amount)
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/bills\/([^/]+)\/overpayment\/apply$/,
    reply: ({ params, body }) => {
      const row = findBill(params[0])
      if (!row) return notFound('BILL_NOT_FOUND')
      const target = findBill(body?.targetBillId)
      if (!target) return notFound('BILL_NOT_FOUND')
      const standing = overpaymentReply(row)
      if (standing.overpaidAmount <= 0) return refused('BILL_NOT_OVERPAID')
      if (standing.keptAsCredit <= 0) return refused('BILL_OVERPAYMENT_NOT_KEPT_AS_CREDIT')
      if (target.id === row.id || isCredit(target))
        return refused('BILL_OVERPAYMENT_TARGET_NOT_PAYABLE')
      if (target.supplierId !== row.supplierId) return refused('BILL_OVERPAYMENT_SUPPLIER_MISMATCH')
      if (target.hold) return refused('BILL_OVERPAYMENT_TARGET_ON_HOLD')
      const amount = body.amount ?? Math.min(standing.keptAsCredit, target.outstandingAmount)
      if (amount > standing.keptAsCredit) return refused('BILL_OVERPAYMENT_APPLY_EXCEEDS_CREDIT')
      if (!(amount > 0) || amount > target.outstandingAmount)
        return refused('BILL_OVERPAYMENT_APPLY_EXCEEDS_BILL')
      // The target owes that much less, through the credit it now carries.
      target._extra.creditedAmount = round3((target._extra.creditedAmount ?? 0) + amount)
      target.outstandingAmount = round3(target.outstandingAmount - amount)
      return settle(row, 'APPLIED', amount, { targetBillId: target.id })
    },
  },

  // The archived Peppol document behind a bill that arrived over the network.
  {
    match: /^\/api\/v1\/inbound-invoices\/([^/]+)\/document$/,
    reply: ({ params }) =>
      raw(
        `<?xml version="1.0"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><ID>${params[0]}</ID></Invoice>`,
        'application/xml',
        `${params[0]}.xml`,
      ),
  },

  // Orders a bill can be matched to, and the suppliers behind the intake form.
  {
    match: '/api/v1/purchase-orders',
    reply: ({ query }) => {
      const items = ORDER_OPTIONS(query.get('supplierId') ?? '')
      return { items, page: 0, pageSize: 100, count: items.length, total: items.length }
    },
  },
  {
    match: '/api/v1/suppliers',
    reply: ({ query }) => {
      const q = (query.get('q') ?? '').trim().toLowerCase()
      const items = Object.keys(SUPPLIERS)
        .filter((id) => !q || SUPPLIERS[id].name.toLowerCase().includes(q))
        .map(supplierRow)
      return { items, page: 0, pageSize: 20, count: items.length, total: items.length }
    },
  },
  {
    match: /^\/api\/v1\/suppliers\/([^/]+)\/overview$/,
    reply: ({ params }) =>
      SUPPLIERS[params[0]] ? supplierOverview(params[0]) : notFound('SUPPLIER_NOT_FOUND'),
  },
  {
    match: /^\/api\/v1\/suppliers\/([^/]+)$/,
    reply: ({ params }) =>
      SUPPLIERS[params[0]] ? supplierDetail(params[0]) : notFound('SUPPLIER_NOT_FOUND'),
  },
]
