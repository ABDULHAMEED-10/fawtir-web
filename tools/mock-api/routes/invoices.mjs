/**
 * Invoices (list + detail) fixtures for the mock gateway - Al Bahja Coffee's book in
 * September 2026, in the shapes `src/api/invoices/list.ts` and `src/api/invoices/detail.ts` read.
 *
 * Every figure is derived from the lines (see `priced`) so the summary, the rows and the detail
 * agree with each other; nothing is typed twice.
 */

const TODAY = '2026-09-25'
const scale = (n) => Math.round(n * 1000) / 1000

const CUSTOMERS = {
  'c-mgh': {
    name: 'Muscat Grand Hotel LLC',
    vat: 'OM1100447102',
    peppol: 'ACTIVE',
    type: 'BUSINESS',
    city: 'Muscat',
  },
  'c-salalah': {
    name: 'Salalah Beach Resort',
    vat: 'OM1100512290',
    peppol: 'ACTIVE',
    type: 'BUSINESS',
    city: 'Salalah',
  },
  'c-qurum': {
    name: 'Qurum Business Center',
    vat: 'OM1100338817',
    peppol: 'INACTIVE',
    type: 'BUSINESS',
    city: 'Muscat',
  },
  'c-bahla': {
    name: 'Bahla Fort Restaurant',
    vat: 'OM1100761003',
    peppol: 'ACTIVE',
    type: 'BUSINESS',
    city: 'Bahla',
  },
  'c-mouj': {
    name: 'Al Mouj Marina Café',
    vat: 'OM1100904455',
    peppol: 'INACTIVE',
    type: 'BUSINESS',
    city: 'Muscat',
  },
  'c-nizwa': {
    name: 'Nizwa Souq Café',
    vat: null,
    peppol: 'INACTIVE',
    type: 'BUSINESS',
    city: 'Nizwa',
  },
  'c-sohar': {
    name: 'Sohar Grand Mall',
    vat: 'OM1100999001',
    peppol: 'ACTIVE',
    type: 'BUSINESS',
    city: 'Sohar',
  },
  'c-seeb': {
    name: 'Seeb Corniche Bakery',
    vat: 'OM1100220481',
    peppol: 'INACTIVE',
    type: 'BUSINESS',
    city: 'Sur',
  },
  'c-mht': {
    name: 'Ministry of Heritage & Tourism',
    vat: 'OM1100000017',
    peppol: 'ACTIVE',
    type: 'GOVERNMENT',
    city: 'Muscat',
  },
  'c-mm': {
    name: 'Muscat Municipality',
    vat: 'OM1100633920',
    peppol: 'INACTIVE',
    type: 'BUSINESS',
    city: 'Muscat',
  },
  'c-aisha': {
    name: 'Aisha Al Balushi',
    vat: 'OM1100745211',
    peppol: 'ACTIVE',
    type: 'BUSINESS',
    city: 'Muscat',
  },
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

const PRODUCTS = {
  cappuccino: { code: 'BV-014', description: 'Cappuccino - Large', unit: 'EA', price: 1.8 },
  beans: { code: 'BN-002', description: 'Coffee Beans 1kg - House Blend', unit: 'KGM', price: 9.5 },
  latte: { code: 'BV-021', description: 'Latte - Regular', unit: 'EA', price: 1.5 },
  pastry: { code: 'PS-007', description: 'Date & Cardamom Pastry', unit: 'EA', price: 0.9 },
  training: { code: 'SV-003', description: 'Barista training - half day', unit: 'HUR', price: 45 },
  espresso: { code: 'BN-005', description: 'Espresso Roast 250g', unit: 'EA', price: 3.2 },
}

function line(lineNumber, key, quantity, discount = 0, taxRate = 5) {
  const p = PRODUCTS[key]
  return {
    lineNumber,
    productId: `p-${key}`,
    productCode: p.code,
    description: p.description,
    unitCode: p.unit,
    quantity,
    unitPrice: p.price,
    discountType: 'PERCENTAGE',
    discountValue: discount,
    taxCategoryCode: taxRate === 5 ? 'S5' : 'Z0',
    en16931Category: taxRate === 5 ? 'S' : 'Z',
    taxRate,
    exemptionReason: null,
  }
}

/** Prices the lines the way the server does: line discounts, then VAT, at three decimals. */
function priced(lines) {
  let subtotal = 0
  let itemLevelDiscount = 0
  let vatAmount = 0
  for (const l of lines) {
    const gross = scale(l.quantity * l.unitPrice)
    const disc = scale((gross * l.discountValue) / 100)
    subtotal = scale(subtotal + gross)
    itemLevelDiscount = scale(itemLevelDiscount + disc)
    vatAmount = scale(vatAmount + ((gross - disc) * l.taxRate) / 100)
  }
  const taxableAmount = scale(subtotal - itemLevelDiscount)
  return {
    subtotal,
    itemLevelDiscount,
    headerDiscount: 0,
    totalDiscount: itemLevelDiscount,
    taxableAmount,
    vatAmount,
    totalAmount: scale(taxableAmount + vatAmount),
    payableRoundingAmount: 0,
    outputScale: 3,
  }
}

const daysBetween = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

/**
 * One document: authoring facts plus what has been paid. `paid` is the sum of un-reversed payments,
 * `credited` what a credit note took off it.
 */
function doc(spec) {
  const totals = spec.state === 'DRAFT' ? null : priced(spec.lines)
  const receivable =
    spec.state === 'ISSUED' && (spec.type === 'INVOICE' || spec.type === 'DEBIT_NOTE')
  const paid = spec.paid ?? 0
  const credited = spec.credited ?? 0
  const outstanding = totals ? scale(totals.totalAmount - paid - credited) : null
  const overdue = receivable && outstanding > 0 && spec.dueDate < TODAY
  const paymentState = !receivable
    ? 'NOT_APPLICABLE'
    : outstanding <= 0
      ? 'PAID'
      : paid > 0
        ? 'PARTIALLY_PAID'
        : 'UNPAID'
  return {
    ...spec,
    totals,
    receivable,
    outstanding,
    paymentState,
    overdue,
    daysOverdue: overdue ? daysBetween(spec.dueDate, TODAY) : null,
    paid,
    credited,
  }
}

const DOCS = [
  doc({
    id: 'inv-2044',
    number: 'INV-2026-0044',
    type: 'INVOICE',
    state: 'ISSUED',
    delivery: 'DELIVERED',
    peppol: 'AB',
    customerId: 'c-mgh',
    branchId: 'b-main',
    issueDate: '2026-09-18',
    dueDate: '2026-10-17',
    deliveryDate: '2026-09-18',
    subject: 'Monthly coffee supply & barista training - September',
    po: 'PO-88213',
    note: 'Thank you for your business. Please settle within 30 days by bank transfer using the reference above.',
    internal: 'Loyalty discount approved by Hafidh on 15 Sep. Follow up if unpaid by 20 Oct.',
    lines: [line(1, 'cappuccino', 12), line(2, 'beans', 4, 10)],
    paid: 30,
    updatedAt: '2026-09-22T09:14:00Z',
  }),
  doc({
    id: 'inv-2043',
    number: 'INV-2026-0043',
    type: 'INVOICE',
    state: 'ISSUED',
    delivery: 'DELIVERED',
    peppol: 'AP',
    customerId: 'c-salalah',
    branchId: 'b-main',
    issueDate: '2026-08-06',
    dueDate: '2026-09-05',
    deliveryDate: '2026-08-05',
    subject: 'Beach café restock - August',
    po: 'SBR-2026-118',
    note: 'Payment due within 30 days.',
    internal: null,
    lines: [line(1, 'beans', 8), line(2, 'espresso', 12), line(3, 'training', 1)],
    updatedAt: '2026-09-20T06:30:00Z',
  }),
  doc({
    id: 'inv-2042',
    number: 'INV-2026-0042',
    type: 'INVOICE',
    state: 'ISSUED',
    delivery: 'NOT_SUBMITTED',
    customerId: 'c-qurum',
    branchId: 'b-seeb',
    issueDate: '2026-09-10',
    dueDate: '2026-10-10',
    deliveryDate: '2026-09-10',
    subject: 'Office pantry - September',
    po: null,
    note: null,
    internal: null,
    lines: [line(1, 'latte', 20), line(2, 'pastry', 18)],
    updatedAt: '2026-09-10T11:02:00Z',
  }),
  doc({
    id: 'inv-2041',
    number: 'INV-2026-0041',
    type: 'INVOICE',
    state: 'ISSUED',
    delivery: 'SENT_MANUALLY',
    customerId: 'c-bahla',
    branchId: 'b-main',
    issueDate: '2026-09-02',
    dueDate: '2026-10-02',
    deliveryDate: '2026-09-01',
    subject: 'Ramadan 2026 supply - settlement',
    po: 'BFR-77',
    note: 'Thank you for settling early.',
    internal: 'Paid by cheque, cleared 12 Sep.',
    lines: [line(1, 'beans', 2), line(2, 'espresso', 1)],
    paid: 23.31,
    updatedAt: '2026-09-12T08:00:00Z',
  }),
  doc({
    id: 'inv-2040',
    number: 'INV-2026-0040',
    type: 'INVOICE',
    state: 'CANCELLED',
    delivery: 'NOT_SUBMITTED',
    customerId: 'c-mouj',
    branchId: 'b-main',
    issueDate: '2026-09-01',
    dueDate: '2026-10-01',
    deliveryDate: '2026-09-01',
    subject: 'Marina kiosk - trial order',
    po: null,
    note: null,
    internal: 'Cancelled: raised against the wrong customer account.',
    lines: [line(1, 'cappuccino', 5), line(2, 'pastry', 10)],
    updatedAt: '2026-09-03T13:45:00Z',
  }),
  doc({
    id: 'draft-2045',
    number: null,
    type: 'INVOICE',
    state: 'DRAFT',
    delivery: 'NOT_SUBMITTED',
    customerId: 'c-nizwa',
    branchId: 'b-main',
    issueDate: null,
    dueDate: null,
    deliveryDate: '2026-09-24',
    subject: 'Souq café - weekly beans',
    po: 'NSC-PO-4471',
    note: 'Delivered every Thursday.',
    internal: null,
    lines: [line(1, 'beans', 3), line(2, 'pastry', 24, 5)],
    updatedAt: '2026-09-24T15:20:00Z',
  }),
  doc({
    id: 'draft-2046',
    number: null,
    type: 'INVOICE',
    state: 'DRAFT',
    delivery: 'NOT_SUBMITTED',
    customerId: 'c-sohar',
    branchId: 'b-seeb',
    issueDate: null,
    dueDate: null,
    deliveryDate: null,
    subject: null,
    po: 'SPL-0919',
    note: null,
    internal: null,
    lines: [line(1, 'training', 2)],
    updatedAt: '2026-09-25T07:05:00Z',
  }),
  doc({
    id: 'crn-0003',
    number: 'CRN-2026-0003',
    type: 'CREDIT_NOTE',
    state: 'ISSUED',
    delivery: 'DELIVERED',
    peppol: 'AP',
    correctionOf: 'inv-2043',
    customerId: 'c-salalah',
    branchId: 'b-main',
    issueDate: '2026-09-15',
    dueDate: '2026-09-15',
    deliveryDate: null,
    subject: 'Returned: 2 × Espresso Roast 250g (damaged)',
    po: null,
    note: 'Credit for damaged stock returned on 12 Sep.',
    internal: null,
    lines: [line(1, 'espresso', 2)],
    updatedAt: '2026-09-15T10:10:00Z',
  }),
  doc({
    id: 'dbn-0001',
    number: 'DBN-2026-0001',
    type: 'DEBIT_NOTE',
    state: 'ISSUED',
    delivery: 'NOT_SUBMITTED',
    correctionOf: 'inv-2042',
    customerId: 'c-qurum',
    branchId: 'b-seeb',
    issueDate: '2026-09-16',
    dueDate: '2026-10-10',
    deliveryDate: null,
    subject: 'Under-billed: 6 pastries on INV-2026-0042',
    po: null,
    note: null,
    internal: null,
    lines: [line(1, 'pastry', 6)],
    updatedAt: '2026-09-16T09:00:00Z',
  }),
  doc({
    id: 'inv-2039',
    number: 'INV-2026-0039',
    type: 'INVOICE',
    state: 'ISSUED',
    delivery: 'SENT_MANUALLY',
    customerId: 'c-seeb',
    branchId: 'b-main',
    issueDate: '2026-08-20',
    dueDate: '2026-09-19',
    deliveryDate: '2026-08-20',
    subject: 'Harbour canteen - August',
    po: null,
    note: null,
    internal: null,
    lines: [line(1, 'latte', 40), line(2, 'cappuccino', 30)],
    paid: 119.7,
    updatedAt: '2026-09-11T12:00:00Z',
  }),
  doc({
    id: 'inv-2038',
    number: 'INV-2026-0038',
    type: 'INVOICE',
    state: 'ISSUED',
    delivery: 'NOT_SUBMITTED',
    customerId: 'c-mm',
    branchId: 'b-main',
    issueDate: '2026-08-18',
    dueDate: '2026-09-17',
    deliveryDate: '2026-08-18',
    subject: 'Wholesale beans - August',
    po: 'RB-0818',
    note: null,
    internal: null,
    lines: [line(1, 'beans', 10, 5)],
    paid: 40,
    updatedAt: '2026-09-05T09:30:00Z',
  }),
  doc({
    id: 'inv-2037',
    number: 'INV-2026-0037',
    type: 'INVOICE',
    state: 'ISSUED',
    delivery: 'NOT_SUBMITTED',
    customerId: 'c-mht',
    branchId: 'b-main',
    issueDate: '2026-09-21',
    dueDate: '2026-10-21',
    deliveryDate: '2026-09-20',
    subject: 'Heritage Week hospitality',
    po: 'MHT/2026/0912',
    note: 'Government purchase order attached.',
    internal: null,
    lines: [line(1, 'cappuccino', 60), line(2, 'pastry', 60), line(3, 'training', 1)],
    updatedAt: '2026-09-21T14:00:00Z',
  }),
  doc({
    id: 'inv-2036',
    number: 'INV-2026-0036',
    type: 'INVOICE',
    state: 'ISSUED',
    delivery: 'DELIVERED',
    peppol: 'RE',
    customerId: 'c-aisha',
    branchId: 'b-seeb',
    issueDate: '2026-08-28',
    dueDate: '2026-09-27',
    deliveryDate: '2026-08-28',
    subject: 'Souq stall - weekly',
    po: null,
    note: null,
    internal: null,
    lines: [line(1, 'espresso', 15)],
    updatedAt: '2026-08-28T10:00:00Z',
  }),
  doc({
    id: 'inv-2035',
    number: 'INV-2026-0035',
    type: 'INVOICE',
    state: 'ISSUED',
    delivery: 'DELIVERED',
    peppol: 'AP',
    customerId: 'c-mgh',
    branchId: 'b-main',
    issueDate: '2026-08-18',
    dueDate: '2026-09-17',
    deliveryDate: '2026-08-18',
    subject: 'Monthly coffee supply - August',
    po: 'PO-88102',
    note: null,
    internal: null,
    lines: [line(1, 'cappuccino', 12), line(2, 'beans', 4, 10)],
    paid: 58.59,
    updatedAt: '2026-09-14T08:00:00Z',
  }),
]

const byId = (id) => DOCS.find((d) => d.id === id)

function row(d) {
  return {
    id: d.id,
    type: d.type,
    version: 3,
    authoringState: d.state,
    deliveryState: d.delivery,
    customerId: d.customerId,
    currency: 'OMR',
    invoiceNumber: d.number,
    issueDate: d.issueDate,
    dueDate: d.dueDate,
    details: { subject: d.subject, purchaseOrderReference: d.po },
    headerDiscount: { type: 'PERCENTAGE', value: 0 },
    lines: d.lines.map((l) => ({
      lineNumber: l.lineNumber,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountType: l.discountType,
      discountValue: l.discountValue,
      taxRate: l.taxRate,
    })),
    totals: d.totals ? { totalAmount: d.totals.totalAmount } : null,
    customerName: CUSTOMERS[d.customerId].name,
    // TODO(backend): the design's PEPPOL/OTA column and delivery bar want the response code.
    peppolResponse: d.peppol ?? null,
    branchId: d.branchId,
    payment: d.receivable
      ? {
          state: d.paymentState,
          overdue: d.overdue,
          daysOverdue: d.daysOverdue,
          paidAmount: d.paid,
          creditedAmount: d.credited,
          outstandingAmount: d.outstanding,
        }
      : null,
    correctionOfInvoiceId: d.correctionOf ?? null,
    correctionOfInvoiceNumber: d.correctionOf ? (byId(d.correctionOf)?.number ?? null) : null,
  }
}

function detail(d) {
  return {
    ...row(d),
    correctionOfInvoiceId: d.correctionOf ?? null,
    branchId: d.branchId,
    vatMode: 'EXCLUSIVE',
    deliveryBlocker: d.delivery === 'NOT_SUBMITTED' ? 'CANONICAL_HANDOFF_NOT_ENABLED' : null,
    deliveredAt: d.peppol ? `${d.issueDate}T10:32:00Z` : null,
    issuedAt: d.issueDate ? `${d.issueDate}T07:28:00Z` : null,
    details: {
      deliveryDate: d.deliveryDate,
      subject: d.subject,
      purchaseOrderReference: d.po,
      customerVisibleNote: d.note,
      paymentTerms: d.type === 'CREDIT_NOTE' ? null : { code: 'NET30', label: 'Net 30 days' },
      paymentMethod: { code: '30', label: 'Bank transfer' },
      correctionReasonCode: d.correctionOf ? 'QTY' : null,
      buyerReference: null,
      contractReference: null,
      transactionType: 'FULL_TAX',
      transactionSubtypes: [],
      invoicingPeriod: null,
    },
    lines: d.lines,
    totals: d.totals,
    customerName: null,
    payment: null,
  }
}

function paymentsOf(d) {
  if (!d.receivable || d.paid === 0) {
    if (d.id === 'inv-2043') {
      // A payment that was recorded and then reversed: the row stays, struck through.
      return [
        {
          id: 'pay-2043-1',
          entryType: 'PAYMENT',
          reversalOfPaymentId: null,
          amount: 50,
          currency: 'OMR',
          methodCode: '10',
          paymentReference: null,
          paymentDate: '2026-09-08',
          occurredAt: '2026-09-08T10:00:00Z',
        },
        {
          id: 'rev-2043-1',
          entryType: 'REVERSAL',
          reversalOfPaymentId: 'pay-2043-1',
          amount: 50,
          currency: 'OMR',
          methodCode: '10',
          paymentReference: null,
          paymentDate: '2026-09-09',
          occurredAt: '2026-09-09T08:15:00Z',
        },
      ]
    }
    return []
  }
  const ref =
    {
      'inv-2044': 'MGH-2044-07',
      'inv-2041': 'CHQ 004512',
      'inv-2039': 'TRX-91820',
      'inv-2038': 'RB-AUG-1',
      'inv-2035': 'MGH-2035-01',
    }[d.id] ?? null
  const method = d.id === 'inv-2041' ? '20' : '30'
  const date = d.updatedAt.slice(0, 10)
  return [
    {
      id: `pay-${d.id}`,
      entryType: 'PAYMENT',
      reversalOfPaymentId: null,
      amount: d.paid,
      currency: 'OMR',
      methodCode: method,
      paymentReference: ref,
      paymentDate: date,
      occurredAt: d.updatedAt,
    },
  ]
}

function attachmentsOf(d) {
  if (d.id === 'inv-2044') {
    return [
      {
        id: 'att-1',
        filename: 'PO-88213 - Muscat Grand Hotel.pdf',
        contentType: 'application/pdf',
        byteSize: 253952,
        sha256: 'a1',
        attachedAt: '2026-09-18T07:20:00Z',
      },
      {
        id: 'att-2',
        filename: 'Signed delivery note - 18 Sep.jpg',
        contentType: 'image/jpeg',
        byteSize: 1258291,
        sha256: 'b2',
        attachedAt: '2026-09-18T12:40:00Z',
      },
    ]
  }
  if (d.id === 'inv-2037') {
    return [
      {
        id: 'att-3',
        filename: 'MHT-2026-0912 purchase order.pdf',
        contentType: 'application/pdf',
        byteSize: 402113,
        sha256: 'c3',
        attachedAt: '2026-09-21T13:55:00Z',
      },
    ]
  }
  if (d.id === 'draft-2045') {
    return [
      {
        id: 'att-4',
        filename: 'NSC-PO-4471.pdf',
        contentType: 'application/pdf',
        byteSize: 88320,
        sha256: 'd4',
        attachedAt: '2026-09-24T15:00:00Z',
      },
    ]
  }
  return []
}

function historyOf(d) {
  const me = 'u-nasser'
  const other = 'u-hafidh'
  const at = (day, time) => `${day}T${time}:00Z`
  const entries = []
  const created = d.issueDate ?? d.updatedAt.slice(0, 10)
  entries.push({
    id: `${d.id}-h1`,
    eventType: 'DRAFT_CREATED',
    outcome: 'SUCCEEDED',
    invoiceVersion: 1,
    changedFieldsHash: 'x',
    actorId: other,
    occurredAt: at(created, '06:58'),
  })
  entries.push({
    id: `${d.id}-h2`,
    eventType: 'DRAFT_UPDATED',
    outcome: 'SUCCEEDED',
    invoiceVersion: 2,
    changedFieldsHash: 'y',
    actorId: me,
    occurredAt: at(created, '07:10'),
  })
  if (d.attachments?.length || attachmentsOf(d).length) {
    entries.push({
      id: `${d.id}-h2b`,
      eventType: 'ATTACHMENT_ADDED',
      outcome: 'SUCCEEDED',
      invoiceVersion: 2,
      changedFieldsHash: null,
      actorId: me,
      occurredAt: at(created, '07:20'),
    })
  }
  if (d.state !== 'DRAFT') {
    const issued =
      d.type === 'CREDIT_NOTE'
        ? 'CREDIT_NOTE_ISSUED'
        : d.type === 'DEBIT_NOTE'
          ? 'DEBIT_NOTE_ISSUED'
          : 'ISSUED'
    entries.push({
      id: `${d.id}-h3`,
      eventType: issued,
      outcome: 'SUCCEEDED',
      invoiceVersion: 3,
      changedFieldsHash: 'z',
      actorId: other,
      occurredAt: at(d.issueDate, '07:28'),
    })
  }
  if (d.delivery === 'SENT_MANUALLY') {
    entries.push({
      id: `${d.id}-h4`,
      eventType: 'MARKED_SENT_MANUALLY',
      outcome: 'SUCCEEDED',
      invoiceVersion: 3,
      changedFieldsHash: null,
      actorId: other,
      occurredAt: at(d.issueDate, '07:31'),
    })
  }
  for (const p of paymentsOf(d)) {
    entries.push({
      id: `${d.id}-${p.id}`,
      eventType: p.entryType === 'PAYMENT' ? 'PAYMENT_RECORDED' : 'PAYMENT_REVERSED',
      outcome: 'SUCCEEDED',
      invoiceVersion: 3,
      changedFieldsHash: null,
      actorId: me,
      occurredAt: p.occurredAt,
    })
  }
  if (d.state === 'CANCELLED') {
    entries.push({
      id: `${d.id}-h9`,
      eventType: 'CANCELLED',
      outcome: 'SUCCEEDED',
      invoiceVersion: 4,
      changedFieldsHash: null,
      actorId: me,
      occurredAt: d.updatedAt,
    })
  }
  // Newest first, as the server answers.
  entries.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
  return { entries, truncated: false, limit: 200 }
}

/** `InvoiceListSummary`, every figure counted from the rows above. */
function summary() {
  const live = DOCS.filter((d) => d.state !== 'DISCARDED')
  const receivables = live.filter((d) => d.receivable)
  const open = receivables.filter((d) => d.paymentState !== 'PAID')
  const overdue = open.filter((d) => d.overdue)
  const awaiting = open.filter((d) => !d.overdue)
  const paid = receivables.filter((d) => d.paymentState === 'PAID')
  const sum = (list, pick) => scale(list.reduce((acc, d) => acc + pick(d), 0))
  const dueSoon = awaiting.filter((d) => daysBetween(TODAY, d.dueDate) <= 7)
  const oldest = overdue.map((d) => d.dueDate).sort()[0] ?? null
  return {
    currencyCode: 'OMR',
    asOf: TODAY,
    all: live.length,
    drafts: live.filter((d) => d.state === 'DRAFT').length,
    // TODO(backend): the design's "To send" tab wants a count of issued, undelivered documents.
    toSend: live.filter((d) => d.state === 'ISSUED' && d.delivery === 'NOT_SUBMITTED').length,
    awaiting: awaiting.length,
    overdue: overdue.length,
    paid: paid.length,
    outstandingTotal: sum(open, (d) => d.outstanding),
    outstandingInvoices: open.length,
    awaitingTotal: sum(awaiting, (d) => d.outstanding),
    dueSoonInvoices: dueSoon.length,
    dueSoonDays: 7,
    overdueTotal: sum(overdue, (d) => d.outstanding),
    overdueInvoices: overdue.length,
    oldestOverdueDueDate: oldest,
    paidTotal: sum(paid, (d) => d.paid),
    paidInvoices: paid.length,
  }
}

function listRows(query) {
  const states = query.get('state')?.split(',') ?? null
  const payment = query.get('payment')
  // A comma-separated set, as the API takes it (e.g. INVOICE,CREDIT_NOTE,DEBIT_NOTE).
  const types = query.get('type')?.split(',') ?? null
  const from = query.get('from')
  const to = query.get('to')
  const q = (query.get('q') ?? '').trim().toLowerCase()
  const correctionOf = query.get('correction_of_invoice_id')
  const customerId = query.get('customer_id')
  const sort = query.get('sort') ?? 'UPDATED'
  let rows = DOCS.filter((d) => d.state !== 'DISCARDED')
  if (states) rows = rows.filter((d) => states.includes(d.state))
  if (payment === 'AWAITING')
    rows = rows.filter((d) => d.receivable && d.paymentState !== 'PAID' && !d.overdue)
  if (payment === 'OVERDUE') rows = rows.filter((d) => d.overdue)
  if (payment === 'PAID') rows = rows.filter((d) => d.receivable && d.paymentState === 'PAID')
  if (types) rows = rows.filter((d) => types.includes(d.type))
  if (from) rows = rows.filter((d) => d.issueDate && d.issueDate >= from)
  if (to) rows = rows.filter((d) => d.issueDate && d.issueDate <= to)
  if (correctionOf) rows = rows.filter((d) => d.correctionOf === correctionOf)
  if (customerId) rows = rows.filter((d) => d.customerId === customerId)
  if (q)
    rows = rows.filter(
      (d) =>
        (d.number ?? '').toLowerCase().includes(q) ||
        CUSTOMERS[d.customerId].name.toLowerCase().includes(q),
    )
  const cmp = {
    UPDATED: (a, b) => (a.updatedAt < b.updatedAt ? 1 : -1),
    ISSUED_NEWEST: (a, b) => ((a.issueDate ?? '') < (b.issueDate ?? '') ? 1 : -1),
    ISSUED_OLDEST: (a, b) => ((a.issueDate ?? '9') > (b.issueDate ?? '9') ? 1 : -1),
    DUE_SOONEST: (a, b) => ((a.dueDate ?? '9') > (b.dueDate ?? '9') ? 1 : -1),
    AMOUNT_HIGHEST: (a, b) => (b.totals?.totalAmount ?? 0) - (a.totals?.totalAmount ?? 0),
    AMOUNT_LOWEST: (a, b) => (a.totals?.totalAmount ?? 0) - (b.totals?.totalAmount ?? 0),
    CUSTOMER: (a, b) => CUSTOMERS[a.customerId].name.localeCompare(CUSTOMERS[b.customerId].name),
  }[sort]
  return rows.sort(cmp ?? (() => 0))
}

const ID = '([^/]+)'
const BASE = '/api/v1/authored-invoices'

export default [
  {
    match: '/api/v1/me/entitlements',
    reply: () => ({
      userId: 'u-nasser',
      username: 'nasser.alhabsi',
      tenantId: 't-fawtir',
      roles: [
        {
          id: 'r-1',
          code: 'PLATFORM_TENANT_ADMIN',
          name: 'Platform tenant administrator',
          systemRole: true,
        },
      ],
      permissions: [
        'platform.tenants.manage',
        'platform.operators.manage',
        'platform.support',
        'admin.users.manage',
        'admin.roles.manage',
        'admin.settings.manage',
        'role.read',
        'role.list',
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
      ],
      scopes: ['platform.tenants.manage', 'platform.operators.manage', 'platform.support'],
      featureFlags: {},
    }),
  },
  { match: `${BASE}/summary`, reply: () => summary() },
  {
    match: BASE,
    reply: ({ query }) => {
      const rows = listRows(query)
      const page = Number(query.get('page') ?? 0)
      const size = Number(query.get('size') ?? 10)
      return {
        content: rows.slice(page * size, page * size + size).map(row),
        page,
        size,
        totalElements: rows.length,
        totalPages: Math.ceil(rows.length / size),
      }
    },
  },
  {
    match: `${BASE}/export.csv`,
    reply: ({ query }) => ({
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="fawtir-invoices.csv"',
      },
      body: listRows(query)
        .map((d) => `${d.number ?? ''},${CUSTOMERS[d.customerId].name}`)
        .join('\n'),
    }),
  },
  {
    match: new RegExp(`^${BASE}/${ID}$`),
    reply: ({ params }) => (byId(params[0]) ? detail(byId(params[0])) : { status: 404 }),
  },
  {
    match: new RegExp(`^${BASE}/${ID}/receivable$`),
    reply: ({ params }) => {
      const d = byId(params[0])
      if (!d) return { status: 404 }
      return {
        documentTotal: d.receivable ? d.totals.totalAmount : null,
        paidAmount: d.paid,
        creditedAmount: d.credited,
        outstandingAmount: d.receivable ? d.outstanding : null,
        currency: 'OMR',
        paymentState: d.paymentState,
        overdue: d.overdue,
        dueDate: d.receivable ? d.dueDate : null,
      }
    },
  },
  {
    match: new RegExp(`^${BASE}/${ID}/payments$`),
    reply: ({ params }) => (byId(params[0]) ? paymentsOf(byId(params[0])) : { status: 404 }),
  },
  {
    method: 'POST',
    match: new RegExp(`^${BASE}/${ID}/payments$`),
    reply: ({ body }) => ({
      id: `pay-new-${Date.now()}`,
      entryType: 'PAYMENT',
      reversalOfPaymentId: null,
      amount: body?.amount ?? 0,
      currency: 'OMR',
      methodCode: body?.methodCode ?? '30',
      paymentReference: body?.paymentReference ?? null,
      paymentDate: body?.paymentDate ?? TODAY,
      occurredAt: new Date().toISOString(),
    }),
  },
  {
    method: 'POST',
    match: new RegExp(`^${BASE}/${ID}/payments/${ID}/reverse$`),
    reply: ({ params }) => ({
      id: `rev-${params[1]}`,
      entryType: 'REVERSAL',
      reversalOfPaymentId: params[1],
      amount: 0,
      currency: 'OMR',
      methodCode: null,
      paymentReference: null,
      paymentDate: TODAY,
      occurredAt: new Date().toISOString(),
    }),
  },
  {
    match: new RegExp(`^${BASE}/${ID}/attachments$`),
    reply: ({ params }) => (byId(params[0]) ? attachmentsOf(byId(params[0])) : { status: 404 }),
  },
  {
    match: new RegExp(`^${BASE}/${ID}/attachments/${ID}$`),
    reply: () => ({
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="file.pdf"',
      },
      body: '%PDF-1.4',
    }),
  },
  {
    match: new RegExp(`^${BASE}/${ID}/history$`),
    reply: ({ params }) => (byId(params[0]) ? historyOf(byId(params[0])) : { status: 404 }),
  },
  {
    match: new RegExp(`^${BASE}/${ID}/internal-note$`),
    reply: ({ params }) => ({ internalNote: byId(params[0])?.internal ?? null }),
  },
  {
    method: 'POST',
    match: new RegExp(`^${BASE}/${ID}/cancel$`),
    reply: ({ params }) => {
      const d = byId(params[0])
      if (!d) return { status: 404 }
      d.state = 'CANCELLED'
      d.updatedAt = new Date().toISOString()
      return detail(d)
    },
  },
  {
    match: new RegExp(`^${BASE}/${ID}/reminders$`),
    reply: ({ params }) => {
      const d = byId(params[0])
      if (!d || !d.receivable) return []
      const recipient =
        'accounts@' + CUSTOMERS[d.customerId].name.toLowerCase().replace(/[^a-z]+/g, '') + '.om'
      const rungs = [-3, 0, 7, 14].filter((r) => daysBetween(TODAY, d.dueDate) <= -r)
      return rungs.map((r) => {
        const fired = new Date(Date.parse(`${d.dueDate}T09:00:00Z`) + r * 86_400_000).toISOString()
        return {
          invoiceId: d.id,
          invoiceNumber: d.number,
          daysFromDue: r,
          firedOn: fired.slice(0, 10),
          recipient,
          locale: 'en',
          outcome: r === 7 && d.id === 'inv-2043' ? 'FAILED' : 'SENT',
          failureReason: r === 7 && d.id === 'inv-2043' ? 'Mailbox full' : null,
          createdAt: fired,
        }
      })
    },
  },
  {
    match: new RegExp(`^${BASE}/${ID}/reminders/preview$`),
    reply: ({ params }) => {
      const d = byId(params[0])
      if (!d) return { status: 404 }
      const recipient =
        'accounts@' + CUSTOMERS[d.customerId].name.toLowerCase().replace(/[^a-z]+/g, '') + '.om'
      const verdict = !d.receivable
        ? 'NOT_ISSUED'
        : d.paymentState === 'PAID'
          ? 'SETTLED'
          : d.overdue
            ? 'NO_RUNG_TODAY'
            : 'SEND'
      return {
        invoiceId: d.id,
        invoiceNumber: d.number,
        verdict,
        rung: d.receivable ? daysBetween(d.dueDate, TODAY) : null,
        recipient,
        language: 'en',
        subject: `Payment reminder - ${d.number}`,
        body: `Dear ${CUSTOMERS[d.customerId].name},\n\nInvoice ${d.number} for OMR ${d.totals?.totalAmount.toFixed(3)} is due on ${d.dueDate}.\n\nKind regards,\nAl Bahja Coffee`,
      }
    },
  },
  { match: '/api/v1/branches', reply: () => BRANCHES },
  {
    match: /^\/api\/v1\/customers\/([^/]+)$/,
    reply: ({ params }) => {
      const c = CUSTOMERS[params[0]]
      if (!c) return { status: 404 }
      return {
        id: params[0],
        type: c.type,
        displayName: c.name,
        profile: {
          details: { vatRegistrationNumber: c.vat },
          contact: { contactPerson: null, emailRecipients: ['accounts@example.om'] },
          deliveryPreferences: { sendingMethod: c.peppol === 'ACTIVE' ? 'PEPPOL' : 'EMAIL' },
          invoiceAddress: { cityName: c.city, countryCode: 'OM' },
        },
        peppolDelivery: c.peppol,
        invoiceEligible: true,
        status: 'ACTIVE',
        updatedAt: '2026-09-01T00:00:00Z',
      }
    },
  },
  {
    method: 'DELETE',
    match: /^\/api\/v1\/invoice-drafts\/([^/]+)$/,
    reply: ({ params }) => {
      const d = byId(params[0])
      if (!d) return { status: 404 }
      d.state = 'DISCARDED'
      return { ...detail(d), authoringState: 'DISCARDED' }
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/invoice-drafts\/([^/]+)\/preview$/,
    reply: ({ params }) => {
      const d = byId(params[0])
      if (!d) return { status: 404 }
      const totals = priced(d.lines)
      return { currency: 'OMR', lines: [], totals }
    },
  },
  /**
   * The platform's code lists (/v1/reference-data, src/api/reference/referenceData.ts): the V193
   * seeds. The shell loads them beside the session; the composer names them from the locale files.
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
