/**
 * Periodic invoices (I-13) — schedules, their runs, and the customers and template invoices the
 * screens read them against. Shapes follow `src/api/invoices/periodic.ts`, `customers.ts`,
 * `invoices/list.ts` and `invoices/detail.ts`. Dates sit around 25 Sep 2026, Al Bahja Coffee's
 * customers, rial amounts.
 */

const CUSTOMERS = [
  customer('c-mgh', 'Muscat Grand Hotel LLC', 'OM1100447102', 'PEPPOL'),
  customer('c-bahla', 'Bahla Fort Restaurant', 'OM1100558214', 'EMAIL_PDF'),
  customer('c-sohar', 'Sohar Grand Mall', 'OM1100294736', 'PEPPOL'),
  customer('c-qurum', 'Qurum Business Center', 'OM1100640119', 'PEPPOL'),
  customer('c-nizwa', 'Nizwa Souq Café', 'OM1100731885', 'EMAIL_PDF'),
  customer('c-mouj', 'Al Mouj Marina Café', 'OM1100812903', 'PEPPOL'),
  customer('c-seeb', 'Seeb Corniche Bakery', 'OM1100903311', 'EMAIL_PDF'),
  customer('c-salalah', 'Salalah Beach Resort', 'OM1100114872', 'PEPPOL'),
]

function customer(id, displayName, vat, sendingMethod) {
  return {
    id,
    type: 'BUSINESS',
    displayName,
    profile: {
      details: { vatRegistrationNumber: vat },
      contact: { contactPerson: null, emailRecipients: ['accounts@example.om'] },
      deliveryPreferences: { sendingMethod },
      invoiceAddress: { cityName: 'Muscat', countryCode: 'OM' },
    },
    peppolDelivery: sendingMethod === 'PEPPOL' ? 'ACTIVE' : 'NOT_APPLICABLE',
    invoiceEligible: true,
    missingInvoiceFields: [],
    status: 'ACTIVE',
    updatedAt: '2026-09-01T06:00:00Z',
  }
}

/** Two lines priced to the design's 58.590: 59.600 gross, 3.800 line discount, 5% VAT. */
const COFFEE_LINES = [
  line(1, 'Cappuccino - Large', 'EA', 12, 1.8, 0),
  line(2, 'Coffee Beans 1kg - House Blend', 'KGM', 4, 9.5, 10),
]

function line(lineNumber, description, unitCode, quantity, unitPrice, discountPercent) {
  return {
    lineNumber,
    productId: null,
    productCode: null,
    description,
    unitCode,
    quantity,
    unitPrice,
    discountType: 'PERCENTAGE',
    discountValue: discountPercent,
    taxCategoryCode: 'S5',
    en16931Category: 'S',
    taxRate: 5,
    exemptionReason: null,
  }
}

function totalsOf(lines) {
  let subtotal = 0
  let discount = 0
  for (const l of lines) {
    const gross = l.quantity * l.unitPrice
    subtotal += gross
    discount += l.discountType === 'PERCENTAGE' ? (gross * l.discountValue) / 100 : l.discountValue
  }
  const taxable = subtotal - discount
  const vat = Math.round(taxable * 5) / 100
  const r = (n) => Math.round(n * 1000) / 1000
  return {
    subtotal: r(subtotal),
    itemLevelDiscount: r(discount),
    headerDiscount: 0,
    totalDiscount: r(discount),
    taxableAmount: r(taxable),
    vatAmount: r(vat),
    totalAmount: r(taxable + vat),
    payableRoundingAmount: 0,
    outputScale: 3,
  }
}

function template(id, number, customerId, subject, po, issueDate, lines) {
  return {
    id,
    type: 'INVOICE',
    correctionOfInvoiceId: null,
    version: 2,
    authoringState: 'ISSUED',
    deliveryState: 'SENT_MANUALLY',
    deliveryBlocker: null,
    customerId,
    branchId: 'br-main',
    currency: 'OMR',
    vatMode: 'EXCLUSIVE',
    invoiceNumber: number,
    issueDate,
    dueDate: plusDays(issueDate, 30),
    issuedAt: `${issueDate}T07:12:00Z`,
    details: {
      deliveryDate: issueDate,
      subject,
      purchaseOrderReference: po,
      customerVisibleNote:
        'Thank you for your business. Please settle within 30 days by bank transfer using the reference above.',
      paymentTerms: { code: 'NET30', label: 'Net 30 days' },
      paymentMethod: { code: 'BANK', label: 'Bank transfer' },
      correctionReasonCode: null,
      buyerReference: null,
      contractReference: null,
      transactionType: null,
      transactionSubtypes: null,
      invoicingPeriod: null,
    },
    headerDiscount: null,
    lines,
    totals: totalsOf(lines),
    customerName: CUSTOMERS.find((c) => c.id === customerId)?.displayName ?? null,
    payment: {
      state: 'PAID',
      overdue: false,
      daysOverdue: null,
      paidAmount: null,
      creditedAmount: null,
      outstandingAmount: 0,
    },
  }
}

function plusDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const TEMPLATES = [
  template(
    'inv-t1',
    'INV-2026-000412',
    'c-mgh',
    'Monthly coffee supply',
    'PO-88213',
    '2026-07-18',
    COFFEE_LINES,
  ),
  template(
    'inv-t2',
    'INV-2026-000398',
    'c-bahla',
    'Weekly espresso beans',
    'PO-77102',
    '2026-07-04',
    [line(1, 'Espresso Beans 1kg - Dark Roast', 'KGM', 2, 3.2, 0)],
  ),
  template('inv-t3', 'INV-2026-000377', 'c-sohar', 'Quarterly kiosk restock', null, '2026-07-01', [
    line(1, 'Coffee Beans 1kg - House Blend', 'KGM', 5, 9.5, 0),
    line(2, 'Paper cups 12oz (box of 500)', 'BX', 2, 4.0, 0),
  ]),
  template('inv-t4', 'INV-2026-000351', 'c-qurum', 'Office catering', 'PO-66120', '2026-06-30', [
    line(1, 'Catering — coffee and pastries', 'EA', 1, 44.0, 0),
  ]),
  template('inv-t5', 'INV-2026-000290', 'c-nizwa', 'Ramadan pop-up supply', null, '2026-03-20', [
    line(1, 'Karak tea concentrate 5L', 'EA', 4, 8.12, 0),
  ]),
  template(
    'inv-t6',
    'INV-2026-000441',
    'c-mouj',
    'Grand opening series',
    'PO-90001',
    '2026-09-10',
    [line(1, 'Barista training session', 'HUR', 3, 5.0, 0)],
  ),
  template('inv-t7', 'INV-2026-000455', 'c-seeb', 'Corniche pastry run', null, '2026-09-18', [
    line(1, 'Croissant tray (24)', 'EA', 3, 7.0, 0),
  ]),
  template(
    'inv-t8',
    'INV-2026-000301',
    'c-salalah',
    'Resort minibar coffee',
    'PO-51230',
    '2026-04-15',
    [line(1, 'Drip coffee sachets (box of 100)', 'BX', 8, 14.285, 0)],
  ),
]

/** Drafts the runs raised — same lines as their template, no number until issued. */
const DRAFTS = [
  {
    ...template(
      'inv-d1',
      null,
      'c-mgh',
      'Monthly coffee supply',
      'PO-88213',
      '2026-09-18',
      COFFEE_LINES,
    ),
    authoringState: 'DRAFT',
    totals: null,
    issuedAt: null,
    deliveryState: 'NOT_SUBMITTED',
  },
  {
    ...template(
      'inv-d2',
      'INV-2026-000430',
      'c-mgh',
      'Monthly coffee supply',
      'PO-88213',
      '2026-08-18',
      COFFEE_LINES,
    ),
  },
  {
    ...template(
      'inv-d3',
      null,
      'c-bahla',
      'Weekly espresso beans',
      'PO-77102',
      '2026-09-19',
      TEMPLATES[1].lines,
    ),
    authoringState: 'DRAFT',
    totals: null,
    issuedAt: null,
    deliveryState: 'NOT_SUBMITTED',
  },
]

const INVOICES = [...TEMPLATES, ...DRAFTS]

let schedules = [
  schedule('sch-1', 'c-mgh', 'inv-t1', 'MONTHLY', '2026-10-18', null, null, true),
  schedule('sch-2', 'c-bahla', 'inv-t2', 'WEEKLY', '2026-09-26', null, null, true),
  schedule('sch-3', 'c-sohar', 'inv-t3', 'QUARTERLY', '2026-10-01', null, 6, true),
  schedule('sch-4', 'c-qurum', 'inv-t4', 'MONTHLY', '2026-09-20', null, null, true),
  schedule('sch-5', 'c-nizwa', 'inv-t5', 'MONTHLY', '2027-02-20', '2027-04-20', 3, false),
  schedule('sch-6', 'c-mouj', 'inv-t6', 'ANNUALLY', '2027-01-15', '2029-01-15', null, true),
  schedule('sch-7', 'c-seeb', 'inv-t7', 'WEEKLY', '2026-09-25', null, 3, true),
  schedule('sch-8', 'c-salalah', 'inv-t8', 'MONTHLY', '2026-09-15', null, 0, true),
]

function schedule(
  id,
  customerId,
  templateInvoiceId,
  interval,
  nextRunDate,
  endDate,
  remainingOccurrences,
  active,
) {
  return {
    id,
    customerId,
    templateInvoiceId,
    interval,
    transactionSubtype:
      interval === 'WEEKLY' || interval === 'MONTHLY' ? 'SUMMARY' : 'CONTINUOUS_SUPPLY',
    nextRunDate,
    endDate,
    remainingOccurrences,
    active,
  }
}

const RUNS = {
  'sch-1': [
    run('2026-09-18', '2026-08-18', '2026-09-17', 'DRAFTED', 'inv-d1'),
    run('2026-08-18', '2026-07-18', '2026-08-17', 'DRAFTED', 'inv-d2'),
    run('2026-07-18', '2026-06-18', '2026-07-17', 'FAILED', null, 'Template invoice was cancelled'),
  ],
  'sch-2': [
    run('2026-09-19', '2026-09-12', '2026-09-18', 'DRAFTED', 'inv-d3'),
    run('2026-09-12', '2026-09-05', '2026-09-11', 'SKIPPED', null),
  ],
  'sch-4': [run('2026-08-20', '2026-07-20', '2026-08-19', 'DRAFTED', 'inv-d2')],
  'sch-8': [
    run('2026-08-15', null, null, 'DRAFTED', 'inv-d2'),
    run('2026-07-15', null, null, 'DRAFTED', 'inv-d2'),
  ],
}

function run(runDate, periodStart, periodEnd, outcome, draftInvoiceId, failureReason = null) {
  return {
    runDate,
    periodStart,
    periodEnd,
    outcome,
    draftInvoiceId,
    draftInvoice: draftInvoiceId ? `/api/v1/authored-invoices/${draftInvoiceId}` : null,
    failureReason,
    createdAt: `${runDate}T04:00:00Z`,
  }
}

function springPage(items, query) {
  const page = Number(query.get('page') ?? 0)
  const size = Number(query.get('size') ?? 25)
  return {
    content: items.slice(page * size, page * size + size),
    page,
    size,
    totalElements: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / size)),
  }
}

let nextId = 9

export default [
  { match: '/api/v1/customers', reply: ({ query }) => springPage(CUSTOMERS, query) },
  {
    match: /^\/api\/v1\/customers\/([^/]+)$/,
    reply: ({ params }) => {
      const found = CUSTOMERS.find((c) => c.id === params[0])
      return found ? found : { status: 404 }
    },
  },
  {
    match: '/api/v1/authored-invoices',
    reply: ({ query }) => {
      const customerId = query.get('customer_id')
      const type = query.get('type')
      const states = (query.get('state') ?? '').split(',').filter(Boolean)
      const rows = INVOICES.filter(
        (inv) =>
          (!customerId || inv.customerId === customerId) &&
          (!type || inv.type === type) &&
          (states.length === 0 || states.includes(inv.authoringState)),
      )
      return springPage(rows, query)
    },
  },
  {
    match: /^\/api\/v1\/authored-invoices\/([^/]+)$/,
    reply: ({ params }) => {
      const found = INVOICES.find((inv) => inv.id === params[0])
      return found ? found : { status: 404 }
    },
  },
  { match: '/api/v1/periodic-invoice-schedules', reply: () => schedules },
  {
    method: 'POST',
    match: '/api/v1/periodic-invoice-schedules',
    reply: ({ body }) => {
      const created = schedule(
        `sch-${nextId++}`,
        body.customerId,
        body.templateInvoiceId,
        body.interval,
        body.firstRunDate,
        body.endDate ?? null,
        body.occurrences ?? null,
        true,
      )
      schedules = [...schedules, created]
      return { status: 201, body: created }
    },
  },
  {
    match: /^\/api\/v1\/periodic-invoice-schedules\/([^/]+)$/,
    reply: ({ params }) => {
      const found = schedules.find((s) => s.id === params[0])
      return found ? found : { status: 404 }
    },
  },
  {
    method: 'PUT',
    match: /^\/api\/v1\/periodic-invoice-schedules\/([^/]+)$/,
    reply: ({ params, body }) => {
      const found = schedules.find((s) => s.id === params[0])
      if (!found) return { status: 404 }
      Object.assign(found, {
        interval: body.interval,
        transactionSubtype:
          body.interval === 'WEEKLY' || body.interval === 'MONTHLY'
            ? 'SUMMARY'
            : 'CONTINUOUS_SUPPLY',
        nextRunDate: body.nextRunDate,
        endDate: body.endDate ?? null,
        remainingOccurrences: body.occurrences ?? null,
      })
      return found
    },
  },
  {
    match: /^\/api\/v1\/periodic-invoice-schedules\/([^/]+)\/runs$/,
    reply: ({ params }) => RUNS[params[0]] ?? [],
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/periodic-invoice-schedules\/([^/]+)\/(pause|resume)$/,
    reply: ({ params }) => {
      const found = schedules.find((s) => s.id === params[0])
      if (!found) return { status: 404 }
      found.active = params[1] === 'resume'
      if (found.active && found.nextRunDate < '2026-09-25') found.nextRunDate = '2026-09-25'
      return found
    },
  },
]
