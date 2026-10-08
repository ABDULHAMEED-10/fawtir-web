/**
 * Supplier credit and debit notes (E-15, E-16): the lists and summaries, one note, its
 * settlements or decisions, apply / refund and accept / refuse, plus the bill intake the two
 * upload screens go through, the bills and suppliers the screens resolve, and the session and
 * reference data the guarded shell asks for.
 *
 * Al Bahja Coffee's suppliers, rial amounts, September 2026. Shapes follow
 * src/api/expenditure/notes.ts, bills.ts, billIntake.ts, suppliers.ts and supplierRecord.ts.
 * The figures are one population: every summary is derived from the rows below.
 *
 * `agreements.mjs` and `notes.mjs` sort before this file and answer `/me/entitlements` first, so
 * a run that needs the permissions below loads this module alone (see the brief).
 */

const ENTITLEMENTS = {
  userId: 'u-hafidh',
  username: 'hafidh.saif',
  tenantId: 't-albahja',
  tenantName: 'Al Bahja Coffee',
  roles: [{ id: 'r-owner', code: 'OWNER', name: 'Owner', systemRole: true }],
  permissions: [
    'invoice.read',
    'invoice.write',
    'invoice.approve',
    'invoice.payment.manage',
    'customer.read',
    'supplier.read',
    'supplier.write',
    'product.read',
  ],
  scopes: [],
  featureFlags: {},
}

const REFERENCE_DATA = {
  taxCategories: [
    { code: 'S5', en16931Category: 'S', rate: '5', exemptionReasonRequired: false, active: true },
    { code: 'Z0', en16931Category: 'Z', rate: '0', exemptionReasonRequired: false, active: true },
    { code: 'E0', en16931Category: 'E', rate: '0', exemptionReasonRequired: true, active: true },
    { code: 'O0', en16931Category: 'O', rate: '0', exemptionReasonRequired: true, active: true },
    { code: 'AE0', en16931Category: 'AE', rate: '0', exemptionReasonRequired: true, active: true },
    { code: 'G0', en16931Category: 'G', rate: '0', exemptionReasonRequired: true, active: true },
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
}

/* ------------------------------------------------------------------ suppliers */

const SUPPLIERS = [
  supplier(
    '5a000000-0000-4000-8000-000000000001',
    'Al Noor Dates LLC',
    'OM1100518844',
    'Al Noor Dates LLC',
    '0248:OM1100518844',
  ),
  supplier(
    '5a000000-0000-4000-8000-000000000002',
    'Muscat Roastery Co',
    'OM1100711290',
    'Muscat Roastery Co LLC',
    '0248:OM1100711290',
  ),
  supplier(
    '5a000000-0000-4000-8000-000000000003',
    'Sohar Packaging LLC',
    'OM1100628391',
    'Sohar Packaging LLC',
    null,
  ),
  supplier(
    '5a000000-0000-4000-8000-000000000004',
    'Mazoon Electricity',
    'OM1100200330',
    'Mazoon Electricity Company SAOC',
    '0248:OM1100200330',
  ),
  supplier(
    '5a000000-0000-4000-8000-000000000005',
    'Gulf Cold Logistics',
    'OM1100554027',
    'Gulf Cold Logistics LLC',
    '0248:OM1100554027',
  ),
]

function supplier(id, displayName, vatNumber, legalName, participantId) {
  return {
    id,
    displayName,
    legalName,
    vatNumber,
    participantId,
    billingChannel: participantId ? 'PEPPOL' : 'EMAIL_PDF',
    selfBilling: false,
    terms: {
      paymentTerms: 'NET30',
      netDays: 30,
      earlyPaymentDiscountPercent: null,
      earlyPaymentDiscountDays: null,
      earlyPaymentDiscount: null,
    },
    youOwe: { amount: 0, currency: 'OMR', openBills: 0, onHold: 0 },
    record: {
      health: [],
      paidOnTimeCount: 11,
      settledCount: 12,
      paidOnTime: '11 of 12',
      bankChangedAt: null,
    },
    status: 'ACTIVE',
  }
}

function supplierDetail(row) {
  return {
    profile: {
      id: row.id,
      type: 'BUSINESS',
      displayName: row.displayName,
      legalName: row.legalName,
      vatNumber: row.vatNumber,
      registeredForVat: true,
      registeredOnPeppol: row.participantId !== null,
      participantScheme: row.participantId ? '0248' : null,
      participantValue: row.participantId ? row.participantId.split(':')[1] : null,
      participantId: row.participantId,
      defaultCurrency: 'OMR',
      defaultTaxCategory: 'S5',
      paymentTerms: 'NET30',
      defaultPaymentMethod: '30',
      // As the backend does: no account on file is an object of nulls, never null.
      bankDetails: {
        beneficiaryName: null,
        iban: null,
        bic: null,
        bankName: null,
        changedAt: null,
        confirmedAt: null,
      },
      contactPerson: null,
      roleTitle: null,
      emailRecipients: null,
      telephone: null,
      mobilePhone: null,
      preferredLanguage: 'en',
      receivingChannel: row.billingChannel,
      requiresApprovalBeforePayment: true,
      earlyPaymentDiscountPercent: null,
      earlyPaymentDiscountDays: null,
      commercialRegistrationNumber: null,
      notes: null,
      supplierCategory: null,
      selfBillingAgreement: false,
      health: [],
      supplierSince: '2025-03-04',
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

/* ---------------------------------------------------------------------- bills */

const BILLS = [
  bill(
    'b-and-3382',
    '5a000000-0000-4000-8000-000000000001',
    'AND-INV-3382',
    '2026-07-28',
    '2026-08-27',
    933.9,
    44.47,
    933.9,
    'APPROVED',
    'PEPPOL',
  ),
  bill(
    'b-and-3301',
    '5a000000-0000-4000-8000-000000000001',
    'AND-INV-3301',
    '2026-07-02',
    '2026-08-01',
    2117.1,
    100.81,
    0,
    'PAID',
    'PEPPOL',
  ),
  bill(
    'b-and-3150',
    '5a000000-0000-4000-8000-000000000001',
    'AND-INV-3150',
    '2026-06-20',
    '2026-07-20',
    1288.0,
    61.333,
    1288.0,
    'APPROVED',
    'PEPPOL',
  ),
  bill(
    'b-mr-8790',
    '5a000000-0000-4000-8000-000000000002',
    'MR-INV-8790',
    '2026-07-24',
    '2026-08-23',
    1480.5,
    70.5,
    1480.5,
    'APPROVED',
    'PEPPOL',
  ),
  bill(
    'b-sp-1140',
    '5a000000-0000-4000-8000-000000000003',
    'SP-INV-1140',
    '2026-07-24',
    '2026-08-23',
    3140.0,
    149.52,
    3140.0,
    'APPROVED',
    'UPLOADED',
    'PR-0014',
  ),
  bill(
    'b-sp-1108',
    '5a000000-0000-4000-8000-000000000003',
    'SP-INV-1108',
    '2026-07-10',
    '2026-08-09',
    940.8,
    44.8,
    0,
    'PAID',
    'UPLOADED',
  ),
  bill(
    'b-mz-2288',
    '5a000000-0000-4000-8000-000000000004',
    'MZ-INV-2288',
    '2026-07-05',
    '2026-08-04',
    412.3,
    19.633,
    412.3,
    'APPROVED',
    'PEPPOL',
  ),
  bill(
    'b-mz-7801',
    '5a000000-0000-4000-8000-000000000004',
    'MZ-INV-7801',
    '2026-06-06',
    '2026-07-06',
    388.5,
    18.5,
    0,
    'PAID',
    'PEPPOL',
  ),
  bill(
    'b-gcl-2301',
    '5a000000-0000-4000-8000-000000000005',
    'GCL-2301',
    '2026-07-25',
    '2026-08-25',
    288.4,
    13.733,
    288.4,
    'APPROVED',
    'PEPPOL',
  ),
  bill(
    'b-gcl-2288',
    '5a000000-0000-4000-8000-000000000005',
    'GCL-2288',
    '2026-07-18',
    '2026-08-17',
    411.5,
    19.595,
    411.5,
    'ON_HOLD',
    'PEPPOL',
  ),
]

function bill(
  id,
  supplierId,
  number,
  issueDate,
  dueDate,
  total,
  vat,
  outstanding,
  state,
  source,
  run = null,
) {
  const supplierRow = SUPPLIERS.find((s) => s.id === supplierId)
  return {
    id,
    source,
    supplierId,
    supplierName: supplierRow.displayName,
    documentTypeCode: '380',
    supplierBillNumber: number,
    issueDate,
    dueDate,
    overdue: state !== 'PAID' && dueDate < '2026-09-25',
    currencyCode: 'OMR',
    totalIncludingVat: total,
    vatAmount: vat,
    paidAmount: total - outstanding,
    outstandingAmount: outstanding,
    purchaseOrderReference: null,
    workflowState: state,
    readiness: { state: 'READY', distinctApprovals: 1, required: 1, autoApproved: false },
    match: null,
    hold:
      state === 'ON_HOLD'
        ? { reason: 'Three deliveries in dispute', openedAt: '2026-07-30T08:10:00Z' }
        : null,
    paymentRunReference: run,
    paidOnTheSpot: false,
  }
}

/**
 * The receipt report we (the receiver) filed with the Tax Authority for a note that came over
 * Peppol. One waits on the Tax Authority and one was turned down, so both states are on screen.
 */
function receiptReportOf(id, source, issueDate) {
  if (source !== 'PEPPOL') return null
  if (id === 'cn-mr-0118') return { status: 'SUBMITTED', reportedAt: null, tddUuid: `tdd-${id}` }
  if (id === 'dn-gcl-0091')
    return { status: 'REJECTED', reportedAt: `${issueDate}T11:20:00Z`, tddUuid: `tdd-${id}` }
  return { status: 'ACCEPTED', reportedAt: `${issueDate}T11:20:00Z`, tddUuid: `tdd-${id}` }
}

/* --------------------------------------------------------------- credit notes */

const CREDIT_NOTES = [
  creditNote({
    id: 'cn-and-0442',
    supplierId: '5a000000-0000-4000-8000-000000000001',
    number: 'AND-CN-0442',
    issueDate: '2026-07-30',
    source: 'PEPPOL',
    credited: 84.9,
    vat: 4.05,
    reasonCode: 'QTY',
    reasonDetail: 'SHORT_DELIVERY',
    status: 'UNAPPLIED',
    balance: { applied: 0, refunded: 0, remaining: 84.9 },
    billId: 'b-and-3382',
  }),
  creditNote({
    id: 'cn-mr-0118',
    supplierId: '5a000000-0000-4000-8000-000000000002',
    number: 'MR-CN-0118',
    issueDate: '2026-07-28',
    source: 'PEPPOL',
    credited: 242.5,
    vat: 11.548,
    reasonCode: 'VAL',
    reasonDetail: 'OVERCHARGE',
    status: 'WAITING_FOR_BILL',
    balance: { applied: 0, refunded: 0, remaining: 242.5 },
    billNumber: 'MR-INV-8811',
  }),
  creditNote({
    id: 'cn-sp-0067',
    supplierId: '5a000000-0000-4000-8000-000000000003',
    number: 'SP-CN-0067',
    issueDate: '2026-07-24',
    source: 'UPLOADED',
    credited: 100.8,
    vat: 4.8,
    reasonCode: 'QTY',
    reasonDetail: 'DAMAGED',
    status: 'APPLIED',
    balance: { applied: 100.8, refunded: 0, remaining: 0 },
    billId: 'b-sp-1140',
  }),
  creditNote({
    id: 'cn-mz-2210',
    supplierId: '5a000000-0000-4000-8000-000000000004',
    number: 'MZ-CN-2210',
    issueDate: '2026-07-18',
    source: 'PEPPOL',
    credited: 61.3,
    vat: 2.919,
    reasonCode: 'VAL',
    reasonDetail: 'PRICE_CORRECTION',
    status: 'REFUNDED',
    balance: { applied: 0, refunded: 61.3, remaining: 0 },
    billId: 'b-mz-7801',
  }),
  creditNote({
    id: 'cn-and-0391',
    supplierId: '5a000000-0000-4000-8000-000000000001',
    number: 'AND-CN-0391',
    issueDate: '2026-07-11',
    source: 'PEPPOL',
    credited: 224.16,
    vat: 8.46,
    reasonCode: 'CAN',
    reasonDetail: 'RETURN',
    status: 'APPLIED',
    balance: { applied: 224.16, refunded: 0, remaining: 0 },
    billId: 'b-and-3301',
  }),
]

function creditNote({
  id,
  supplierId,
  number,
  issueDate,
  source,
  credited,
  vat,
  reasonCode,
  reasonDetail = null,
  status,
  balance,
  billId = null,
  billNumber = null,
}) {
  const supplierRow = SUPPLIERS.find((s) => s.id === supplierId)
  const billRow = billId ? BILLS.find((b) => b.id === billId) : null
  return {
    id,
    inboundDeliveryId: source === 'PEPPOL' ? `inb-${id}` : null,
    source,
    networkVerified: source === 'PEPPOL',
    // Our own receipt report (om-tdd, reporter role 02): EXPENDITURE.md R.1.
    receiptReport: receiptReportOf(id, source, issueDate),
    supplierId,
    supplierName: supplierRow.displayName,
    supplierParticipantId: supplierRow.participantId,
    documentTypeCode: '381',
    creditNoteNumber: number,
    issueDate,
    currencyCode: 'OMR',
    taxCurrencyCode: null,
    creditedAmount: credited,
    vatAmount: vat,
    reasonCode,
    // The words beside the CL-02-OM code (older rows hold the app's reason ids): R.3.
    reasonDetail,
    approval: 'NONE',
    status,
    balance,
    receivedAt: `${issueDate}T11:05:00Z`,
    intakeId: source === 'UPLOADED' ? `intake-${id}` : null,
    onHold: false,
    hold: null,
    credits: {
      billNumber: billRow ? billRow.supplierBillNumber : billNumber,
      issueDate: billRow ? billRow.issueDate : null,
      documentUuid: billRow ? `uuid-${billRow.id}` : null,
      billId: billRow ? billRow.id : null,
      applied: status === 'APPLIED',
    },
  }
}

const CREDIT_SETTLEMENTS = {
  'cn-sp-0067': [
    {
      id: 'st-1',
      creditNoteId: 'cn-sp-0067',
      billId: 'b-sp-1140',
      kind: 'APPLIED',
      amount: 100.8,
      paymentReference: null,
      settledOn: '2026-07-26',
      actorId: 'u-hafidh',
      occurredAt: '2026-07-26T09:12:00Z',
    },
  ],
  'cn-mz-2210': [
    {
      id: 'st-2',
      creditNoteId: 'cn-mz-2210',
      billId: null,
      kind: 'REFUNDED',
      amount: 61.3,
      paymentReference: 'TRF-88213',
      settledOn: '2026-08-02',
      actorId: 'u-hafidh',
      occurredAt: '2026-08-02T11:40:00Z',
    },
  ],
  'cn-and-0391': [
    {
      id: 'st-3',
      creditNoteId: 'cn-and-0391',
      billId: 'b-and-3301',
      kind: 'APPLIED',
      amount: 224.16,
      paymentReference: null,
      settledOn: '2026-07-14',
      actorId: 'u-hafidh',
      occurredAt: '2026-07-14T14:05:00Z',
    },
  ],
}

function creditSummary(query) {
  const usable = CREDIT_NOTES.filter((n) => n.balance.remaining > 0)
  const recovered = CREDIT_NOTES.filter((n) => n.status === 'APPLIED' || n.status === 'REFUNDED')
  const tally = new Map()
  for (const note of CREDIT_NOTES) tally.set(note.supplierId, (tally.get(note.supplierId) ?? 0) + 1)
  const [topId, topCount] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
  return {
    currencyCode: 'OMR',
    usableCount: usable.length,
    usableCredit: round(usable.reduce((sum, n) => sum + n.balance.remaining, 0)),
    recoveredThisQuarterCount: recovered.length,
    recoveredThisQuarter: round(
      recovered.reduce((sum, n) => sum + n.balance.applied + n.balance.refunded, 0),
    ),
    topSupplier: {
      supplierId: topId,
      supplierName: SUPPLIERS.find((s) => s.id === topId).displayName,
      noteCount: topCount,
    },
    excludedFromTotals: 0,
    tabs: creditTabs(narrowed(CREDIT_NOTES, query)),
  }
}

function creditTabs(notes) {
  const of = (status) => notes.filter((n) => n.status === status).length
  return {
    all: notes.length,
    unapplied: of('UNAPPLIED'),
    waitingForBill: of('WAITING_FOR_BILL'),
    applied: of('APPLIED'),
    refunded: of('REFUNDED'),
  }
}

/* ---------------------------------------------------------------- debit notes */

const DEBIT_NOTES = [
  debitNote({
    id: 'dn-gcl-0091',
    supplierId: '5a000000-0000-4000-8000-000000000005',
    number: 'GCL-DN-0091',
    issueDate: '2026-07-26',
    dueDate: '2026-08-25',
    source: 'PEPPOL',
    total: 96.5,
    vat: 4.595,
    reasonCode: 'VAL',
    reasonDetail: 'SURCHARGE',
    status: 'UNCHECKED',
    outstanding: 96.5,
    paid: 0,
    billId: 'b-gcl-2301',
  }),
  debitNote({
    id: 'dn-mr-0034',
    supplierId: '5a000000-0000-4000-8000-000000000002',
    number: 'MR-DN-0034',
    issueDate: '2026-07-27',
    dueDate: '2026-08-26',
    source: 'PEPPOL',
    total: 61.75,
    vat: 2.94,
    reasonCode: 'VAL',
    reasonDetail: 'PRICE_CORRECTION',
    status: 'ACCEPTED',
    outstanding: 61.75,
    paid: 0,
    decidedAt: '2026-07-28T10:30:00Z',
    billId: 'b-mr-8790',
  }),
  debitNote({
    id: 'dn-sp-0012',
    supplierId: '5a000000-0000-4000-8000-000000000003',
    number: 'SP-DN-0012',
    issueDate: '2026-07-22',
    dueDate: '2026-08-21',
    source: 'UPLOADED',
    total: 80.65,
    vat: 3.84,
    reasonCode: 'VAL',
    reasonDetail: 'SURCHARGE',
    status: 'ACCEPTED',
    outstanding: 0,
    paid: 80.65,
    decidedAt: '2026-07-23T08:15:00Z',
    billId: 'b-sp-1108',
  }),
  debitNote({
    id: 'dn-mz-0088',
    supplierId: '5a000000-0000-4000-8000-000000000004',
    number: 'MZ-DN-0088',
    issueDate: '2026-07-16',
    dueDate: '2026-08-15',
    source: 'PEPPOL',
    total: 122.7,
    vat: 5.843,
    reasonCode: 'OTH',
    reasonDetail: 'LATE_FEE',
    status: 'REFUSED',
    outstanding: 122.7,
    paid: 0,
    decidedAt: '2026-07-17T13:02:00Z',
    decisionReason: 'Already charged',
    billId: 'b-mz-2288',
  }),
  debitNote({
    id: 'dn-and-0021',
    supplierId: '5a000000-0000-4000-8000-000000000001',
    number: 'AND-DN-0021',
    issueDate: '2026-07-09',
    dueDate: '2026-08-08',
    source: 'PEPPOL',
    total: 61.3,
    vat: 2.919,
    reasonCode: 'CAN',
    reasonDetail: 'DUPLICATE',
    status: 'REFUSED',
    outstanding: 61.3,
    paid: 0,
    decidedAt: '2026-07-10T09:45:00Z',
    decisionReason: 'Handling charge billed twice',
    billId: 'b-and-3150',
  }),
]

function debitNote({
  id,
  supplierId,
  number,
  issueDate,
  dueDate,
  source,
  total,
  vat,
  reasonCode,
  reasonDetail = null,
  status,
  outstanding,
  paid,
  decidedAt = null,
  decisionReason = null,
  billId,
}) {
  const supplierRow = SUPPLIERS.find((s) => s.id === supplierId)
  const billRow = BILLS.find((b) => b.id === billId)
  return {
    id,
    inboundDeliveryId: source === 'PEPPOL' ? `inb-${id}` : null,
    source,
    networkVerified: source === 'PEPPOL',
    // Our own receipt report (om-tdd, reporter role 02): EXPENDITURE.md R.1.
    receiptReport: receiptReportOf(id, source, issueDate),
    supplierId,
    supplierName: supplierRow.displayName,
    supplierParticipantId: supplierRow.participantId,
    debitNoteNumber: number,
    issueDate,
    dueDate,
    overdue: status === 'ACCEPTED' && outstanding > 0 && dueDate < '2026-09-25',
    currencyCode: 'OMR',
    taxCurrencyCode: null,
    totalIncludingVat: total,
    vatAmount: vat,
    amountDue: total,
    reasonCode,
    // The words beside the CL-02-OM code (older rows hold the app's reason ids): R.3.
    reasonDetail,
    approval: 'NONE',
    receivedAt: `${issueDate}T11:05:00Z`,
    intakeId: source === 'UPLOADED' ? `intake-${id}` : null,
    paidAmount: paid,
    creditedAmount: 0,
    outstandingAmount: outstanding,
    paymentState: paid >= total ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID',
    status,
    decidedBy: decidedAt ? 'u-hafidh' : null,
    decidedAt,
    decisionReason,
    relatesTo: {
      billNumber: billRow.supplierBillNumber,
      issueDate: billRow.issueDate,
      documentUuid: `uuid-${billRow.id}`,
    },
  }
}

const DEBIT_DECISIONS = {
  'dn-mr-0034': [
    {
      decision: 'ACCEPTED',
      reason: null,
      decidedBy: 'u-hafidh',
      decidedAt: '2026-07-28T10:30:00Z',
    },
  ],
  'dn-sp-0012': [
    { decision: 'ACCEPTED', reason: null, decidedBy: 'u-ali', decidedAt: '2026-07-23T08:15:00Z' },
  ],
  'dn-mz-0088': [
    {
      decision: 'REFUSED',
      reason: 'Already charged',
      decidedBy: 'u-hafidh',
      decidedAt: '2026-07-17T13:02:00Z',
    },
  ],
  'dn-and-0021': [
    {
      decision: 'REFUSED',
      reason: 'Handling charge billed twice',
      decidedBy: 'u-hafidh',
      decidedAt: '2026-07-10T09:45:00Z',
    },
    { decision: 'ACCEPTED', reason: null, decidedBy: 'u-yusuf', decidedAt: '2026-07-09T16:20:00Z' },
  ],
}

function debitSummary(query) {
  const unchecked = DEBIT_NOTES.filter((n) => n.status === 'UNCHECKED')
  const accepted = DEBIT_NOTES.filter((n) => n.status === 'ACCEPTED')
  const refused = DEBIT_NOTES.filter((n) => n.status === 'REFUSED')
  return {
    currencyCode: 'OMR',
    needsCheckingCount: unchecked.length,
    needsCheckingTotal: round(unchecked.reduce((sum, n) => sum + n.totalIncludingVat, 0)),
    acceptedThisQuarterCount: accepted.length,
    acceptedThisQuarterTotal: round(accepted.reduce((sum, n) => sum + n.totalIncludingVat, 0)),
    acceptedOpenTotal: round(accepted.reduce((sum, n) => sum + n.outstandingAmount, 0)),
    rejectedThisYearCount: refused.length,
    rejectedThisYearTotal: round(refused.reduce((sum, n) => sum + n.totalIncludingVat, 0)),
    excludedFromTotals: 0,
    tabs: debitTabs(narrowed(DEBIT_NOTES, query)),
  }
}

/* ------------------------------------------------ the notes as bill rows (lines) */

const NOTE_LINES = {
  'cn-and-0442': [
    {
      lineNo: 1,
      description: 'Khalas dates, 5 kg box',
      quantity: 3,
      unit: 'EA',
      unitPrice: 26.95,
      vatRate: 5,
      lineNet: 80.85,
      purchaseOrderLineId: null,
      goodsReceiptId: null,
    },
  ],
  'cn-sp-0067': [
    {
      lineNo: 1,
      description: 'Kraft coffee bags 1kg, printed',
      quantity: 400,
      unit: 'EA',
      unitPrice: 0.24,
      vatRate: 5,
      lineNet: 96.0,
      purchaseOrderLineId: null,
      goodsReceiptId: null,
    },
  ],
  // A standard, a zero-rated and an exempt line (CL-04-OM S, Z, E): EXPENDITURE.md R.2.
  'cn-and-0391': [
    {
      lineNo: 1,
      description: 'Returned: Khalas dates, 5 kg box',
      quantity: 12,
      unit: 'BX',
      unitPrice: 14.1,
      vatRate: 5,
      taxCategoryCode: 'S',
      exemptionReasonCode: null,
      exemptionReason: null,
      lineNet: 169.2,
      purchaseOrderLineId: null,
      goodsReceiptId: null,
    },
    {
      lineNo: 2,
      description: 'Returned: fresh Khalas dates, loose',
      quantity: 25,
      unit: 'KG',
      unitPrice: 1.6,
      vatRate: 0,
      taxCategoryCode: 'Z',
      exemptionReasonCode: 'VATZR-OM-01',
      exemptionReason: null,
      lineNet: 40.0,
      purchaseOrderLineId: null,
      goodsReceiptId: null,
    },
    {
      lineNo: 3,
      description: 'Cargo insurance, returned load',
      quantity: 1,
      unit: 'EA',
      unitPrice: 6.5,
      vatRate: 0,
      taxCategoryCode: 'E',
      exemptionReasonCode: 'VATEX-OM-01',
      exemptionReason: null,
      lineNet: 6.5,
      purchaseOrderLineId: null,
      goodsReceiptId: null,
    },
  ],
  'dn-gcl-0091': [
    {
      lineNo: 1,
      description: 'Out-of-hours delivery surcharge',
      quantity: 1,
      unit: 'EA',
      unitPrice: 91.905,
      vatRate: 5,
      lineNet: 91.905,
      purchaseOrderLineId: null,
      goodsReceiptId: null,
    },
  ],
  'dn-mz-0088': [
    {
      lineNo: 1,
      description: 'Late payment fee, July account',
      quantity: 1,
      unit: 'EA',
      unitPrice: 116.857,
      vatRate: 5,
      lineNet: 116.857,
      purchaseOrderLineId: null,
      goodsReceiptId: null,
    },
  ],
}

function noteAsBillDetail(note, kind) {
  const total = kind === 'credit' ? note.creditedAmount : note.totalIncludingVat
  const number = kind === 'credit' ? note.creditNoteNumber : note.debitNoteNumber
  const row = {
    id: note.id,
    source: note.source,
    supplierId: note.supplierId,
    supplierName: note.supplierName,
    documentTypeCode: kind === 'credit' ? '381' : '383',
    supplierBillNumber: number,
    issueDate: note.issueDate,
    dueDate: kind === 'credit' ? null : note.dueDate,
    overdue: kind === 'credit' ? false : note.overdue,
    currencyCode: 'OMR',
    totalIncludingVat: total,
    vatAmount: note.vatAmount,
    paidAmount: kind === 'credit' ? 0 : note.paidAmount,
    outstandingAmount: kind === 'credit' ? 0 : note.outstandingAmount,
    purchaseOrderReference: null,
    workflowState: 'APPROVED',
    readiness: { state: 'READY', distinctApprovals: 1, required: 1, autoApproved: true },
    match: null,
    hold: null,
    paymentRunReference: null,
    paidOnTheSpot: false,
    inboundDeliveryId: note.inboundDeliveryId,
    networkVerified: note.networkVerified,
    amountDue: total,
    creditedAmount: 0,
    complianceObligation: note.networkVerified ? 'REPORTED_BY_SENDER' : 'PENDING_COMPLIANCE_INPUT',
  }
  return {
    bill: row,
    lines: NOTE_LINES[note.id] ?? [],
    readiness: row.readiness,
    approvals: [],
    hold: null,
    holdHistory: [],
    settlement: {
      billTotal: total,
      paidAmount: row.paidAmount,
      creditedAmount: 0,
      outstandingAmount: row.outstandingAmount,
      currency: 'OMR',
      paymentState: 'UNPAID',
      overdue: row.overdue,
      dueDate: row.dueDate,
    },
    payments: [],
    paymentRunReference: null,
    intake:
      note.source === 'UPLOADED'
        ? {
            id: note.intakeId ?? `intake-${note.id}`,
            source: 'UPLOADED',
            filename: `${number}.pdf`,
            contentType: 'application/pdf',
            uploadedAt: `${note.issueDate}T09:00:00Z`,
          }
        : null,
    compliance: {
      source: note.source,
      networkVerified: note.networkVerified,
      obligation: row.complianceObligation,
      receiptReport: note.receiptReport ?? null,
    },
    activity: [{ at: `${note.issueDate}T11:05:00Z`, kind: 'ARRIVED', detail: null, actor: null }],
    // The note's reason and the bill it corrects, as `GET /bills/{id}` answers for a 381/383.
    correction: {
      reasonCode: note.reasonCode,
      reasonDetail: note.reasonDetail ?? null,
      relatedBillId: kind === 'credit' ? note.credits.billId : null,
      relatedBillNumber: kind === 'credit' ? note.credits.billNumber : note.relatesTo?.billNumber,
      relatedBillIssueDate: kind === 'credit' ? note.credits.issueDate : note.relatesTo?.issueDate,
    },
  }
}

function billDetail(row) {
  return {
    bill: {
      ...row,
      inboundDeliveryId: row.source === 'PEPPOL' ? `inb-${row.id}` : null,
      networkVerified: row.source === 'PEPPOL',
      amountDue: row.totalIncludingVat,
      creditedAmount: 0,
      complianceObligation: 'REPORTED_BY_SENDER',
    },
    lines: [],
    readiness: row.readiness,
    approvals: [],
    hold: row.hold
      ? {
          id: 'h-1',
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
      creditedAmount: 0,
      outstandingAmount: row.outstandingAmount,
      currency: 'OMR',
      paymentState: row.outstandingAmount > 0 ? 'UNPAID' : 'PAID',
      overdue: row.overdue,
      dueDate: row.dueDate,
    },
    payments: [],
    paymentRunReference: row.paymentRunReference,
    intake:
      row.source === 'UPLOADED'
        ? {
            id: `intake-${row.id}`,
            source: 'UPLOADED',
            filename: `${row.supplierBillNumber}.pdf`,
            contentType: 'application/pdf',
            uploadedAt: `${row.issueDate}T09:00:00Z`,
          }
        : null,
    compliance: {
      source: row.source,
      networkVerified: row.source === 'PEPPOL',
      obligation: 'REPORTED_BY_SENDER',
    },
    activity: [{ at: `${row.issueDate}T10:00:00Z`, kind: 'ARRIVED', detail: null, actor: null }],
  }
}

/* --------------------------------------------------------------------- intake */

const INTAKES = new Map()
let intakeSeed = 0

function newIntake(query) {
  intakeSeed += 1
  const id = `intake-new-${intakeSeed}`
  const intake = {
    id,
    source: query.get('source') ?? 'UPLOADED',
    filename: 'SP-credit-note-July.pdf',
    contentType: 'application/pdf',
    byteSize: 190464,
    sha256: 'c0ffee'.padEnd(64, '0'),
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
    uploadedAt: '2026-09-25T09:00:00Z',
  }
  INTAKES.set(id, intake)
  return intake
}

/* ------------------------------------------------------------------ helpers */

function round(value) {
  return Math.round(value * 1000) / 1000
}

function page(items, query) {
  const pageNo = Number(query.get('page') ?? 0)
  const size = Number(query.get('page_size') ?? 20)
  const slice = items.slice(pageNo * size, pageNo * size + size)
  return { items: slice, page: pageNo, pageSize: size, count: slice.length, total: items.length }
}

function debitTabs(notes) {
  const of = (status) => notes.filter((n) => n.status === status).length
  return {
    all: notes.length,
    unchecked: of('UNCHECKED'),
    accepted: of('ACCEPTED'),
    refused: of('REFUSED'),
  }
}

function byStatus(items, query) {
  const status = query.get('status') ?? 'ALL'
  return status === 'ALL' ? items : items.filter((n) => n.status === status)
}

/**
 * The lists' `q` (the note's number, the supplier's name or Peppol id, the bill it names) and
 * `supplier_id`, which also narrow the summaries' `tabs`.
 */
function narrowed(items, query) {
  const q = (query.get('q') ?? '').trim().toLowerCase()
  const supplierId = query.get('supplier_id')
  return items.filter((n) => {
    if (supplierId && n.supplierId !== supplierId) return false
    if (!q) return true
    const bill = n.credits?.billNumber ?? n.relatesTo?.billNumber
    return [
      n.creditNoteNumber ?? n.debitNoteNumber,
      n.supplierName,
      n.supplierParticipantId,
      bill,
    ].some((value) => (value ?? '').toLowerCase().includes(q))
  })
}

/** The lists' `sort`: NEWEST (the default, as listed), AMOUNT_HIGHEST, AMOUNT_LOWEST, SUPPLIER. */
function sorted(items, query) {
  const sort = query.get('sort') ?? 'NEWEST'
  const amount = (n) => n.creditedAmount ?? n.totalIncludingVat ?? 0
  if (sort === 'NEWEST') return items
  return [...items].sort((a, b) =>
    sort === 'SUPPLIER'
      ? (a.supplierName ?? '').localeCompare(b.supplierName ?? '')
      : sort === 'AMOUNT_LOWEST'
        ? amount(a) - amount(b)
        : amount(b) - amount(a),
  )
}

function noteList(items, query) {
  return page(sorted(byStatus(narrowed(items, query), query), query), query)
}

function billsFor(query) {
  const supplierId = query.get('supplier_id')
  const q = (query.get('q') ?? '').trim().toLowerCase()
  return BILLS.filter(
    (b) =>
      (!supplierId || b.supplierId === supplierId) &&
      (!q || `${b.supplierBillNumber} ${b.supplierName}`.toLowerCase().includes(q)),
  )
}

function refusal(status, code, detail) {
  return {
    status,
    body: {
      type: `https://api.fawtir.om/problems/${code.toLowerCase()}`,
      title: code,
      status,
      detail,
      error: code,
      trace_id: 'trace-mock',
    },
  }
}

export default [
  { match: '/api/v1/me/entitlements', reply: () => ENTITLEMENTS },
  { match: '/api/v1/reference-data', reply: () => REFERENCE_DATA },

  /* credit notes */
  { match: '/api/v1/credit-notes/summary', reply: ({ query }) => creditSummary(query) },
  {
    match: '/api/v1/credit-notes',
    reply: ({ query }) => noteList(CREDIT_NOTES, query),
  },
  {
    match: /^\/api\/v1\/credit-notes\/([^/]+)$/,
    reply: ({ params }) => CREDIT_NOTES.find((n) => n.id === params[0]) ?? { status: 404 },
  },
  {
    match: /^\/api\/v1\/credit-notes\/([^/]+)\/settlements$/,
    reply: ({ params }) => CREDIT_SETTLEMENTS[params[0]] ?? [],
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/credit-notes\/([^/]+)\/apply$/,
    reply: ({ params, body }) => {
      const note = CREDIT_NOTES.find((n) => n.id === params[0])
      if (!note) return { status: 404 }
      const target = BILLS.find((b) => b.id === body?.billId)
      if (!target) return refusal(400, 'CREDIT_NOTE_TARGET_NOT_FOUND', 'No such bill.')
      if (target.supplierId !== note.supplierId)
        return refusal(
          400,
          'CREDIT_NOTE_SUPPLIER_MISMATCH',
          'A credit can only reduce a bill from the supplier who issued it.',
        )
      const amount = round(
        Math.min(
          body?.amount ?? note.balance.remaining,
          note.balance.remaining,
          target.outstandingAmount,
        ),
      )
      note.balance = {
        applied: round(note.balance.applied + amount),
        refunded: note.balance.refunded,
        remaining: round(note.balance.remaining - amount),
      }
      note.status = note.balance.remaining > 0 ? 'UNAPPLIED' : 'APPLIED'
      note.credits = {
        billNumber: target.supplierBillNumber,
        issueDate: target.issueDate,
        documentUuid: `uuid-${target.id}`,
        billId: target.id,
        applied: true,
      }
      target.outstandingAmount = round(target.outstandingAmount - amount)
      const settlement = {
        id: `st-${Date.now()}`,
        creditNoteId: note.id,
        billId: target.id,
        kind: 'APPLIED',
        amount,
        paymentReference: null,
        settledOn: '2026-09-25',
        actorId: 'u-hafidh',
        occurredAt: new Date().toISOString(),
      }
      ;(CREDIT_SETTLEMENTS[note.id] ??= []).push(settlement)
      return { settlement, status: note.status, balance: note.balance }
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/credit-notes\/([^/]+)\/refund$/,
    reply: ({ params, body }) => {
      const note = CREDIT_NOTES.find((n) => n.id === params[0])
      if (!note) return { status: 404 }
      const amount = round(Math.min(body?.amount ?? 0, note.balance.remaining))
      note.balance = {
        applied: note.balance.applied,
        refunded: round(note.balance.refunded + amount),
        remaining: round(note.balance.remaining - amount),
      }
      note.status = note.balance.remaining > 0 ? 'UNAPPLIED' : 'REFUNDED'
      const settlement = {
        id: `st-${Date.now()}`,
        creditNoteId: note.id,
        billId: null,
        kind: 'REFUNDED',
        amount,
        paymentReference: body?.paymentReference ?? null,
        settledOn: body?.paidOn ?? '2026-09-25',
        actorId: 'u-hafidh',
        occurredAt: new Date().toISOString(),
      }
      ;(CREDIT_SETTLEMENTS[note.id] ??= []).push(settlement)
      return { settlement, status: note.status, balance: note.balance }
    },
  },

  /* debit notes */
  { match: '/api/v1/debit-notes/summary', reply: ({ query }) => debitSummary(query) },
  { match: '/api/v1/debit-notes', reply: ({ query }) => noteList(DEBIT_NOTES, query) },
  {
    match: /^\/api\/v1\/debit-notes\/([^/]+)$/,
    reply: ({ params }) => DEBIT_NOTES.find((n) => n.id === params[0]) ?? { status: 404 },
  },
  {
    match: /^\/api\/v1\/debit-notes\/([^/]+)\/decisions$/,
    reply: ({ params }) => DEBIT_DECISIONS[params[0]] ?? [],
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/debit-notes\/([^/]+)\/(accept|refuse)$/,
    reply: ({ params, body }) => {
      const note = DEBIT_NOTES.find((n) => n.id === params[0])
      if (!note) return { status: 404 }
      const decision = params[1] === 'accept' ? 'ACCEPTED' : 'REFUSED'
      if (note.status === decision)
        return refusal(409, 'DEBIT_NOTE_DECISION_UNCHANGED', 'That decision is already recorded.')
      if (decision === 'REFUSED' && !body?.reason)
        return refusal(400, 'DEBIT_NOTE_REASON_REQUIRED', 'A refusal needs a reason.')
      const record = {
        decision,
        reason: decision === 'REFUSED' ? body.reason : null,
        decidedBy: 'u-hafidh',
        decidedAt: new Date().toISOString(),
      }
      note.status = decision
      note.decidedBy = record.decidedBy
      note.decidedAt = record.decidedAt
      note.decisionReason = record.reason
      ;(DEBIT_DECISIONS[note.id] ??= []).unshift(record)
      return record
    },
  },

  /* bills: the list the choosers search, one bill, and the notes' own rows */
  { match: '/api/v1/bills', reply: ({ query }) => page(billsFor(query), query) },
  {
    match: /^\/api\/v1\/bills\/([^/]+)$/,
    reply: ({ params }) => {
      const row = BILLS.find((b) => b.id === params[0])
      if (row) return billDetail(row)
      const credit = CREDIT_NOTES.find((n) => n.id === params[0])
      if (credit) return noteAsBillDetail(credit, 'credit')
      const debit = DEBIT_NOTES.find((n) => n.id === params[0])
      if (debit) return noteAsBillDetail(debit, 'debit')
      return { status: 404 }
    },
  },
  {
    match: /^\/api\/v1\/inbound-invoices\/([^/]+)\/document$/,
    reply: () => ({
      status: 200,
      headers: { 'Content-Disposition': 'attachment; filename="note.xml"' },
      body: '<Invoice/>',
    }),
  },

  /* intake */
  { method: 'POST', match: '/api/v1/bills/intake', reply: ({ query }) => newIntake(query) },
  {
    // The file an uploaded note was confirmed from (`intakeId` on its row).
    match: /^\/api\/v1\/bills\/intake\/([^/]+)\/file$/,
    reply: ({ params }) => ({
      status: 200,
      headers: { 'Content-Disposition': `attachment; filename="${params[0]}.pdf"` },
      body: '%PDF-1.4',
    }),
  },
  {
    match: /^\/api\/v1\/bills\/intake\/([^/]+)$/,
    reply: ({ params }) => INTAKES.get(params[0]) ?? { status: 404 },
  },
  {
    method: 'DELETE',
    match: /^\/api\/v1\/bills\/intake\/([^/]+)$/,
    reply: ({ params }) => ({ status: INTAKES.delete(params[0]) ? 204 : 404 }),
  },
  {
    method: 'PUT',
    match: /^\/api\/v1\/bills\/intake\/([^/]+)$/,
    reply: ({ params }) => INTAKES.get(params[0]) ?? { status: 404 },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/bills\/intake\/([^/]+)\/confirm$/,
    reply: ({ params, body }) => {
      const intake = INTAKES.get(params[0])
      if (!intake) return refusal(404, 'BILL_INTAKE_NOT_FOUND', 'No such upload.')
      if (intake.confirmedBillId)
        return refusal(409, 'BILL_INTAKE_ALREADY_CONFIRMED', 'Already saved.')
      const supplierRow = SUPPLIERS.find((s) => s.id === body?.supplierId) ?? null
      const id = `${body?.documentTypeCode === '383' ? 'dn' : 'cn'}-new-${intakeSeed}`
      const base = {
        id,
        supplierId: supplierRow?.id ?? null,
        number: body?.billNumber ?? null,
        issueDate: body?.issueDate ?? '2026-09-25',
        source: 'UPLOADED',
        reasonCode: body?.reasonCode ?? null,
        reasonDetail: body?.reasonDetail ?? null,
      }
      let creditApplied = null
      const related = body?.relatedBillId ? BILLS.find((b) => b.id === body.relatedBillId) : null
      if (body?.relatedBillId && !related)
        return refusal(400, 'BILL_INTAKE_RELATED_BILL_UNKNOWN', 'No such bill.')
      if (related && supplierRow && related.supplierId !== supplierRow.id)
        return refusal(400, 'BILL_INTAKE_RELATED_BILL_SUPPLIER_MISMATCH', 'Another supplier.')
      // "Hold it as credit" belongs to a credit note: refused on a debit note, as the server does.
      const holdAsCredit = body?.holdAsCredit === true
      if (holdAsCredit && body?.documentTypeCode !== '381')
        return refusal(400, 'BILL_INTAKE_HOLD_AS_CREDIT_NOT_ALLOWED', 'Only a credit note.')
      if (body?.documentTypeCode === '383') {
        DEBIT_NOTES.unshift(
          debitNote({
            ...base,
            dueDate: body?.dueDate ?? '2026-10-25',
            total: body?.total ?? 0,
            vat: body?.vat ?? 0,
            status: 'UNCHECKED',
            outstanding: body?.total ?? 0,
            paid: 0,
            billId: BILLS[0].id,
          }),
        )
        DEBIT_NOTES[0].supplierName = supplierRow?.displayName ?? body?.supplierName ?? 'Unknown'
        DEBIT_NOTES[0].relatesTo = null
      } else {
        CREDIT_NOTES.unshift(
          creditNote({
            ...base,
            credited: body?.total ?? 0,
            vat: body?.vat ?? 0,
            status: 'UNAPPLIED',
            balance: { applied: 0, refunded: 0, remaining: body?.total ?? 0 },
            billId: related?.id ?? null,
          }),
        )
        CREDIT_NOTES[0].supplierName = supplierRow?.displayName ?? body?.supplierName ?? 'Unknown'
        // A credit note naming its bill is set against it in the same request: the largest
        // amount that fits; any excess stays as credit, and a bill owing nothing takes none.
        // Held as credit (`holdAsCredit`), the bill stays the note's reference and nothing is
        // applied: the whole note waits as unused credit.
        const note = CREDIT_NOTES[0]
        const amount =
          related && !holdAsCredit
            ? round(Math.min(note.balance.remaining, Math.max(0, related.outstandingAmount)))
            : 0
        if (holdAsCredit) {
          note.credits.applied = false
        } else if (amount > 0) {
          note.balance = {
            applied: amount,
            refunded: 0,
            remaining: round(note.balance.remaining - amount),
          }
          note.status = note.balance.remaining > 0 ? 'UNAPPLIED' : 'APPLIED'
          note.credits.applied = true
          related.outstandingAmount = round(related.outstandingAmount - amount)
          creditApplied = { billId: related.id, amount }
          ;(CREDIT_SETTLEMENTS[note.id] ??= []).push({
            id: `st-${Date.now()}`,
            creditNoteId: note.id,
            billId: related.id,
            kind: 'APPLIED',
            amount,
            paymentReference: null,
            settledOn: '2026-09-25',
            actorId: 'u-hafidh',
            occurredAt: new Date().toISOString(),
          })
        } else {
          note.credits.applied = false
          note.credits.billId = null
        }
      }
      const confirmed = (body?.documentTypeCode === '383' ? DEBIT_NOTES : CREDIT_NOTES)[0]
      confirmed.intakeId = intake.id
      intake.confirmedBillId = id
      return {
        id,
        supplierBillNumber: body?.billNumber ?? null,
        totalIncludingVat: body?.total ?? 0,
        currencyCode: body?.currency ?? 'OMR',
        // The credit this confirm took off the chosen bill; null when nothing was applied.
        creditApplied,
      }
    },
  },

  /* suppliers */
  {
    match: '/api/v1/suppliers',
    reply: ({ query }) => {
      const q = (query.get('q') ?? '').trim().toLowerCase()
      return page(
        SUPPLIERS.filter((s) => !q || s.displayName.toLowerCase().includes(q)),
        query,
      )
    },
  },
  {
    match: /^\/api\/v1\/suppliers\/([^/]+)\/overview$/,
    reply: ({ params }) => {
      const open = BILLS.filter((b) => b.supplierId === params[0] && b.outstandingAmount > 0)
      const bucket = (rows) => ({
        amount: round(rows.reduce((sum, b) => sum + b.outstandingAmount, 0)),
        bills: rows.length,
        nextDue: rows[0]?.dueDate ?? null,
      })
      const late = open.filter((b) => b.overdue && b.workflowState !== 'ON_HOLD')
      const onHold = open.filter((b) => b.workflowState === 'ON_HOLD')
      const notDue = open.filter((b) => !b.overdue && b.workflowState !== 'ON_HOLD')
      return {
        tabs: {
          bills: BILLS.filter((b) => b.supplierId === params[0]).length,
          payments: 3,
          orders: 2,
          documents: 1,
        },
        match: { agreed: 4, orderBacked: 5, summary: null },
        usualLeadTimeDays: 3,
        payables: {
          currencyCode: 'OMR',
          notDue: bucket(notDue),
          dueSoon: bucket([]),
          late: bucket(late),
          onHold: bucket(onHold),
          everLate: late.length > 0,
          total: bucket(open).amount,
        },
      }
    },
  },
  {
    match: /^\/api\/v1\/suppliers\/([^/]+)$/,
    reply: ({ params }) => {
      const row = SUPPLIERS.find((s) => s.id === params[0])
      return row ? supplierDetail(row) : { status: 404 }
    },
  },
]
