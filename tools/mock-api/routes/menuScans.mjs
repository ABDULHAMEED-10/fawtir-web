/**
 * Scan a menu or price list (`/v1/catalog/menu-scans`, backend PR #787): upload, read into a
 * draft, the file as uploaded, and the all-or-nothing confirm. Shapes follow
 * `src/api/catalog/menuScans.ts`. In memory; for screenshots and the responsive harness only.
 *
 *   MOCK_MENU_SCAN=unavailable   reads answer READING_UNAVAILABLE (reading switched off)
 *   MOCK_MENU_SCAN=failed        reads answer READ_FAILED
 *   MOCK_MENU_SCAN=limit         reads answer 429 MENU_SCAN_DAILY_LIMIT
 *
 * The multipart body is not parsed: every upload keeps the sample menu below.
 */

import { randomUUID } from 'node:crypto'

const MODE = process.env.MOCK_MENU_SCAN ?? 'read'
const LIMIT = 20

const scans = new Map()
const confirmations = new Map()
let readsToday = 0

const problem = (status, code, extra = {}) => ({
  status,
  headers: { 'Content-Type': 'application/problem+json' },
  body: {
    type: `https://api.fawtir.om/problems/${code.toLowerCase().replace(/_/g, '-')}`,
    status,
    code,
    ...extra,
  },
})

const row = (id, name, price, extra = {}) => ({
  id,
  name,
  nameAr: null,
  description: null,
  price,
  priceAsPrinted: price === null ? null : price.toFixed(3),
  currency: 'OMR',
  sizes: [],
  confidence: 0.96,
  state: 'clear',
  ticked: true,
  concerns: [],
  soldAs: 'C62',
  taxCategory: 'S',
  taxPercent: 5,
  goodsOrService: 'G',
  itemKind: 'HAND_OVER',
  hsCode: '000000000000',
  ...extra,
})

const check = (concerns) => ({ state: 'check', ticked: false, concerns })

const READING = (fileId) => {
  const groups = [
    {
      id: 'g1',
      heading: 'Brewed drinks',
      headingAr: 'المشروبات المحضّرة',
      becomes: 'Brewed drinks',
      existingGroupId: 'g-drinks',
      rows: [
        row('g1-r1', 'Espresso', 0.8),
        row('g1-r2', 'Flat White', 1.4),
        row('g1-r3', 'Cappuccino', 1.4, {
          sizes: [
            { name: 'Small', price: 1.4, priceAsPrinted: '1.400' },
            { name: 'Large', price: 1.8, priceAsPrinted: '1.800' },
          ],
        }),
        row('g1-r4', 'V60 Pour Over', null, {
          priceAsPrinted: '1.8OO',
          confidence: 0.62,
          ...check([
            { code: 'PRICE_UNREADABLE', message: 'The price is not a plain amount' },
            { code: 'LOW_CONFIDENCE', message: 'Read with low confidence' },
          ]),
        }),
      ],
    },
    {
      id: 'g2',
      heading: 'Sweets',
      headingAr: 'حلويات',
      becomes: 'Sweets',
      existingGroupId: null,
      rows: [
        row('g2-r1', 'Date cake', 1.2, { nameAr: 'كيكة التمر' }),
        row('g2-r2', 'حلوى عمانية', null, {
          nameAr: 'حلوى عمانية',
          ...check([{ code: 'PRICE_MISSING', message: 'No price printed' }]),
        }),
      ],
    },
  ]
  const rows = groups.flatMap((g) => g.rows)
  return {
    fileId,
    reason: null,
    summary: {
      clear: rows.filter((r) => r.state === 'clear').length,
      needChecking: rows.filter((r) => r.state === 'check').length,
      headings: groups.length,
    },
    groups,
  }
}

/** The sample menu "photo": an SVG the page shows beside the reading. */
const MENU_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
<rect width="600" height="800" fill="#fbf7ef"/>
<text x="300" y="80" font-family="Georgia" font-size="34" text-anchor="middle" fill="#2b2118">AL BAHJA COFFEE</text>
<text x="300" y="115" font-family="Georgia" font-size="14" text-anchor="middle" fill="#7a6a58">SOUQ STREET · NIZWA</text>
<text x="60" y="190" font-family="Georgia" font-size="20" fill="#2b2118">BREWED DRINKS</text>
<g font-family="Georgia" font-size="18" fill="#3a2e24">
<text x="60" y="235">Espresso</text><text x="540" y="235" text-anchor="end">0.800</text>
<text x="60" y="270">Flat White</text><text x="540" y="270" text-anchor="end">1.400</text>
<text x="60" y="305">Cappuccino  S / L</text><text x="540" y="305" text-anchor="end">1.400 / 1.800</text>
<text x="60" y="340">V60 Pour Over</text><text x="540" y="340" text-anchor="end">1.8OO</text>
</g>
<text x="60" y="420" font-family="Georgia" font-size="20" fill="#2b2118">SWEETS</text>
<g font-family="Georgia" font-size="18" fill="#3a2e24">
<text x="60" y="465">Date cake</text><text x="540" y="465" text-anchor="end">1.200</text>
<text x="60" y="500">Omani halwa</text><text x="540" y="500" text-anchor="end">on request</text>
</g>
</svg>`

const scanOf = (fileId) => scans.get(fileId)

export default [
  {
    method: 'POST',
    match: '/api/v1/catalog/menu-scans',
    reply: () => {
      const fileId = randomUUID()
      const scan = {
        fileId,
        contentType: 'image/svg+xml',
        byteSize: MENU_SVG.length,
        sha256: fileId.replace(/-/g, ''),
        uploadedAt: new Date().toISOString(),
      }
      scans.set(fileId, scan)
      return { status: 201, body: { ...scan, contentType: 'image/png' } }
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/catalog\/menu-scans\/([^/]+)\/read$/,
    reply: ({ params }) => {
      if (!scanOf(params[0])) return problem(404, 'MENU_SCAN_NOT_FOUND')
      const empty = { clear: 0, needChecking: 0, headings: 0 }
      if (MODE === 'unavailable') {
        return { fileId: params[0], reason: 'READING_UNAVAILABLE', summary: empty, groups: [] }
      }
      if (MODE === 'limit' || readsToday >= LIMIT) {
        return problem(429, 'MENU_SCAN_DAILY_LIMIT', {
          detail: "You've reached today's limit for reading menus. Try again tomorrow.",
          limit: LIMIT,
        })
      }
      readsToday += 1
      if (MODE === 'failed') {
        return { fileId: params[0], reason: 'READ_FAILED', summary: empty, groups: [] }
      }
      return READING(params[0])
    },
  },
  {
    match: /^\/api\/v1\/catalog\/menu-scans\/([^/]+)\/file$/,
    reply: ({ params }) =>
      scanOf(params[0])
        ? { status: 200, raw: MENU_SVG, headers: { 'Content-Type': 'image/svg+xml' } }
        : problem(404, 'MENU_SCAN_NOT_FOUND'),
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/catalog\/menu-scans\/([^/]+)\/confirm$/,
    reply: ({ params, body, headers }) => {
      const fileId = params[0]
      if (!scanOf(fileId)) return problem(404, 'MENU_SCAN_NOT_FOUND')
      const key = headers?.['idempotency-key']
      if (!key || !/^[A-Za-z0-9._:-]{1,100}$/.test(key)) return problem(400, 'MENU_SCAN_INVALID')
      const list = JSON.stringify(body ?? {})
      const earlier = confirmations.get(key)
      if (earlier) {
        if (earlier.fileId !== fileId || earlier.list !== list) {
          return problem(409, 'MENU_SCAN_KEY_REUSED')
        }
        return { status: 200, body: { ...earlier.answer, replayed: true } }
      }
      const groups = Array.isArray(body?.groups) ? body.groups : []
      if (groups.length === 0) return problem(400, 'MENU_SCAN_INVALID')
      const rows = []
      groups.forEach((group, g) =>
        (group.items ?? []).forEach((item, i) => {
          const sized = (item.sizes ?? []).length > 0
          if ((item.price === null || item.price === undefined) && !sized) {
            rows.push({
              group: g,
              item: i,
              field: 'price',
              code: 'MENU_SCAN_PRICE_REQUIRED',
              message: 'A price is required',
            })
          }
          if (!String(item.name ?? '').trim()) {
            rows.push({
              group: g,
              item: i,
              field: 'name',
              code: 'PRODUCT_NAME_REQUIRED',
              message: 'A name is required',
            })
          }
        }),
      )
      if (rows.length > 0) return problem(400, 'MENU_SCAN_ROWS_REFUSED', { rows })
      let n = 0
      const products = groups.flatMap((group, g) =>
        group.items.map((item, i) => ({
          groupIndex: g,
          itemIndex: i,
          productId: randomUUID(),
          code: `MENU-${String(++n).padStart(6, '0')}`,
          name: item.name,
          groupId: group.kindId ? 'g-drinks' : randomUUID(),
          kindId: group.kindId ?? randomUUID(),
        })),
      )
      const answer = {
        confirmationId: randomUUID(),
        fileId,
        replayed: false,
        productCount: products.length,
        products,
      }
      confirmations.set(key, { fileId, list, answer })
      return { status: 201, body: answer }
    },
  },
]
