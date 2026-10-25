/**
 * Periodic invoices (I-13) — schedules, their runs, and the customers, branches and invoices the
 * screens read them against. Shapes follow `src/api/invoices/periodic.ts`, `customers.ts`,
 * `invoices/list.ts` and `invoices/detail.ts`, plus the TODO(backend) fields the design needs
 * (a schedule's own template, run counts, the switches). Dates sit around 25 Sep 2026, Al Bahja
 * Coffee's customers, rial amounts. `reminders.mjs` reads the same customers and invoices.
 */

export const CUSTOMERS = [
  customer('c-mgh', 'Muscat Grand Hotel LLC', 'OM1100447102', 'PEPPOL', 'ap@muscatgrand.om'),
  customer('c-bahla', 'Bahla Fort Restaurant', 'OM1100558214', 'EMAIL_PDF', 'ahmed@bahlafort.om'),
  customer('c-sohar', 'Sohar Grand Mall', 'OM1100294736', 'PEPPOL', 'finance@sohargrandmall.om'),
  customer('c-qurum', 'Qurum Business Center', 'OM1100640119', 'PEPPOL', 'ap@qurumbc.om'),
  customer('c-nizwa', 'Nizwa Souq Café', 'OM1100731885', 'EMAIL_PDF', 'khalid@nizwasouq.om'),
  customer('c-mouj', 'Al Mouj Marina Café', 'OM1100812903', 'PEPPOL', 'hello@almoujmarina.om'),
  customer('c-seeb', 'Seeb Corniche Bakery', 'OM1100903311', 'EMAIL_PDF', 'orders@seebcorniche.om'),
  customer(
    'c-salalah',
    'Salalah Beach Resort',
    'OM1100114872',
    'PEPPOL',
    'finance@salalahbeach.om',
  ),
]

function customer(id, displayName, vat, sendingMethod, email) {
  return {
    id,
    type: 'BUSINESS',
    displayName,
    profile: {
      details: {
        vatRegistrationNumber: vat,
        peppolParticipantId: sendingMethod === 'PEPPOL' ? { scheme: '0248', value: vat } : null,
      },
      contact: { contactPerson: null, emailRecipients: [email] },
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

export const BRANCHES = [
  {
    id: 'br-main',
    code: 'MAIN',
    name: 'Al Bahja Coffee (Main)',
    type: 'HEAD_OFFICE',
    city: 'Muscat',
  },
  { id: 'br-seeb', code: 'SEEB', name: 'Al Bahja Coffee (Seeb)', type: 'BRANCH', city: 'Seeb' },
  { id: 'br-nizwa', code: 'NIZWA', name: 'Al Bahja Coffee (Nizwa)', type: 'BRANCH', city: 'Nizwa' },
]

/** The design's two lines: 21.600 + 34.200 = 55.800 taxable, 2.790 VAT, 58.590 total. */
const COFFEE_LINES = [
  line(1, 'Cappuccino - Large', 'EA', 12, 1.8, 0),
  line(2, 'Coffee Beans 1kg - H Blend', 'KGM', 4, 9.5, 10),
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

function plusDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const TODAY = '2026-09-25'

/**
 * An issued invoice. `payment` describes where it stands on 25 Sep 2026; an unpaid one past its
 * due date is overdue, which is what the reminders queue chases.
 */
function invoice(
  id,
  number,
  customerId,
  subject,
  po,
  issueDate,
  lines,
  payment = 'PAID',
  terms = 30,
) {
  const totals = totalsOf(lines)
  const dueDate = plusDays(issueDate, terms)
  const overdue = payment !== 'PAID' && dueDate < TODAY
  const paid =
    payment === 'PAID'
      ? totals.totalAmount
      : payment === 'PARTIALLY_PAID'
        ? Math.round(totals.totalAmount * 400) / 1000
        : 0
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
    dueDate,
    issuedAt: `${issueDate}T07:12:00Z`,
    details: {
      deliveryDate: issueDate,
      subject,
      purchaseOrderReference: po,
      customerVisibleNote:
        'Thank you for your business. Please settle within 30 days by bank transfer using the reference above.',
      paymentTerms: { code: `NET${terms}`, label: `Net ${terms} days` },
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
    totals,
    customerName: CUSTOMERS.find((c) => c.id === customerId)?.displayName ?? null,
    payment: {
      state: payment,
      overdue,
      daysOverdue: overdue
        ? Math.round((Date.parse(TODAY) - Date.parse(dueDate)) / 86_400_000)
        : null,
      paidAmount: paid,
      creditedAmount: 0,
      outstandingAmount: Math.round((totals.totalAmount - paid) * 1000) / 1000,
    },
  }
}

const TEMPLATES = [
  invoice(
    'inv-t1',
    'INV-2026-000412',
    'c-mgh',
    'Monthly coffee supply',
    'PO-88213',
    '2026-07-18',
    COFFEE_LINES,
  ),
  invoice(
    'inv-t2',
    'INV-2026-000398',
    'c-bahla',
    'Weekly espresso beans',
    'PO-77102',
    '2026-07-04',
    [line(1, 'Espresso Beans 1kg - Dark Roast', 'KGM', 2, 3.2, 0)],
  ),
  invoice('inv-t3', 'INV-2026-000377', 'c-sohar', 'Quarterly kiosk restock', null, '2026-07-01', [
    line(1, 'Coffee Beans 1kg - House Blend', 'KGM', 5, 9.5, 0),
    line(2, 'Paper cups 12oz (box of 500)', 'BX', 2, 4.0, 0),
  ]),
  invoice('inv-t4', 'INV-2026-000351', 'c-qurum', 'Office catering', 'PO-66120', '2026-06-30', [
    line(1, 'Catering: coffee and pastries', 'EA', 1, 44.0, 0),
  ]),
  invoice('inv-t5', 'INV-2026-000290', 'c-nizwa', 'Ramadan pop-up supply', null, '2026-03-20', [
    line(1, 'Karak tea concentrate 5L', 'EA', 4, 8.12, 0),
  ]),
  invoice('inv-t6', 'INV-2026-000441', 'c-mouj', 'Grand opening series', 'PO-90001', '2026-09-10', [
    line(1, 'Barista training session', 'HUR', 3, 5.0, 0),
  ]),
  invoice('inv-t7', 'INV-2026-000455', 'c-seeb', 'Corniche pastry run', null, '2026-09-18', [
    line(1, 'Croissant tray (24)', 'EA', 3, 7.0, 0),
  ]),
  invoice(
    'inv-t8',
    'INV-2026-000301',
    'c-salalah',
    'Resort minibar coffee',
    'PO-51230',
    '2026-04-15',
    [line(1, 'Drip coffee sachets (box of 100)', 'BX', 8, 14.285, 0)],
  ),
]

/** What the schedules raised, and the unpaid invoices the reminders queue is chasing. */
const RAISED = [
  {
    ...invoice(
      'inv-d1',
      'INV-2026-000430',
      'c-mgh',
      'Monthly coffee supply',
      'PO-88213',
      '2026-09-18',
      COFFEE_LINES,
      'PARTIALLY_PAID',
    ),
    deliveryState: 'SENT_PEPPOL',
  },
  invoice(
    'inv-d2',
    'INV-2026-000429',
    'c-mgh',
    'Monthly coffee supply',
    'PO-88213',
    '2026-08-18',
    COFFEE_LINES,
    'PAID',
  ),
  invoice(
    'inv-d3',
    'INV-2026-000458',
    'c-bahla',
    'Weekly espresso beans',
    'PO-77102',
    '2026-09-19',
    TEMPLATES[1].lines,
    'UNPAID',
    14,
  ),
  invoice(
    'inv-101',
    'INV-2026-000401',
    'c-nizwa',
    'September café supply',
    null,
    '2026-08-11',
    [
      line(1, 'Coffee Beans 1kg - House Blend', 'KGM', 30, 9.5, 0),
      line(2, 'Karak tea concentrate 5L', 'EA', 4, 8.12, 0),
    ],
    'UNPAID',
  ),
  invoice(
    'inv-102',
    'INV-2026-000377',
    'c-salalah',
    'Resort minibar coffee',
    'PO-51230',
    '2026-08-04',
    [line(1, 'Drip coffee sachets (box of 100)', 'BX', 80, 14.285, 0)],
    'UNPAID',
  ),
  invoice(
    'inv-103',
    'INV-2026-000392',
    'c-bahla',
    'Kitchen restock',
    null,
    '2026-08-24',
    [line(1, 'Espresso Beans 1kg - Dark Roast', 'KGM', 190, 3.2, 0)],
    'PARTIALLY_PAID',
  ),
  invoice(
    'inv-104',
    'INV-2026-000351',
    'c-mgh',
    'Barista training',
    'PO-88214',
    '2026-07-30',
    [line(1, 'Barista training session', 'HUR', 250, 5.0, 0)],
    'UNPAID',
  ),
  invoice(
    'inv-105',
    'INV-2026-000360',
    'c-mouj',
    'Opening week supply',
    'PO-90001',
    '2026-08-07',
    [line(1, 'Cappuccino - Large', 'EA', 120, 1.8, 0)],
    'UNPAID',
  ),
  invoice(
    'inv-106',
    'INV-2026-000466',
    'c-qurum',
    'Office catering',
    'PO-66120',
    '2026-09-17',
    [line(1, 'Catering: coffee and pastries', 'EA', 10, 44.0, 0)],
    'UNPAID',
  ),
  invoice(
    'inv-107',
    'INV-2026-000470',
    'c-seeb',
    'Corniche pastry run',
    null,
    '2026-09-20',
    [line(1, 'Croissant tray (24)', 'EA', 30, 7.0, 0)],
    'UNPAID',
    14,
  ),
  invoice(
    'inv-108',
    'INV-2026-000318',
    'c-sohar',
    'Kiosk restock',
    null,
    '2026-06-20',
    [line(1, 'Paper cups 12oz (box of 500)', 'BX', 40, 4.0, 0)],
    'PAID',
  ),
  invoice(
    'inv-109',
    'INV-2026-000330',
    'c-nizwa',
    'August café supply',
    null,
    '2026-07-11',
    [line(1, 'Coffee Beans 1kg - House Blend', 'KGM', 20, 9.5, 0)],
    'PAID',
  ),
]

export const INVOICES = [...TEMPLATES, ...RAISED]

/** The schedule's own template, as the design sets one up from scratch. */
function templateOf(inv) {
  return {
    branchId: inv.branchId,
    currency: inv.currency,
    vatMode: 'EXCLUSIVE',
    taxCategoryCode: 'S5',
    details: {
      subject: inv.details.subject,
      purchaseOrderReference: inv.details.purchaseOrderReference,
      paymentTerms: inv.details.paymentTerms,
      customerVisibleNote: inv.details.customerVisibleNote,
      internalNote: 'Loyalty discount approved by Hafidh on 15 Jul. Follow up if unpaid by 20 Aug.',
    },
    lines: inv.lines.map((l) => ({
      lineNumber: l.lineNumber,
      description: l.description,
      itemType: ['HUR', 'DAY', 'MON', 'E48'].includes(l.unitCode) ? 'SERVICE' : 'GOODS',
      unitCode: l.unitCode,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: { type: l.discountType, value: l.discountValue },
      taxCategory: { code: 'S5', en16931Category: 'S', rate: 5, exemptionReason: null },
      hsCode: l.unitCode === 'HUR' ? null : '090121000000',
      serviceType: l.unitCode === 'HUR' ? '92900' : null,
    })),
  }
}

let schedules = [
  schedule('sch-1', 'c-mgh', 'inv-t1', 'MONTHLY', '2026-10-18', null, null, true, {
    runCount: 2,
    lastRunDate: '2026-09-18',
    template: templateOf(TEMPLATES[0]),
    autoIssue: true,
    notifyOnRun: true,
    createdAt: '2026-07-18T06:00:00Z',
  }),
  schedule('sch-2', 'c-bahla', 'inv-t2', 'WEEKLY', '2026-09-26', null, null, true, {
    runCount: 8,
    lastRunDate: '2026-09-19',
  }),
  schedule('sch-3', 'c-sohar', 'inv-t3', 'QUARTERLY', '2026-10-01', null, 6, true, {
    runCount: 3,
    lastRunDate: '2026-07-01',
    template: templateOf(TEMPLATES[2]),
  }),
  schedule('sch-4', 'c-qurum', 'inv-t4', 'MONTHLY', '2026-09-20', null, null, true, {
    runCount: 5,
    lastRunDate: '2026-08-20',
  }),
  // Paused by Fawtir when the company moved to a plan without periodic invoices.
  schedule('sch-5', 'c-nizwa', 'inv-t5', 'MONTHLY', '2027-02-20', '2027-04-20', 3, false, {
    runCount: 4,
    lastRunDate: '2026-03-20',
    pauseReason: 'PLAN_FEATURE_NOT_INCLUDED',
  }),
  schedule('sch-6', 'c-mouj', 'inv-t6', 'ANNUALLY', '2027-01-15', '2029-01-15', null, true, {
    runCount: 0,
    lastRunDate: null,
  }),
  schedule('sch-7', 'c-seeb', 'inv-t7', 'WEEKLY', '2026-09-25', null, 3, true, {
    runCount: 1,
    lastRunDate: '2026-09-18',
  }),
  schedule('sch-8', 'c-salalah', 'inv-t8', 'MONTHLY', '2026-09-15', null, 0, true, {
    runCount: 2,
    lastRunDate: '2026-09-15',
  }),
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
  extra = {},
) {
  return {
    id,
    customerId,
    templateInvoiceId,
    template: null,
    interval,
    transactionSubtype:
      interval === 'WEEKLY' || interval === 'MONTHLY' ? 'SUMMARY' : 'CONTINUOUS_SUPPLY',
    nextRunDate,
    endDate,
    remainingOccurrences,
    active,
    autoIssue: false,
    notifyOnRun: false,
    createdAt: '2026-06-01T06:00:00Z',
    pauseReason: null,
    ...extra,
  }
}

const RUNS = {
  'sch-1': [
    run('2026-09-18', '2026-08-18', '2026-09-17', 'DRAFTED', 'inv-d1', null, {
      invoiceNumber: 'INV-2026-000430',
      totalAmount: 58.59,
      deliveryState: 'SENT_PEPPOL',
      paymentState: 'PARTIALLY_PAID',
    }),
    run('2026-08-18', '2026-07-18', '2026-08-17', 'DRAFTED', 'inv-d2', null, {
      invoiceNumber: 'INV-2026-000429',
      totalAmount: 58.59,
      deliveryState: 'SENT_PEPPOL',
      paymentState: 'PAID',
    }),
    run('2026-07-18', '2026-06-18', '2026-07-17', 'FAILED', null, 'Template invoice was cancelled'),
  ],
  'sch-2': [
    run('2026-09-19', '2026-09-12', '2026-09-18', 'DRAFTED', 'inv-d3', null, {
      invoiceNumber: 'INV-2026-000458',
      totalAmount: 6.72,
      deliveryState: 'NOT_SUBMITTED',
      paymentState: 'UNPAID',
    }),
    run('2026-09-12', '2026-09-05', '2026-09-11', 'SKIPPED', null),
  ],
  'sch-4': [run('2026-08-20', '2026-07-20', '2026-08-19', 'DRAFTED', 'inv-d2')],
  'sch-8': [
    run('2026-08-15', null, null, 'DRAFTED', 'inv-d2'),
    run('2026-07-15', null, null, 'DRAFTED', 'inv-d2'),
  ],
}

function run(
  runDate,
  periodStart,
  periodEnd,
  outcome,
  draftInvoiceId,
  failureReason = null,
  extra = {},
) {
  return {
    runDate,
    periodStart,
    periodEnd,
    outcome,
    draftInvoiceId,
    draftInvoice: draftInvoiceId ? `/api/v1/authored-invoices/${draftInvoiceId}` : null,
    failureReason,
    createdAt: `${runDate}T04:00:00Z`,
    ...extra,
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
  { match: '/api/v1/branches', reply: () => BRANCHES },
  {
    match: '/api/v1/authored-invoices',
    reply: ({ query }) => {
      const customerId = query.get('customer_id')
      const type = query.get('type')
      const payment = query.get('payment')
      const states = (query.get('state') ?? '').split(',').filter(Boolean)
      const rows = INVOICES.filter(
        (inv) =>
          (!customerId || inv.customerId === customerId) &&
          (!type || inv.type === type) &&
          (states.length === 0 || states.includes(inv.authoringState)) &&
          (!payment ||
            (payment === 'PAID' && inv.payment.state === 'PAID') ||
            (payment === 'OVERDUE' && inv.payment.overdue) ||
            (payment === 'AWAITING' && inv.payment.state !== 'PAID' && !inv.payment.overdue)),
      )
      return springPage(rows, query)
    },
  },
  {
    // Before the detail route: its id pattern would otherwise swallow "summary".
    match: '/api/v1/authored-invoices/summary',
    reply: () => {
      const issued = INVOICES.filter((i) => i.authoringState === 'ISSUED')
      const overdue = issued.filter((i) => i.payment.overdue)
      const sum = (rows) =>
        Math.round(rows.reduce((s, i) => s + i.payment.outstandingAmount, 0) * 1000) / 1000
      return {
        currencyCode: 'OMR',
        asOf: TODAY,
        all: issued.length,
        drafts: 0,
        awaiting: issued.filter((i) => i.payment.state !== 'PAID' && !i.payment.overdue).length,
        overdue: overdue.length,
        paid: issued.filter((i) => i.payment.state === 'PAID').length,
        outstandingTotal: sum(issued),
        outstandingInvoices: issued.filter((i) => i.payment.state !== 'PAID').length,
        awaitingTotal: sum(issued.filter((i) => i.payment.state !== 'PAID' && !i.payment.overdue)),
        dueSoonInvoices: 2,
        dueSoonDays: 7,
        overdueTotal: sum(overdue),
        overdueInvoices: overdue.length,
        oldestOverdueDueDate: overdue.map((i) => i.dueDate).sort()[0] ?? null,
        paidTotal: 0,
        paidInvoices: issued.filter((i) => i.payment.state === 'PAID').length,
      }
    },
  },
  {
    match: /^\/api\/v1\/authored-invoices\/([^/]+)$/,
    reply: ({ params }) => {
      const found = INVOICES.find((inv) => inv.id === params[0])
      return found ? found : { status: 404 }
    },
  },
  {
    match: /^\/api\/v1\/authored-invoices\/([^/]+)\/internal-note$/,
    reply: () => ({
      internalNote: 'Loyalty discount approved by Hafidh on 15 Jul. Follow up if unpaid by 20 Aug.',
    }),
  },
  { match: '/api/v1/periodic-invoice-schedules', reply: () => schedules },
  {
    method: 'POST',
    match: '/api/v1/periodic-invoice-schedules',
    reply: ({ body }) => {
      const created = schedule(
        `sch-${nextId++}`,
        body.customerId,
        body.templateInvoiceId ?? null,
        body.interval,
        body.firstRunDate,
        body.endDate ?? null,
        body.occurrences ?? null,
        true,
        {
          template: body.template ?? null,
          autoIssue: Boolean(body.autoIssue),
          notifyOnRun: Boolean(body.notifyOnRun),
          runCount: 0,
          lastRunDate: null,
          createdAt: `${TODAY}T08:00:00Z`,
        },
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
        ...(body.customerId ? { customerId: body.customerId } : {}),
        ...(body.template ? { template: body.template } : {}),
        ...(body.autoIssue !== undefined ? { autoIssue: Boolean(body.autoIssue) } : {}),
        ...(body.notifyOnRun !== undefined ? { notifyOnRun: Boolean(body.notifyOnRun) } : {}),
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
      // Pausing or resuming by hand leaves no reason behind.
      found.pauseReason = null
      if (found.active && found.nextRunDate < TODAY) found.nextRunDate = TODAY
      return found
    },
  },
]
