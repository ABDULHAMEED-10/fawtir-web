/**
 * The customer directory (/customers, /customers/new, /customers/:id/edit, /customers/import):
 * the list, its summary and receivables, one record and the CSV export. The staged import is
 * answered by `suppliers.mjs` for both targets.
 * Shapes follow `src/api/customers/customers.ts` and `src/api/counterpartyImport.ts`. The rows are
 * the Customers frame's (Al Bahja Coffee, September 2026), with its figures made to add up:
 * 217.490 owed by four customers, 120.400 of it overdue from one.
 *
 * `drafts.mjs` and `invoices.mjs` sort first and answer `/customers` and `/customers/{id}` for the
 * composers; a run that renders the directory loads this module alone (or first).
 */

const NOW = '2026-09-25T09:30:00Z'

function customer(id, type, displayName, vat, sendingMethod, contact, email, city, delivery) {
  return {
    id,
    type,
    displayName,
    profile: {
      details: {
        vatRegistrationNumber: vat,
        peppolParticipantId: vat ? { scheme: '0248', value: vat } : null,
      },
      contact: { contactPerson: contact, emailRecipients: email ? [email] : [] },
      deliveryPreferences: { sendingMethod, automaticPaymentReminders: true },
      invoiceAddress: { cityName: city, countryCode: 'OM' },
    },
    peppolDelivery: delivery ?? (sendingMethod === 'PEPPOL' ? 'ACTIVE' : 'NOT_APPLICABLE'),
    invoiceEligible: true,
    missingInvoiceFields: [],
    status: 'ACTIVE',
    updatedAt: '2026-09-20T06:00:00Z',
  }
}

const CUSTOMERS = [
  customer(
    'c-salalah',
    'BUSINESS',
    'Salalah Beach Resort',
    'OM1100582341',
    'PEPPOL',
    'Mariam Al Hinai',
    'mariam@salalahbeach.om',
    'Salalah',
  ),
  customer(
    'c-qurum',
    'BUSINESS',
    'Qurum Business Center',
    'OM1100337812',
    'PEPPOL',
    'Salim Al Farsi',
    'accounts@qurumbc.om',
    'Muscat',
  ),
  customer(
    'c-grand',
    'BUSINESS',
    'Muscat Grand Hotel LLC',
    'OM1100447102',
    'PEPPOL',
    'Dana Al Balushi',
    'dana@muscatgrand.om',
    'Muscat',
  ),
  customer(
    'c-bahla',
    'BUSINESS',
    'Bahla Fort Restaurant',
    'OM1100771290',
    'PEPPOL',
    'Khalid Al Amri',
    'khalid@bahlafort.om',
    'Bahla',
    'PENDING_VERIFICATION',
  ),
  customer(
    'c-tourism',
    'GOVERNMENT',
    'Ministry of Tourism',
    null,
    'PEPPOL',
    'Procurement Office',
    'procurement@mot.gov.om',
    'Muscat',
  ),
  customer(
    'c-rawahi',
    'CONSUMER',
    'Ahmed Al Rawahi',
    null,
    'QR_RECEIPT',
    null,
    'ahmed.r@gmail.com',
    'Muscat',
  ),
  customer(
    'c-nizwa',
    'BUSINESS',
    'Nizwa Heritage Hotel',
    'OM1100912004',
    'EMAIL_PDF',
    'Aisha Al Kindi',
    'aisha@nizwaheritage.om',
    'Nizwa',
  ),
  customer(
    'c-sohar',
    'BUSINESS',
    'Sohar Port Cafe',
    'OM1100650018',
    'PEPPOL',
    'Yousef Al Maamari',
    'yousef@soharportcafe.om',
    'Sohar',
  ),
]

const RECEIVABLES = {
  'c-salalah': {
    outstanding: 120.4,
    overdue: 120.4,
    invoices: 2,
    openInvoices: 2,
    partlyPaidInvoices: 0,
    oldestOverdueDueDate: '2026-09-05',
    daysOverdue: 20,
  },
  'c-qurum': {
    outstanding: 46.2,
    overdue: 0,
    invoices: 4,
    openInvoices: 1,
    partlyPaidInvoices: 0,
    oldestOverdueDueDate: null,
    daysOverdue: null,
  },
  'c-grand': {
    outstanding: 28.59,
    overdue: 0,
    invoices: 3,
    openInvoices: 1,
    partlyPaidInvoices: 1,
    oldestOverdueDueDate: null,
    daysOverdue: null,
  },
  'c-bahla': {
    outstanding: 22.3,
    overdue: 0,
    invoices: 1,
    openInvoices: 1,
    partlyPaidInvoices: 0,
    oldestOverdueDueDate: null,
    daysOverdue: null,
  },
  'c-tourism': {
    outstanding: 0,
    overdue: 0,
    invoices: 2,
    openInvoices: 0,
    partlyPaidInvoices: 0,
    oldestOverdueDueDate: null,
    daysOverdue: null,
  },
  'c-rawahi': {
    outstanding: 0,
    overdue: 0,
    invoices: 1,
    openInvoices: 0,
    partlyPaidInvoices: 0,
    oldestOverdueDueDate: null,
    daysOverdue: null,
  },
  'c-sohar': {
    outstanding: 0,
    overdue: 0,
    invoices: 1,
    openInvoices: 0,
    partlyPaidInvoices: 0,
    oldestOverdueDueDate: null,
    daysOverdue: null,
  },
}

function summary() {
  const count = (type) => CUSTOMERS.filter((c) => c.type === type).length
  const owing = Object.values(RECEIVABLES).filter((r) => r.outstanding > 0)
  const eligible = CUSTOMERS.filter((c) => c.type !== 'CONSUMER')
  return {
    currencyCode: 'OMR',
    asOf: NOW,
    total: CUSTOMERS.length,
    archived: 0,
    byType: {
      business: count('BUSINESS'),
      government: count('GOVERNMENT'),
      consumer: count('CONSUMER'),
    },
    peppolReady: eligible.filter((c) => c.peppolDelivery === 'ACTIVE').length,
    peppolEligible: eligible.length,
    receivables: {
      outstanding: Math.round(owing.reduce((s, r) => s + r.outstanding, 0) * 1000) / 1000,
      overdue: Math.round(owing.reduce((s, r) => s + r.overdue, 0) * 1000) / 1000,
      openInvoices: owing.reduce((s, r) => s + r.openInvoices, 0),
      overdueInvoices: 2,
      customersOwing: owing.length,
      customersOverdue: owing.filter((r) => r.overdue > 0).length,
    },
  }
}

function record(summary, version = 1) {
  const consumer = summary.type === 'CONSUMER'
  const [first, ...rest] = summary.displayName.split(' ')
  const vat = summary.profile.details.vatRegistrationNumber
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
        vatRegistrationNumber: vat,
        registeredForVat: consumer ? null : Boolean(vat),
        entityMinistryCode: summary.type === 'GOVERNMENT' ? 'MOT-01' : null,
        defaultBuyerReference: summary.type === 'GOVERNMENT' ? 'MOT-2026-COFFEE' : null,
        defaultPurchaseOrderNumber: null,
        defaultContractTenderReference: null,
        peppolParticipantId: summary.profile.details.peppolParticipantId ?? null,
        registeredOnPeppol: consumer
          ? null
          : summary.profile.deliveryPreferences.sendingMethod === 'PEPPOL',
      },
      contact: {
        contactPerson: summary.profile.contact.contactPerson,
        roleTitle: consumer ? null : 'Accounts',
        emailRecipients: summary.profile.contact.emailRecipients,
        telephone: '+968 2456 7788',
        mobilePhone: '+968 9123 4567',
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
        emailPdfCopy: true,
        automaticPaymentReminders: true,
      },
      invoiceAddress: {
        attention: null,
        countryCode: 'OM',
        cityName: summary.profile.invoiceAddress.cityName,
        countrySubentity: 'Muscat Governorate',
        streetName: 'Way 3025',
        buildingNumber: '12',
        additionalStreetName: null,
        poBox: '1234',
        postalCode: '112',
      },
      sameAsInvoicingAddress: true,
      deliveryAddress: null,
      customerVisibleNote: null,
    },
  }
}

const SORTS = {
  NAME_ASC: (a, b) => a.displayName.localeCompare(b.displayName),
  NAME_DESC: (a, b) => b.displayName.localeCompare(a.displayName),
  RECENT: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
}

function springPage(all, query) {
  const size = Number(query.get('size') ?? 10)
  const number = Number(query.get('page') ?? 0)
  return {
    content: all.slice(number * size, number * size + size),
    number,
    size,
    totalElements: all.length,
    totalPages: Math.max(1, Math.ceil(all.length / size)),
  }
}

let nextCustomer = 1

export default [
  {
    match: '/api/v1/customers',
    reply: ({ query }) => {
      const type = query.get('type')
      const search = (query.get('search') ?? '').toLowerCase()
      const sort = SORTS[query.get('sort') ?? 'NAME_ASC'] ?? SORTS.NAME_ASC
      const rows = CUSTOMERS.filter(
        (c) =>
          (!type || c.type === type) && (!search || c.displayName.toLowerCase().includes(search)),
      ).sort(sort)
      return springPage(rows, query)
    },
  },
  { match: '/api/v1/customers/summary', reply: () => summary() },
  {
    match: '/api/v1/customers/receivables',
    reply: ({ query }) => ({
      currencyCode: 'OMR',
      asOf: NOW,
      items: query
        .getAll('customer_id')
        .filter((id) => RECEIVABLES[id])
        .map((id) => ({ customerId: id, ...RECEIVABLES[id] })),
    }),
  },
  {
    match: '/api/v1/customers/export',
    reply: () => ({ status: 200, body: 'name\n', headers: { 'Content-Type': 'text/csv' } }),
  },
  {
    method: 'POST',
    match: '/api/v1/customers',
    reply: ({ body }) => {
      const name =
        body.type === 'CONSUMER'
          ? [body.details.firstName, body.details.lastName].filter(Boolean).join(' ')
          : (body.details.legalRegisteredName ?? body.details.entityMinistryName)
      const created = customer(
        `c-new-${nextCustomer++}`,
        body.type,
        name,
        body.details.vatRegistrationNumber ?? null,
        body.deliveryPreferences.sendingMethod,
        body.contact.contactPerson,
        body.contact.emailRecipients?.[0] ?? null,
        body.invoiceAddress?.cityName ?? 'Muscat',
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
    method: 'PUT',
    match: /^\/api\/v1\/customers\/([^/]+)$/,
    reply: ({ params, body }) => {
      const found = CUSTOMERS.find((c) => c.id === params[0])
      return found ? record(found, (body?.expectedVersion ?? 1) + 1) : { status: 404 }
    },
  },
]
