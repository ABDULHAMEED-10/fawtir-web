/**
 * Payments, recurring bills and payables reminders for the mock gateway: Al Bahja Coffee's
 * September 2026, in the shapes `src/api/expenditure/paymentRuns.ts`, `recurringBills.ts`,
 * `billReminders.ts`, `bills.ts` and `suppliers.ts` read.
 *
 * Everything the Payments, Recurring bills and Reminders frames draw has a row here: a draft run
 * with bills in and out of it, bills the run cannot take, a late watch and a paused one, a rule
 * for every reminder type. Writes mutate the fixtures in memory so ticking, pausing and saving
 * show their effect until the process restarts.
 */

const TODAY = '2026-09-25'
const money = (n) => Math.round(n * 1000) / 1000

/* ----------------------------------------------------------------- suppliers */

const SUPPLIERS = {
  's-mr': {
    name: 'Muscat Roastery Co',
    vat: 'OM1100447102',
    cr: '1104472',
    address: 'Rusayl Industrial Estate, Muscat',
    iban: 'OM550018000044712290',
    channel: 'PEPPOL',
    peppol: true,
    email: 'accounts@muscatroastery.om',
  },
  's-sp': {
    name: 'Sohar Packaging LLC',
    vat: 'OM1100628391',
    cr: '1163281',
    address: 'Industrial Area 4, Sohar',
    iban: 'OM900018000062839100',
    channel: 'EMAIL_PDF',
    peppol: false,
    email: 'billing@soharpack.om',
  },
  's-nh': {
    name: 'Nizwa Hardware Store',
    vat: 'OM1100773310',
    cr: '1188341',
    address: 'Souq Road, Nizwa',
    iban: 'OM310018000077331000',
    channel: 'PAPER',
    peppol: false,
    email: null,
  },
  's-mz': {
    name: 'Mazoon Electricity',
    vat: 'OM1100901220',
    cr: '1201884',
    address: 'Nizwa Distribution Centre',
    iban: 'OM770018000090122000',
    channel: 'PEPPOL',
    peppol: true,
    email: 'billing@mazoon.om',
  },
  's-gcl': {
    name: 'Gulf Cold Logistics',
    vat: 'OM1100582341',
    cr: '1195520',
    address: 'Port Road, Sohar',
    iban: 'OM120018000058234100',
    channel: 'EMAIL_PDF',
    peppol: false,
    email: 'ops@gulfcold.om',
  },
  's-and': {
    name: 'Al Noor Dates LLC',
    vat: 'OM1100338817',
    cr: '1177803',
    address: 'Wadi Al Kabir, Muscat',
    iban: 'OM440018000033881700',
    channel: 'PEPPOL',
    peppol: true,
    email: 'sales@alnoordates.om',
  },
  's-abp': {
    name: 'Al Bahja Properties',
    vat: 'OM1100201477',
    cr: '1092231',
    address: 'Nizwa Souq, Nizwa',
    iban: 'OM630018000020147700',
    channel: 'EMAIL_PDF',
    peppol: false,
    email: 'rent@albahjaprop.om',
  },
  's-omantel': {
    name: 'Omantel',
    vat: 'OM1100112040',
    cr: '1001120',
    address: 'Ruwi, Muscat',
    iban: 'OM210018000011204000',
    channel: 'PEPPOL',
    peppol: true,
    email: 'business@omantel.om',
  },
  's-sahl': {
    name: 'Sahl Cloud LLC',
    vat: 'OM1100664220',
    cr: '1211440',
    address: 'Knowledge Oasis, Muscat',
    iban: 'OM880018000066422000',
    channel: 'EMAIL_PDF',
    peppol: false,
    email: 'billing@sahlcloud.om',
  },
  's-bright': {
    name: 'Bright Facilities LLC',
    vat: null,
    cr: '1230098',
    address: 'Al Khuwair, Muscat',
    iban: null,
    channel: 'PAPER',
    peppol: false,
    email: null,
  },
}

function supplierDetail(id) {
  const s = SUPPLIERS[id]
  if (!s) return null
  return {
    profile: {
      id,
      type: 'BUSINESS',
      displayName: s.name,
      legalName: s.name,
      vatNumber: s.vat,
      registeredForVat: Boolean(s.vat),
      registeredOnPeppol: s.peppol,
      participantScheme: s.peppol ? '0248' : null,
      participantValue: s.peppol ? s.vat : null,
      participantId: s.peppol ? `0248:${s.vat}` : null,
      defaultCurrency: 'OMR',
      defaultTaxCategory: 'S5',
      paymentTerms: 'NET30',
      defaultPaymentMethod: '30',
      bankDetails: s.iban
        ? {
            iban: s.iban,
            bic: 'BMUSOMRX',
            accountName: s.name,
            bankName: 'Bank Muscat',
            changedAt: null,
            confirmedAt: '2026-01-10T08:00:00Z',
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
      contactPerson: null,
      roleTitle: null,
      emailRecipients: s.email ? [s.email] : null,
      telephone: '+968 2441 0000',
      mobilePhone: null,
      preferredLanguage: 'en',
      receivingChannel: s.channel,
      requiresApprovalBeforePayment: true,
      earlyPaymentDiscountPercent: id === 's-mr' ? 2 : null,
      earlyPaymentDiscountDays: id === 's-mr' ? 10 : null,
      commercialRegistrationNumber: s.cr,
      notes: null,
      supplierCategory: null,
      selfBillingAgreement: false,
      health: s.iban ? [] : ['NO_BANK_DETAILS'],
      supplierSince: '2025-02-01',
      switchedOffAt: null,
      status: 'ACTIVE',
      customerStatus: null,
      version: 3,
    },
    invoiceAddress: {
      line1: s.address,
      line2: null,
      city: s.address.split(', ').pop(),
      region: null,
      postalCode: null,
      countryCode: 'OM',
    },
    sameAsInvoicingAddress: true,
    deliveryAddress: null,
  }
}

/* ----------------------------------------------------------------------- bills */

/** Priced from their lines so the sheet, the run and the recorded figures agree. */
function bill(id, supplierId, number, issueDate, dueDate, source, lines, extra = {}) {
  const net = money(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0))
  const vat = money(
    lines.reduce((sum, line) => sum + (line.quantity * line.unitPrice * line.vatRate) / 100, 0),
  )
  const total = money(net + vat)
  const s = SUPPLIERS[supplierId]
  return {
    id,
    supplierId,
    supplierName: s.name,
    number,
    issueDate,
    dueDate,
    source,
    lines: lines.map((line, index) => ({
      lineNo: index + 1,
      ...line,
      lineNet: money(line.quantity * line.unitPrice),
      purchaseOrderLineId: null,
      goodsReceiptId: null,
    })),
    net,
    vat,
    total,
    purchaseOrder: null,
    goodsReceipt: null,
    matchVerdict: 'NO_ORDER',
    approvedBy: 'Hafidh Saif',
    approvedAt: '2026-09-20T06:30:00Z',
    workflowState: 'APPROVED',
    hold: null,
    intakeFile: null,
    ...extra,
  }
}

const BILLS = [
  bill(
    'b-mr-8821',
    's-mr',
    'MR-INV-8821',
    '2026-09-14',
    '2026-10-14',
    'PEPPOL',
    [
      {
        description: 'Green beans, Yirgacheffe',
        quantity: 300,
        unit: 'KGM',
        unitPrice: 7.4,
        vatRate: 5,
      },
      { description: 'Jute sacks, 25 kg', quantity: 12, unit: 'EA', unitPrice: 1.85, vatRate: 5 },
    ],
    {
      purchaseOrder: 'PO-0031',
      goodsReceipt: 'GRN-0087',
      matchVerdict: 'MATCHED',
      approvedAt: '2026-09-20T06:30:00Z',
      discountPercent: 2,
    },
  ),
  bill(
    'b-mr-8790',
    's-mr',
    'MR-INV-8790',
    '2026-09-06',
    '2026-09-28',
    'PEPPOL',
    [
      { description: 'Green beans, Sidamo', quantity: 50, unit: 'KGM', unitPrice: 7.4, vatRate: 5 },
      { description: 'Jute sacks, 25 kg', quantity: 2, unit: 'EA', unitPrice: 1.85, vatRate: 5 },
    ],
    {
      purchaseOrder: 'PO-0027',
      goodsReceipt: 'GRN-0081',
      matchVerdict: 'MATCHED',
      approvedAt: '2026-09-08T06:30:00Z',
    },
  ),
  bill(
    'b-sp-1140',
    's-sp',
    'SP-INV-1140',
    '2026-09-10',
    '2026-09-28',
    'UPLOADED',
    [
      {
        description: 'Kraft coffee bags 1kg, printed',
        quantity: 8000,
        unit: 'EA',
        unitPrice: 0.24,
        vatRate: 5,
      },
      {
        description: 'Kraft coffee bags 250g, printed',
        quantity: 12164,
        unit: 'EA',
        unitPrice: 0.088,
        vatRate: 5,
      },
    ],
    {
      purchaseOrder: 'PO-0031',
      goodsReceipt: null,
      matchVerdict: 'MATCHED_BY_HAND',
      approvedAt: '2026-09-12T09:10:00Z',
      intakeFile: { id: 'in-1140', filename: 'SP-INV-1140.svg', contentType: 'image/svg+xml' },
    },
  ),
  bill(
    'b-nh-4471',
    's-nh',
    'NH-4471',
    '2026-09-16',
    '2026-09-23',
    'SCANNED',
    [
      {
        description: 'Workshop consumables',
        quantity: 1,
        unit: 'EA',
        unitPrice: 182.59,
        vatRate: 5,
      },
    ],
    {
      approvedAt: '2026-09-17T11:00:00Z',
      intakeFile: { id: 'in-4471', filename: 'NH-4471.svg', contentType: 'image/svg+xml' },
    },
  ),
  bill(
    'b-mz-7801',
    's-mz',
    'MZ-INV-7801',
    '2026-09-18',
    '2026-09-30',
    'PEPPOL',
    [
      {
        description: 'Electricity, roastery, August',
        quantity: 1,
        unit: 'EA',
        unitPrice: 303.238,
        vatRate: 5,
      },
    ],
    { approvedAt: '2026-09-19T07:00:00Z' },
  ),
  bill(
    'b-sp-1152',
    's-sp',
    'SP-INV-1152',
    '2026-09-22',
    '2026-10-10',
    'UPLOADED',
    [
      {
        description: 'Kraft coffee bags 500g, plain',
        quantity: 6000,
        unit: 'EA',
        unitPrice: 0.155,
        vatRate: 5,
      },
    ],
    {
      purchaseOrder: 'PO-0034',
      matchVerdict: 'MATCHED',
      approvedAt: '2026-09-23T07:00:00Z',
      intakeFile: { id: 'in-1152', filename: 'SP-INV-1152.svg', contentType: 'image/svg+xml' },
    },
  ),
  bill(
    'b-mr-8850',
    's-mr',
    'MR-INV-8850',
    '2026-09-24',
    '2026-10-24',
    'PEPPOL',
    [
      {
        description: 'Green beans, Harrar',
        quantity: 80,
        unit: 'KGM',
        unitPrice: 7.29,
        vatRate: 5,
      },
    ],
    {
      purchaseOrder: 'PO-0036',
      goodsReceipt: 'GRN-0090',
      matchVerdict: 'MATCHED',
      approvedAt: '2026-09-24T12:00:00Z',
      discountPercent: 2,
    },
  ),
  bill(
    'b-gcl-2288',
    's-gcl',
    'GCL-2288',
    '2026-09-12',
    '2026-10-02',
    'UPLOADED',
    [
      {
        description: 'Cold delivery, weeks 36 and 37',
        quantity: 2,
        unit: 'EA',
        unitPrice: 196,
        vatRate: 5,
      },
    ],
    {
      workflowState: 'ON_HOLD',
      approvedBy: null,
      approvedAt: null,
      hold: { reason: 'Two deliveries billed twice', openedAt: '2026-09-15T08:00:00Z' },
      intakeFile: { id: 'in-2288', filename: 'GCL-2288.svg', contentType: 'image/svg+xml' },
    },
  ),
  bill(
    'b-and-3388',
    's-and',
    'AND-INV-3388',
    '2026-09-19',
    '2026-10-19',
    'PEPPOL',
    [
      {
        description: 'Khalas dates, 5 kg boxes',
        quantity: 42,
        unit: 'BX',
        unitPrice: 21.18,
        vatRate: 5,
      },
    ],
    {
      workflowState: 'MISMATCH',
      approvedBy: null,
      approvedAt: null,
      purchaseOrder: 'PO-0033',
      matchVerdict: 'MISMATCH',
      matchSummary: '3 boxes more than we received',
    },
  ),
]

/** Al Bahja Properties' past rent bills, for the recurring watch's history and the "past bills" panel. */
const RENT_MONTHS = [
  '2025-10',
  '2025-11',
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
]
const RENT_BILLS = RENT_MONTHS.map((month, index) =>
  bill(
    `b-abp-${month}`,
    's-abp',
    `ABP-INV-0${288 + index * 3}`,
    `${month}-23`,
    `${month}-30`,
    'UPLOADED',
    [
      {
        description: `Shop rent, Nizwa branch, ${month}`,
        quantity: 1,
        unit: 'MON',
        unitPrice: 1200,
        vatRate: 0,
      },
    ],
    {
      workflowState: 'PAID',
      paidOn: `${month}-29`,
      intakeFile: {
        id: `in-abp-${month}`,
        filename: `ABP-INV-0${288 + index * 3}.svg`,
        contentType: 'image/svg+xml',
      },
    },
  ),
)
BILLS.push(...RENT_BILLS)

const billById = (id) => BILLS.find((b) => b.id === id)

function billRow(b) {
  const paid = b.workflowState === 'PAID'
  return {
    id: b.id,
    source: b.source,
    supplierId: b.supplierId,
    supplierName: b.supplierName,
    documentTypeCode: '380',
    supplierBillNumber: b.number,
    issueDate: b.issueDate,
    dueDate: b.dueDate,
    overdue: !paid && b.dueDate < TODAY,
    currencyCode: 'OMR',
    totalIncludingVat: b.total,
    vatAmount: b.vat,
    paidAmount: paid ? b.total : 0,
    outstandingAmount: paid ? 0 : b.total,
    purchaseOrderReference: b.purchaseOrder,
    workflowState: b.workflowState,
    readiness: {
      state: b.workflowState === 'APPROVED' || paid ? 'READY' : 'PENDING',
      distinctApprovals: b.approvedAt ? 1 : 0,
      required: 1,
      autoApproved: false,
    },
    match:
      b.purchaseOrder || b.matchVerdict !== 'NO_ORDER'
        ? {
            verdict: b.matchVerdict,
            purchaseOrderNumber: b.purchaseOrder,
            byHand: b.matchVerdict === 'MATCHED_BY_HAND',
          }
        : { verdict: 'NO_ORDER', purchaseOrderNumber: null, byHand: false },
    hold: b.hold,
    paymentRunReference: paid ? 'PR-0009' : null,
    paidOnTheSpot: false,
  }
}

function billDetail(b) {
  const row = billRow(b)
  return {
    bill: {
      ...row,
      inboundDeliveryId: b.source === 'PEPPOL' ? `del-${b.id}` : null,
      networkVerified: b.source === 'PEPPOL',
      amountDue: row.outstandingAmount,
      creditedAmount: 0,
      complianceObligation:
        b.source === 'PEPPOL' ? 'REPORTED_BY_SENDER' : 'PENDING_COMPLIANCE_INPUT',
      match: row.match
        ? {
            ...row.match,
            purchaseOrderId: b.purchaseOrder ? `po-${b.purchaseOrder}` : null,
            goodsReceiptId: b.goodsReceipt ? `grn-${b.goodsReceipt}` : null,
            goodsReceiptNumber: b.goodsReceipt ?? null,
            summary: b.matchSummary ?? null,
            matchedAt: b.purchaseOrder ? b.issueDate + 'T10:00:00Z' : null,
          }
        : null,
    },
    lines: b.lines,
    readiness: row.readiness,
    approvals: b.approvedAt
      ? [
          {
            id: `ap-${b.id}`,
            decision: 'APPROVED',
            reason: null,
            decidedBy: b.approvedBy,
            decidedAt: b.approvedAt,
          },
        ]
      : [],
    hold: b.hold
      ? {
          id: `h-${b.id}`,
          reason: b.hold.reason,
          openedBy: 'Yusuf Al Balushi',
          openedAt: b.hold.openedAt,
          releasedBy: null,
          releasedAt: null,
        }
      : null,
    holdHistory: [],
    settlement: {
      billTotal: b.total,
      paidAmount: row.paidAmount,
      creditedAmount: 0,
      outstandingAmount: row.outstandingAmount,
      currency: 'OMR',
      paymentState: row.paidAmount > 0 ? 'PAID' : 'UNPAID',
      overdue: row.overdue,
      dueDate: b.dueDate,
    },
    payments: b.paidOn
      ? [
          {
            id: `pay-${b.id}`,
            entryType: 'PAYMENT',
            amount: b.total,
            currency: 'OMR',
            methodCode: '30',
            paymentReference: 'PR-0009',
            paymentDate: b.paidOn,
            occurredAt: `${b.paidOn}T09:00:00Z`,
          },
        ]
      : [],
    paymentRunReference: row.paymentRunReference,
    intake: b.intakeFile
      ? {
          id: b.intakeFile.id,
          source: b.source,
          filename: b.intakeFile.filename,
          contentType: b.intakeFile.contentType,
          uploadedAt: `${b.issueDate}T12:00:00Z`,
        }
      : null,
    compliance: {
      source: b.source,
      networkVerified: b.source === 'PEPPOL',
      obligation: b.source === 'PEPPOL' ? 'REPORTED_BY_SENDER' : 'PENDING_COMPLIANCE_INPUT',
    },
    activity: [
      { at: `${b.issueDate}T12:00:00Z`, kind: 'ARRIVED', detail: null, actor: null },
      ...(b.approvedAt
        ? [{ at: b.approvedAt, kind: 'APPROVED', detail: null, actor: b.approvedBy }]
        : []),
    ],
  }
}

/** A drawn stand-in for the scan or PDF someone uploaded, so the viewer has a picture to show. */
function intakeSvg(b) {
  const s = SUPPLIERS[b.supplierId]
  const rows = b.lines
    .map(
      (line, i) =>
        `<text x="40" y="${300 + i * 26}" font-size="13" fill="#3a3a3a">${line.description}</text><text x="560" y="${300 + i * 26}" font-size="13" fill="#3a3a3a" text-anchor="end">${line.lineNet.toFixed(3)}</text>`,
    )
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="760" viewBox="0 0 600 760"><rect width="600" height="760" fill="#fbfaf7"/><text x="40" y="70" font-size="22" font-weight="700" fill="#151c2d">${s.name}</text><text x="40" y="94" font-size="12" fill="#6b6f80">${s.address} · VAT ${s.vat ?? ''}</text><text x="560" y="70" font-size="16" font-weight="700" fill="#151c2d" text-anchor="end">TAX INVOICE</text><text x="560" y="94" font-size="12" fill="#6b6f80" text-anchor="end">No. ${b.number} · Issued ${b.issueDate} · Due ${b.dueDate}</text><line x1="40" y1="120" x2="560" y2="120" stroke="#151c2d"/><text x="40" y="150" font-size="11" fill="#8f8f8f">BILLED TO</text><text x="40" y="170" font-size="13" fill="#3a3a3a">Al Bahja Coffee LLC, Souq Street, Nizwa</text><text x="40" y="270" font-size="11" fill="#8f8f8f">DESCRIPTION</text><text x="560" y="270" font-size="11" fill="#8f8f8f" text-anchor="end">AMOUNT</text>${rows}<line x1="300" y1="${330 + b.lines.length * 26}" x2="560" y2="${330 + b.lines.length * 26}" stroke="#eceef2"/><text x="560" y="${360 + b.lines.length * 26}" font-size="13" fill="#3a3a3a" text-anchor="end">Net ${b.net.toFixed(3)} · VAT ${b.vat.toFixed(3)}</text><text x="560" y="${390 + b.lines.length * 26}" font-size="18" font-weight="700" fill="#151c2d" text-anchor="end">Total ${b.total.toFixed(3)}</text><text x="40" y="700" font-size="11" fill="#8f8f8f">Bank Muscat · IBAN ${s.iban ?? ''}</text></svg>`
}

/* ------------------------------------------------------------ payment runs */

const PAYER_ACCOUNTS = [
  {
    id: 'acc-bm-4471',
    name: 'Bank Muscat ····4471',
    iban: 'OM600180000012344471',
    bic: 'BMUSOMRX',
    active: true,
  },
  {
    id: 'acc-nbo-8820',
    name: 'National Bank of Oman ····8820',
    iban: 'OM280180000012348820',
    bic: 'NBOMOMRX',
    active: true,
  },
]

function priced(b, paymentDate) {
  // Muscat Roastery gives 2% off when paid within ten days of issue.
  const early = b.discountPercent && paymentDate && daysBetween(b.issueDate, paymentDate) <= 10
  const discount = early ? money((b.total * b.discountPercent) / 100) : 0
  return { outstanding: b.total, discount, amount: money(b.total - discount) }
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

let runSeq = 15
const RUNS = [
  {
    id: 'run-0014',
    reference: 'PR-0014',
    state: 'DRAFT',
    paymentDate: null,
    payerAccountId: 'acc-bm-4471',
    runReference: 'ALBAHJA-PR-0014',
    format: 'BANK_MUSCAT_CSV',
    currency: 'OMR',
    billIds: ['b-mr-8821', 'b-mr-8790', 'b-sp-1140', 'b-nh-4471'],
    exportedAt: null,
    paidAt: null,
    cancelledAt: null,
    createdAt: '2026-09-24T07:10:00Z',
    version: 4,
  },
  {
    id: 'run-0013',
    reference: 'PR-0013',
    state: 'SCHEDULED',
    paymentDate: '2026-09-27',
    payerAccountId: 'acc-bm-4471',
    runReference: 'ALBAHJA-PR-0013',
    format: 'BANK_MUSCAT_CSV',
    currency: 'OMR',
    billIds: ['b-mz-7801'],
    exportedAt: null,
    paidAt: null,
    cancelledAt: null,
    createdAt: '2026-09-21T07:10:00Z',
    version: 2,
  },
  {
    id: 'run-0012',
    reference: 'PR-0012',
    state: 'EXPORTED',
    paymentDate: '2026-09-18',
    payerAccountId: 'acc-bm-4471',
    runReference: 'ALBAHJA-PR-0012',
    format: 'PAIN_001',
    currency: 'OMR',
    billIds: ['b-sp-1152'],
    exportedAt: '2026-09-17T13:00:00Z',
    paidAt: null,
    cancelledAt: null,
    createdAt: '2026-09-15T07:10:00Z',
    version: 5,
  },
  {
    id: 'run-0011',
    reference: 'PR-0011',
    state: 'PAID',
    paymentDate: '2026-09-04',
    payerAccountId: 'acc-nbo-8820',
    runReference: 'ALBAHJA-PR-0011',
    format: 'BANK_MUSCAT_CSV',
    currency: 'OMR',
    billIds: ['b-abp-2026-08'],
    exportedAt: '2026-09-03T13:00:00Z',
    paidAt: '2026-09-04T10:00:00Z',
    cancelledAt: null,
    createdAt: '2026-09-01T07:10:00Z',
    version: 6,
  },
  {
    id: 'run-0009',
    reference: 'PR-0009',
    state: 'PAID',
    paymentDate: '2026-07-04',
    payerAccountId: 'acc-bm-4471',
    runReference: 'ALBAHJA-PR-0009',
    format: 'BANK_MUSCAT_CSV',
    currency: 'OMR',
    billIds: ['b-abp-2026-06', 'b-abp-2026-07'],
    exportedAt: '2026-07-03T13:00:00Z',
    paidAt: '2026-07-04T10:00:00Z',
    cancelledAt: null,
    createdAt: '2026-07-01T07:10:00Z',
    version: 6,
  },
  {
    id: 'run-0008',
    reference: 'PR-0008',
    state: 'CANCELLED',
    paymentDate: '2026-06-20',
    payerAccountId: null,
    runReference: null,
    format: null,
    currency: 'OMR',
    billIds: [],
    exportedAt: null,
    paidAt: null,
    cancelledAt: '2026-06-18T10:00:00Z',
    createdAt: '2026-06-15T07:10:00Z',
    version: 2,
  },
]

const runById = (id) => RUNS.find((r) => r.id === id)

function runItems(run) {
  return run.billIds.map((billId) => {
    const b = billById(billId)
    const p = priced(b, run.paymentDate)
    return {
      id: `item-${run.id}-${billId}`,
      billId,
      supplierId: b.supplierId,
      supplierName: b.supplierName,
      supplierBillNumber: b.number,
      issueDate: b.issueDate,
      dueDate: b.dueDate,
      amount: p.amount,
      discountTaken: p.discount,
      outstanding: p.outstanding,
    }
  })
}

function runDto(run) {
  const items = runItems(run)
  const billsTotal = money(items.reduce((s, i) => s + i.outstanding, 0))
  const discountTotal = money(items.reduce((s, i) => s + i.discountTaken, 0))
  const { billIds, ...rest } = run
  return { ...rest, billsTotal, discountTotal, netTotal: money(billsTotal - discountTotal) }
}

const runDetail = (run) => ({ run: runDto(run), items: runItems(run) })

/** Approved, unpaid, in no open run: what a run may take. */
function candidates(excludeRun, paymentDate) {
  const taken = new Set(
    RUNS.filter(
      (r) =>
        r.id !== excludeRun &&
        (r.state === 'DRAFT' || r.state === 'SCHEDULED' || r.state === 'EXPORTED'),
    ).flatMap((r) => r.billIds),
  )
  const inThis = new Set(excludeRun ? (runById(excludeRun)?.billIds ?? []) : [])
  return BILLS.filter(
    (b) => b.workflowState === 'APPROVED' && !taken.has(b.id) && !inThis.has(b.id),
  ).map((b) => {
    const p = priced(b, paymentDate)
    return {
      billId: b.id,
      supplierId: b.supplierId,
      supplierName: b.supplierName,
      supplierBillNumber: b.number,
      issueDate: b.issueDate,
      dueDate: b.dueDate,
      ...p,
    }
  })
}

function blocked() {
  return BILLS.filter(
    (b) =>
      b.workflowState === 'ON_HOLD' ||
      b.workflowState === 'MISMATCH' ||
      b.workflowState === 'AWAITING_APPROVAL',
  ).map((b) => ({
    billId: b.id,
    supplierBillNumber: b.number,
    supplierId: b.supplierId,
    supplierName: b.supplierName,
    dueDate: b.dueDate,
    outstanding: b.total,
    reasonCodes:
      b.workflowState === 'ON_HOLD'
        ? ['ON_HOLD']
        : b.workflowState === 'MISMATCH'
          ? ['MISMATCH']
          : ['AWAITING_APPROVALS'],
    approvalsGiven: b.workflowState === 'AWAITING_APPROVAL' ? 1 : null,
    approvalsRequired: b.workflowState === 'AWAITING_APPROVAL' ? 2 : null,
  }))
}

const refuse = (code, status = 400) => ({
  status,
  body: {
    type: 'https://api.fawtir.om/problems/expenditure-refused',
    title: code,
    status,
    error: code,
    detail: code,
  },
})

/* --------------------------------------------------------- recurring bills */

const RECURRING = [
  {
    id: 'rb-rent',
    supplierId: 's-abp',
    supplierName: 'Al Bahja Properties',
    description: 'Shop rent, Nizwa branch',
    currencyCode: 'OMR',
    totalIncludingVat: 1200,
    vatAmount: 0,
    paymentTermsDays: 7,
    interval: 'MONTHLY',
    nextRunDate: '2026-10-23',
    endDate: null,
    remainingOccurrences: null,
    active: true,
    lastRunDate: '2026-08-23',
    mode: 'EXPECT',
    category: 'Rent & premises',
    theirReference: '03215879464817',
    arrivesAroundDay: 23,
    paymentDueDay: 5,
    tolerancePercent: 10,
    lateAfterDays: 2,
    autoApproveWithinRange: false,
    notifyUserId: 'u-yusuf',
    watchingFrom: '2025-09-02',
    lastVariancePercent: 0,
    expectation: {
      state: 'LATE',
      expectedOn: '2026-09-23',
      lastArrivedOn: '2026-08-23',
      lastArrivedAmount: 1200,
      variancePercent: 0,
      lateDays: 2,
    },
  },
  {
    id: 'rb-power',
    supplierId: 's-mz',
    supplierName: 'Mazoon Electricity',
    description: 'Electricity',
    currencyCode: 'OMR',
    totalIncludingVat: 318.4,
    vatAmount: 15.162,
    paymentTermsDays: 10,
    interval: 'MONTHLY',
    nextRunDate: '2026-10-12',
    endDate: null,
    remainingOccurrences: null,
    active: true,
    lastRunDate: '2026-09-12',
    mode: 'EXPECT',
    category: 'Utilities',
    theirReference: 'ACC-77812',
    arrivesAroundDay: 12,
    paymentDueDay: null,
    tolerancePercent: 15,
    lateAfterDays: 3,
    autoApproveWithinRange: true,
    notifyUserId: 'u-yusuf',
    watchingFrom: '2025-11-01',
    lastVariancePercent: 22,
    expectation: {
      state: 'ARRIVED_OUT_OF_RANGE',
      expectedOn: '2026-09-12',
      lastArrivedOn: '2026-09-12',
      lastArrivedAmount: 388.45,
      variancePercent: 22,
      lateDays: null,
    },
  },
  {
    id: 'rb-net',
    supplierId: 's-omantel',
    supplierName: 'Omantel',
    description: 'Internet & phone',
    currencyCode: 'OMR',
    totalIncludingVat: 84.2,
    vatAmount: 4.01,
    paymentTermsDays: 14,
    interval: 'MONTHLY',
    nextRunDate: '2026-10-01',
    endDate: null,
    remainingOccurrences: null,
    active: true,
    lastRunDate: '2026-09-01',
    mode: 'EXPECT',
    category: 'Telecoms',
    theirReference: '96891-2210',
    arrivesAroundDay: 1,
    paymentDueDay: 15,
    tolerancePercent: 5,
    lateAfterDays: 2,
    autoApproveWithinRange: true,
    notifyUserId: 'u-yusuf',
    watchingFrom: '2025-10-01',
    lastVariancePercent: 0,
    expectation: {
      state: 'DUE_TO_ARRIVE',
      expectedOn: '2026-10-01',
      lastArrivedOn: '2026-09-01',
      lastArrivedAmount: 84.2,
      variancePercent: 0,
      lateDays: null,
    },
  },
  {
    id: 'rb-soft',
    supplierId: 's-sahl',
    supplierName: 'Sahl Cloud LLC',
    description: 'Accounting software',
    currencyCode: 'OMR',
    totalIncludingVat: 540,
    vatAmount: 25.714,
    paymentTermsDays: 30,
    interval: 'ANNUALLY',
    nextRunDate: '2027-03-03',
    endDate: null,
    remainingOccurrences: null,
    active: true,
    lastRunDate: '2026-03-03',
    mode: 'EXPECT',
    category: 'Software',
    theirReference: 'SUB-4410',
    arrivesAroundDay: 3,
    paymentDueDay: null,
    tolerancePercent: 10,
    lateAfterDays: 5,
    autoApproveWithinRange: false,
    notifyUserId: 'u-hafidh',
    watchingFrom: '2025-03-01',
    lastVariancePercent: 0,
    expectation: {
      state: 'ARRIVED',
      expectedOn: '2026-03-03',
      lastArrivedOn: '2026-03-03',
      lastArrivedAmount: 540,
      variancePercent: 0,
      lateDays: null,
    },
  },
  {
    id: 'rb-cold',
    supplierId: 's-gcl',
    supplierName: 'Gulf Cold Logistics',
    description: 'Weekly cold delivery',
    currencyCode: 'OMR',
    totalIncludingVat: 96,
    vatAmount: 4.571,
    paymentTermsDays: 7,
    interval: 'WEEKLY',
    nextRunDate: null,
    endDate: null,
    remainingOccurrences: null,
    active: false,
    lastRunDate: '2026-07-19',
    mode: 'EXPECT',
    category: 'Logistics',
    theirReference: 'GCL-ROUTE-9',
    arrivesAroundDay: 7,
    paymentDueDay: null,
    tolerancePercent: 10,
    lateAfterDays: 1,
    autoApproveWithinRange: false,
    notifyUserId: 'u-yusuf',
    watchingFrom: '2026-01-04',
    lastVariancePercent: 0,
    expectation: {
      state: 'DUE_TO_ARRIVE',
      expectedOn: '2026-07-26',
      lastArrivedOn: '2026-07-19',
      lastArrivedAmount: 96,
      variancePercent: 0,
      lateDays: null,
    },
    pausedOn: '2026-07-22',
  },
  {
    id: 'rb-clean',
    supplierId: 's-bright',
    supplierName: 'Bright Facilities LLC',
    description: 'Window cleaning',
    currencyCode: 'OMR',
    totalIncludingVat: 45,
    vatAmount: 0,
    paymentTermsDays: 14,
    interval: 'MONTHLY',
    nextRunDate: '2026-10-01',
    endDate: '2027-03-31',
    remainingOccurrences: 6,
    active: true,
    lastRunDate: '2026-09-01',
    mode: 'RAISE',
    category: 'Rent & premises',
    theirReference: null,
    arrivesAroundDay: null,
    paymentDueDay: null,
    tolerancePercent: null,
    lateAfterDays: null,
    autoApproveWithinRange: false,
    notifyUserId: null,
    watchingFrom: null,
    lastVariancePercent: null,
    expectation: null,
  },
]

const recurringById = (id) => RECURRING.find((r) => r.id === id)

function recurringDto(r) {
  const { pausedOn, ...dto } = r
  // The schedule's VAT category (EXPENDITURE.md M.3): stored from the POST/PUT body as sent and
  // echoed back; null on the seeded rows, where the screen infers it from vatAmount.
  return { taxCategoryCode: null, ...dto }
}

function inState(r, state) {
  if (state === 'ALL') return true
  if (state === 'PAUSED') return !r.active
  if (state === 'LATE') return r.active && r.expectation?.state === 'LATE'
  return r.active
}

const PER_YEAR = { WEEKLY: 52, MONTHLY: 12, QUARTERLY: 4, ANNUALLY: 1 }

function recurringSummary() {
  const active = RECURRING.filter((r) => r.active)
  const expectedMonthly = money(
    active.reduce((s, r) => s + (r.totalIncludingVat * PER_YEAR[r.interval]) / 12, 0),
  )
  const late = active.filter((r) => r.expectation?.state === 'LATE')
  const next = active
    .filter((r) => r.expectation?.expectedOn && r.expectation.expectedOn >= TODAY)
    .sort((a, b) => a.expectation.expectedOn.localeCompare(b.expectation.expectedOn))[0]
  return {
    expectedMonthly,
    currencyCode: 'OMR',
    recurringCount: RECURRING.length,
    activeCount: active.length,
    lateCount: late.length,
    lateDescription: late.length
      ? `${late[0].description}, ${late[0].expectation.lateDays} days past its usual date`
      : null,
    arrivingNext: next?.expectation.expectedOn ?? null,
    arrivingNextDescription: next
      ? `${next.supplierName}, usually OMR ${next.totalIncludingVat.toFixed(3)}`
      : null,
  }
}

/** One run per period. The rent watch has eleven arrivals behind it and the current period open. */
function recurringRuns(r) {
  if (r.id === 'rb-rent') {
    const arrived = RENT_MONTHS.map((month, index) => ({
      id: `rr-rent-${month}`,
      runDate: `${month}-23`,
      periodStart: `${month}-01`,
      periodEnd: `${month}-${month.endsWith('02') ? '28' : '30'}`,
      billId: `b-abp-${month}`,
      outcome: 'ARRIVED',
      failureReason: null,
      expectedOn: `${month}-23`,
      variancePercent: 0,
    }))
    return [
      {
        id: 'rr-rent-2026-09',
        runDate: '2026-09-23',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        billId: null,
        outcome: 'LATE',
        failureReason: null,
        expectedOn: '2026-09-23',
        variancePercent: null,
      },
      ...arrived.reverse(),
    ]
  }
  if (r.id === 'rb-power') {
    return [
      {
        id: 'rr-p-9',
        runDate: '2026-09-12',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        billId: 'b-mz-7801',
        outcome: 'ARRIVED_OUT_OF_RANGE',
        failureReason: null,
        expectedOn: '2026-09-12',
        variancePercent: 22,
      },
      {
        id: 'rr-p-8',
        runDate: '2026-08-12',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        billId: 'b-mz-7790',
        outcome: 'ARRIVED',
        failureReason: null,
        expectedOn: '2026-08-12',
        variancePercent: 1.5,
      },
      {
        id: 'rr-p-7',
        runDate: '2026-07-12',
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
        billId: 'b-mz-7770',
        outcome: 'ARRIVED',
        failureReason: null,
        expectedOn: '2026-07-12',
        variancePercent: -2,
      },
    ]
  }
  if (r.mode === 'RAISE') {
    return [
      {
        id: 'rr-c-9',
        runDate: '2026-09-01',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        billId: 'b-clean-9',
        outcome: 'RAISED',
        failureReason: null,
        expectedOn: null,
        variancePercent: null,
      },
      {
        id: 'rr-c-8',
        runDate: '2026-08-01',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        billId: 'b-clean-8',
        outcome: 'RAISED',
        failureReason: null,
        expectedOn: null,
        variancePercent: null,
      },
    ]
  }
  return r.expectation
    ? [
        {
          id: `rr-${r.id}-1`,
          runDate: r.expectation.expectedOn,
          periodStart: null,
          periodEnd: null,
          billId: null,
          outcome: r.expectation.state === 'ARRIVED' ? 'ARRIVED' : 'EXPECTED',
          failureReason: null,
          expectedOn: r.expectation.expectedOn,
          variancePercent: r.expectation.variancePercent,
        },
      ]
    : []
}

/* ---------------------------------------------------------- bill reminders */

// Beside the routes it serves, so this module's other areas are left as they are.
import { saveRules, saveSettings, settingsAnswer } from '../lib/billReminderRules.mjs'

const USERS = [
  { id: 'u-yusuf', username: 'yusuf', firstName: 'Yusuf', lastName: 'Al Balushi' },
  { id: 'u-hafidh', username: 'hafidh', firstName: 'Hafidh', lastName: 'Saif' },
  { id: 'u-aisha', username: 'aisha', firstName: 'Aisha', lastName: 'Al Hinai' },
]

let RULES = [
  {
    type: 'BEFORE_DUE',
    // Ascending, as the server answers a ladder.
    offsets: [2, 7],
    repeatEveryDays: null,
    escalationOffsets: null,
    recipients: ['u-yusuf'],
    enabled: true,
  },
  {
    type: 'LATE',
    offsets: [1],
    repeatEveryDays: 3,
    escalationOffsets: null,
    recipients: ['u-yusuf', 'u-hafidh'],
    enabled: true,
  },
  {
    type: 'DISCOUNT_EXPIRY',
    offsets: [3],
    repeatEveryDays: null,
    escalationOffsets: null,
    recipients: ['u-hafidh'],
    enabled: true,
  },
  {
    type: 'APPROVAL_STALE',
    offsets: [2],
    repeatEveryDays: null,
    escalationOffsets: [5],
    recipients: [],
    enabled: true,
  },
  {
    type: 'MISMATCH_STALE',
    offsets: [3],
    repeatEveryDays: null,
    escalationOffsets: null,
    recipients: ['u-yusuf'],
    enabled: true,
  },
  {
    type: 'SCAN_UNCONFIRMED',
    offsets: [2],
    repeatEveryDays: null,
    escalationOffsets: null,
    recipients: [],
    enabled: true,
  },
]

let SETTINGS = {
  delivery: 'DAILY_DIGEST',
  digestTime: '08:00',
  skipWeekends: true,
  stopWhenInRun: true,
}

const PREVIEW = {
  date: TODAY,
  total: 4,
  groups: [
    {
      recipientUserId: 'u-yusuf',
      displayName: 'Yusuf Al Balushi',
      headline: 'Two things need your attention this morning.',
      items: [
        {
          ruleType: 'LATE',
          subjectType: 'BILL',
          subjectId: 'b-and-3370',
          subjectDisplay: 'AND-INV-3370',
          daysFromDue: -9,
          headline: 'Al Noor Dates unpaid for 9 days',
          amount: 411.5,
          currency: 'OMR',
        },
        {
          ruleType: 'BEFORE_DUE',
          subjectType: 'BILL',
          subjectId: 'b-sp-1140',
          subjectDisplay: 'SP-INV-1140',
          daysFromDue: 3,
          headline: 'Sohar Packaging due in 3 days',
          amount: 3140,
          currency: 'OMR',
        },
      ],
    },
    {
      recipientUserId: 'u-hafidh',
      displayName: 'Hafidh Saif',
      headline: 'Three things need your attention this morning.',
      items: [
        {
          ruleType: 'LATE',
          subjectType: 'BILL',
          subjectId: 'b-and-3370',
          subjectDisplay: 'AND-INV-3370',
          daysFromDue: -9,
          headline: 'Al Noor Dates unpaid for 9 days',
          amount: 411.5,
          currency: 'OMR',
        },
        {
          ruleType: 'DISCOUNT_EXPIRY',
          subjectType: 'BILL',
          subjectId: 'b-mr-8821',
          subjectDisplay: 'MR-INV-8821',
          daysFromDue: 3,
          headline: '2% discount expires 28 Sept',
          amount: 47.09,
          currency: 'OMR',
        },
        {
          ruleType: 'APPROVAL_STALE',
          subjectType: 'BILL',
          subjectId: 'b-and-3388',
          subjectDisplay: 'AND-INV-3388',
          daysFromDue: 6,
          headline: 'Two approvals waiting 6 days',
          amount: 2996.31,
          currency: 'OMR',
        },
      ],
    },
  ],
}

let INBOX = [
  {
    id: 'inb-1',
    ruleType: 'LATE',
    subjectType: 'BILL',
    subjectId: 'b-and-3370',
    billId: 'b-and-3370',
    daysFromDue: -9,
    firedOn: TODAY,
    headline: 'Al Noor Dates unpaid for 9 days',
    outcome: 'SENT',
    createdAt: `${TODAY}T04:00:00Z`,
    acknowledgedAt: null,
  },
  {
    id: 'inb-2',
    ruleType: 'BEFORE_DUE',
    subjectType: 'BILL',
    subjectId: 'b-sp-1140',
    billId: 'b-sp-1140',
    daysFromDue: 3,
    firedOn: TODAY,
    headline: 'Sohar Packaging due in 3 days',
    outcome: 'SENT',
    createdAt: `${TODAY}T04:00:00Z`,
    acknowledgedAt: null,
  },
]

/* -------------------------------------------------------------------- routes */

export default [
  /* --- payment runs --- */
  {
    match: '/api/v1/payment-runs/candidates',
    reply: ({ query }) => candidates(null, query.get('payment_date')),
  },
  { match: '/api/v1/payment-runs/blocked', reply: () => blocked() },
  {
    match: '/api/v1/payment-runs',
    reply: ({ query }) => {
      const state = query.get('state')
      return RUNS.filter((r) => !state || r.state === state).map(runDto)
    },
  },
  {
    method: 'POST',
    match: '/api/v1/payment-runs',
    reply: ({ body }) => {
      const id = `run-00${runSeq}`
      const run = {
        id,
        reference: `PR-00${runSeq}`,
        state: body?.paymentDate ? 'SCHEDULED' : 'DRAFT',
        paymentDate: body?.paymentDate ?? null,
        payerAccountId: body?.payerAccountId ?? null,
        runReference: body?.runReference ?? null,
        format: body?.format ?? null,
        currency: body?.currency ?? 'OMR',
        billIds: [],
        exportedAt: null,
        paidAt: null,
        cancelledAt: null,
        createdAt: `${TODAY}T09:00:00Z`,
        version: 1,
      }
      runSeq += 1
      RUNS.unshift(run)
      return { status: 201, body: runDto(run) }
    },
  },
  {
    match: /^\/api\/v1\/payment-runs\/([^/]+)\/candidates$/,
    reply: ({ params }) =>
      runById(params[0]) ? candidates(params[0], runById(params[0]).paymentDate) : { status: 404 },
  },
  { match: /^\/api\/v1\/payment-runs\/([^/]+)\/blocked$/, reply: () => blocked() },
  {
    match: /^\/api\/v1\/payment-runs\/([^/]+)$/,
    reply: ({ params }) => (runById(params[0]) ? runDetail(runById(params[0])) : { status: 404 }),
  },
  {
    method: 'PUT',
    match: /^\/api\/v1\/payment-runs\/([^/]+)$/,
    reply: ({ params, body }) => {
      const run = runById(params[0])
      if (!run) return { status: 404 }
      if (run.state !== 'DRAFT' && run.state !== 'SCHEDULED')
        return refuse('PAYMENT_RUN_NOT_EDITABLE')
      Object.assign(run, {
        paymentDate: body?.paymentDate ?? null,
        payerAccountId: body?.payerAccountId ?? null,
        runReference: body?.runReference ?? null,
        format: body?.format ?? null,
      })
      run.state = run.paymentDate ? 'SCHEDULED' : 'DRAFT'
      run.version += 1
      return runDetail(run)
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/payment-runs\/([^/]+)\/items$/,
    reply: ({ params, body }) => {
      const run = runById(params[0])
      if (!run) return { status: 404 }
      if (run.state !== 'DRAFT' && run.state !== 'SCHEDULED')
        return refuse('PAYMENT_RUN_NOT_EDITABLE')
      for (const billId of body?.billIds ?? []) {
        const b = billById(billId)
        if (!b) return { status: 404 }
        if (b.workflowState !== 'APPROVED') return refuse('PAYMENT_RUN_BILL_NOT_READY')
        if (!run.billIds.includes(billId)) run.billIds.push(billId)
      }
      run.version += 1
      return runDetail(run)
    },
  },
  {
    method: 'DELETE',
    match: /^\/api\/v1\/payment-runs\/([^/]+)\/items\/([^/]+)$/,
    reply: ({ params }) => {
      const run = runById(params[0])
      if (!run) return { status: 404 }
      run.billIds = run.billIds.filter((id) => id !== params[1])
      run.version += 1
      return runDetail(run)
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/payment-runs\/([^/]+)\/export$/,
    reply: ({ params }) => {
      const run = runById(params[0])
      if (!run) return { status: 404 }
      if (run.state !== 'SCHEDULED' && run.state !== 'EXPORTED')
        return refuse('PAYMENT_RUN_TRANSITION_INVALID')
      if (!run.format) return refuse('PAYMENT_RUN_FORMAT_REQUIRED')
      run.state = 'EXPORTED'
      run.exportedAt = `${TODAY}T10:00:00Z`
      const rows = runItems(run).map(
        (i) =>
          `${i.supplierName},${SUPPLIERS[i.supplierId].iban ?? ''},${i.amount.toFixed(3)},${i.supplierBillNumber}`,
      )
      return {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${run.reference}.csv"`,
        },
        body: ['beneficiary,iban,amount,reference', ...rows].join('\n'),
      }
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/payment-runs\/([^/]+)\/mark-paid$/,
    reply: ({ params }) => {
      const run = runById(params[0])
      if (!run) return { status: 404 }
      if (run.state !== 'EXPORTED') return refuse('PAYMENT_RUN_TRANSITION_INVALID')
      run.state = 'PAID'
      run.paidAt = `${TODAY}T11:00:00Z`
      for (const id of run.billIds) billById(id).workflowState = 'PAID'
      return runDto(run)
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/payment-runs\/([^/]+)\/cancel$/,
    reply: ({ params }) => {
      const run = runById(params[0])
      if (!run) return { status: 404 }
      if (run.state !== 'DRAFT' && run.state !== 'SCHEDULED')
        return refuse('PAYMENT_RUN_TRANSITION_INVALID')
      run.state = 'CANCELLED'
      run.cancelledAt = `${TODAY}T11:00:00Z`
      return runDto(run)
    },
  },
  { match: '/api/v1/payer-bank-accounts', reply: () => PAYER_ACCOUNTS },
  {
    method: 'POST',
    match: '/api/v1/payer-bank-accounts',
    reply: ({ body }) => {
      const account = {
        id: `acc-${PAYER_ACCOUNTS.length + 1}`,
        name: body?.name ?? 'Account',
        iban: body?.iban ?? '',
        bic: body?.bic ?? null,
        active: true,
      }
      PAYER_ACCOUNTS.push(account)
      return { status: 201, body: account }
    },
  },

  /* --- bills the runs and watches point at --- */
  {
    match: /^\/api\/v1\/bills\/intake\/([^/]+)\/file$/,
    reply: ({ params }) => {
      const b = BILLS.find((x) => x.intakeFile?.id === params[0])
      if (!b) return { status: 404 }
      return {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Content-Disposition': `attachment; filename="${b.intakeFile.filename}"`,
        },
        body: intakeSvg(b),
      }
    },
  },
  {
    match: /^\/api\/v1\/inbound-invoices\/([^/]+)\/document$/,
    reply: ({ params }) => {
      const b = billById(params[0].replace(/^del-/, ''))
      if (!b) return { status: 404 }
      return {
        status: 200,
        headers: {
          'Content-Type': 'application/xml',
          'Content-Disposition': `attachment; filename="${b.number}.xml"`,
        },
        body: `<?xml version="1.0"?><Invoice><ID>${b.number}</ID></Invoice>`,
      }
    },
  },
  {
    match: '/api/v1/bills/summary',
    reply: () => ({
      currencyCode: 'OMR',
      openCount: 9,
      openTotal: 9000,
      overdueCount: 1,
      dueThisWeekCount: 3,
      dueThisWeekTotal: 3700,
      readyToPayCount: 7,
      readyToPayTotal: 8800,
      disputedCount: 0,
      disputedTotal: 0,
      excludedFromTotals: 0,
      needsAttention: {
        draft: 0,
        new: 0,
        mismatch: 1,
        awaitingApproval: 0,
        total: 1,
        truncated: false,
      },
      tabs: {
        needsAttention: 1,
        all: 20,
        awaitingApproval: 0,
        approved: 7,
        onHold: 1,
        paid: 11,
        truncated: false,
      },
    }),
  },
  {
    match: '/api/v1/bills',
    reply: ({ query }) => {
      const supplierId = query.get('supplier_id')
      const rows = BILLS.filter((b) => !supplierId || b.supplierId === supplierId).map(billRow)
      return { items: rows, page: 0, pageSize: 50, count: rows.length, total: rows.length }
    },
  },
  {
    match: /^\/api\/v1\/bills\/([^/]+)$/,
    reply: ({ params }) =>
      billById(params[0]) ? billDetail(billById(params[0])) : { status: 404 },
  },

  /* --- suppliers --- */
  {
    match: '/api/v1/suppliers',
    reply: ({ query }) => {
      const q = (query.get('q') ?? '').toLowerCase()
      const items = Object.entries(SUPPLIERS)
        .filter(([, s]) => !q || s.name.toLowerCase().includes(q))
        .map(([id, s]) => ({
          id,
          displayName: s.name,
          vatNumber: s.vat,
          status: 'ACTIVE',
          receivingChannel: s.channel,
          registeredOnPeppol: s.peppol,
          health: [],
          owed: 0,
          currency: 'OMR',
          openBills: 0,
          lastBillOn: null,
        }))
      return { items, page: 0, pageSize: 20, count: items.length, total: items.length }
    },
  },
  {
    match: /^\/api\/v1\/suppliers\/([^/]+)\/bills$/,
    reply: ({ params }) => {
      const rows = BILLS.filter((b) => b.supplierId === params[0])
        .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
        .map(billRow)
      return { items: rows, page: 0, pageSize: 20, count: rows.length }
    },
  },
  {
    match: /^\/api\/v1\/suppliers\/([^/]+)$/,
    reply: ({ params }) => supplierDetail(params[0]) ?? { status: 404 },
  },

  /* --- recurring bills --- */
  { match: '/api/v1/recurring-bills/summary', reply: () => recurringSummary() },
  {
    match: '/api/v1/recurring-bills',
    reply: ({ query }) => {
      const items = RECURRING.filter((r) => inState(r, query.get('state') ?? 'ACTIVE')).map(
        recurringDto,
      )
      return {
        items,
        page: Number(query.get('page') ?? 0),
        pageSize: Number(query.get('page_size') ?? 50),
        count: items.length,
      }
    },
  },
  {
    method: 'POST',
    match: '/api/v1/recurring-bills',
    reply: ({ body }) => {
      const id = `rb-${RECURRING.length + 1}`
      const r = {
        id,
        ...body,
        nextRunDate: body?.startDate ?? '2026-10-23',
        remainingOccurrences: null,
        active: true,
        lastRunDate: null,
        lastVariancePercent: null,
        expectation:
          body?.mode === 'EXPECT'
            ? {
                state: 'DUE_TO_ARRIVE',
                expectedOn: '2026-10-23',
                lastArrivedOn: null,
                lastArrivedAmount: null,
                variancePercent: null,
                lateDays: null,
              }
            : null,
      }
      RECURRING.push(r)
      return { status: 201, body: recurringDto(r) }
    },
  },
  {
    match: /^\/api\/v1\/recurring-bills\/([^/]+)\/runs$/,
    reply: ({ params }) =>
      recurringById(params[0]) ? recurringRuns(recurringById(params[0])) : { status: 404 },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/recurring-bills\/([^/]+)\/pause$/,
    reply: ({ params }) => {
      const r = recurringById(params[0])
      if (!r) return { status: 404 }
      r.active = false
      r.pausedOn = TODAY
      return recurringDto(r)
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/recurring-bills\/([^/]+)\/resume$/,
    reply: ({ params }) => {
      const r = recurringById(params[0])
      if (!r) return { status: 404 }
      r.active = true
      return recurringDto(r)
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/recurring-bills\/([^/]+)\/chase$/,
    reply: ({ params }) => {
      const r = recurringById(params[0])
      if (!r) return { status: 404 }
      if (r.mode !== 'EXPECT') return refuse('RECURRING_BILL_NOT_EXPECTING')
      if (!r.active) return refuse('RECURRING_BILL_PAUSED')
      return {
        status: 202,
        body: {
          recurringBillId: r.id,
          notifyUserId: r.notifyUserId,
          expectedOn: r.expectation?.expectedOn ?? null,
        },
      }
    },
  },
  {
    match: /^\/api\/v1\/recurring-bills\/([^/]+)$/,
    reply: ({ params }) =>
      recurringById(params[0]) ? recurringDto(recurringById(params[0])) : { status: 404 },
  },
  {
    method: 'PUT',
    match: /^\/api\/v1\/recurring-bills\/([^/]+)$/,
    reply: ({ params, body }) => {
      const r = recurringById(params[0])
      if (!r) return { status: 404 }
      Object.assign(r, body)
      return recurringDto(r)
    },
  },

  /* --- payables reminders --- */
  { match: '/api/v1/bill-reminders/rules', reply: () => ({ rules: RULES }) },
  {
    method: 'PUT',
    match: '/api/v1/bill-reminders/rules',
    // Checked as the server checks it: see ../lib/billReminderRules.mjs.
    reply: ({ body }) => {
      const answer = saveRules(RULES, body, { users: USERS.map((user) => user.id) })
      if (answer.rules) RULES = answer.rules
      return { status: answer.status, body: answer.body }
    },
  },
  { match: '/api/v1/bill-reminders/settings', reply: () => settingsAnswer(SETTINGS) },
  {
    method: 'PUT',
    match: '/api/v1/bill-reminders/settings',
    reply: ({ body }) => {
      const answer = saveSettings(body)
      if (answer.settings) SETTINGS = answer.settings
      return { status: answer.status, body: answer.body }
    },
  },
  { match: '/api/v1/bill-reminders/preview', reply: () => PREVIEW },
  {
    match: '/api/v1/bill-reminders/inbox',
    reply: ({ query }) =>
      query.get('unread') === 'true' ? INBOX.filter((i) => i.acknowledgedAt === null) : INBOX,
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/bill-reminders\/inbox\/([^/]+)\/acknowledge$/,
    reply: ({ params }) => {
      const item = INBOX.find((i) => i.id === params[0])
      if (!item) return { status: 404 }
      item.acknowledgedAt = `${TODAY}T12:00:00Z`
      return { status: 204 }
    },
  },
  {
    match: '/api/v1/users',
    reply: () => ({
      content: USERS,
      totalElements: USERS.length,
      totalPages: 1,
      number: 0,
      size: 100,
    }),
  },

  /* --- the shell's code lists, copied from invoices.mjs so this module opens on its own --- */
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
