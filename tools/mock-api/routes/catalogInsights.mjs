/**
 * One item's read-only pages (`ProductInsightsController`, backend #788): how it sells
 * (`/sales`), where it is used (`/usage`) and its history (`/history`). Shapes follow
 * `src/api/catalog/insights.ts`. The figures are made up but add up: the series sums to the
 * totals, the channels to the total, the usage counts to its rows.
 */
import { PRODUCTS_FOR_ROUTES } from './products.mjs'

const round3 = (value) => Math.round(value * 1000) / 1000
const find = (id) => PRODUCTS_FOR_ROUTES().find((p) => p.id === id)
const problem = (status, code) => ({
  status,
  body: {
    type: `https://api.fawtir.om/problems/${status === 404 ? 'not-found' : 'invalid'}`,
    status,
    code,
  },
})

const isoDay = (date) => date.toISOString().slice(0, 10)
const addDays = (iso, days) => {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return isoDay(date)
}
const today = () => isoDay(new Date())

/** A steady pattern by weekday and season, so the busiest day and best month are stable. */
const unitsOn = (iso, seed) => {
  const date = new Date(`${iso}T00:00:00Z`)
  const weekday = [9, 14, 18, 13, 12, 6, 10][date.getUTCDay()]
  const month = 1 + ((date.getUTCMonth() + seed) % 12) / 10
  return Math.round(weekday * month)
}

function sales(product, query) {
  const to = query.get('to') ?? today()
  const from = query.get('from') ?? addDays(to, -29)
  if (from > to) return problem(400, 'PRODUCT_SALES_PERIOD_INVALID')
  const currency = (query.get('currency') ?? 'OMR').toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) return problem(400, 'PRODUCT_SALES_CURRENCY_INVALID')
  const price = product.defaultUnitPrice
  const seed = product.code.length
  const never = ['p-green', 'p-export', 'p-train'].includes(product.id)
  const series = []
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const units = never ? 0 : unitsOn(day, seed)
    const invoiceUnits = units >= 15 ? 3 : 0
    series.push({
      start: day,
      units,
      revenue: round3(units * price),
      sales: units === 0 ? 0 : Math.max(1, Math.round(units * 0.8)),
      tillUnits: units - invoiceUnits,
      invoiceUnits,
    })
  }
  const sum = (key) => series.reduce((total, row) => total + row[key], 0)
  const units = sum('units')
  const tillUnits = sum('tillUnits')
  const invoiceUnits = sum('invoiceUnits')
  const figures = (count) => ({
    units: count,
    revenue: round3(count * price),
    sales: Math.round(count * 0.8),
  })
  const variants = (product.sizes ?? []).length
    ? product.sizes.map((size, index) => {
        const share = index === 0 ? 0.35 : index === 1 ? 0.5 : 0.15
        const count = Math.round(units * share)
        return {
          variantId: size.id,
          code: `${product.code}-${index + 1}`,
          name: size.name,
          units: count,
          revenue: round3(count * (price + size.priceDelta)),
        }
      })
    : [{ variantId: null, code: null, name: null, units, revenue: round3(units * price) }]
  const addOns = (product.addOns ?? []).map((addOn, index) => {
    const quantity = Math.round(units / (index === 0 ? 5 : 9))
    return {
      addOnId: addOn.id,
      name: addOn.name,
      quantity,
      revenue: round3(quantity * addOn.price),
    }
  })
  return {
    productId: product.id,
    from,
    to,
    interval: query.get('interval') ?? 'DAY',
    branchId: query.get('branchId'),
    currency,
    total: figures(units),
    averagePrice: units > 0 ? round3(price) : null,
    returnedUnits: units > 0 ? 2 : 0,
    returnedRevenue: units > 0 ? round3(2 * price) : 0,
    till: figures(tillUnits),
    invoice: figures(invoiceUnits),
    series,
    variants,
    addOns,
  }
}

/** The documents naming an item, newest first. Till sales one row each. */
function usageRows(product) {
  const price = product.defaultUnitPrice
  const rows = [
    ['INVOICE', 'INV-2038', -5, 'ISSUED', 'Nizwa Souq Café', 18],
    ['QUOTATION', 'QT-0121', -2, 'SENT', 'Muscat Grand Hotel', 40],
    ['INVOICE', 'INV-2019', -40, 'PAID', 'Barka Beach Resort', 64],
    ['CREDIT_NOTE', 'CN-0031', -38, 'ISSUED', 'Barka Beach Resort', -4],
    ['INVOICE', null, -1, 'DRAFT', 'Al Mouj Marina', 12],
    ['ORDER_FORM', 'OF-0044', -12, 'ACCEPTED', 'Muscat Grand Hotel', 30],
    ['PERIODIC', 'PER-0007', -60, 'ACTIVE', 'Nizwa Souq Café', 18],
  ].map(([kind, number, days, state, customerName, quantity], index) => ({
    kind,
    documentId: `doc-${product.id}-${index + 1}`,
    number,
    date: addDays(today(), days),
    state,
    customerId: `c-${index + 1}`,
    customerName,
    branchId: 'b-main',
    quantity,
    lineValue: round3(quantity * price),
    currency: 'OMR',
  }))
  for (let i = 0; i < 26; i += 1) {
    const quantity = 1 + (i % 3)
    rows.push({
      kind: 'TILL_SALE',
      documentId: `till-${product.id}-${i + 1}`,
      number: `POS-${String(4100 + i)}`,
      date: addDays(today(), -Math.floor(i / 2)),
      state: 'ISSUED',
      customerId: null,
      customerName: null,
      branchId: 'b-main',
      quantity,
      lineValue: round3(quantity * price),
      currency: 'OMR',
    })
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date))
}

function usage(product, query) {
  const kinds = query.getAll('kind')
  const page = Number(query.get('page') ?? 0)
  const size = Number(query.get('size') ?? 20)
  const all = ['p-green', 'p-export', 'p-train'].includes(product.id) ? [] : usageRows(product)
  const counts = {}
  for (const row of all) counts[row.kind] = (counts[row.kind] ?? 0) + 1
  const asked = kinds.length ? all.filter((row) => kinds.includes(row.kind)) : all
  return {
    content: asked.slice(page * size, page * size + size),
    page,
    size,
    totalElements: asked.length,
    counts,
  }
}

function history(product, query) {
  const page = Number(query.get('page') ?? 0)
  const size = Number(query.get('size') ?? 20)
  const at = (days, time) => `${addDays(today(), days)}T${time}:00Z`
  const entries = [
    {
      action: 'ProductUpdated',
      occurredAt: at(-3, '09:12'),
      categories: ['PRICE'],
      actorName: 'Hafidh Saif',
      changes: [
        {
          field: 'defaultUnitPrice',
          branchId: null,
          branchName: null,
          from: String(round3(product.defaultUnitPrice - 0.095)),
          to: String(product.defaultUnitPrice),
        },
      ],
    },
    {
      action: 'ProductVariantsChanged',
      occurredAt: at(-12, '14:48'),
      categories: ['SIZES'],
      actorName: 'Yusuf Al Balushi',
      changes: [
        { field: 'addOn', branchId: null, branchName: null, from: null, to: 'Oat milk 0.200' },
      ],
    },
    {
      action: 'ProductBranchSettingsChanged',
      occurredAt: at(-20, '11:03'),
      categories: ['BRANCHES', 'PRICE'],
      actorName: 'Hafidh Saif',
      changes: [
        {
          field: 'branchPrice',
          branchId: 'b-seeb',
          branchName: 'Al Bahja Coffee (Seeb)',
          from: null,
          to: '1.4',
        },
        {
          field: 'onSale',
          branchId: 'b-nizwa',
          branchName: 'Al Bahja Coffee (Nizwa)',
          from: 'true',
          to: 'false',
        },
      ],
    },
    {
      action: 'ProductUpdated',
      occurredAt: at(-34, '08:20'),
      categories: ['TAX'],
      actorName: 'Hafidh Saif',
      changes: [
        { field: 'defaultTaxCategory', branchId: null, branchName: null, from: 'Z', to: 'S' },
        { field: 'defaultTaxRate', branchId: null, branchName: null, from: '0', to: '5' },
      ],
    },
    {
      action: 'ProductUpdated',
      occurredAt: at(-50, '16:31'),
      categories: ['DETAILS'],
      actorName: 'Yusuf Al Balushi',
      changes: [
        {
          field: 'nameAr',
          branchId: null,
          branchName: null,
          from: null,
          to: product.nameAr ?? product.name,
        },
      ],
    },
  ].map((entry, index) => ({
    id: `h-${product.id}-${index + 1}`,
    actorId: `u-${index + 1}`,
    actorType: 'USER',
    ...entry,
  }))
  return {
    content: entries.slice(page * size, page * size + size),
    page,
    size,
    hasMore: (page + 1) * size < entries.length,
    // History starts at deployment: older items name their creation from the product row.
    productCreatedAt: '2026-03-14T10:02:00Z',
    productCreatedBy: 'u-1',
    productCreatedByName: 'Hafidh Saif',
  }
}

const route = (suffix, reply) => ({
  match: new RegExp(`^/api/v1/products/([^/]+)/${suffix}$`),
  reply: ({ params, query }) => {
    const product = find(params[0])
    return product ? reply(product, query) : problem(404, 'PRODUCT_NOT_FOUND')
  },
})

export default [route('sales', sales), route('usage', usage), route('history', history)]
