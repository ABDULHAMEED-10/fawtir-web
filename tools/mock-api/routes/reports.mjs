/**
 * Reports (src/api/reports/reports.ts): the volume, expenditure, cash-flow and VAT reports and
 * the Lists catalogue, for Al Bahja Coffee from January 2024 to today.
 *
 * One set of monthly figures is stated and every bucket and grouping is cut from it, so the
 * report pages agree with one another the way the real ledgers would: the VAT report's output is
 * 5% of the volume report's standard-rated sales, its input is the expenditure report's VAT, and
 * a grouping always adds back up to the ungrouped total.
 */

const FIRST = { year: 2024, month: 0 }

const pad = (n) => String(n).padStart(2, '0')
const keyOf = (year, month) => `${year}-${pad(month + 1)}`
const round3 = (n) => Math.round(n * 1000) / 1000

/** Every month from January 2024 to the current one, with the share of it that has passed. */
function months() {
  const now = new Date()
  const list = []
  for (
    let y = FIRST.year, m = FIRST.month;
    y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth());
  ) {
    const days = new Date(y, m + 1, 0).getDate()
    const current = y === now.getFullYear() && m === now.getMonth()
    list.push({ key: keyOf(y, m), year: y, month: m, elapsed: current ? now.getDate() / days : 1 })
    m += 1
    if (m === 12) {
      m = 0
      y += 1
    }
  }
  return list
}

/** Seasonal wave plus steady growth: winter and Ramadan-season peaks, a July best month. */
const SEASON = [0.86, 0.95, 1.05, 0.98, 1.02, 1.08, 1.18, 0.9, 0.95, 0.92, 1.0, 1.12]
function trend(index, base, growth) {
  return base * (1 + growth * index) * SEASON[index % 12]
}

function monthFigures() {
  return months().map((entry, index) => {
    const incomeNet = trend(index, 11_200, 0.021) * entry.elapsed
    const spendNet =
      trend(index, 7_900, 0.017) * (1.03 - (0.06 * ((index * 7) % 5)) / 4) * entry.elapsed
    return {
      ...entry,
      incomeNet,
      incomeDocs: Math.round((incomeNet / 118) * (0.96 + ((index * 13) % 7) / 100)),
      cancelled: index % 5 === 0 ? 2 : index % 3 === 0 ? 1 : 0,
      spendNet,
      bills: Math.round((spendNet / 70) * (0.95 + ((index * 11) % 9) / 100)),
      received: incomeNet * 1.05 * (0.92 + ((index * 5) % 7) / 60),
      paidOut: spendNet * 1.05 * (0.97 + ((index * 3) % 5) / 50),
    }
  })
}

/* ------------------------------------------------------------------ buckets */

function bucketOf(entry, granularity) {
  if (granularity === 'YEAR') {
    return { period: String(entry.year), start: `${entry.year}-01-01`, end: `${entry.year}-12-31` }
  }
  if (granularity === 'QUARTER') {
    const q = Math.floor(entry.month / 3)
    const endMonth = q * 3 + 3
    return {
      period: `${entry.year}-Q${q + 1}`,
      start: `${entry.year}-${pad(q * 3 + 1)}-01`,
      end: `${entry.year}-${pad(endMonth)}-${pad(new Date(entry.year, endMonth, 0).getDate())}`,
    }
  }
  return {
    period: entry.key,
    start: `${entry.key}-01`,
    end: `${entry.key}-${pad(new Date(entry.year, entry.month + 1, 0).getDate())}`,
  }
}

/** The months inside [from, to], each with the bucket it falls in. */
function inRange(query) {
  const from = query.get('from') ?? '0000-01-01'
  const to = query.get('to') ?? '9999-12-31'
  const granularity = query.get('granularity') ?? 'MONTH'
  return monthFigures()
    .filter((entry) => `${entry.key}-31` >= from && `${entry.key}-01` <= to)
    .map((entry) => ({ entry, bucket: bucketOf(entry, granularity) }))
}

/** Adds rows that share a bucket and group together, summing every numeric field. */
function collapse(rows, keyFields) {
  const map = new Map()
  for (const row of rows) {
    const id = keyFields.map((field) => row[field]).join('|')
    const found = map.get(id)
    if (!found) {
      map.set(id, { ...row })
      continue
    }
    for (const [field, value] of Object.entries(row)) {
      if (typeof value === 'number' && !keyFields.includes(field)) found[field] += value
    }
  }
  return [...map.values()]
}

const rounded = (row, fields) => {
  for (const field of fields) row[field] = round3(row[field])
  return row
}

/* ---------------------------------------------------------------- groupings */

const CUSTOMERS = [
  ['c-nizwa', 'Nizwa Souq Café', 0.22],
  ['c-barka', 'Barka Beach Resort', 0.17],
  ['c-grand', 'Muscat Grand Hotel', 0.13],
  ['c-mouj', 'Al Mouj Marina', 0.1],
  ['c-sohar', 'Sohar Coffee House', 0.08],
  ['c-sur', 'Sur Corniche Bakery', 0.07],
  ['c-salalah', 'Salalah Garden Café', 0.06],
  ['c-ibri', 'Ibri Road Stop', 0.05],
  ['c-rustaq', 'Rustaq Fort Kitchen', 0.04],
  ['c-other', 'Walk-in customers', 0.08],
]

const SUPPLIERS = [
  ['s-roastery', 'Muscat Roastery', 0.32],
  ['s-packaging', 'Sohar Packaging', 0.16],
  ['s-cold', 'Gulf Cold Logistics', 0.11],
  ['s-dates', 'Al Noor Dates', 0.08],
  ['s-mazoon', 'Mazoon Electricity', 0.07],
  ['s-dairy', 'Dhofar Dairy', 0.1],
  ['s-cups', 'Oman Paper Cups', 0.06],
  ['s-water', 'Nama Water Services', 0.05],
  ['s-glass', 'Ruwi Glassware', 0.05],
]

/** Category is free text on a bill; the empty key is every bill nobody categorised. */
const CATEGORIES = [
  ['Raw materials', 0.46],
  ['Packaging', 0.16],
  ['Logistics', 0.12],
  ['Utilities', 0.07],
  ['Rent & premises', 0.1],
  ['', 0.09],
]

/** Peppol grows through 2026 while uploads and scans fall. */
function sourceShares(entry) {
  const index = (entry.year - FIRST.year) * 12 + entry.month
  const peppol = Math.min(0.8, 0.34 + index * 0.012)
  const scanned = Math.max(0.05, 0.2 - index * 0.004)
  return [
    ['PEPPOL', peppol],
    ['UPLOADED', 1 - peppol - scanned],
    ['SCANNED', scanned],
  ]
}

/* ------------------------------------------------------------------ reports */

function volume(query) {
  const groupBy = query.get('group_by') ?? 'NONE'
  const raw = []
  for (const { entry, bucket } of inRange(query)) {
    const base = {
      period: bucket.period,
      periodStart: bucket.start,
      periodEnd: bucket.end,
      currency: 'OMR',
    }
    const parts =
      groupBy === 'CUSTOMER'
        ? CUSTOMERS.map(([key, label, share]) => [key, label, share])
        : groupBy === 'TYPE'
          ? // Invoices, debit notes and credit notes, and the tenant's own self-billed documents
            // (issued as the buyer, so purchases). The shares still add up to the whole.
            [
              ['380', 'Invoice', 0.99],
              ['383', 'Debit note', 0.02],
              ['381', 'Credit note', -0.03],
              ['389', 'Self-billed invoice', 0.03],
              ['261', 'Self-billed credit note', -0.01],
            ]
          : groupBy === 'BRANCH'
            ? [
                ['b-muscat', 'Muscat', 0.7],
                ['b-nizwa', 'Nizwa', 0.3],
              ]
            : [[null, null, 1]]
    for (const [key, label, share] of parts) {
      const taxable = entry.incomeNet * share
      // A little of the trade is zero-rated exports, taxed at nothing.
      const vat = taxable * 0.05 * 0.96
      raw.push({
        ...base,
        groupKey: key,
        groupLabel: label,
        documents: Math.max(0, Math.round(entry.incomeDocs * Math.abs(share))),
        taxableAmount: taxable,
        vatAmount: vat,
        totalAmount: taxable + vat,
        cancelled: key === null || key === 'c-other' ? entry.cancelled : 0,
      })
    }
  }
  const rows = collapse(raw, ['period', 'groupKey']).map((row) =>
    rounded(row, ['taxableAmount', 'vatAmount', 'totalAmount']),
  )
  return {
    from: query.get('from'),
    to: query.get('to'),
    granularity: query.get('granularity') ?? 'MONTH',
    groupBy,
    rows,
    totals: [totalOf(rows, ['documents', 'taxableAmount', 'vatAmount', 'totalAmount'])],
  }
}

function totalOf(rows, fields) {
  const total = { currency: 'OMR' }
  for (const field of fields) total[field] = round3(rows.reduce((sum, row) => sum + row[field], 0))
  return total
}

function expenditure(query) {
  const groupBy = query.get('group_by') ?? 'NONE'
  const raw = []
  for (const { entry, bucket } of inRange(query)) {
    const base = {
      period: bucket.period,
      periodStart: bucket.start,
      periodEnd: bucket.end,
      currency: 'OMR',
    }
    const parts =
      groupBy === 'SUPPLIER'
        ? SUPPLIERS
        : groupBy === 'CATEGORY'
          ? CATEGORIES.map(([label, share]) => [label, label, share])
          : groupBy === 'SOURCE'
            ? sourceShares(entry).map(([key, share]) => [key, key, share])
            : [['', '', 1]]
    for (const [key, label, share] of parts) {
      const net = entry.spendNet * share
      const vat = net * 0.05
      raw.push({
        ...base,
        groupKey: key,
        groupLabel: label,
        documents: Math.round(entry.bills * share),
        netAmount: net,
        vatAmount: vat,
        totalAmount: net + vat,
      })
    }
  }
  const rows = collapse(raw, ['period', 'groupKey']).map((row) =>
    rounded(row, ['netAmount', 'vatAmount', 'totalAmount']),
  )
  return {
    from: query.get('from'),
    to: query.get('to'),
    granularity: query.get('granularity') ?? 'MONTH',
    groupBy,
    rows,
    totals: [totalOf(rows, ['documents', 'netAmount', 'vatAmount', 'totalAmount'])],
  }
}

function cashFlow(query) {
  const raw = inRange(query).map(({ entry, bucket }) => ({
    period: bucket.period,
    periodStart: bucket.start,
    periodEnd: bucket.end,
    currency: 'OMR',
    received: entry.received,
    paidOut: entry.paidOut,
    net: entry.received - entry.paidOut,
  }))
  const rows = collapse(raw, ['period']).map((row) => rounded(row, ['received', 'paidOut', 'net']))
  return {
    from: query.get('from'),
    to: query.get('to'),
    granularity: query.get('granularity') ?? 'MONTH',
    rows,
    totals: [totalOf(rows, ['received', 'paidOut', 'net'])],
  }
}

function vat(query) {
  const output = []
  const input = []
  const net = []
  for (const { entry, bucket } of inRange(query)) {
    const base = {
      period: bucket.period,
      periodStart: bucket.start,
      periodEnd: bucket.end,
      currency: 'OMR',
    }
    const standard = entry.incomeNet * 0.96
    const zero = entry.incomeNet * 0.03
    const exempt = entry.incomeNet * 0.01
    const docs = entry.incomeDocs
    output.push(
      {
        ...base,
        side: 'OUTPUT',
        category: 'S',
        rate: 5,
        documents: Math.round(docs * 0.95),
        taxableAmount: standard,
        vatAmount: standard * 0.05,
      },
      {
        ...base,
        side: 'OUTPUT',
        category: 'Z',
        rate: 0,
        documents: Math.round(docs * 0.03),
        taxableAmount: zero,
        vatAmount: 0,
      },
      {
        ...base,
        side: 'OUTPUT',
        category: 'E',
        rate: null,
        documents: Math.round(docs * 0.02),
        taxableAmount: exempt,
        vatAmount: 0,
      },
    )
    input.push({
      ...base,
      side: 'INPUT',
      category: 'ALL',
      rate: null,
      documents: entry.bills,
      taxableAmount: entry.spendNet,
      vatAmount: entry.spendNet * 0.05,
    })
    net.push({
      ...base,
      side: 'NET',
      category: 'ALL',
      rate: null,
      documents: docs + entry.bills,
      taxableAmount: 0,
      vatAmount: standard * 0.05 - entry.spendNet * 0.05,
    })
  }
  const fields = ['taxableAmount', 'vatAmount']
  const fold = (rows) => collapse(rows, ['period', 'category']).map((row) => rounded(row, fields))
  return {
    from: query.get('from'),
    to: query.get('to'),
    granularity: query.get('granularity') ?? 'MONTH',
    output: fold(output),
    input: fold(input),
    net: fold(net),
  }
}

/** Ten of the frame's twelve lists are published; the aged tables and the journal are not yet. */
const DATASETS = [
  ['invoices', 'Every invoice', 'invoice.export', ['from', 'to', 'state', 'type']],
  ['customers', 'Customers', 'customer.read', []],
  ['invoice-lines', 'Catalog lines sold', 'invoice.export', ['from', 'to']],
  ['payments-received', 'Payments received', 'invoice.export', ['from', 'to']],
  ['bills', 'Every bill', 'reports.read', ['from', 'to']],
  ['suppliers', 'Suppliers', 'supplier.read', []],
  ['payments-made', 'Payments made', 'reports.read', ['from', 'to']],
  ['credit-debit-notes', 'Credit and debit notes', 'reports.read', ['from', 'to']],
  ['vat-ledger', 'VAT ledger', 'reports.read', ['from', 'to']],
  ['tax-document-register', 'Tax document register', 'compliance.read', ['from', 'to']],
]

function lists() {
  return {
    datasets: DATASETS.map(([key, title, permission, parameters]) => ({
      key,
      title,
      description: `${title}, one row each.`,
      permission,
      formats: ['csv', 'xlsx'],
      hrefCsv: `/api/v1/reports/lists/${key}.csv`,
      hrefXlsx: `/api/v1/reports/lists/${key}.xlsx`,
      parameters,
    })),
  }
}

export default [
  { match: '/api/v1/reports/volume', reply: ({ query }) => volume(query) },
  { match: '/api/v1/reports/expenditure', reply: ({ query }) => expenditure(query) },
  { match: '/api/v1/reports/cash-flow', reply: ({ query }) => cashFlow(query) },
  { match: '/api/v1/reports/vat', reply: ({ query }) => vat(query) },
  { match: '/api/v1/reports/lists', reply: () => lists() },
]
