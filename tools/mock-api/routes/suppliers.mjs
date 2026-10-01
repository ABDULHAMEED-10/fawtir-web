/**
 * Supplier directory fixtures (Figma section Suppliers, 163:25586): the list and its summary
 * (`GET /v1/suppliers`, `/summary`), one supplier's record for the edit form (`GET/PUT
 * /v1/suppliers/{id}`, `POST /v1/suppliers`, switch on/off, bank-details confirm), and the staged
 * import for suppliers and customers (`/v1/{suppliers|customers}/import/*`), in the shapes
 * `src/api/expenditure/suppliers.ts` and `src/api/counterpartyImport.ts` expect. Also answers
 * `/v1/reference-data` and `/v1/me/entitlements` so a run that loads only this module opens the
 * guarded shell.
 *
 * The record beyond the profile (overview, statement, purchase orders, record-a-bill) lives in
 * `supplierRecord.mjs`.
 *
 * The book is the design's: 68 suppliers, 61 active, 44 of them on Peppol, 11,247.880 owed across
 * 18 open bills, 6 records needing a fix. The frame's tab counts (Active 48, Needs fix 2, Not on
 * Peppol 5, Switched off 4) disagree with its own cards, so every count here is taken off one
 * population and the cards and tabs agree.
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
    'customer.manage',
    'customer.import',
    'supplier.read',
    'supplier.manage',
    'purchase-order.manage',
    'product.read',
    'branch.read',
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

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const terms = (paymentTerms, netDays, percent = null, days = null) => ({
  paymentTerms,
  netDays,
  earlyPaymentDiscountPercent: percent,
  earlyPaymentDiscountDays: days,
  earlyPaymentDiscount: percent === null ? null : `${percent}% within ${days} days`,
})

const record = (health, paidOnTime, settled, bankChangedAt = null) => ({
  health,
  paidOnTimeCount: paidOnTime,
  settledCount: settled,
  paidOnTime: `${paidOnTime} of ${settled}`,
  bankChangedAt,
})

/** The six rows the frame draws in full. */
const FEATURED = [
  {
    id: uuid(1),
    displayName: 'Muscat Roastery Co',
    vatNumber: 'OM1100447102',
    billingChannel: 'PEPPOL',
    participantId: '0248:OM1100447102',
    selfBilling: false,
    terms: terms('NET30', 30, 2, 7),
    youOwe: { amount: 2759.1, currency: 'OMR', openBills: 2, onHold: 0 },
    record: record([], 11, 11),
    status: 'ACTIVE',
    switchedOffAt: null,
  },
  {
    id: uuid(2),
    displayName: 'Gulf Cold Logistics',
    vatNumber: 'OM1100554027',
    billingChannel: 'PEPPOL',
    participantId: '0248:OM1100554027',
    selfBilling: false,
    terms: terms('NET30', 30),
    youOwe: { amount: 699.9, currency: 'OMR', openBills: 1, onHold: 1 },
    record: record(['BANK_CHANGED_UNCONFIRMED'], 8, 9, daysAgo(4)),
    status: 'ACTIVE',
    switchedOffAt: null,
  },
  {
    id: uuid(3),
    displayName: 'Sohar Packaging LLC',
    vatNumber: 'OM1100628391',
    billingChannel: 'PEPPOL',
    participantId: '0248:OM1100628391',
    selfBilling: true,
    terms: terms('NET10', 10),
    youOwe: { amount: 3140, currency: 'OMR', openBills: 1, onHold: 0 },
    record: record([], 9, 10),
    status: 'ACTIVE',
    switchedOffAt: null,
  },
  {
    id: uuid(4),
    displayName: 'Nizwa Hardware Store',
    vatNumber: null,
    billingChannel: 'PAPER',
    participantId: null,
    selfBilling: false,
    terms: terms('DUE_ON_RECEIPT', 0),
    youOwe: { amount: 191.72, currency: 'OMR', openBills: 1, onHold: 0 },
    record: record(['NO_VAT_NUMBER'], 5, 6),
    status: 'ACTIVE',
    switchedOffAt: null,
  },
  {
    id: uuid(5),
    displayName: 'Al Bahja Properties',
    vatNumber: 'OM1100201477',
    billingChannel: 'EMAIL_PDF',
    participantId: null,
    selfBilling: false,
    terms: terms('5th of month', null),
    youOwe: { amount: 0, currency: 'OMR', openBills: 0, onHold: 0 },
    record: record([], 12, 12),
    status: 'ACTIVE',
    switchedOffAt: null,
  },
  {
    id: uuid(6),
    displayName: 'Muttrah Roasters',
    vatNumber: null,
    billingChannel: 'EMAIL_PDF',
    participantId: null,
    selfBilling: false,
    terms: terms('NET30', 30),
    youOwe: { amount: 0, currency: 'OMR', openBills: 0, onHold: 0 },
    record: record([], 31, 31),
    status: 'SWITCHED_OFF',
    switchedOffAt: '2026-04-12T09:30:00Z',
  },
]

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

const FILLER_NAMES = [
  'Al Noor Dates LLC',
  'Mazoon Electricity',
  'Salalah Spice House',
  'Barka Glass Works',
  'Ibri Motors',
  'Seeb Stationery',
  'Duqm Steel',
  'Rustaq Textiles',
  'Sur Marine Supplies',
  'Bahla Pottery',
  'Ibra Dairy',
  'Khasab Cold Store',
  'Adam Agro',
  'Bidbid Bakery',
  'Samail Fruits',
  'Nakhal Water',
  'Quriyat Fisheries',
  'Jalan Furniture',
  'Shinas Cement',
  'Liwa Plastics',
  'Sohar Aluminium',
  'Falaj Print House',
  'Ghala Couriers',
  'Wadi Kabir Garage',
  'Athaiba Signs',
  'Qurum Cleaning',
  'Amerat Landscaping',
  'Ruwi Electricals',
  'Darsait Hardware',
  'Wattayah Tyres',
  'Azaiba Uniforms',
  'Bausher Security',
  'Misfah Honey',
  'Jabal Akhdar Farms',
  'Sinaw Livestock',
  'Buraimi Traders',
  'Yanqul Minerals',
  'Dhank Gravel',
  'Hamra Guides',
  'Manah Poultry',
  'Izki Olive Press',
  'Fanja Bricks',
  'Sumail Gypsum',
  'Halban Feeds',
  'Mabelah Packaging',
  'Seeb Signage',
  'Maabilah Coffee',
  'Ansab Recycling',
  'Rusayl Tooling',
  'Ghubrah Interiors',
  'Shatti Linens',
  'Madinat Catering',
  'Muttrah Souq Traders',
  'Sidab Boats',
  'Yiti Sands',
  'Bandar Jissah Resort',
  'Wadi Adai Motors',
  'Hail Al Awamir Transport',
  'Mawaleh Vegetables',
  'Barka Poultry',
  'Suwaiq Nets',
  'Musannah Timber',
]

/** Amounts for the further suppliers we owe, so the book comes to 11,247.880 across 18 bills. */
const OWED_FILLER = [
  { amount: 1284.5, bills: 3 },
  { amount: 962.34, bills: 3 },
  { amount: 845.0, bills: 3 },
  { amount: 810.226, bills: 2 },
  { amount: 555.094, bills: 2 },
]

const FILLER = FILLER_NAMES.map((name, index) => {
  // 7 switched off in total, one featured, so six more from the tail.
  const switchedOff = index >= FILLER_NAMES.length - 6
  // Needs a fix: 3 with no bank details, 2 missing VAT, 1 changed account. One changed account and
  // one missing VAT are featured, so three no-bank and one no-VAT are here.
  const health = switchedOff
    ? []
    : index < 3
      ? ['NO_BANK_DETAILS']
      : index === 3
        ? ['NO_VAT_NUMBER']
        : []
  // 44 of the 61 active are on Peppol: 3 featured + 41 here; 17 are not: 2 featured + 15 here.
  const onPeppol = !switchedOff && index >= 4 && index < 45
  const owed = OWED_FILLER[index]
  const vat = health.includes('NO_VAT_NUMBER')
    ? null
    : `OM11${String(200000 + index * 137).slice(0, 8)}`
  return {
    id: uuid(10 + index),
    displayName: name,
    vatNumber: vat,
    billingChannel: onPeppol ? 'PEPPOL' : index % 2 === 0 ? 'EMAIL_PDF' : 'PAPER',
    participantId: onPeppol ? `0248:${vat}` : null,
    selfBilling: false,
    terms: terms('NET30', 30),
    youOwe: {
      amount: owed?.amount ?? 0,
      currency: 'OMR',
      openBills: owed?.bills ?? 0,
      onHold: 0,
    },
    record: record(health, 4 + (index % 5), 5 + (index % 5)),
    status: switchedOff ? 'SWITCHED_OFF' : 'ACTIVE',
    switchedOffAt: switchedOff ? `2026-0${1 + (index % 6)}-1${index % 9}T10:00:00Z` : null,
  }
})

const SUPPLIERS = [...FEATURED, ...FILLER]

const needsFix = (row) => row.status === 'ACTIVE' && row.record.health.length > 0

function summary() {
  const active = SUPPLIERS.filter((row) => row.status === 'ACTIVE')
  const off = SUPPLIERS.filter((row) => row.status === 'SWITCHED_OFF')
  const onPeppol = active.filter((row) => row.billingChannel === 'PEPPOL')
  const owed = SUPPLIERS.filter((row) => row.youOwe.amount > 0)
  const fix = SUPPLIERS.filter(needsFix)
  const has = (flag) => fix.filter((row) => row.record.health.includes(flag)).length
  return {
    currencyCode: 'OMR',
    total: SUPPLIERS.length,
    active: active.length,
    switchedOff: off.length,
    onPeppol: onPeppol.length,
    notOnPeppol: active.length - onPeppol.length,
    owedTotal: Math.round(owed.reduce((sum, row) => sum + row.youOwe.amount, 0) * 1000) / 1000,
    openBills: owed.reduce((sum, row) => sum + row.youOwe.openBills, 0),
    needsFix: {
      noBankDetails: has('NO_BANK_DETAILS'),
      noVat: has('NO_VAT_NUMBER'),
      bankChanged: has('BANK_CHANGED_UNCONFIRMED'),
    },
    owedSuppliers: owed.length,
    needsFixSuppliers: fix.length,
  }
}

const FILTERS = {
  ACTIVE: (row) => row.status === 'ACTIVE',
  NEEDS_FIX: needsFix,
  OWED: (row) => row.youOwe.amount > 0,
  NOT_ON_PEPPOL: (row) => row.status === 'ACTIVE' && row.billingChannel !== 'PEPPOL',
  SWITCHED_OFF: (row) => row.status === 'SWITCHED_OFF',
}

function listPage(query) {
  const filter = FILTERS[query.get('filter') ?? ''] ?? (() => true)
  const q = (query.get('q') ?? '').trim().toLowerCase()
  const sort = query.get('sort')
  const page = Number(query.get('page') ?? 0)
  const pageSize = Number(query.get('page_size') ?? 10)
  let rows = SUPPLIERS.filter(filter)
  if (q) {
    rows = rows.filter(
      (row) =>
        row.displayName.toLowerCase().includes(q) ||
        (row.vatNumber ?? '').toLowerCase().includes(q),
    )
  }
  if (sort === 'OWED_DESC') rows = [...rows].sort((a, b) => b.youOwe.amount - a.youOwe.amount)
  else if (sort === 'OWED_ASC') rows = [...rows].sort((a, b) => a.youOwe.amount - b.youOwe.amount)
  else if (query.get('filter'))
    rows = [...rows].sort((a, b) => a.displayName.localeCompare(b.displayName))
  const items = rows.slice(page * pageSize, (page + 1) * pageSize)
  return { items, page, pageSize, count: items.length, total: rows.length }
}

/* -------------------------------------------------------------------- detail */

const byId = (id) => SUPPLIERS.find((row) => row.id === id)

/** Recorded on the profile only: what the list row does not carry. */
const PROFILE_EXTRA = {
  [uuid(1)]: {
    legalName: 'Muscat Roastery Co LLC',
    commercialRegistrationNumber: '1104472',
    bankDetails: {
      beneficiaryName: 'Muscat Roastery Co LLC',
      iban: 'OM550018000044712290',
      bic: 'BMUSOMRX',
      bankName: 'Bank Muscat',
      changedAt: '2026-01-14T09:12:00Z',
      confirmedAt: '2026-01-14T09:40:00Z',
    },
    contactPerson: 'Ahmed Al Harthy',
    emailRecipients: ['ahmed@muscatroastery.om'],
    telephone: '+96891232290',
    supplierCategory: 'Raw materials',
    supplierSince: '2024-09-02',
    invoiceAddress: {
      attention: null,
      countryCode: 'OM',
      cityName: 'Muscat',
      countrySubentity: 'Muscat',
      streetName: 'Rusayl Industrial Estate',
      buildingNumber: null,
      additionalStreetName: null,
      poBox: null,
      postalCode: '124',
    },
  },
  [uuid(2)]: {
    legalName: 'Gulf Cold Logistics LLC',
    commercialRegistrationNumber: '1298811',
    bankDetails: {
      beneficiaryName: 'Gulf Cold Logistics LLC',
      iban: 'OM230270000098765432101',
      bic: 'NBOMOMRX',
      bankName: 'National Bank of Oman',
      changedAt: daysAgo(4),
      confirmedAt: null,
    },
    contactPerson: 'Salim Al Rawahi',
    emailRecipients: ['accounts@gulfcold.om'],
    telephone: '+96824551900',
    supplierCategory: 'Logistics',
    supplierSince: '2025-03-11',
    invoiceAddress: {
      attention: null,
      countryCode: 'OM',
      cityName: 'Sohar',
      countrySubentity: 'North Batinah',
      streetName: 'Port Road',
      buildingNumber: '12',
      additionalStreetName: null,
      poBox: null,
      postalCode: '311',
    },
  },
}

const versions = new Map()

function detail(row) {
  const extra = PROFILE_EXTRA[row.id] ?? {}
  const [scheme, value] = row.participantId ? row.participantId.split(':') : [null, null]
  return {
    profile: {
      id: row.id,
      type: 'BUSINESS',
      displayName: row.displayName,
      legalName: extra.legalName ?? `${row.displayName} LLC`,
      vatNumber: row.vatNumber,
      registeredForVat: row.vatNumber !== null,
      registeredOnPeppol: row.participantId !== null,
      participantScheme: scheme,
      participantValue: value,
      participantId: row.participantId,
      defaultCurrency: 'OMR',
      defaultTaxCategory: 'S5',
      paymentTerms: row.terms.paymentTerms,
      defaultPaymentMethod: '30',
      bankDetails:
        extra.bankDetails ??
        // As the backend does: no account on file is an object of nulls, never null.
        (row.record.health.includes('NO_BANK_DETAILS')
          ? {
              beneficiaryName: null,
              iban: null,
              bic: null,
              bankName: null,
              changedAt: null,
              confirmedAt: null,
            }
          : {
              beneficiaryName: row.displayName,
              iban: `OM81018000001234${String(row.id).slice(-7)}`,
              bic: 'BMUSOMRX',
              bankName: 'Bank Muscat',
              changedAt: null,
              confirmedAt: null,
            }),
      contactPerson: extra.contactPerson ?? 'Accounts team',
      roleTitle: null,
      emailRecipients: extra.emailRecipients ?? [
        `ap@${row.displayName.split(' ')[0].toLowerCase()}.om`,
      ],
      telephone: extra.telephone ?? '+96824000000',
      mobilePhone: null,
      preferredLanguage: 'en',
      receivingChannel: row.billingChannel,
      requiresApprovalBeforePayment: true,
      earlyPaymentDiscountPercent: row.terms.earlyPaymentDiscountPercent,
      earlyPaymentDiscountDays: row.terms.earlyPaymentDiscountDays,
      commercialRegistrationNumber: extra.commercialRegistrationNumber ?? null,
      notes: null,
      supplierCategory: extra.supplierCategory ?? null,
      selfBillingAgreement: row.selfBilling,
      health: row.record.health,
      supplierSince: extra.supplierSince ?? '2025-06-01',
      switchedOffAt: row.switchedOffAt,
      status: row.status,
      customerStatus: 'ACTIVE',
      version: versions.get(row.id) ?? 3,
    },
    invoiceAddress: extra.invoiceAddress ?? null,
    sameAsInvoicingAddress: true,
    deliveryAddress: null,
  }
}

function applyRequest(row, body) {
  row.displayName = body.legalName || row.displayName
  row.vatNumber = body.registeredForVat ? (body.vatNumber ?? null) : null
  row.participantId =
    body.registeredOnPeppol && body.participantScheme && body.participantValue
      ? `${body.participantScheme}:${body.participantValue}`
      : null
  row.billingChannel = body.receivingChannel ?? row.billingChannel
  row.terms = terms(
    body.paymentTerms,
    /^NET(\d+)$/.test(body.paymentTerms ?? '') ? Number(body.paymentTerms.slice(3)) : null,
    body.earlyPaymentDiscountPercent,
    body.earlyPaymentDiscountDays,
  )
  const extra = (PROFILE_EXTRA[row.id] ??= {})
  extra.legalName = body.legalName
  extra.commercialRegistrationNumber = body.commercialRegistrationNumber
  extra.contactPerson = body.contactPerson
  extra.emailRecipients = body.emailRecipients
  extra.telephone = body.telephone
  extra.supplierCategory = body.supplierCategory
  extra.invoiceAddress = body.invoiceAddress
  if (body.bankDetails) {
    extra.bankDetails = {
      ...body.bankDetails,
      changedAt: new Date().toISOString(),
      confirmedAt: null,
    }
    row.record.health = [...new Set([...row.record.health, 'BANK_CHANGED_UNCONFIRMED'])]
    row.record.bankChangedAt = extra.bankDetails.changedAt
  }
  row.record.health = row.record.health.filter((flag) => flag !== 'NO_VAT_NUMBER')
  if (!row.vatNumber) row.record.health.push('NO_VAT_NUMBER')
  versions.set(row.id, (versions.get(row.id) ?? 3) + 1)
}

/* -------------------------------------------------------------------- import */

const BATCH_ID = '7f1d3d4e-2b6a-4d51-8b3c-7c6a19f0a111'

const importRow = (rowNumber, displayName, severity, field, message, extra = {}) => ({
  rowNumber,
  displayName,
  severity,
  field,
  message,
  cells: [],
  outcome: null,
  outcomeMessage: null,
  ...extra,
})

const READY_NAMES = [
  'Al Noor Dates LLC',
  'Mazoon Electricity',
  'Salalah Spice House',
  'Barka Glass Works',
  'Ibri Motors',
  'Seeb Stationery',
  'Duqm Steel',
  'Rustaq Textiles',
  'Sur Marine Supplies',
  'Bahla Pottery',
  'Ibra Dairy',
  'Khasab Cold Store',
  'Adam Agro',
  'Bidbid Bakery',
  'Samail Fruits',
  'Nakhal Water',
  'Quriyat Fisheries',
  'Jalan Furniture',
  'Shinas Cement',
  'Liwa Plastics',
  'Sohar Aluminium',
  'Falaj Print House',
  'Ghala Couriers',
  'Wadi Kabir Garage',
  'Athaiba Signs',
  'Qurum Cleaning',
  'Amerat Landscaping',
  'Ruwi Electricals',
  'Darsait Hardware',
  'Wattayah Tyres',
  'Azaiba Uniforms',
  'Bausher Security',
  'Misfah Honey',
  'Jabal Akhdar Farms',
  'Sinaw Livestock',
  'Buraimi Traders',
  'Yanqul Minerals',
  'Dhank Gravel',
  'Hamra Guides',
  'Manah Poultry',
  'Izki Olive Press',
]

const PROBLEM_ROWS = [
  importRow(
    7,
    'Rustaq Timber Trading',
    'CANNOT_IMPORT',
    'vatRegistrationNumber',
    'Ten digits, an Oman VATIN has twelve. Two look to have been cut off.',
    {
      summary: 'Net 30 · rustaq@timber.om',
      value: 'OM11004471',
    },
  ),
  importRow(
    14,
    'Barka Chemical Supplies',
    'CANNOT_IMPORT',
    'peppolParticipantId',
    'No scheme in front of it. Should read 0248:OM1100883412.',
    {
      summary: 'Net 45 · no email given',
      value: 'OM1100883412',
    },
  ),
  importRow(
    28,
    null,
    'CANNOT_IMPORT',
    'legalRegisteredName',
    "No name at all. A supplier can't be saved without one.",
    {
      summary: 'VAT OM1100774209 · Net 30',
      value: '',
    },
  ),
  importRow(
    39,
    'Salalah Spice Company',
    'CANNOT_IMPORT',
    'paymentTerms',
    'Not one of the terms Fawtir knows. Did you mean Net 30?',
    {
      summary: 'VAT OM1100992018',
      value: '30 days nett',
    },
  ),
  importRow(
    3,
    'Sohar Packaging LLC',
    'NEEDS_A_LOOK',
    'vatRegistrationNumber',
    'A counterparty with this VAT number is already on file',
    {
      summary: 'VAT OM1100628391 · Net 10',
      value: 'OM1100628391',
    },
  ),
  importRow(
    21,
    'Ibri Electrical Works',
    'NEEDS_A_LOOK',
    'bankIban',
    "Will import, but they can't go in a payment run until an account is added.",
    {
      summary: 'VAT OM1100337715 · Net 30',
      value: '',
    },
  ),
  importRow(
    33,
    'Nizwa Date Farms',
    'NEEDS_A_LOOK',
    'emailRecipients',
    'No email address. Their bills will have to be typed in.',
    {
      summary: 'VAT OM1100118824 · Net 30',
      value: '',
    },
  ),
  importRow(
    35,
    'Sur Fishing Cooperative',
    'NEEDS_A_LOOK',
    'peppolParticipantId',
    'A counterparty with this Peppol identifier is already on file',
    {
      summary: 'VAT OM1100220417 · On receipt',
      value: '0248:OM1100220417',
    },
  ),
  importRow(
    44,
    'Muscat Office Supplies',
    'NEEDS_A_LOOK',
    'bankIban',
    "Will import, but they can't go in a payment run until an account is added.",
    {
      summary: 'VAT OM1100931180 · Net 30',
      value: '',
    },
  ),
  importRow(
    47,
    'Bahla Ceramics',
    'NEEDS_A_LOOK',
    'vatRegistrationNumber',
    'No VAT number. Their VAT cannot be reclaimed until one is added.',
    {
      summary: 'Net 30 · sales@bahlaceramics.om',
      value: '',
    },
  ),
  importRow(
    50,
    'Sohar Port Services',
    'NEEDS_A_LOOK',
    'telephone',
    'Not a phone number Fawtir can dial. It will be kept as typed.',
    {
      summary: 'VAT OM1100774411 · Net 60',
      value: '24 5511',
    },
  ),
]

const READY_ROWS = READY_NAMES.map((name, index) => {
  // Row numbers the problem rows do not take, in file order.
  const taken = new Set(PROBLEM_ROWS.map((row) => row.rowNumber))
  let rowNumber = 2
  let seen = -1
  while (seen < index) {
    if (!taken.has(rowNumber)) seen += 1
    if (seen < index) rowNumber += 1
  }
  return importRow(rowNumber, name, 'READY', null, null, {
    summary: `VAT OM11${String(300000 + index * 211).slice(0, 8)} · Net 30`,
  })
})

const batches = new Map()

function batch(target, filename) {
  const rows = [...PROBLEM_ROWS, ...READY_ROWS].sort((a, b) => a.rowNumber - b.rowNumber)
  const counts = {
    ready: rows.filter((row) => row.severity === 'READY').length,
    needsALook: rows.filter((row) => row.severity === 'NEEDS_A_LOOK').length,
    cannotImport: rows.filter((row) => row.severity === 'CANNOT_IMPORT').length,
    wouldImport: rows.filter((row) => row.severity !== 'CANNOT_IMPORT').length,
    onPeppol: 33,
  }
  return {
    id: BATCH_ID,
    target,
    state: 'CHECKED',
    filename,
    fileSha256: 'a'.repeat(64),
    totalRows: rows.length,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    committedAt: null,
    rows,
    counts,
  }
}

const TEMPLATE_CSV =
  'customerType,legalRegisteredName,vatRegistrationNumber,peppolParticipantId,paymentTerms,emailRecipients,telephone\n'

function importRoutes(prefix, target) {
  const base = `/api/v1/${prefix}/import`
  return [
    {
      match: `${base}/template`,
      reply: () => ({
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="fawtir-${prefix}-template.csv"`,
        },
        body: TEMPLATE_CSV,
      }),
    },
    {
      method: 'POST',
      match: `${base}/check`,
      reply: () => {
        const checked = batch(target, `${prefix}.csv`)
        batches.set(checked.id, checked)
        return checked
      },
    },
    {
      match: new RegExp(`^${base}/([^/]+)/failed\\.csv$`),
      reply: () => ({
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${prefix}-rows-that-failed.csv"`,
        },
        body: TEMPLATE_CSV,
      }),
    },
    {
      method: 'POST',
      match: new RegExp(`^${base}/([^/]+)/commit$`),
      reply: ({ params, body }) => {
        const found = batches.get(params[0]) ?? batch(target, `${prefix}.csv`)
        const importable = found.rows.filter((row) => row.severity !== 'CANNOT_IMPORT')
        const chosen = Array.isArray(body?.rowNumbers)
          ? importable.filter((row) => body.rowNumbers.includes(row.rowNumber))
          : importable
        found.state = 'COMMITTED'
        found.committedAt = new Date().toISOString()
        return {
          batchId: found.id,
          selected: chosen.length,
          created: chosen.length,
          skipped: found.totalRows - chosen.length,
        }
      },
    },
    {
      match: new RegExp(`^${base}/([^/]+)$`),
      reply: ({ params }) => {
        const found = batches.get(params[0])
        if (found) return found
        if (params[0] === BATCH_ID) {
          const fresh = batch(target, `${prefix}.csv`)
          batches.set(fresh.id, fresh)
          return fresh
        }
        return { status: 404 }
      },
    },
  ]
}

/* ---------------------------------------------------------------------- routes */

export default [
  { match: '/api/v1/me/entitlements', reply: () => ENTITLEMENTS },
  { match: '/api/v1/reference-data', reply: () => REFERENCE_DATA },

  // Before the `/suppliers/{id}` routes: `import` and `summary` are not ids.
  ...importRoutes('suppliers', 'SUPPLIER'),
  ...importRoutes('customers', 'CUSTOMER'),

  { match: '/api/v1/suppliers/summary', reply: () => summary() },
  { match: '/api/v1/suppliers', reply: ({ query }) => listPage(query) },
  {
    method: 'POST',
    match: '/api/v1/suppliers',
    reply: ({ body }) => {
      const row = {
        id: uuid(900 + SUPPLIERS.length),
        displayName: body.legalName,
        vatNumber: null,
        billingChannel: 'PEPPOL',
        participantId: null,
        selfBilling: false,
        terms: terms('NET30', 30),
        youOwe: { amount: 0, currency: 'OMR', openBills: 0, onHold: 0 },
        record: record(body.bankDetails ? [] : ['NO_BANK_DETAILS'], 0, 0),
        status: 'ACTIVE',
        switchedOffAt: null,
      }
      SUPPLIERS.push(row)
      applyRequest(row, body)
      return { status: 201, body: detail(row) }
    },
  },
  {
    match: /^\/api\/v1\/suppliers\/([^/]+)$/,
    reply: ({ params }) => {
      const row = byId(params[0])
      return row ? detail(row) : { status: 404 }
    },
  },
  {
    method: 'PUT',
    match: /^\/api\/v1\/suppliers\/([^/]+)$/,
    reply: ({ params, body }) => {
      const row = byId(params[0])
      if (!row) return { status: 404 }
      if (body.version !== undefined && body.version !== (versions.get(row.id) ?? 3)) {
        return {
          status: 409,
          body: { type: 'https://api.fawtir.om/problems/resource-conflict', status: 409 },
        }
      }
      applyRequest(row, body)
      return detail(row)
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/suppliers\/([^/]+)\/switch-(off|on)$/,
    reply: ({ params }) => {
      const row = byId(params[0])
      if (!row) return { status: 404 }
      row.status = params[1] === 'off' ? 'SWITCHED_OFF' : 'ACTIVE'
      row.switchedOffAt = params[1] === 'off' ? new Date().toISOString() : null
      return detail(row)
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/suppliers\/([^/]+)\/bank-details\/confirm$/,
    reply: ({ params }) => {
      const row = byId(params[0])
      if (!row) return { status: 404 }
      row.record.health = row.record.health.filter((flag) => flag !== 'BANK_CHANGED_UNCONFIRMED')
      row.record.bankChangedAt = null
      const extra = PROFILE_EXTRA[row.id]
      if (extra?.bankDetails) extra.bankDetails.confirmedAt = new Date().toISOString()
      return detail(row)
    },
  },
]
