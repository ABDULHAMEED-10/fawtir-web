/**
 * Invoice import (the Invoices list's Bulk upload dialog), in the shapes of
 * `src/api/invoices/import.ts`. The backend has none of these routes yet (INCOME.md rows I.1 to I.10).
 *
 * The mock cannot read the multipart file, so it walks the guide's story instead: the first file
 * checked has problems, and the corrected one after it previews cleanly with two descriptions to
 * classify. Creating then answers the drafts at once. The template and report are not mocked.
 */

let checks = 0
const batches = new Map()

const BASE = {
  kind: 'BUSINESS',
  filename: 'september-invoices.xlsx',
  fileSha256: '9f2c1e7ab04d5c3e8a61f7d2b9c04e5a1d3f6b8c2e7a9d0f1b4c6e8a2d5f7b9c',
  duplicateOf: null,
  totalRows: 12,
  processedRows: 12,
  errors: [],
  summary: null,
  inferred: [],
  unresolved: [],
  warnings: [],
  created: [],
}

const ERRORS = [
  {
    rowNumber: 14,
    column: 'Unit',
    message: 'KG is not a valid unit. Did you mean KGM for kilogram?',
  },
  {
    rowNumber: 22,
    column: 'Customer',
    message: 'No customer named Al Noor Trading. Check the spelling or create the customer first.',
  },
  { rowNumber: 31, column: 'Price', message: 'Price cannot be negative.' },
  {
    rowNumber: 47,
    column: 'Reference',
    message: 'This reference appears on rows 47 and 63 with different customers.',
  },
]

const SUMMARY = {
  invoices: 4,
  lines: 12,
  total: 2847.35,
  byCustomer: [
    { customerName: 'Muscat Grand Hotel LLC', invoices: 2, total: 1640.25 },
    { customerName: 'Nizwa Souq Café', invoices: 1, total: 732.6 },
    { customerName: 'Sohar Grand Mall', invoices: 1, total: 474.5 },
  ],
}

const INFERRED = [
  {
    rowNumbers: [3, 4],
    column: 'Description',
    value: 'Arabica beans 1kg',
    matchedTo: 'Arabica coffee beans, 1 kg (catalogue)',
  },
  { rowNumbers: [9], column: 'Customer', value: 'Nizwa Souq Cafe', matchedTo: 'Nizwa Souq Café' },
]

/** Non-blocking: a blank TAX_CATEGORY cell read as standard rate. */
const WARNINGS = [
  {
    rowNumbers: [6, 7],
    column: 'TAX_CATEGORY',
    code: 'TAX_CATEGORY_DEFAULTED',
    message: 'No VAT category was given, so this line was set to standard rate (5%).',
  },
]

const UNRESOLVED = [
  { description: 'Cardamom syrup 750 ml', itemType: 'GOODS', rowCount: 3 },
  { description: 'Barista training session', itemType: 'SERVICE', rowCount: 1 },
]

const CREATED = [
  {
    reference: 'SEP-001',
    invoiceId: 'd-imp-1',
    draftNumber: null,
    customerName: 'Muscat Grand Hotel LLC',
    total: 1020.0,
  },
  {
    reference: 'SEP-002',
    invoiceId: 'd-imp-2',
    draftNumber: null,
    customerName: 'Muscat Grand Hotel LLC',
    total: 620.25,
  },
  {
    reference: 'SEP-003',
    invoiceId: 'd-imp-3',
    draftNumber: null,
    customerName: 'Nizwa Souq Café',
    total: 732.6,
  },
  {
    reference: 'SEP-004',
    invoiceId: 'd-imp-4',
    draftNumber: null,
    customerName: 'Sohar Grand Mall',
    total: 474.5,
  },
]

function check() {
  checks += 1
  const id = `imp-${checks}`
  const batch =
    checks % 2 === 1
      ? { ...BASE, id, state: 'CHECKED', totalRows: 64, processedRows: 64, errors: ERRORS }
      : {
          ...BASE,
          id,
          filename: 'september-invoices-corrected.xlsx',
          state: 'CHECKED',
          summary: SUMMARY,
          inferred: INFERRED,
          unresolved: UNRESOLVED,
          warnings: WARNINGS,
        }
  batches.set(id, batch)
  return batch
}

export default [
  { method: 'POST', match: '/api/v1/invoices/import/check', reply: () => check() },
  {
    match: /^\/api\/v1\/invoices\/import\/([^/]+)$/,
    reply: ({ params }) => batches.get(params[0]) ?? { status: 404 },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/invoices\/import\/([^/]+)\/commit$/,
    reply: ({ params }) => {
      const batch = batches.get(params[0])
      if (!batch) return { status: 404 }
      const done = { ...batch, state: 'CREATED', created: CREATED }
      batches.set(batch.id, done)
      return done
    },
  },
  {
    method: 'DELETE',
    match: /^\/api\/v1\/invoices\/import\/([^/]+)$/,
    reply: ({ params }) => {
      batches.delete(params[0])
      return { status: 204 }
    },
  },
]
