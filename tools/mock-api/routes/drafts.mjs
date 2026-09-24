/**
 * Invoice drafts (the composer at /invoices/new and /invoices/:id/edit) — branches, the customer
 * search and records it picks from, the product catalogue, and a draft store that is created,
 * saved, priced, discarded and issued in memory. Shapes follow `src/api/invoices/drafts.ts`,
 * `customers.ts` and `catalog/products.ts`. Al Bahja Coffee, September 2026, rial amounts.
 */

const NOW = '2026-09-25T09:30:00Z'

/**
 * The static session lacks the composer's permissions (`invoice.draft`, `invoice.issue`,
 * `customer.manage`, `product.manage`, the internal note). Module routes are matched before the
 * static ones, so this answers the same session with those added; every other screen keeps working.
 */
const ENTITLEMENTS = {
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
    { id: 'r-2', code: 'PLATFORM_SUPPORT', name: 'Platform support', systemRole: true },
  ],
  permissions: [
    'platform.tenants.manage',
    'platform.operators.manage',
    'platform.support',
    'admin.users.manage',
    'admin.roles.manage',
    'role.read',
    'role.list',
    'invoice.read',
    'invoice.write',
    'invoice.approve',
    'invoice.draft',
    'invoice.issue',
    'invoice.internal-note.read',
    'customer.read',
    'customer.manage',
    'supplier.read',
    'product.read',
    'product.manage',
    'branch.read',
  ],
  scopes: ['platform.tenants.manage', 'platform.operators.manage', 'platform.support'],
  featureFlags: {},
}

const BRANCHES = [
  { id: 'b-nizwa', code: 'NIZWA', name: 'Al Bahja Coffee (Nizwa)', type: 'BRANCH', city: 'Nizwa' },
  {
    id: 'b-main',
    code: 'MAIN',
    name: 'Al Bahja Coffee (Main)',
    type: 'HEAD_OFFICE',
    city: 'Muscat',
  },
  { id: 'b-seeb', code: 'SEEB', name: 'Al Bahja Coffee (Seeb)', type: 'BRANCH', city: 'Seeb' },
  {
    id: 'b-sohar',
    code: 'SOHAR',
    name: 'Al Bahja Roastery (Sohar)',
    type: 'BRANCH',
    city: 'Sohar',
  },
]

function customer(id, type, displayName, vat, sendingMethod, extra = {}) {
  return {
    id,
    type,
    displayName,
    profile: {
      details: { vatRegistrationNumber: vat },
      contact: { contactPerson: extra.contactPerson ?? null, emailRecipients: extra.emails ?? [] },
      deliveryPreferences: { sendingMethod },
      invoiceAddress: { cityName: extra.city ?? 'Muscat', countryCode: 'OM' },
    },
    peppolDelivery: sendingMethod === 'PEPPOL' ? 'ACTIVE' : 'NOT_APPLICABLE',
    invoiceEligible: true,
    missingInvoiceFields: [],
    status: 'ACTIVE',
    updatedAt: '2026-09-01T06:00:00Z',
  }
}

const CUSTOMERS = [
  customer('c-mgh', 'BUSINESS', 'Muscat Grand Hotel LLC', 'OM1100447102', 'PEPPOL', {
    contactPerson: 'Salim Al Riyami',
    emails: ['accounts@muscatgrand.om'],
  }),
  customer('c-nizwa', 'BUSINESS', 'Nizwa Souq Café', 'OM1100338914', 'PEPPOL', {
    city: 'Nizwa',
    emails: ['owner@nizwasouq.om'],
  }),
  customer('c-salalah', 'BUSINESS', 'Salalah Beach Resort', 'OM1100562773', 'PEPPOL', {
    city: 'Salalah',
    emails: ['finance@salalahbeach.om'],
  }),
  customer('c-bahla', 'BUSINESS', 'Bahla Fort Restaurant', 'OM1100714208', 'EMAIL_PDF', {
    city: 'Bahla',
    emails: ['bahlafort@example.om'],
  }),
  customer('c-sohar', 'BUSINESS', 'Sohar Grand Mall', 'OM1100901556', 'PEPPOL', {
    city: 'Sohar',
    emails: ['ap@sohargrandmall.om'],
  }),
  // Also named by periodic.mjs, so a combined mock answers the same ids.
  customer('c-qurum', 'BUSINESS', 'Qurum Business Center', 'OM1100640119', 'PEPPOL', {
    emails: ['accounts@qurumbc.om'],
  }),
  customer('c-mouj', 'BUSINESS', 'Al Mouj Marina Café', 'OM1100812903', 'PEPPOL', {
    emails: ['cafe@almouj.om'],
  }),
  customer('c-seeb', 'BUSINESS', 'Seeb Corniche Bakery', 'OM1100903311', 'EMAIL_PDF', {
    city: 'Seeb',
    emails: ['bakery@seebcorniche.om'],
  }),
  customer('c-mht', 'GOVERNMENT', 'Ministry of Heritage & Tourism', 'OM1100000114', 'PEPPOL', {
    contactPerson: 'Procurement office',
    emails: ['procurement@mht.gov.om'],
  }),
  customer('c-mm', 'GOVERNMENT', 'Muscat Municipality', 'OM1100000229', 'PEPPOL', {
    emails: ['finance@mm.gov.om'],
  }),
  customer('c-aisha', 'CONSUMER', 'Aisha Al Balushi', null, 'QR_RECEIPT', {
    emails: ['aisha.albalushi@example.om'],
    city: 'Seeb',
  }),
  customer('c-khalid', 'CONSUMER', 'Khalid Al Rashdi', null, 'QR_RECEIPT', {
    emails: [],
    city: 'Nizwa',
  }),
  customer('c-maryam', 'CONSUMER', 'Maryam Al Hinai', null, 'QR_RECEIPT', {
    emails: ['maryam.h@example.om'],
  }),
]

/** `GET /customers/{id}` and the writes answer the whole profile (`CustomerRecordDto`). */
function record(summary, version = 1) {
  const consumer = summary.type === 'CONSUMER'
  const [first, ...rest] = summary.displayName.split(' ')
  return {
    ...summary,
    version,
    profile: {
      logo: null,
      details: {
        firstName: consumer ? first : null,
        lastName: consumer ? rest.join(' ') : null,
        legalRegisteredName: summary.type === 'BUSINESS' ? summary.displayName : null,
        entityMinistryName: summary.type === 'GOVERNMENT' ? summary.displayName : null,
        vatRegistrationNumber: summary.profile.details.vatRegistrationNumber,
        registeredForVat: consumer ? null : true,
        entityMinistryCode: null,
        defaultBuyerReference: summary.type === 'GOVERNMENT' ? 'MHT-2026-COFFEE' : null,
        defaultPurchaseOrderNumber: null,
        defaultContractTenderReference: null,
        peppolParticipantId: consumer
          ? null
          : { scheme: '0248', value: summary.profile.details.vatRegistrationNumber },
        registeredOnPeppol: consumer
          ? null
          : summary.profile.deliveryPreferences.sendingMethod === 'PEPPOL',
      },
      contact: {
        contactPerson: summary.profile.contact.contactPerson,
        roleTitle: null,
        emailRecipients: summary.profile.contact.emailRecipients,
        telephone: null,
        mobilePhone: null,
        preferredLanguage: 'en',
      },
      billingDefaults: {
        defaultCurrency: 'OMR',
        defaultTaxCategory: 'S5',
        paymentTerms: 'NET30',
        defaultPaymentMethod: '30',
      },
      deliveryPreferences: {
        sendingMethod: summary.profile.deliveryPreferences.sendingMethod,
        emailPdfCopy: false,
        automaticPaymentReminders: false,
      },
      invoiceAddress: {
        attention: null,
        countryCode: 'OM',
        cityName: summary.profile.invoiceAddress.cityName,
        countrySubentity: null,
        streetName: 'Way 3025',
        buildingNumber: '12',
        additionalStreetName: null,
        poBox: null,
        postalCode: '112',
      },
      sameAsInvoicingAddress: true,
      deliveryAddress: null,
      customerVisibleNote: null,
    },
  }
}

function product(id, code, name, unit, price, tax = 'S', rate = 5) {
  return {
    id,
    code,
    name,
    description: null,
    defaultUnitCode: unit,
    defaultUnitPrice: price,
    defaultTaxCategory: tax,
    defaultTaxRate: rate,
    active: true,
    version: 0,
  }
}

const PRODUCTS = [
  product('p-cap', 'CAP-L', 'Cappuccino - Large', 'EA', 1.8),
  product('p-flat', 'FLT-1', 'Flat White', 'EA', 1.6),
  product('p-beans', 'BEAN-HB', 'Coffee Beans 1kg - House Blend', 'KGM', 9.5),
  product('p-green', 'BEAN-YG', 'Green Beans - Yirgacheffe', 'KGM', 10.25),
  product('p-roast', 'SRV-ROAST', 'Roasting service - per batch', 'E48', 4.2),
  product('p-cups', 'CUP-500', 'Takeaway cups - 500 pack', 'PK', 22.8),
  product('p-train', 'SRV-TRAIN', 'Barista training', 'HUR', 15),
  product('p-deliv', 'SRV-DELIV', 'Delivery charge', 'EA', 2.5),
  product('p-export', 'BEAN-EXP', 'Export beans - Salalah lot', 'KGM', 11, 'G', 0),
]

const page = (items, size = 20) => ({
  content: items,
  page: 0,
  size,
  totalElements: items.length,
  totalPages: 1,
  number: 0,
})

/* ------------------------------------------------------------------ drafts */

const round3 = (n) => Math.round(n * 1000) / 1000

/** The engine's arithmetic for the preview: line discounts, the header discount shared out, VAT. */
function price(draft) {
  const gross = draft.lines.map((line) => line.quantity * line.unitPrice)
  const lineDisc = draft.lines.map((line, i) =>
    line.discount.type === 'PERCENTAGE'
      ? (gross[i] * line.discount.value) / 100
      : line.discount.value,
  )
  const afterLine = gross.map((g, i) => g - lineDisc[i])
  const base = afterLine.reduce((a, b) => a + b, 0)
  const header =
    draft.headerDiscount.type === 'PERCENTAGE'
      ? (base * draft.headerDiscount.value) / 100
      : draft.headerDiscount.value
  const lines = draft.lines.map((line, i) => {
    const allocated = base > 0 ? (header * afterLine[i]) / base : 0
    const taxable = afterLine[i] - allocated
    const vat = (taxable * line.taxCategory.rate) / 100
    return {
      lineNumber: line.lineNumber,
      grossAmount: round3(gross[i]),
      lineDiscount: round3(lineDisc[i]),
      allocatedHeaderDiscount: round3(allocated),
      taxableAmount: round3(taxable),
      vatAmount: round3(vat),
      lineNetAmount: round3(taxable + vat),
    }
  })
  const subtotal = round3(gross.reduce((a, b) => a + b, 0))
  const itemLevelDiscount = round3(lineDisc.reduce((a, b) => a + b, 0))
  const headerDiscount = round3(header)
  const taxableAmount = round3(lines.reduce((a, l) => a + l.taxableAmount, 0))
  const vatAmount = round3(lines.reduce((a, l) => a + l.vatAmount, 0))
  return {
    currency: 'OMR',
    lines,
    totals: {
      subtotal,
      itemLevelDiscount,
      headerDiscount,
      totalDiscount: round3(itemLevelDiscount + headerDiscount),
      taxableAmount,
      vatAmount,
      totalAmount: round3(taxableAmount + vatAmount),
    },
  }
}

function toResponse(id, version, state, draft, extra = {}) {
  return {
    id,
    version,
    authoringState: state,
    customerId: draft.customerId,
    branchId: draft.branchId,
    currency: draft.currency,
    invoiceNumber: extra.invoiceNumber ?? null,
    details: {
      deliveryDate: draft.details.deliveryDate ?? null,
      subject: draft.details.subject ?? null,
      purchaseOrderReference: draft.details.purchaseOrderReference ?? null,
      customerVisibleNote: draft.details.customerVisibleNote ?? null,
      paymentTerms: draft.details.paymentTerms ?? null,
      transactionType: draft.details.transactionType,
    },
    type: 'INVOICE',
    headerDiscount: draft.headerDiscount,
    lines: draft.lines.map((line) => ({
      lineNumber: line.lineNumber,
      productId: line.productId,
      productCode: line.productCode,
      description: line.description,
      unitCode: line.unitCode,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountType: line.discount.type,
      discountValue: line.discount.value,
      taxCategoryCode: line.taxCategory.code,
      en16931Category: line.taxCategory.en16931Category,
      taxRate: line.taxCategory.rate,
      exemptionReason: line.taxCategory.exemptionReason,
    })),
  }
}

const draftLine = (
  lineNumber,
  productId,
  productCode,
  description,
  unitCode,
  quantity,
  unitPrice,
  discount = 0,
) => ({
  lineNumber,
  productId,
  productCode,
  description,
  unitCode,
  quantity,
  unitPrice,
  discount: { type: 'PERCENTAGE', value: discount },
  taxCategory: { code: 'S5', en16931Category: 'S', rate: 5, exemptionReason: null },
})

/** A draft on file, priced to the design's 59.600 / 3.800 / 55.800 / 2.790 / 58.590. */
const DRAFTS = new Map([
  [
    'd-2044',
    {
      version: 3,
      state: 'DRAFT',
      internalNote: 'Loyalty discount approved by Hafidh on 15 Sep. Follow up if unpaid by 20 Oct.',
      draft: {
        customerId: 'c-mgh',
        branchId: 'b-nizwa',
        currency: 'OMR',
        vatMode: 'EXCLUSIVE',
        lines: [
          draftLine(1, 'p-cap', 'CAP-L', 'Cappuccino - Large', 'EA', 12, 1.8, 0),
          draftLine(
            2,
            'p-train',
            'SRV-TRAIN',
            'Barista training - September sessions',
            'HUR',
            4,
            9.5,
            10,
          ),
        ],
        headerDiscount: { type: 'PERCENTAGE', value: 0 },
        details: {
          deliveryDate: '2026-09-24',
          subject: 'Monthly coffee supply & barista training — September',
          purchaseOrderReference: 'PO-88213',
          customerVisibleNote:
            'Thank you for your business. Please settle within 30 days by bank transfer using the reference above.',
          paymentTerms: { code: 'NET30', label: 'Net 30 days' },
          transactionType: 'FULL_TAX',
        },
      },
    },
  ],
])
let nextDraft = 2045
let nextCustomer = 1

const DRAFT_ID = /^\/api\/v1\/invoice-drafts\/([^/]+)$/

export default [
  { match: '/api/v1/me/entitlements', reply: () => ENTITLEMENTS },
  { match: '/api/v1/branches', reply: () => BRANCHES },

  {
    match: '/api/v1/customers',
    reply: ({ query }) => {
      const type = query.get('type')
      const search = (query.get('search') ?? '').toLowerCase()
      return page(
        CUSTOMERS.filter(
          (c) =>
            (!type || c.type === type) && (!search || c.displayName.toLowerCase().includes(search)),
        ),
      )
    },
  },
  {
    method: 'POST',
    match: '/api/v1/customers',
    reply: ({ body }) => {
      const name =
        body.type === 'CONSUMER'
          ? [body.details.firstName, body.details.lastName].filter(Boolean).join(' ')
          : body.details.legalRegisteredName
      const created = customer(
        `c-new-${nextCustomer++}`,
        body.type,
        name,
        body.details.vatRegistrationNumber ?? null,
        body.deliveryPreferences.sendingMethod,
        {
          emails: body.contact.emailRecipients ?? [],
        },
      )
      CUSTOMERS.push(created)
      return { status: 201, body: record(created, 0) }
    },
  },
  {
    match: /^\/api\/v1\/customers\/([^/]+)$/,
    reply: ({ params }) => {
      const found = CUSTOMERS.find((c) => c.id === params[0])
      return found ? record(found) : { status: 404 }
    },
  },

  {
    match: '/api/v1/products',
    reply: ({ query }) => {
      const q = (query.get('q') ?? '').toLowerCase()
      return page(
        PRODUCTS.filter(
          (p) => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q),
        ),
      )
    },
  },

  {
    method: 'POST',
    match: '/api/v1/invoice-drafts',
    reply: ({ body }) => {
      const id = `d-${nextDraft++}`
      DRAFTS.set(id, {
        version: 0,
        state: 'DRAFT',
        internalNote: body.draft.details.internalNote ?? null,
        draft: body.draft,
      })
      return { status: 201, body: toResponse(id, 0, 'DRAFT', body.draft) }
    },
  },
  {
    match: DRAFT_ID,
    reply: ({ params }) => {
      const found = DRAFTS.get(params[0])
      return found
        ? toResponse(params[0], found.version, found.state, found.draft, found)
        : { status: 404 }
    },
  },
  {
    method: 'PUT',
    match: DRAFT_ID,
    reply: ({ params, body }) => {
      const found = DRAFTS.get(params[0])
      if (!found) return { status: 404 }
      if (body.expectedVersion !== found.version) {
        return {
          status: 409,
          body: {
            type: 'https://api.fawtir.om/problems/stale-invoice-version',
            status: 409,
            code: 'STALE_INVOICE_VERSION',
          },
        }
      }
      found.version += 1
      found.draft = body.draft
      if ('internalNote' in body.draft.details) found.internalNote = body.draft.details.internalNote
      return toResponse(params[0], found.version, found.state, found.draft)
    },
  },
  {
    method: 'DELETE',
    match: DRAFT_ID,
    reply: ({ params }) => {
      const found = DRAFTS.get(params[0])
      if (!found) return { status: 404 }
      found.state = 'DISCARDED'
      found.version += 1
      return toResponse(params[0], found.version, found.state, found.draft)
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/invoice-drafts\/([^/]+)\/preview$/,
    reply: ({ params }) => {
      const found = DRAFTS.get(params[0])
      if (!found) return { status: 404 }
      if (found.draft.lines.length === 0) {
        return {
          status: 422,
          body: {
            type: 'https://api.fawtir.om/problems/validation-failed',
            status: 422,
            code: 'INVOICE_LINES_REQUIRED',
          },
        }
      }
      return price(found.draft)
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/invoice-drafts\/([^/]+)\/issue$/,
    reply: ({ params, body }) => {
      const found = DRAFTS.get(params[0])
      if (!found) return { status: 404 }
      found.state = 'ISSUED'
      found.version += 1
      found.invoiceNumber = 'INV-2026-000343'
      const priced = price(found.draft)
      return {
        ...toResponse(params[0], found.version, 'ISSUED', found.draft, found),
        issueDate: body.issueDate,
        dueDate: body.dueDate,
        totals: priced.totals,
        deliveryState: 'NOT_SUBMITTED',
        issuedAt: NOW,
      }
    },
  },
  {
    match: /^\/api\/v1\/authored-invoices\/([^/]+)\/internal-note$/,
    reply: ({ params }) => {
      const found = DRAFTS.get(params[0])
      return found ? { internalNote: found.internalNote } : { status: 404 }
    },
  },
]
