/**
 * Bundles (`/v1/bundles`, backend #790): list, one, create, edit, archive, reactivate, the
 * invoice lines and the report. Shapes follow `src/api/catalog/bundles.ts`. Parts are the mock
 * catalogue's products (`products.mjs`); VAT and the split are worked out from them as the server
 * does: one line when every part shares a VAT category and rate, else one line per part priced at
 * its share. In memory, so a restart puts the bundles back.
 */
import { PRODUCTS_FOR_ROUTES } from './products.mjs'

const round3 = (value) => Math.round(value * 1000) / 1000
const product = (id) => PRODUCTS_FOR_ROUTES().find((p) => p.id === id)
const problem = (
  status,
  code,
  slug = status === 404 ? 'not-found' : status === 409 ? 'resource-conflict' : 'validation-failed',
) => ({
  status,
  body: { type: `https://api.fawtir.om/problems/${slug}`, status, code },
})

/** What the branch holds of the counted parts (others are not counted). */
const ON_HAND = { 'p-green': 6, 'p-cups': 0, 'p-dates': 40 }

let next = 10
const BUNDLES = [
  {
    id: 'bun-starter',
    code: 'PKG-0003',
    name: 'Starter bundle',
    nameAr: 'حزمة البداية',
    description: 'Green beans, cups and a training hour.',
    kindId: 'k-beans',
    groupId: 'g-beans',
    price: 30,
    showParts: true,
    active: true,
    version: 1,
    parts: [
      { productId: 'p-green', variantId: null, quantity: 1, free: false },
      { productId: 'p-cups', variantId: null, quantity: 1, free: false },
      { productId: 'p-train', variantId: null, quantity: 1, free: true },
    ],
  },
  {
    id: 'bun-gift',
    code: 'PKG-0004',
    name: 'Dates and cups gift box',
    nameAr: null,
    description: null,
    kindId: null,
    groupId: null,
    price: 26,
    showParts: true,
    active: true,
    version: 0,
    parts: [
      { productId: 'p-dates', variantId: null, quantity: 2, free: false },
      { productId: 'p-cups', variantId: null, quantity: 1, free: false },
    ],
  },
  {
    id: 'bun-morning',
    code: 'PKG-0007',
    name: 'Morning deal',
    nameAr: null,
    description: null,
    kindId: 'k-milk',
    groupId: 'g-drinks',
    price: 3.9,
    showParts: false,
    active: true,
    version: 0,
    parts: [
      { productId: 'p-cap', variantId: null, quantity: 1, free: false },
      { productId: 'p-deliv', variantId: null, quantity: 1, free: false },
    ],
  },
  {
    id: 'bun-ramadan',
    code: 'PKG-0002',
    name: 'Ramadan gift box',
    nameAr: null,
    description: null,
    kindId: null,
    groupId: null,
    price: 12,
    showParts: true,
    active: false,
    version: 2,
    parts: [
      { productId: 'p-dates', variantId: null, quantity: 1, free: false },
      { productId: 'p-green', variantId: null, quantity: 1, free: false },
    ],
  },
]

/** Units sold, revenue and parts value over the report's 90 days. */
const SOLD = { 'bun-starter': 22, 'bun-gift': 9, 'bun-morning': 0, 'bun-ramadan': 4 }

function partView(part, position, branchId) {
  const p = product(part.productId)
  const counted = branchId ? part.productId in ON_HAND : null
  const onHand = counted ? ON_HAND[part.productId] : null
  return {
    position,
    productId: part.productId,
    variantId: part.variantId,
    code: p?.code ?? '',
    name: p?.name ?? part.productId,
    quantity: part.quantity,
    free: part.free,
    unitPrice: p?.defaultUnitPrice ?? 0,
    taxCategory: p?.defaultTaxCategory ?? 'S',
    taxRate: p?.defaultTaxRate ?? null,
    taxReasonCode: p?.defaultTaxReasonCode ?? null,
    goodsOrService: p?.classificationGoodsOrService ?? null,
    counted,
    onHand,
    allows: counted ? Math.floor(onHand / part.quantity) : null,
  }
}

function view(bundle, branchId) {
  const parts = bundle.parts.map((part, index) => partView(part, index + 1, branchId))
  const partsValue = round3(
    parts.reduce((sum, part) => sum + (part.free ? 0 : part.unitPrice * part.quantity), 0),
  )
  const treatments = new Set(
    parts.map((part) => `${part.taxCategory}/${part.taxRate}/${part.taxReasonCode}`),
  )
  const split = treatments.size > 1
  const top = [...parts].sort((a, b) => (b.taxRate ?? 0) - (a.taxRate ?? 0))[0]
  let availability = null
  if (branchId) {
    const unavailableBecause = parts
      .filter((part) => !product(part.productId)?.active)
      .map((part) => ({
        productId: part.productId,
        variantId: part.variantId,
        name: part.name,
        reason: 'ARCHIVED',
      }))
    const counted = parts.filter((part) => part.counted)
    let canBeMade = counted.length ? Math.min(...counted.map((part) => part.allows)) : null
    const limiting = counted.length
      ? counted.reduce((low, part) => (part.allows < low.allows ? part : low), counted[0])
      : null
    if (unavailableBecause.length || !bundle.active) canBeMade = 0
    availability = {
      branchId,
      available: bundle.active && unavailableBecause.length === 0,
      canBeMade,
      limitedByProductId: limiting?.productId ?? null,
      limitedByName: limiting?.name ?? null,
      unavailableBecause,
    }
  }
  return {
    id: bundle.id,
    code: bundle.code,
    name: bundle.name,
    nameAr: bundle.nameAr,
    description: bundle.description,
    kindId: bundle.kindId,
    groupId: bundle.groupId,
    barcode: null,
    unitCode: 'C62',
    basePrice: bundle.price,
    price: bundle.price,
    partsValue,
    saving: round3(partsValue - bundle.price),
    taxCategory: top?.taxCategory ?? 'S',
    taxRate: top?.taxRate ?? 5,
    showParts: bundle.showParts,
    splitOnInvoice: split,
    splitBecause: split ? 'VAT_TREATMENTS_DIFFER' : null,
    active: bundle.active,
    version: bundle.version,
    parts,
    availability,
  }
}

function invoiceLines(bundle, branchId, quantity) {
  const shown = view(bundle, branchId)
  const line = (fields) => ({ variantId: null, discount: null, ...fields })
  if (!shown.splitOnInvoice) {
    return {
      bundleId: bundle.id,
      branchId,
      quantity,
      split: false,
      splitBecause: null,
      lines: [
        line({
          productId: bundle.id,
          productCode: bundle.code,
          description: bundle.name,
          unitCode: 'C62',
          quantity,
          unitPrice: bundle.price,
          taxCategory: { code: shown.taxCategory, rate: shown.taxRate ?? 0 },
          classification: { goodsOrService: 'G', hsCode: null, serviceTypeCode: null },
          bundleId: null,
        }),
      ],
    }
  }
  // Shared out by what each part sells for on its own, free parts included; three decimals.
  const weight = shown.parts.reduce((sum, part) => sum + part.unitPrice * part.quantity, 0)
  const lines = shown.parts.map((part) =>
    line({
      productId: part.productId,
      productCode: part.code,
      description: part.name,
      unitCode: 'C62',
      quantity: part.quantity * quantity,
      unitPrice: round3((bundle.price * part.unitPrice) / weight),
      taxCategory: {
        code: part.taxCategory,
        rate: part.taxRate ?? 0,
        exemptionReasonCode: part.taxReasonCode,
      },
      classification: {
        goodsOrService: part.goodsOrService ?? 'G',
        hsCode: null,
        serviceTypeCode: null,
      },
      bundleId: bundle.id,
    }),
  )
  // The shares add up to the bundle's price: the last part takes what rounding left.
  const others = lines
    .slice(0, -1)
    .reduce((sum, row) => sum + row.unitPrice * (row.quantity / quantity), 0)
  const last = lines[lines.length - 1]
  last.unitPrice = round3((bundle.price - others) / (last.quantity / quantity))
  return {
    bundleId: bundle.id,
    branchId,
    quantity,
    split: true,
    splitBecause: 'VAT_TREATMENTS_DIFFER',
    lines,
  }
}

function refusal(body, id) {
  const parts = Array.isArray(body?.parts) ? body.parts : []
  if (!body?.code?.trim() || !body?.name?.trim() || !(Number(body?.price) >= 0)) {
    return problem(400, 'VALIDATION_FAILED')
  }
  if (parts.length < 2) return problem(400, 'BUNDLE_PARTS_TOO_FEW')
  if (parts.length > 50) return problem(400, 'BUNDLE_PARTS_TOO_MANY')
  const seen = new Set()
  for (const part of parts) {
    const p = product(part.productId)
    if (!p) return problem(400, 'BUNDLE_PART_NOT_FOUND')
    if (!p.active) return problem(400, 'BUNDLE_PART_ARCHIVED')
    if (p.itemKind === 'BUNDLE') return problem(400, 'BUNDLE_PART_IS_BUNDLE')
    if (!(Number(part.quantity) > 0)) return problem(400, 'BUNDLE_PART_QUANTITY_INVALID')
    const key = `${part.productId}/${part.variantId ?? ''}`
    if (seen.has(key)) return problem(400, 'BUNDLE_PART_DUPLICATE')
    seen.add(key)
  }
  const code = body.code.trim().toLowerCase()
  const taken =
    PRODUCTS_FOR_ROUTES().some((p) => p.active && p.code.toLowerCase() === code) ||
    BUNDLES.some((b) => b.id !== id && b.active && b.code.toLowerCase() === code)
  if (taken) return problem(409, 'PRODUCT_CODE_DUPLICATE')
  return null
}

const fromBody = (body) => ({
  code: body.code.trim(),
  name: body.name.trim(),
  nameAr: body.nameAr ?? null,
  description: body.description ?? null,
  kindId: body.kindId ?? null,
  groupId: body.kindId ? 'g-beans' : null,
  price: round3(Number(body.price)),
  showParts: body.showParts !== false,
  parts: body.parts.map((part) => ({
    productId: part.productId,
    variantId: part.variantId ?? null,
    quantity: Number(part.quantity),
    free: Boolean(part.free),
  })),
})

const ONE = /^\/api\/v1\/bundles\/([^/]+)$/
const find = (id) => BUNDLES.find((b) => b.id === id)
const versioned = (query, bundle) => Number(query.get('expectedVersion')) === bundle.version

export default [
  {
    match: '/api/v1/bundles',
    reply: ({ query }) => {
      const status = query.get('status') ?? 'ACTIVE'
      const branchId = query.get('branchId')
      return {
        content: BUNDLES.filter((b) => status === 'ALL' || (status === 'ACTIVE') === b.active)
          .sort((a, b) => a.code.localeCompare(b.code))
          .map((b) => view(b, branchId)),
      }
    },
  },
  {
    method: 'POST',
    match: '/api/v1/bundles',
    reply: ({ body }) => {
      const refused = refusal(body)
      if (refused) return refused
      const bundle = { id: `bun-${next++}`, active: true, version: 0, ...fromBody(body) }
      BUNDLES.push(bundle)
      return { status: 201, body: view(bundle, null) }
    },
  },
  {
    // Before the one-bundle route, which would read "report" as an id.
    match: '/api/v1/bundles/report',
    reply: ({ query }) => {
      const to = query.get('to') ?? new Date().toISOString().slice(0, 10)
      const from = query.get('from') ?? to
      if (query.get('from') && from > to) return problem(400, 'BUNDLE_REPORT_PERIOD_INVALID')
      const rows = BUNDLES.filter((b) => b.active || SOLD[b.id]).map((b) => {
        const shown = view(b, null)
        const unitsSold = SOLD[b.id] ?? 0
        const revenue = round3(unitsSold * b.price)
        const partsValue = round3(unitsSold * shown.partsValue)
        return {
          bundleId: b.id,
          code: b.code,
          name: b.name,
          active: b.active,
          unitsSold,
          revenue,
          partsValue,
          discountGiven: round3(partsValue - revenue),
        }
      })
      return {
        from,
        to,
        branchId: query.get('branchId'),
        revenue: round3(rows.reduce((sum, row) => sum + row.revenue, 0)),
        discountGiven: round3(rows.reduce((sum, row) => sum + row.discountGiven, 0)),
        bundles: rows,
      }
    },
  },
  {
    match: /^\/api\/v1\/bundles\/([^/]+)\/invoice-lines$/,
    reply: ({ params, query }) => {
      const bundle = find(params[0])
      if (!bundle) return problem(404, 'BUNDLE_NOT_FOUND')
      const quantity = Number(query.get('quantity') ?? 1)
      if (!Number.isInteger(quantity) || quantity < 1)
        return problem(400, 'BUNDLE_QUANTITY_INVALID')
      return invoiceLines(bundle, query.get('branchId'), quantity)
    },
  },
  {
    match: ONE,
    reply: ({ params, query }) => {
      const bundle = find(params[0])
      return bundle ? view(bundle, query.get('branchId')) : problem(404, 'BUNDLE_NOT_FOUND')
    },
  },
  {
    method: 'PUT',
    match: ONE,
    reply: ({ params, query, body }) => {
      const bundle = find(params[0])
      if (!bundle) return problem(404, 'BUNDLE_NOT_FOUND')
      if (!versioned(query, bundle)) return problem(409, 'PRODUCT_VERSION_CONFLICT')
      if (!bundle.active) return problem(409, 'PRODUCT_ARCHIVED')
      const refused = refusal(body, bundle.id)
      if (refused) return refused
      Object.assign(bundle, fromBody(body), { version: bundle.version + 1 })
      return view(bundle, null)
    },
  },
  {
    method: 'DELETE',
    match: ONE,
    reply: ({ params, query }) => {
      const bundle = find(params[0])
      if (!bundle) return problem(404, 'BUNDLE_NOT_FOUND')
      if (!versioned(query, bundle)) return problem(409, 'PRODUCT_VERSION_CONFLICT')
      if (bundle.active) Object.assign(bundle, { active: false, version: bundle.version + 1 })
      return view(bundle, null)
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/bundles\/([^/]+)\/reactivate$/,
    reply: ({ params, query }) => {
      const bundle = find(params[0])
      if (!bundle) return problem(404, 'BUNDLE_NOT_FOUND')
      if (!versioned(query, bundle)) return problem(409, 'PRODUCT_VERSION_CONFLICT')
      if (!bundle.active) Object.assign(bundle, { active: true, version: bundle.version + 1 })
      return view(bundle, null)
    },
  },
]
