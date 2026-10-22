/**
 * The product catalogue (`/v1/products`): the catalogue list and item form, and the composer's
 * product picker. Shapes follow `src/api/catalog/products.ts` (`ProductResponse`); refusals follow
 * `InvoiceRestExceptionHandler` (409 for a stale version, a code already on sale and an archived
 * product, 404 for a missing one). In memory, so a restart puts the catalogue back.
 */

const NOW = '2026-10-21T09:00:00Z'

function product(id, code, name, unit, price, extra = {}) {
  return {
    id,
    code,
    name,
    description: null,
    defaultUnitCode: unit,
    defaultUnitPrice: price,
    defaultTaxCategory: 'S',
    defaultTaxRate: 5,
    classificationGoodsOrService: null,
    classificationIsicCode: null,
    classificationHsCode: null,
    classificationServiceTypeCode: null,
    active: true,
    archivedAt: null,
    version: 0,
    ...extra,
  }
}

const goods = (hs) => ({
  classificationGoodsOrService: 'G',
  classificationHsCode: hs,
  classificationServiceTypeCode: '00000000',
})
const service = (type = '00000000') => ({
  classificationGoodsOrService: 'S',
  classificationServiceTypeCode: type,
})

let nextProduct = 1

const PRODUCTS = [
  product('p-cap', 'CAP-L', 'Cappuccino - Large', 'EA', 1.8, goods('210111000000')),
  product('p-flat', 'FLT-1', 'Flat White', 'EA', 1.6, goods('210111000000')),
  product('p-beans', 'BEAN-HB', 'Coffee Beans 1kg - House Blend', 'KGM', 9.5, goods('090121000000')),
  product('p-green', 'BEAN-YG', 'Green Beans - Yirgacheffe', 'KGM', 10.25, goods('090111000000')),
  product('p-roast', 'SRV-ROAST', 'Roasting service - per batch', 'E48', 4.2, service()),
  product('p-cups', 'CUP-500', 'Takeaway cups - 500 pack', 'PK', 22.8),
  product('p-train', 'SRV-TRAIN', 'Barista training', 'HUR', 15, service()),
  product('p-deliv', 'SRV-DELIV', 'Delivery charge', 'EA', 2.5, service()),
  product('p-export', 'BEAN-EXP', 'Export beans - Salalah lot', 'KGM', 11, {
    defaultTaxCategory: 'G',
    defaultTaxRate: 0,
    ...goods('090121000000'),
  }),
  product('p-dates', 'DATES-KH', 'Khalas dates 1kg', 'KGM', 3.2, {
    defaultTaxCategory: 'Z',
    defaultTaxRate: 0,
    ...goods('080410000000'),
  }),
  product('p-syrup', 'SYR-VAN', 'Vanilla syrup 750ml', 'EA', 4.75, {
    ...goods('210690000000'),
    active: false,
    archivedAt: '2026-08-14T10:12:00Z',
    version: 2,
  }),
]

const problem = (status, code, slug = 'resource-conflict') => ({
  status,
  body: { type: `https://api.fawtir.om/problems/${slug}`, status, code },
})

/** `ProductRequest` onto a stored product. */
function apply(target, body) {
  const c = body.classification ?? null
  Object.assign(target, {
    code: String(body.code ?? '').trim(),
    name: String(body.name ?? '').trim(),
    description: body.description ?? null,
    defaultUnitCode: body.defaultUnitCode,
    defaultUnitPrice: body.defaultUnitPrice,
    defaultTaxCategory: body.defaultTaxCategory,
    defaultTaxRate: body.defaultTaxRate ?? null,
    classificationGoodsOrService: c?.goodsOrService ?? null,
    classificationIsicCode: c?.industrialClassificationCode ?? null,
    classificationHsCode: c?.hsCode ?? null,
    classificationServiceTypeCode: c?.goodsOrService ? (c.serviceTypeCode ?? '00000000') : null,
  })
  return target
}

/** The refusals a save can meet before it is stored, in the server's order. */
function refusal(body, id) {
  if (body.classification?.goodsOrService === 'S' && body.classification?.hsCode) {
    return problem(400, 'HS_CODE_ON_SERVICES_LINE', 'validation-failed')
  }
  const code = String(body.code ?? '').trim().toUpperCase()
  if (PRODUCTS.some((p) => p.active && p.id !== id && p.code.toUpperCase() === code)) {
    return problem(409, 'PRODUCT_CODE_DUPLICATE')
  }
  return null
}

const ONE = /^\/api\/v1\/products\/([^/]+)$/

export default [
  {
    match: '/api/v1/products',
    reply: ({ query }) => {
      const q = (query.get('q') ?? '').toLowerCase()
      const activeOnly = query.get('activeOnly') !== 'false'
      const page = Number(query.get('page') ?? 0)
      const size = Number(query.get('size') ?? 50)
      const found = PRODUCTS.filter(
        (p) =>
          (!activeOnly || p.active) &&
          (!q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)),
      )
      return {
        content: found.slice(page * size, page * size + size),
        page,
        size,
        totalElements: found.length,
      }
    },
  },
  {
    method: 'POST',
    match: '/api/v1/products',
    reply: ({ body }) => {
      const refused = refusal(body, null)
      if (refused) return refused
      const created = apply(product(`p-new-${nextProduct++}`, '', '', 'EA', 0), body)
      PRODUCTS.push(created)
      return { status: 201, body: created }
    },
  },
  {
    match: ONE,
    reply: ({ params }) => {
      const found = PRODUCTS.find((p) => p.id === params[0])
      return found ?? problem(404, 'PRODUCT_NOT_FOUND', 'not-found')
    },
  },
  {
    method: 'PUT',
    match: ONE,
    reply: ({ params, query, body }) => {
      const found = PRODUCTS.find((p) => p.id === params[0])
      if (!found) return problem(404, 'PRODUCT_NOT_FOUND', 'not-found')
      if (Number(query.get('expectedVersion')) !== found.version) {
        return problem(409, 'PRODUCT_VERSION_CONFLICT')
      }
      if (!found.active) return problem(409, 'PRODUCT_ARCHIVED')
      const refused = refusal(body, found.id)
      if (refused) return refused
      apply(found, body)
      found.version += 1
      return found
    },
  },
  {
    method: 'DELETE',
    match: ONE,
    reply: ({ params, query }) => {
      const found = PRODUCTS.find((p) => p.id === params[0])
      if (!found) return problem(404, 'PRODUCT_NOT_FOUND', 'not-found')
      if (!found.active) return found
      if (Number(query.get('expectedVersion')) !== found.version) {
        return problem(409, 'PRODUCT_VERSION_CONFLICT')
      }
      found.active = false
      found.archivedAt = NOW
      found.version += 1
      return found
    },
  },
]
