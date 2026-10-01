/**
 * One supplier's record for the mock gateway: Muscat Roastery Co, Al Bahja Coffee's coffee
 * supplier, in September 2026, in the shapes `src/api/expenditure/supplierRecord.ts`,
 * `purchaseOrders.ts`, `billIntake.ts` and `paymentRuns.ts` read.
 *
 * Feeds Suppliers › Detail (Figma 163:26275) with its Add to a payment run modal (163:29156),
 * New purchase order (163:27317), the purchase order's own page, Record a bill (163:27781) and
 * the Statement (163:28602). Every figure is derived from the bills and lines below so the
 * header, the bands, the statement and the modal agree with each other.
 *
 * Paths are pinned to this supplier's id and to `po-` order ids, so the suppliers list module
 * (`suppliers.mjs`) and the payments module keep their own paths.
 */

const TODAY = '2026-09-25'
const SUPPLIER_ID = 'muscat-roastery'
const scale = (n) => Math.round(n * 1000) / 1000
const sum = (values) => scale(values.reduce((total, value) => total + value, 0))
const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const PROFILE = {
  id: SUPPLIER_ID,
  type: 'BUSINESS',
  displayName: 'Muscat Roastery Co',
  legalName: 'Muscat Roastery Company LLC',
  vatNumber: 'OM1100447102',
  registeredForVat: true,
  registeredOnPeppol: true,
  participantScheme: '0248',
  participantValue: 'OM1100447102',
  participantId: '0248:OM1100447102',
  defaultCurrency: 'OMR',
  defaultTaxCategory: 'S5',
  paymentTerms: 'NET30',
  defaultPaymentMethod: '30',
  bankDetails: {
    beneficiaryName: 'Muscat Roastery Company LLC',
    iban: 'OM550180000044712290',
    bic: 'BMUSOMRX',
    bankName: 'Bank Muscat',
    changedAt: '2026-01-14T09:12:00Z',
    confirmedAt: '2026-01-15T07:40:00Z',
  },
  contactPerson: 'Ahmed Al Harthy',
  roleTitle: 'Sales manager',
  emailRecipients: ['ahmed@muscatroastery.com', 'accounts@muscatroastery.com'],
  telephone: '+96824455120',
  mobilePhone: null,
  preferredLanguage: 'en',
  receivingChannel: 'PEPPOL',
  requiresApprovalBeforePayment: true,
  earlyPaymentDiscountPercent: 2,
  earlyPaymentDiscountDays: 7,
  commercialRegistrationNumber: '1104472',
  notes: null,
  supplierCategory: 'Raw materials',
  tradingName: null,
  tags: [],
  autoMatchPurchaseOrders: true,
  switchedOffReason: null,
  switchedOffNote: null,
  selfBillingAgreement: false,
  health: [],
  supplierSince: '2024-09-02',
  switchedOffAt: null,
  status: 'ACTIVE',
  customerStatus: 'ACTIVE',
  version: 12,
}

let profile = { ...PROFILE }

const DETAIL = () => ({
  profile,
  invoiceAddress: {
    attention: null,
    countryCode: 'OM',
    cityName: 'Muscat',
    countrySubentity: null,
    streetName: 'Rusayl Industrial Estate',
    buildingNumber: null,
    additionalStreetName: null,
    poBox: '1188',
    postalCode: '124',
  },
  sameAsInvoicingAddress: true,
  deliveryAddress: null,
})

/* ------------------------------------------------------------------ orders */

const line = (id, lineNo, description, quantity, unit, unitPrice, vatRate = 5) => {
  const lineNet = scale(quantity * unitPrice)
  return {
    id,
    lineNo,
    description,
    quantity,
    unit,
    unitPrice,
    vatRate,
    lineNet,
    vatAmount: scale((lineNet * vatRate) / 100),
  }
}

const order = (id, number, state, orderDate, wantedBy, lines, extra = {}) => {
  const totalNet = sum(lines.map((l) => l.lineNet))
  const totalVat = sum(lines.map((l) => l.vatAmount))
  return {
    id,
    supplierId: SUPPLIER_ID,
    number,
    state,
    orderDate,
    wantedBy,
    deliverToBranchId: 'br-nizwa',
    yourReference: `ALBAHJA-${number}`,
    supplierNote: 'Deliveries accepted Sunday to Thursday, 06:00 to 10:00 only.',
    currency: 'OMR',
    totalNet,
    totalVat,
    totalGross: scale(totalNet + totalVat),
    lines,
    submittedBy: 'u-yusuf',
    submittedAt: `${orderDate}T07:30:00Z`,
    approvedBy: 'u-hafidh',
    approvedAt: `${orderDate}T09:05:00Z`,
    sentAt:
      state === 'DRAFT' || state === 'AWAITING_APPROVAL' || state === 'APPROVED'
        ? null
        : `${orderDate}T09:20:00Z`,
    cancelledAt: null,
    createdBy: 'u-yusuf',
    version: 3,
    ...extra,
  }
}

const orders = [
  order('po-0034', 'PO-0034', 'SENT', '2026-09-22', '2026-09-28', [
    line('po-0034-1', 1, 'Green beans Yirgacheffe', 300, 'KGM', 7.4),
    line('po-0034-2', 2, 'Green beans House Blend', 120, 'KGM', 6.1),
    line('po-0034-3', 3, 'Jute sacks, 25 kg', 20, 'EA', 1.95),
  ]),
  order('po-0033', 'PO-0033', 'RECEIVED', '2026-09-08', '2026-09-14', [
    line('po-0033-1', 1, 'Green beans Yirgacheffe', 240, 'KGM', 7.4),
    line('po-0033-2', 2, 'Jute sacks, 25 kg', 10, 'EA', 1.85),
  ]),
  order('po-0031', 'PO-0031', 'CLOSED', '2026-08-20', '2026-08-27', [
    line('po-0031-1', 1, 'Green beans Yirgacheffe', 215, 'KGM', 7.1),
    line('po-0031-2', 2, 'Green beans House Blend', 120, 'KGM', 6.1),
    line('po-0031-3', 3, 'Jute sacks, 25 kg', 20, 'EA', 1.85),
  ]),
  order('po-0027', 'PO-0027', 'CLOSED', '2026-08-01', '2026-08-08', [
    line('po-0027-1', 1, 'Roasting service', 12, 'EA', 32.11),
  ]),
  order('po-0021', 'PO-0021', 'CLOSED', '2026-06-10', '2026-06-17', [
    line('po-0021-1', 1, 'Green beans Yirgacheffe', 225, 'KGM', 7.1),
    line('po-0021-2', 2, 'Jute sacks, 25 kg', 25, 'EA', 1.85),
  ]),
  order(
    'po-0018',
    'PO-0018',
    'CANCELLED',
    '2026-05-02',
    '2026-05-09',
    [line('po-0018-1', 1, 'Green beans House Blend', 60, 'KGM', 6.1)],
    {
      cancelledAt: '2026-05-03T08:00:00Z',
      sentAt: null,
    },
  ),
]

const receipts = {
  'po-0033': [
    {
      id: 'grn-0091',
      purchaseOrderId: 'po-0033',
      number: 'GRN-0091',
      receivedOn: '2026-09-14',
      checkedInBy: 'u-yusuf',
      note: 'Checked in by Yusuf. All bags sound.',
      lines: [
        { id: 'grn-0091-1', purchaseOrderLineId: 'po-0033-1', quantityReceived: 240 },
        { id: 'grn-0091-2', purchaseOrderLineId: 'po-0033-2', quantityReceived: 10 },
      ],
    },
  ],
  'po-0031': [
    {
      id: 'grn-0087',
      purchaseOrderId: 'po-0031',
      number: 'GRN-0087',
      receivedOn: '2026-08-27',
      checkedInBy: 'u-yusuf',
      note: null,
      lines: [
        { id: 'grn-0087-1', purchaseOrderLineId: 'po-0031-1', quantityReceived: 215 },
        { id: 'grn-0087-2', purchaseOrderLineId: 'po-0031-2', quantityReceived: 120 },
        { id: 'grn-0087-3', purchaseOrderLineId: 'po-0031-3', quantityReceived: 20 },
      ],
    },
  ],
}

const orderById = (id) => orders.find((o) => o.id === id)
let orderSeed = 35

/* ------------------------------------------------------------------ bills */

const bill = (id, number, issueDate, dueDate, total, state, extra = {}) => ({
  id,
  source: 'PEPPOL',
  supplierId: SUPPLIER_ID,
  supplierName: PROFILE.displayName,
  documentTypeCode: '380',
  supplierBillNumber: number,
  issueDate,
  dueDate,
  overdue: state !== 'PAID' && dueDate < TODAY,
  currencyCode: 'OMR',
  totalIncludingVat: total,
  vatAmount: scale(total - total / 1.05),
  paidAmount: state === 'PAID' ? total : 0,
  outstandingAmount: state === 'PAID' ? 0 : total,
  purchaseOrderReference: null,
  workflowState: state,
  readiness:
    state === 'AWAITING_APPROVAL'
      ? { state: 'PENDING', distinctApprovals: 0, required: 1, autoApproved: false }
      : { state: 'READY', distinctApprovals: 1, required: 1, autoApproved: false },
  match: null,
  hold: null,
  paymentRunReference: null,
  paidOnTheSpot: false,
  ...extra,
})

const matched = (po) => ({ verdict: 'MATCHED', purchaseOrderNumber: po, byHand: false })

const bills = [
  bill('bill-8844', 'MR-INV-8844', '2026-09-20', '2026-10-20', 1884.225, 'APPROVED', {
    match: matched('PO-0033'),
    purchaseOrderReference: 'PO-0033',
  }),
  bill('bill-8821', 'MR-INV-8821', '2026-09-19', '2026-10-19', 2354.31, 'IN_PAYMENT_RUN', {
    match: matched('PO-0031'),
    purchaseOrderReference: 'PO-0031',
    paymentRunReference: 'PR-0014',
  }),
  bill('bill-8801', 'MR-INV-8801', '2026-09-15', '2026-10-15', 612.4, 'AWAITING_APPROVAL', {
    match: matched('PO-0027'),
    purchaseOrderReference: 'PO-0027',
  }),
  bill('bill-8790', 'MR-INV-8790', '2026-08-30', '2026-09-29', 404.79, 'IN_PAYMENT_RUN', {
    match: matched('PO-0027'),
    purchaseOrderReference: 'PO-0027',
    paymentRunReference: 'PR-0014',
  }),
  bill('bill-8712', 'MR-INV-8712', '2026-06-18', '2026-07-18', 1842.5, 'PAID', {
    match: matched('PO-0021'),
    purchaseOrderReference: 'PO-0021',
  }),
  ...Array.from({ length: 26 }, (_, i) =>
    bill(
      `bill-${8700 - i}`,
      `MR-INV-${8700 - i}`,
      addDays('2026-06-01', -i * 9),
      addDays('2026-07-01', -i * 9),
      scale(380 + i * 41.75),
      'PAID',
      { match: matched(`PO-00${(20 - (i % 15)).toString().padStart(2, '0')}`) },
    ),
  ),
]

const open = bills.filter((b) => b.workflowState !== 'PAID' && b.workflowState !== 'REJECTED')
const inRun = open.filter((b) => b.workflowState === 'IN_PAYMENT_RUN')
const dueSoon = inRun.filter((b) => b.dueDate >= TODAY && b.dueDate <= addDays(TODAY, 7))
const notDue = inRun.filter((b) => b.dueDate > addDays(TODAY, 7))
const bucket = (rows) => ({
  amount: sum(rows.map((b) => b.outstandingAmount)),
  bills: rows.length,
  nextDue: rows.map((b) => b.dueDate).sort()[0] ?? null,
})

const OVERVIEW = () => ({
  tabs: {
    bills: bills.length,
    payments: 28,
    orders: orders.length,
    documents: DOCUMENTS.length,
    openBills: open.length,
  },
  match: {
    agreed: bills.length,
    orderBacked: bills.length,
    summary: `${bills.length} of ${bills.length}`,
  },
  usualLeadTimeDays: 6,
  payables: {
    currencyCode: 'OMR',
    notDue: bucket(notDue),
    dueSoon: bucket(dueSoon),
    late: { amount: 0, bills: 0, nextDue: null },
    onHold: { amount: 0, bills: 0, nextDue: null },
    everLate: false,
    total: sum(inRun.map((b) => b.outstandingAmount)),
  },
})

const page = (items, query, size = 20) => {
  const p = Number(query.get('page') ?? 0)
  const pageSize = Number(query.get('page_size') ?? size)
  return {
    items: items.slice(p * pageSize, (p + 1) * pageSize),
    page: p,
    pageSize,
    count: Math.min(pageSize, Math.max(0, items.length - p * pageSize)),
  }
}

/* --------------------------------------------------------------- the rest */

const CONTACTS = [
  {
    id: 'ct-ahmed',
    fullName: 'Ahmed Al Harthy',
    roleTitle: 'Sales manager',
    purpose: 'MAIN',
    email: 'ahmed@muscatroastery.com',
    telephone: '+96824455120',
    mobilePhone: null,
    notes: null,
    version: 2,
  },
  {
    id: 'ct-fatma',
    fullName: 'Fatma Al Riyami',
    roleTitle: 'Accounts',
    purpose: 'BILLING',
    email: 'accounts@muscatroastery.com',
    telephone: null,
    mobilePhone: '+96899002290',
    notes: null,
    version: 1,
  },
]

const paper = (
  id,
  title,
  kind,
  series,
  version,
  documentDate,
  provenance,
  note,
  uploadedAt,
  standing,
) => ({
  document: {
    id,
    title,
    kind,
    series,
    version,
    documentDate,
    provenance,
    note,
    contentType: 'application/pdf',
    byteSize: 248_000,
    uploadedAt,
    retentionClass: 'STANDARD',
    legalHold: { held: false, reason: null, setBy: null, setAt: null },
    retainUntil: '2036-12-31',
  },
  standing,
})

const DOCUMENTS = [
  paper(
    'doc-agreement-2',
    'Supply agreement',
    'AGREEMENT',
    'Supply agreement',
    2,
    '2026-01-14',
    'SIGNED',
    'Sets the 2% early-settlement discount',
    '2026-01-14T10:00:00Z',
    'CURRENT',
  ),
  paper(
    'doc-vat',
    'VAT registration certificate',
    'CERTIFICATE',
    null,
    null,
    null,
    'UPLOADED',
    'By Hafidh Saif',
    '2024-09-02T08:30:00Z',
    'ON_FILE',
  ),
  paper(
    'doc-prices',
    'Price list, March 2026',
    'PRICE_LIST',
    'Price list',
    3,
    '2026-03-01',
    'EMAILED',
    'What bills get checked against',
    '2026-03-01T06:10:00Z',
    'CURRENT',
  ),
  paper(
    'doc-agreement-1',
    'Supply agreement',
    'AGREEMENT',
    'Supply agreement',
    1,
    '2024-09-02',
    'SIGNED',
    'Replaced in January',
    '2024-09-02T08:30:00Z',
    'SUPERSEDED',
  ),
]

const PURCHASES = [
  {
    description: 'Green beans Yirgacheffe',
    unit: 'KGM',
    currencyCode: 'OMR',
    totalQuantity: 3840,
    totalAmount: 28400,
    billCount: 14,
  },
  {
    description: 'Green beans House Blend',
    unit: 'KGM',
    currencyCode: 'OMR',
    totalQuantity: 1280,
    totalAmount: 9720,
    billCount: 9,
  },
  {
    description: 'Roasting service',
    unit: 'EA',
    currencyCode: 'OMR',
    totalQuantity: 938,
    totalAmount: 3940,
    billCount: 6,
  },
  {
    description: 'Jute sacks and sundries',
    unit: 'EA',
    currencyCode: 'OMR',
    totalQuantity: 400,
    totalAmount: 740,
    billCount: 11,
  },
  {
    description: 'Sample roasts',
    unit: 'EA',
    currencyCode: 'OMR',
    totalQuantity: 6,
    totalAmount: 96,
    billCount: 2,
  },
]

const PAYMENTS = [
  {
    id: 'pay-8712',
    billId: 'bill-8712',
    entryType: 'PAYMENT',
    reversalOfPaymentId: null,
    amount: 1842.5,
    currency: 'OMR',
    methodCode: '30',
    paymentReference: 'BM-4471-0916',
    paymentDate: '2026-07-16',
    occurredAt: '2026-07-16T07:00:00Z',
  },
  {
    id: 'pay-bf',
    billId: 'bill-8700',
    entryType: 'PAYMENT',
    reversalOfPaymentId: null,
    amount: 961.5,
    currency: 'OMR',
    methodCode: '30',
    paymentReference: 'BM-4471-0918',
    paymentDate: '2026-07-18',
    occurredAt: '2026-07-18T07:00:00Z',
  },
  ...bills
    .filter((b) => b.workflowState === 'PAID' && b.id !== 'bill-8712')
    .slice(0, 26)
    .map((b, i) => ({
      id: `pay-${b.id}`,
      billId: b.id,
      entryType: 'PAYMENT',
      reversalOfPaymentId: null,
      amount: b.totalIncludingVat,
      currency: 'OMR',
      methodCode: i % 5 === 0 ? '10' : '30',
      paymentReference: `BM-44${(71 + i).toString()}-0${900 + i}`,
      paymentDate: b.dueDate,
      occurredAt: `${b.dueDate}T07:00:00Z`,
    })),
]

/** The statement: every figure is the entries' own, so the equation and the ledger agree. */
const STATEMENT = (from, to) => {
  const opening = 1204
  const raw = [
    {
      date: '2026-06-18',
      kind: 'BILL',
      documentId: 'bill-8712',
      reference: 'MR-INV-8712',
      amount: 1842.5,
      detail: 'Against PO-0021 · matched in full',
      outstanding: 0,
    },
    {
      date: '2026-06-28',
      kind: 'CREDIT_NOTE',
      documentId: 'cn-0118',
      reference: 'MR-CN-0118',
      amount: 242.5,
      detail: 'Short delivery on PO-0021 · 25 KG never arrived',
    },
    {
      date: '2026-07-16',
      kind: 'PAYMENT',
      documentId: 'pay-8712',
      reference: 'PR-0011',
      amount: 1842.5,
      detail: 'Bank transfer · ref BM-4471-0916 · settled MR-INV-8712',
    },
    {
      date: '2026-07-18',
      kind: 'PAYMENT',
      documentId: 'pay-bf',
      reference: 'PR-0011',
      amount: 961.5,
      detail: 'Bank transfer · cleared the brought-forward balance',
    },
    {
      date: '2026-08-30',
      kind: 'BILL',
      documentId: 'bill-8790',
      reference: 'MR-INV-8790',
      amount: 404.79,
      detail: 'Against PO-0027 · due 29 Sep · in draft run PR-0014',
      outstanding: 404.79,
    },
    {
      date: '2026-09-19',
      kind: 'BILL',
      documentId: 'bill-8821',
      reference: 'MR-INV-8821',
      amount: 2354.31,
      detail: 'Against PO-0031 · due 19 Oct · in draft run PR-0014',
      outstanding: 2354.31,
    },
  ].filter((e) => e.date >= from && e.date <= to)
  let balance = opening
  const entries = raw.map((e) => {
    balance = scale(balance + (e.kind === 'BILL' || e.kind === 'REVERSAL' ? e.amount : -e.amount))
    return { ...e, runningBalance: balance }
  })
  const of = (kind) => sum(entries.filter((e) => e.kind === kind).map((e) => e.amount))
  return {
    supplierId: SUPPLIER_ID,
    currencyCode: 'OMR',
    from,
    to,
    opening,
    bills: of('BILL'),
    credits: of('CREDIT_NOTE'),
    payments: scale(of('PAYMENT') - of('REVERSAL')),
    closing: balance,
    entries,
    ageing: {
      NOT_DUE: bucket(notDue).amount,
      DUE_WITHIN_30: bucket(dueSoon).amount,
      LATE_30: 0,
      LATE_60_PLUS: 0,
    },
    ageingDetail: {
      NOT_DUE: bucket(notDue),
      DUE_WITHIN_30: bucket(dueSoon),
      LATE_30: { bills: 0, nextDue: null },
      LATE_60_PLUS: { bills: 0, nextDue: null },
    },
    everLate: false,
    unusedCredits: 1,
    issuer: {
      legalName: 'Al Bahja Coffee LLC',
      legalNameAr: 'شركة البهجة للقهوة ش.م.م',
      vatNumber: 'OM1100392000',
      addressLine1: 'Souq Street',
      addressLine2: null,
      addressLine3: null,
      city: 'Nizwa',
      postalCode: '611',
      countrySubdivision: null,
      country: 'OM',
    },
  }
}

/* --------------------------------------------------------------- payments */

const runs = [
  {
    id: 'run-0014',
    reference: 'PR-0014',
    state: 'DRAFT',
    paymentDate: '2026-09-28',
    payerAccountId: 'acc-1',
    runReference: null,
    format: 'BANK_MUSCAT_CSV',
    currency: 'OMR',
    billsTotal: 6091.68,
    discountTotal: 94.17,
    netTotal: 5997.51,
    exportedAt: null,
    paidAt: null,
    cancelledAt: null,
    createdAt: '2026-09-20T08:00:00Z',
    version: 4,
  },
  {
    id: 'run-0013',
    reference: 'PR-0013',
    state: 'PAID',
    paymentDate: '2026-09-10',
    payerAccountId: 'acc-1',
    runReference: 'ABC-0913',
    format: 'BANK_MUSCAT_CSV',
    currency: 'OMR',
    billsTotal: 4120.5,
    discountTotal: 0,
    netTotal: 4120.5,
    exportedAt: '2026-09-09T10:00:00Z',
    paidAt: '2026-09-10T12:00:00Z',
    cancelledAt: null,
    createdAt: '2026-09-05T08:00:00Z',
    version: 6,
  },
]

const candidate = (b) => {
  const by = addDays(b.issueDate, PROFILE.earlyPaymentDiscountDays)
  const discount =
    TODAY <= by ? scale((b.outstandingAmount * PROFILE.earlyPaymentDiscountPercent) / 100) : 0
  return {
    billId: b.id,
    supplierId: SUPPLIER_ID,
    supplierName: PROFILE.displayName,
    supplierBillNumber: b.supplierBillNumber,
    issueDate: b.issueDate,
    dueDate: b.dueDate,
    outstanding: b.outstandingAmount,
    discount,
    amount: scale(b.outstandingAmount - discount),
  }
}

const CANDIDATES = () =>
  open
    .filter((b) => b.workflowState === 'APPROVED' || b.workflowState === 'IN_PAYMENT_RUN')
    .map(candidate)
const BLOCKED = () =>
  open
    .filter((b) => b.workflowState === 'AWAITING_APPROVAL')
    .map((b) => ({
      billId: b.id,
      supplierBillNumber: b.supplierBillNumber,
      supplierId: SUPPLIER_ID,
      supplierName: PROFILE.displayName,
      dueDate: b.dueDate,
      outstanding: b.outstandingAmount,
      reasonCodes: ['AWAITING_APPROVALS'],
      approvalsGiven: 0,
      approvalsRequired: 1,
    }))

/* ------------------------------------------------------------------ routes */

const S = `/api/v1/suppliers/${SUPPLIER_ID}`
const PO = /^\/api\/v1\/purchase-orders\/(po-[a-z0-9-]+)$/
const PO_ACT = /^\/api\/v1\/purchase-orders\/(po-[a-z0-9-]+)\/(submit|approve|send|cancel|close)$/
const PO_RECEIPTS = /^\/api\/v1\/purchase-orders\/(po-[a-z0-9-]+)\/receipts$/
const NEXT_STATE = {
  submit: 'AWAITING_APPROVAL',
  approve: 'APPROVED',
  send: 'SENT',
  cancel: 'CANCELLED',
  close: 'CLOSED',
}

const file = (type, name) => ({
  status: 200,
  headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename="${name}"` },
  body: `%${name}`,
})

let intakeSeed = 0

export default [
  { match: S, reply: () => DETAIL() },
  { match: `${S}/overview`, reply: () => OVERVIEW() },
  { match: `${S}/contacts`, reply: () => CONTACTS },
  { match: `${S}/documents`, reply: () => DOCUMENTS },
  {
    match: `${S}/bills`,
    // `open=true` lists the bills still owed, with their total; otherwise every document.
    reply: ({ query }) =>
      query.get('open') === 'true'
        ? { ...page(open, query), total: open.length }
        : page(bills, query),
  },
  { match: `${S}/purchases`, reply: () => PURCHASES },
  { match: `${S}/payments`, reply: ({ query }) => page(PAYMENTS, query) },
  {
    match: `${S}/statement`,
    reply: ({ query }) => STATEMENT(query.get('from') ?? '2026-01-01', query.get('to') ?? TODAY),
  },
  { match: `${S}/statement.pdf`, reply: () => file('application/pdf', 'statement.pdf') },
  {
    match: `${S}/statement.xlsx`,
    reply: () =>
      file('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'statement.xlsx'),
  },
  { match: `${S}/statement.csv`, reply: () => file('text/csv', 'statement.csv') },
  {
    method: 'POST',
    match: `${S}/statement/email`,
    reply: ({ body }) => ({
      recipient: body?.recipient ?? PROFILE.emailRecipients[0],
      nameSubstituted: false,
    }),
  },
  {
    method: 'POST',
    match: `${S}/switch-off`,
    reply: ({ body }) => {
      profile = {
        ...profile,
        status: 'SWITCHED_OFF',
        switchedOffAt: `${TODAY}T09:00:00Z`,
        switchedOffReason: body?.reason ?? null,
        switchedOffNote: body?.note ?? null,
      }
      return DETAIL()
    },
  },
  {
    method: 'POST',
    match: `${S}/switch-on`,
    reply: () => {
      profile = {
        ...profile,
        status: 'ACTIVE',
        switchedOffAt: null,
        switchedOffReason: null,
        switchedOffNote: null,
      }
      return DETAIL()
    },
  },

  /* Purchase orders: this supplier's, by id prefix. */
  {
    match: '/api/v1/purchase-orders',
    reply: ({ query }) => {
      const supplierId = query.get('supplierId')
      const state = query.get('state')
      const rows = orders.filter(
        (o) => (!supplierId || o.supplierId === supplierId) && (!state || o.state === state),
      )
      return page(rows, query)
    },
  },
  { match: PO, reply: ({ params }) => orderById(params[0]) ?? { status: 404 } },
  {
    method: 'POST',
    match: '/api/v1/purchase-orders',
    reply: ({ body }) => {
      orderSeed += 1
      const lines = (body?.lines ?? []).map((l, i) =>
        line(
          `po-${orderSeed}-${i + 1}`,
          l.lineNo ?? i + 1,
          l.description,
          l.quantity,
          l.unit ?? null,
          l.unitPrice,
          l.vatRate ?? 0,
        ),
      )
      const created = order(
        `po-00${orderSeed}`,
        `PO-00${orderSeed}`,
        'DRAFT',
        body?.orderDate ?? TODAY,
        body?.wantedBy ?? null,
        lines,
        {
          deliverToBranchId: body?.deliverToBranchId ?? null,
          yourReference: body?.yourReference ?? null,
          supplierNote: body?.supplierNote ?? null,
          submittedBy: null,
          submittedAt: null,
          approvedBy: null,
          approvedAt: null,
          sentAt: null,
          version: 1,
        },
      )
      orders.unshift(created)
      return { status: 201, body: created }
    },
  },
  {
    method: 'POST',
    match: PO_ACT,
    reply: ({ params }) => {
      const found = orderById(params[0])
      if (!found) return { status: 404 }
      const action = params[1]
      found.state = NEXT_STATE[action]
      const at = `${TODAY}T10:00:00Z`
      if (action === 'submit') found.submittedAt = at
      if (action === 'approve') found.approvedAt = at
      if (action === 'send') found.sentAt = at
      if (action === 'cancel') found.cancelledAt = at
      found.version += 1
      return found
    },
  },
  {
    match: PO_RECEIPTS,
    reply: ({ params }) => (orderById(params[0]) ? (receipts[params[0]] ?? []) : { status: 404 }),
  },
  {
    method: 'POST',
    match: PO_RECEIPTS,
    reply: ({ params, body }) => {
      const found = orderById(params[0])
      if (!found) return { status: 404 }
      const list = (receipts[params[0]] ??= [])
      const receipt = {
        id: `grn-${100 + list.length}`,
        purchaseOrderId: found.id,
        number: `GRN-0${100 + list.length}`,
        receivedOn: body?.receivedOn ?? TODAY,
        checkedInBy: 'u-hafidh',
        note: body?.note ?? null,
        lines: (body?.lines ?? []).map((l, i) => ({ id: `grn-${list.length}-${i}`, ...l })),
      }
      list.push(receipt)
      const got = new Map()
      for (const r of list)
        for (const l of r.lines)
          got.set(l.purchaseOrderLineId, (got.get(l.purchaseOrderLineId) ?? 0) + l.quantityReceived)
      found.state = found.lines.every((l) => (got.get(l.id) ?? 0) >= l.quantity)
        ? 'RECEIVED'
        : 'PARTIALLY_RECEIVED'
      return { status: 201, body: receipt }
    },
  },

  /* Record a bill: the file first, then the confirmation. */
  {
    method: 'POST',
    match: '/api/v1/bills/intake',
    reply: () => {
      intakeSeed += 1
      return {
        status: 201,
        body: {
          id: `intake-${intakeSeed}`,
          source: 'UPLOADED',
          filename: 'MR-INV-8844.pdf',
          contentType: 'application/pdf',
          byteSize: 184_000,
          sha256: 'ab'.repeat(32),
          documentTypeCode: null,
          extractionStatus: 'NONE',
          extracted: {
            supplierName: null,
            supplierVatNumber: null,
            billNumber: null,
            issueDate: null,
            dueDate: null,
            currency: null,
            net: null,
            vat: null,
            total: null,
            lines: [],
            confidence: {},
          },
          confirmedBillId: null,
          workflowState: null,
          uploadedAt: `${TODAY}T10:00:00Z`,
        },
      }
    },
  },
  {
    method: 'DELETE',
    match: /^\/api\/v1\/bills\/intake\/(intake-\d+)$/,
    reply: () => ({ status: 204 }),
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/bills\/intake\/(intake-\d+)\/confirm$/,
    reply: ({ body }) => ({
      id: 'bill-8845',
      supplierBillNumber: body?.billNumber ?? null,
      totalIncludingVat: body?.total ?? 0,
      currencyCode: body?.currency ?? 'OMR',
    }),
  },

  /* Payment runs, as the modal reads and writes them. */
  { match: '/api/v1/payment-runs/candidates', reply: () => CANDIDATES() },
  { match: '/api/v1/payment-runs/blocked', reply: () => BLOCKED() },
  {
    match: '/api/v1/payment-runs',
    reply: ({ query }) => runs.filter((r) => !query.get('state') || r.state === query.get('state')),
  },
  {
    method: 'POST',
    match: '/api/v1/payment-runs',
    reply: ({ body }) => {
      const created = {
        ...runs[0],
        id: `run-00${runs.length + 14}`,
        reference: `PR-00${runs.length + 14}`,
        state: body?.paymentDate ? 'SCHEDULED' : 'DRAFT',
        paymentDate: body?.paymentDate ?? null,
        billsTotal: 0,
        discountTotal: 0,
        netTotal: 0,
        createdAt: `${TODAY}T10:00:00Z`,
        version: 1,
      }
      runs.push(created)
      return { status: 201, body: created }
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/payment-runs\/(run-[0-9]+)\/items$/,
    reply: ({ params, body }) => {
      const run = runs.find((r) => r.id === params[0])
      if (!run) return { status: 404 }
      const items = (body?.billIds ?? [])
        .map((billId) => bills.find((b) => b.id === billId))
        .filter(Boolean)
        .map(candidate)
      return {
        run,
        items: items.map((c) => ({
          id: `item-${c.billId}`,
          billId: c.billId,
          supplierId: c.supplierId,
          supplierName: c.supplierName,
          supplierBillNumber: c.supplierBillNumber,
          issueDate: c.issueDate,
          dueDate: c.dueDate,
          amount: c.outstanding,
          discountTaken: c.discount,
          outstanding: c.outstanding,
        })),
      }
    },
  },

  /* What the composers read beside the supplier. */
  {
    match: '/api/v1/branches',
    reply: () => [
      {
        id: 'br-nizwa',
        code: 'NZW',
        name: 'Al Bahja Coffee, Souq Street',
        type: 'BRANCH',
        city: 'Nizwa',
      },
      {
        id: 'br-rusayl',
        code: 'RSL',
        name: 'Al Bahja Coffee, Rusayl warehouse',
        type: 'WAREHOUSE',
        city: 'Muscat',
      },
    ],
  },
  {
    match: '/api/v1/expenditure/approval-policy',
    reply: () => ({ requiredApprovals: 1, autoApproveBelow: 2000 }),
  },

  /**
   * The platform's code lists (/v1/reference-data), the V193 seeds, so the guarded shell opens
   * with the same lists `invoices.mjs` answers.
   */
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
]
