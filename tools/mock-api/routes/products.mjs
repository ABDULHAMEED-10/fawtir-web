/**
 * The product catalogue (`/v1/products`): the catalogue list and item form, the Sizes and options
 * page and the composer's product picker. Shapes follow `src/api/catalog/products.ts`
 * (`ProductResponse`); refusals follow `InvoiceRestExceptionHandler` (409 for a stale version, a
 * code or barcode already on sale and an archived product, 404 for a missing one, 400 for the
 * rest). In memory, so a restart puts the catalogue back. Groups and kinds are in
 * `catalogGroups.mjs`; this file reads them to check a product's kind.
 */

import { KINDS } from './catalogGroups.mjs'
import { matchesFor, today, warningFor } from '../lib/zeroRating.mjs'

const NOW = '2026-10-21T09:00:00Z'

let nextId = 1
const newId = (prefix) => `${prefix}-${nextId++}`

const round3 = (value) => Math.round(Number(value) * 1000) / 1000

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
    defaultTaxReasonCode: null,
    defaultTaxReasonText: null,
    nameAr: null,
    barcode: null,
    kindId: null,
    groupId: null,
    itemKind: null,
    priceEntryIncludesVat: false,
    staffCanChangePrice: false,
    keepCount: false,
    defaultDiscount: null,
    sizes: [],
    options: [],
    variantSettings: [],
    addOns: [],
    active: true,
    archivedAt: null,
    version: 0,
    updatedAt: NOW,
    ...extra,
  }
}

const goods = (hs) => ({
  classificationGoodsOrService: 'G',
  classificationHsCode: hs,
  classificationServiceTypeCode: '00000000',
  itemKind: 'HAND_OVER',
})
const service = (type = '00000000', itemKind = 'DO') => ({
  classificationGoodsOrService: 'S',
  classificationServiceTypeCode: type,
  itemKind,
})
const size = (name, nameAr, priceDelta, sortOrder) => ({
  id: newId('size'),
  name,
  nameAr,
  priceDelta,
  sortOrder,
})
const addOn = (name, nameAr, price, sortOrder) => ({
  id: newId('addon'),
  name,
  nameAr,
  price,
  free: price === 0,
  sortOrder,
})

/** The branches `/v1/branches` answers in the mock (drafts.mjs), for the per-branch settings. */
const BRANCHES = [
  { id: 'b-nizwa', code: 'NIZWA', name: 'Al Bahja Coffee (Nizwa)', active: true },
  { id: 'b-main', code: 'MAIN', name: 'Al Bahja Coffee (Main)', active: true },
  { id: 'b-seeb', code: 'SEEB', name: 'Al Bahja Coffee (Seeb)', active: true },
  { id: 'b-sohar', code: 'SOHAR', name: 'Al Bahja Roastery (Sohar)', active: true },
]

/** Per-branch settings (P.9), by product id; a product without an entry is sold everywhere. */
const BRANCH_SETTINGS = {
  'p-flat': {
    availability: 'CHOSEN_BRANCHES',
    branchIds: ['b-main', 'b-seeb'],
    version: 1,
    rows: { 'b-seeb': { branchPrice: 1.4, onSale: true } },
  },
  'p-beans': {
    availability: 'ALL_BRANCHES',
    branchIds: [],
    version: 1,
    rows: { 'b-nizwa': { branchPrice: null, onSale: false } },
  },
  // Switched off at the head office, so the catalogue list there shows a greyed row.
  'p-green': {
    availability: 'ALL_BRANCHES',
    branchIds: [],
    version: 1,
    rows: { 'b-main': { branchPrice: 9.9, onSale: false } },
  },
}

/**
 * The zero-rating re-check's flags (Z.15), by product id: the beans are on the food list from
 * 1 October but still charged 5%.
 */
const ATTENTION = {
  'p-beans': {
    code: 'ZR_FOOD_CHARGED_STANDARD',
    hsCode: '090121000000',
    listKey: 'FOOD',
    listEffectiveFrom: '2026-10-01',
    flaggedAt: '2026-10-02T03:00:00Z',
  },
}

const settingsOf = (id) =>
  BRANCH_SETTINGS[id] ?? { availability: 'ALL_BRANCHES', branchIds: [], version: 0, rows: {} }

/** `ProductBranchSettingsResponse`. */
function settingsView(p) {
  const st = settingsOf(p.id)
  return {
    productId: p.id,
    availability: st.availability,
    branchIds: st.branchIds,
    version: st.version,
    basePrice: p.defaultUnitPrice,
    branches: BRANCHES.map((b) => {
      const row = st.rows[b.id] ?? { branchPrice: null, onSale: true }
      return {
        branchId: b.id,
        branchCode: b.code,
        branchName: b.name,
        branchActive: b.active,
        soldHere: st.availability === 'ALL_BRANCHES' || st.branchIds.includes(b.id),
        branchPrice: row.branchPrice,
        onSale: row.onSale,
        effectivePrice: row.branchPrice ?? p.defaultUnitPrice,
      }
    }),
  }
}

/** Sold and on sale in a branch: the price there, else null. */
function priceIn(p, branchId) {
  const st = settingsOf(p.id)
  if (st.availability === 'CHOSEN_BRANCHES' && !st.branchIds.includes(branchId)) return null
  const row = st.rows[branchId] ?? { branchPrice: null, onSale: true }
  if (!row.onSale) return null
  return row.branchPrice ?? p.defaultUnitPrice
}

/** The price in a branch, sold there or not: its own price if set, else the base price. */
function priceHere(p, branchId) {
  const row = settingsOf(p.id).rows[branchId]
  return row?.branchPrice ?? p.defaultUnitPrice
}

const PRODUCTS = [
  product('p-cap', 'CAP-L', 'Cappuccino - Large', 'EA', 1.8, {
    ...goods('210111000000'),
    nameAr: 'كابتشينو كبير',
    kindId: 'k-milk',
    groupId: 'g-drinks',
  }),
  product('p-flat', 'FLT-1', 'Flat White', 'EA', 1.333, {
    ...goods('210111000000'),
    nameAr: 'فلات وايت',
    barcode: '6281183000221',
    kindId: 'k-milk',
    groupId: 'g-drinks',
    staffCanChangePrice: true,
    defaultDiscount: { type: 'PERCENTAGE', value: 10 },
    sizes: [size('Regular', 'عادي', 0, 0), size('Large', 'كبير', 0.3, 1)],
    options: [size('Full milk', 'حليب كامل', 0, 0), size('Oat milk', 'حليب الشوفان', 0.2, 1)],
    addOns: [addOn('Extra shot', 'جرعة إضافية', 0.3, 0), addOn('Decaf', 'منزوع الكافيين', 0, 1)],
  }),
  product('p-beans', 'BEAN-HB', 'Coffee Beans 1kg - House Blend', 'KGM', 9.5, {
    ...goods('090121000000'),
    keepCount: true,
    kindId: 'k-beans',
    groupId: 'g-beans',
    sizes: [
      size('250 g', '250 غ', 0, 0),
      size('500 g', '500 غ', 2.4, 1),
      size('1 kg', '1 كغ', 6.8, 2),
    ],
  }),
  product('p-green', 'BEAN-YG', 'Green Beans - Yirgacheffe', 'KGM', 10.25, {
    ...goods('090111000000'),
    keepCount: true,
  }),
  product('p-roast', 'SRV-ROAST', 'Roasting service - per batch', 'E48', 4.2, service()),
  // Kept in the bare Rec 21 code on purpose: a product saved before the X prefix (ibr-cl-23)
  // must still open and show its unit.
  product('p-cups', 'CUP-500', 'Takeaway cups - 500 pack', 'PK', 22.8, { keepCount: true }),
  product('p-train', 'SRV-TRAIN', 'Barista training', 'HUR', 15, service('00000000', 'BY_TIME')),
  product('p-deliv', 'SRV-DELIV', 'Delivery charge', 'EA', 2.5, service()),
  product('p-export', 'BEAN-EXP', 'Export beans - Salalah lot', 'KGM', 11, {
    defaultTaxCategory: 'G',
    defaultTaxRate: 0,
    ...goods('090121000000'),
  }),
  product('p-dates', 'DATES-KH', 'Khalas dates 1kg', 'KGM', 3.2, {
    defaultTaxCategory: 'Z',
    defaultTaxRate: 0,
    defaultTaxReasonCode: 'VATZR-OM-01',
    ...goods('080410000000'),
    keepCount: true,
  }),
  // No price yet (template items start at 0.000): the till says so, or asks when staff may set it.
  product('p-free-fixed', 'NOPRICE-FIX', 'Cardamom tin (no price)', 'EA', 0, {
    ...goods('090830000000'),
    nameAr: 'علبة هيل (بلا سعر)',
    barcode: '6281183000900',
  }),
  product('p-free-open', 'NOPRICE-OPEN', 'Gift wrap (price at the till)', 'EA', 0, {
    ...goods('480210000000'),
    nameAr: 'تغليف هدايا (السعر عند البيع)',
    barcode: '6281183000901',
    staffCanChangePrice: true,
  }),
  product('p-free-sizes', 'NOPRICE-SIZE', 'Karak tea (a size unpriced)', 'EA', 0, {
    ...goods('090240000000'),
    nameAr: 'شاي كرك (مقاس بلا سعر)',
    sizes: [size('Small', 'صغير', 0, 0), size('Large', 'كبير', 0.5, 1)],
    addOns: [addOn('Extra sugar', 'سكر إضافي', 0, 0)],
    staffCanChangePrice: true,
  }),
  product('p-syrup', 'SYR-VAN', 'Vanilla syrup 750ml', 'EA', 4.75, {
    ...goods('210690000000'),
    active: false,
    archivedAt: '2026-08-14T10:12:00Z',
    version: 2,
  }),
]

const problem = (
  status,
  code,
  slug = status === 409 ? 'resource-conflict' : 'validation-failed',
) => ({
  status,
  body: { type: `https://api.fawtir.om/problems/${slug}`, status, code },
})

const same = (a, b) =>
  String(a ?? '')
    .trim()
    .toLowerCase() ===
  String(b ?? '')
    .trim()
    .toLowerCase()

/**
 * Size barcodes (backend V509) the till can scan, by product and size name: a scan of one adds that
 * size directly. Seeded when the combination is first laid out.
 */
const SEED_SIZE_BARCODES = { 'p-beans': { '500 g': '6291100500017', '1 kg': '6291100500024' } }

/** Every size x option combination, as the server lays them out. */
function combos(p) {
  const sizes = p.sizes.length ? p.sizes : [null]
  const options = p.options.length ? p.options : [null]
  if (!p.sizes.length && !p.options.length) return []
  return sizes.flatMap((s) => options.map((o) => ({ s, o })))
}

/** `ProductResponse`: the variants are worked out on every read from the current base price. */
/**
 * A product as answered. On the list the sizes, options, variants and add-ons are null unless
 * `include` asks for them (backend #808); `branchId` adds each variant's `branchPrice`.
 */
function view(p, { list = false, include = [], branchId = null } = {}) {
  const { variantSettings, updatedAt, ...rest } = p
  void updatedAt
  rest.zeroRatingWarnings = []
  rest.zeroRatingAttention = ATTENTION[p.id] ?? null
  const withVariants = !list || include.includes('variants')
  const withAddOns = !list || include.includes('addOns')
  if (list && !withVariants && !withAddOns) {
    return { ...rest, sizes: null, options: null, variants: null, addOns: null }
  }
  const variants = combos(p).map(({ s, o }, index) => {
    const key = `${s?.id ?? '-'}:${o?.id ?? '-'}`
    const stored = variantSettings.find((v) => v.key === key) ?? {
      key,
      id: newId('var'),
      code: `${p.code}-${index + 1}`,
      priceOverride: null,
      onSale: true,
      barcode: (!o && SEED_SIZE_BARCODES[p.id]?.[s?.name]) || null,
    }
    if (!variantSettings.includes(stored)) variantSettings.push(stored)
    return {
      id: stored.id,
      sizeId: s?.id ?? null,
      size: s?.name ?? null,
      optionId: o?.id ?? null,
      option: o?.name ?? null,
      name: [p.name, s?.name, o?.name].filter(Boolean).join(' · '),
      code: stored.code,
      priceOverride: stored.priceOverride,
      price:
        stored.priceOverride ??
        round3(p.defaultUnitPrice + (s?.priceDelta ?? 0) + (o?.priceDelta ?? 0)),
      onSale: stored.onSale,
      // Backend #808: the Arabic line name, worked out unless set by hand (null without one).
      nameAr:
        stored.nameAr ??
        (p.nameAr
          ? [p.nameAr, s && (s.nameAr || s.name), o && (o.nameAr || o.name)]
              .filter(Boolean)
              .join(' · ')
          : null),
      nameArSet: Boolean(stored.nameAr),
      sizeAr: s?.nameAr ?? null,
      optionAr: o?.nameAr ?? null,
      barcode: stored.barcode ?? null,
      branchPrice: branchId
        ? (stored.priceOverride ??
          round3(priceHere(p, branchId) + (s?.priceDelta ?? 0) + (o?.priceDelta ?? 0)))
        : null,
    }
  })
  return {
    ...rest,
    sizes: withVariants ? rest.sizes : null,
    options: withVariants ? rest.options : null,
    variants: withVariants ? variants : null,
    addOns: withAddOns ? rest.addOns : null,
  }
}

/**
 * The till's stock flags (`include=stock`, backend #815), as the stock mock lists the branch: a
 * counted product without sizes by its own figure, the beans per size. Null for the rest.
 */
const TILL_STOCK = {
  'p-cups': { onHand: 0, reorderLevel: 4, state: 'OUT' },
  'p-green': { onHand: 9, reorderLevel: 15, state: 'LOW' },
  'p-dates': { onHand: 84, reorderLevel: 30, state: 'OK' },
}
const TILL_STOCK_BY_SIZE = {
  '250 g': { onHand: -2, reorderLevel: 5, state: 'BELOW_ZERO' },
  '500 g': { onHand: 0, reorderLevel: 5, state: 'OUT' },
  '1 kg': { onHand: 6, reorderLevel: 15, state: 'LOW' },
}

function stockOf(p, variants) {
  if (!p.keepCount) return null
  if (variants.length) {
    return {
      onHand: null,
      reorderLevel: null,
      state: null,
      variants: variants.map((v) => ({
        variantId: v.id,
        ...(TILL_STOCK_BY_SIZE[v.size] ?? {
          onHand: null,
          reorderLevel: null,
          state: 'NOT_COUNTED',
        }),
      })),
    }
  }
  return {
    ...(TILL_STOCK[p.id] ?? { onHand: null, reorderLevel: null, state: 'NOT_COUNTED' }),
    variants: [],
  }
}

const tooPrecise = (value) =>
  value !== null && value !== undefined && round3(value) !== Number(value)

/** The four arrays onto a product (copy), or a refusal. `undefined` leaves one as it is. */
function applySetup(p, body) {
  const next = { ...p }
  const rows = (incoming, current, dupCode) => {
    if (incoming === undefined || incoming === null) return { rows: current }
    const names = new Set()
    const out = []
    for (const [index, row] of incoming.entries()) {
      const key = String(row.name ?? '')
        .trim()
        .toLowerCase()
      if (!key || names.has(key)) return { refused: problem(400, dupCode) }
      names.add(key)
      const known =
        current.find((c) => row.id && c.id === row.id) ??
        current.find((c) => same(c.name, row.name))
      out.push({
        id: known?.id ?? newId('size'),
        name: String(row.name).trim(),
        nameAr: row.nameAr ?? null,
        priceDelta: round3(row.priceDelta ?? 0),
        sortOrder: index,
        _raw: row,
      })
    }
    return { rows: out }
  }
  const sizes = rows(body.sizes, p.sizes, 'PRODUCT_SIZE_DUPLICATE')
  if (sizes.refused) return sizes
  const options = rows(body.options, p.options, 'PRODUCT_OPTION_DUPLICATE')
  if (options.refused) return options
  if (sizes.rows.length > 20 || options.rows.length > 20)
    return { refused: problem(400, 'PRODUCT_VARIANT_LIMIT') }
  for (const row of [...sizes.rows, ...options.rows]) {
    if (tooPrecise(row._raw?.priceDelta))
      return { refused: problem(400, 'PRODUCT_PRICE_TOO_PRECISE') }
    delete row._raw
  }
  next.sizes = sizes.rows
  next.options = options.rows

  if (body.addOns !== undefined && body.addOns !== null) {
    if (body.addOns.length > 50) return { refused: problem(400, 'PRODUCT_VARIANT_LIMIT') }
    const names = new Set()
    const out = []
    for (const [index, row] of body.addOns.entries()) {
      const key = String(row.name ?? '')
        .trim()
        .toLowerCase()
      if (!key || names.has(key)) return { refused: problem(400, 'PRODUCT_ADDON_DUPLICATE') }
      names.add(key)
      if (row.free && Number(row.price) > 0)
        return { refused: problem(400, 'PRODUCT_ADDON_FREE_WITH_PRICE') }
      if (tooPrecise(row.price)) return { refused: problem(400, 'PRODUCT_PRICE_TOO_PRECISE') }
      const known =
        p.addOns.find((c) => row.id && c.id === row.id) ??
        p.addOns.find((c) => same(c.name, row.name))
      out.push({
        id: known?.id ?? newId('addon'),
        name: String(row.name).trim(),
        nameAr: row.nameAr ?? null,
        price: row.free ? 0 : round3(row.price ?? 0),
        free: Boolean(row.free),
        sortOrder: index,
      })
    }
    next.addOns = out
  }

  // Combinations: keep what was stored for each, then apply the ones the request names.
  const settings = []
  for (const { s, o } of combos(next)) {
    const key = `${s?.id ?? '-'}:${o?.id ?? '-'}`
    const kept = p.variantSettings.find((v) => v.key === key)
    if (kept) settings.push({ ...kept })
  }
  next.variantSettings = settings
  view(next) // fills the defaults for combinations not stored yet
  if (body.variants !== undefined && body.variants !== null) {
    const seen = new Set()
    for (const row of body.variants) {
      const s = row.size ? next.sizes.find((x) => same(x.name, row.size)) : null
      const o = row.option ? next.options.find((x) => same(x.name, row.option)) : null
      if ((row.size && !s) || (row.option && !o))
        return { refused: problem(400, 'PRODUCT_VARIANT_UNKNOWN_COMBINATION') }
      if (
        Boolean(next.sizes.length) !== Boolean(s) ||
        Boolean(next.options.length) !== Boolean(o)
      ) {
        return { refused: problem(400, 'PRODUCT_VARIANT_UNKNOWN_COMBINATION') }
      }
      const key = `${s?.id ?? '-'}:${o?.id ?? '-'}`
      if (seen.has(key)) return { refused: problem(400, 'PRODUCT_VARIANT_DUPLICATE') }
      seen.add(key)
      const setting = next.variantSettings.find((v) => v.key === key)
      if (row.code !== undefined && row.code !== null && String(row.code).trim() !== '') {
        if (!/^[\x20-\x7e]{1,100}$/.test(row.code))
          return { refused: problem(400, 'PRODUCT_VARIANT_CODE_INVALID') }
        setting.code = String(row.code).trim()
      }
      if (row.price !== undefined) {
        if (tooPrecise(row.price)) return { refused: problem(400, 'PRODUCT_PRICE_TOO_PRECISE') }
        if (row.price !== null && row.price < 0)
          return { refused: problem(400, 'PRODUCT_VARIANT_PRICE_NEGATIVE') }
        setting.priceOverride = row.price === null ? null : round3(row.price)
      }
      if (row.onSale !== undefined) setting.onSale = Boolean(row.onSale)
      // V509: left out keeps the stored barcode, blank removes it.
      if (row.barcode !== undefined && row.barcode !== null) {
        const barcode = String(row.barcode).trim()
        if (barcode && !/^[\x21-\x7e]{1,64}$/.test(barcode))
          return { refused: problem(400, 'PRODUCT_VARIANT_BARCODE_INVALID') }
        setting.barcode = barcode || null
      }
    }
  }
  for (const v of view(next).variants) {
    if (v.price < 0) return { refused: problem(400, 'PRODUCT_VARIANT_PRICE_NEGATIVE') }
  }
  // Codes: unique within the item, against its own code and every other active product's codes.
  const codes = next.variantSettings.map((v) => v.code.toUpperCase())
  if (new Set(codes).size !== codes.length || codes.includes(next.code.toUpperCase())) {
    return { refused: problem(409, 'PRODUCT_VARIANT_CODE_DUPLICATE') }
  }
  const taken = PRODUCTS.filter((o) => o.active && o.id !== p.id).flatMap((o) => [
    o.code.toUpperCase(),
    ...o.variantSettings.map((v) => v.code.toUpperCase()),
  ])
  if (codes.some((code) => taken.includes(code)))
    return { refused: problem(409, 'PRODUCT_VARIANT_CODE_DUPLICATE') }
  return { product: next }
}

const GOODS_UNITS =
  'EA H87 C62 KGM GRM TNE LTR MLT MTR CMT MTK MTQ BX CT PK BG BO CA DZN SET PR RO ZZ'.split(' ')
const SERVICE_UNITS = 'HUR DAY WEE MON ANN E48 C62 LS KMT ZZ'.split(' ')
const TIME_UNITS = 'HUR DAY WEE MON ANN ZZ'.split(' ')
const KIND_IS = { HAND_OVER: 'G', BUNDLE: 'G', DO: 'S', BY_TIME: 'S' }

/** The refusals a save meets before it is stored, in the server's order. */
function refusal(body, id) {
  const c = body.classification ?? null
  if (body.defaultUnitPrice < 0) return problem(400, 'PRODUCT_UNIT_PRICE_NEGATIVE')
  if (tooPrecise(body.defaultUnitPrice)) return problem(400, 'PRODUCT_PRICE_TOO_PRECISE')
  if (body.itemKind && !KIND_IS[body.itemKind]) return problem(400, 'VALIDATION_FAILED')
  const kind = c?.goodsOrService ?? (body.itemKind ? KIND_IS[body.itemKind] : null)
  if (body.itemKind && c?.goodsOrService && c.goodsOrService !== KIND_IS[body.itemKind]) {
    return problem(400, 'PRODUCT_ITEM_KIND_MISMATCH')
  }
  if (
    kind === 'G' &&
    !GOODS_UNITS.includes(body.defaultUnitCode) &&
    SERVICE_UNITS.includes(body.defaultUnitCode)
  ) {
    return problem(400, 'PRODUCT_UNIT_KIND_MISMATCH')
  }
  if (
    kind === 'S' &&
    !SERVICE_UNITS.includes(body.defaultUnitCode) &&
    GOODS_UNITS.includes(body.defaultUnitCode)
  ) {
    return problem(400, 'PRODUCT_UNIT_KIND_MISMATCH')
  }
  if (body.itemKind === 'BY_TIME' && !TIME_UNITS.includes(body.defaultUnitCode)) {
    return problem(400, 'PRODUCT_UNIT_NOT_TIME_BASED')
  }
  if (kind === 'S' && c?.hsCode) return problem(400, 'HS_CODE_ON_SERVICES_LINE')
  if (kind === 'G' && c?.serviceTypeCode && c.serviceTypeCode !== '00000000') {
    return problem(400, 'PRODUCT_SERVICE_TYPE_ON_GOODS')
  }
  if (body.itemKind && kind === 'G' && !c?.hsCode) return problem(400, 'PRODUCT_HS_CODE_REQUIRED')
  if (c?.hsCode && !/^\d{12}$/.test(c.hsCode)) return problem(400, 'HS_CODE_MALFORMED')
  const category = body.defaultTaxCategory
  if (body.defaultTaxReasonCode) {
    if (!['Z', 'E'].includes(category))
      return problem(400, 'PRODUCT_TAX_REASON_CODE_NOT_APPLICABLE')
    const prefix = category === 'Z' ? 'VATZR-OM-' : 'VATEX-OM-'
    if (!body.defaultTaxReasonCode.startsWith(prefix))
      return problem(400, 'PRODUCT_TAX_REASON_CODE_INVALID')
  }
  if (body.defaultTaxReasonText && category === 'S')
    return problem(400, 'PRODUCT_TAX_REASON_NOT_APPLICABLE')
  // Z.7: export and international transport reasons belong to the sale, not the product.
  if (/^VATZR-OM-(04|05|09|10|11|12)$/.test(body.defaultTaxReasonCode ?? '')) {
    return problem(400, 'PRODUCT_TAX_REASON_NOT_A_PRODUCT_DEFAULT')
  }
  // Z.15: zero-rated as food needs an HS code on the food list in force today.
  if (
    category === 'Z' &&
    body.defaultTaxReasonCode === 'VATZR-OM-01' &&
    !matchesFor(c?.hsCode).some((m) => m.listKey === 'FOOD')
  ) {
    return problem(400, 'PRODUCT_ZERO_RATING_HS_MISMATCH')
  }
  if (body.keepCount && kind === 'S') return problem(400, 'PRODUCT_KEEP_COUNT_ON_SERVICE')
  const d = body.defaultDiscount
  if (
    d &&
    (!['PERCENTAGE', 'FIXED_AMOUNT'].includes(d.type) ||
      !(d.value >= 0) ||
      tooPrecise(d.value) ||
      (d.type === 'PERCENTAGE' && d.value > 100))
  ) {
    return problem(400, 'PRODUCT_DEFAULT_DISCOUNT_INVALID')
  }
  if (body.barcode && !/^[\x21-\x7e]{1,64}$/.test(body.barcode))
    return problem(400, 'PRODUCT_BARCODE_INVALID')
  if (body.kindId && !KINDS().some((k) => k.id === body.kindId))
    return problem(400, 'CATALOGUE_KIND_NOT_FOUND')
  const code = String(body.code ?? '')
    .trim()
    .toUpperCase()
  if (PRODUCTS.some((p) => p.active && p.id !== id && p.code.toUpperCase() === code)) {
    return problem(409, 'PRODUCT_CODE_DUPLICATE')
  }
  if (
    body.barcode &&
    PRODUCTS.some((p) => p.active && p.id !== id && p.barcode === body.barcode.trim())
  ) {
    return problem(409, 'PRODUCT_BARCODE_DUPLICATE')
  }
  return null
}

/** `ProductRequest` onto a copy of a product. */
function apply(target, body) {
  const c = body.classification ?? null
  const kind = c?.goodsOrService ?? (body.itemKind ? KIND_IS[body.itemKind] : null)
  const kindRow = body.kindId ? KINDS().find((k) => k.id === body.kindId) : null
  return {
    ...target,
    code: String(body.code ?? '').trim(),
    name: String(body.name ?? '').trim(),
    description: body.description ?? null,
    defaultUnitCode: body.defaultUnitCode,
    defaultUnitPrice: body.defaultUnitPrice,
    defaultTaxCategory: body.defaultTaxCategory,
    defaultTaxRate: body.defaultTaxRate ?? null,
    classificationGoodsOrService: kind,
    classificationIsicCode: c?.industrialClassificationCode ?? null,
    classificationHsCode: c?.hsCode ?? null,
    classificationServiceTypeCode: kind ? (c?.serviceTypeCode ?? '00000000') : null,
    defaultTaxReasonCode: body.defaultTaxReasonCode ?? null,
    defaultTaxReasonText: body.defaultTaxReasonText ?? null,
    nameAr: body.nameAr?.trim() || null,
    barcode: body.barcode?.trim() || null,
    kindId: kindRow?.id ?? null,
    groupId: kindRow?.groupId ?? null,
    itemKind: body.itemKind ?? target.itemKind ?? null,
    priceEntryIncludesVat: Boolean(body.priceEntryIncludesVat),
    staffCanChangePrice: Boolean(body.staffCanChangePrice),
    keepCount: Boolean(body.keepCount),
    defaultDiscount: body.defaultDiscount ?? null,
    updatedAt: new Date().toISOString(),
  }
}

/** Saves `body` onto `found` (or a new product), returning the stored product or a refusal. */
function save(found, body) {
  const refused = refusal(body, found?.id ?? null)
  if (refused) return { refused }
  const base = apply(found ?? product(newId('p-new'), '', '', 'EA', 0), body)
  const setup = applySetup(base, body)
  if (setup.refused) return setup
  // A save re-judges the item: a fixed one drops off Wanting attention.
  delete ATTENTION[setup.product.id]
  return { product: setup.product }
}

/** A save's answer: the item, with the warnings the save found (non-blocking, Z.15). */
function savedView(p) {
  const warning =
    p.classificationGoodsOrService === 'S'
      ? null
      : warningFor({
          hsCode: p.classificationHsCode,
          category: p.defaultTaxCategory,
          reasonCode: p.defaultTaxReasonCode,
        })
  const answer = view(p)
  answer.zeroRatingWarnings = warning
    ? [
        {
          ...warning,
          suggestedReasonCode: warning.code.endsWith('STANDARD') ? 'VATZR-OM-01' : null,
        },
      ]
    : []
  return answer
}

const ONE = /^\/api\/v1\/products\/([^/]+)$/
const find = (id) => PRODUCTS.find((p) => p.id === id)
const replace = (next) => {
  const index = PRODUCTS.findIndex((p) => p.id === next.id)
  if (index >= 0) PRODUCTS[index] = next
  else PRODUCTS.push(next)
  return next
}

const SORTS = {
  NAME: (a, b) => a.name.localeCompare(b.name),
  CODE: (a, b) => a.code.localeCompare(b.code),
  PRICE: (a, b) => a.defaultUnitPrice - b.defaultUnitPrice,
  UPDATED: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
}

export default [
  {
    match: '/api/v1/products',
    reply: ({ query }) => {
      const q = (query.get('q') ?? '').toLowerCase()
      const status = query.get('status') ?? (query.get('activeOnly') === 'false' ? 'ALL' : 'ACTIVE')
      const sort = query.get('sort') ?? 'UPDATED'
      const direction = query.get('direction') ?? (sort === 'UPDATED' ? 'DESC' : 'ASC')
      const itemKind = query.get('itemKind')
      if (
        !['ACTIVE', 'ARCHIVED', 'ALL'].includes(status) ||
        !SORTS[sort] ||
        (itemKind && !KIND_IS[itemKind])
      ) {
        return problem(400, 'VALIDATION_FAILED')
      }
      const branchId = query.get('branchId')
      // The catalogue management list also wants what is switched off or not sold there (greyed).
      const includeUnavailable = query.get('includeUnavailable') === 'true'
      if (branchId && !BRANCHES.some((b) => b.id === branchId)) {
        return problem(404, 'BRANCH_NOT_FOUND', 'not-found')
      }
      const kindId = query.get('kindId')
      const groupId = query.get('groupId')
      const barcode = query.get('barcode')
      const page = Number(query.get('page') ?? 0)
      const size = Number(query.get('size') ?? 50)
      // Backend #808 / #815: words the server does not know are left out; stock needs a branch.
      const include = (query.get('include') ?? '').split(',').map((word) => word.trim())
      const found = PRODUCTS.filter(
        (p) =>
          // With a branch: active products sold and on sale there, whatever the status; with
          // includeUnavailable, every active product.
          (branchId
            ? p.active && (includeUnavailable || priceIn(p, branchId) !== null)
            : status === 'ALL' || (status === 'ACTIVE') === p.active) &&
          // V509: a product's own barcode or one of its sizes'.
          (!barcode ||
            p.barcode === barcode ||
            view(p).variants.some((v) => v.barcode === barcode)) &&
          (!kindId || p.kindId === kindId) &&
          (!groupId || p.groupId === groupId) &&
          (!itemKind || p.itemKind === itemKind) &&
          (!q ||
            [p.name, p.code, p.nameAr, p.barcode, ...p.variantSettings.map((v) => v.code)].some(
              (text) =>
                String(text ?? '')
                  .toLowerCase()
                  .includes(q),
            )),
      ).sort((a, b) => (direction === 'DESC' ? -1 : 1) * SORTS[sort](a, b))
      return {
        content: found.slice(page * size, page * size + size).map((p) => ({
          ...view(p, { list: true, include, branchId }),
          stock:
            branchId && include.includes('stock')
              ? stockOf(p, view(p, { list: false }).variants)
              : null,
          // Greyed rows too: the branch's own price if set, else the base price.
          effectivePrice: branchId ? priceHere(p, branchId) : null,
          // Only on a branch read: false for a product switched off or not sold there.
          ...(branchId ? { availableHere: priceIn(p, branchId) !== null } : {}),
          // V509, a barcode read only: the size whose own barcode was asked, else null.
          ...(barcode
            ? {
                matchedVariantId:
                  p.barcode === barcode
                    ? null
                    : (view(p).variants.find((v) => v.barcode === barcode)?.id ?? null),
              }
            : {}),
        })),
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
      const saved = save(null, body ?? {})
      if (saved.refused) return saved.refused
      return { status: 201, body: savedView(replace(saved.product)) }
    },
  },
  {
    // Before the one-product route, which would read this as a product id.
    match: '/api/v1/products/zero-rating-attention',
    reply: ({ query }) => {
      const page = Number(query.get('page') ?? 0)
      const size = Number(query.get('size') ?? 50)
      const items = Object.entries(ATTENTION).flatMap(([id, flag]) => {
        const p = find(id)
        if (!p || !p.active) return []
        return [
          {
            productId: p.id,
            productCode: p.code,
            productName: p.name,
            code: flag.code,
            hsCode: flag.hsCode,
            taxCategory: p.defaultTaxCategory,
            reasonCode: p.defaultTaxReasonCode,
            listKey: flag.listKey,
            listEffectiveFrom: flag.listEffectiveFrom,
            judgedOn: today(),
            flaggedAt: flag.flaggedAt,
          },
        ]
      })
      return {
        items: items.slice(page * size, page * size + size),
        page,
        size,
        total: items.length,
      }
    },
  },
  {
    match: ONE,
    reply: ({ params }) => {
      const found = find(params[0])
      return found ? view(found) : problem(404, 'PRODUCT_NOT_FOUND', 'not-found')
    },
  },
  {
    method: 'PUT',
    match: ONE,
    reply: ({ params, query, body }) => {
      const found = find(params[0])
      if (!found) return problem(404, 'PRODUCT_NOT_FOUND', 'not-found')
      if (Number(query.get('expectedVersion')) !== found.version) {
        return problem(409, 'PRODUCT_VERSION_CONFLICT')
      }
      if (!found.active) return problem(409, 'PRODUCT_ARCHIVED')
      const saved = save(found, body ?? {})
      if (saved.refused) return saved.refused
      return savedView(replace({ ...saved.product, version: found.version + 1 }))
    },
  },
  {
    method: 'PUT',
    match: /^\/api\/v1\/products\/([^/]+)\/variants$/,
    reply: ({ params, query, body }) => {
      const found = find(params[0])
      if (!found) return problem(404, 'PRODUCT_NOT_FOUND', 'not-found')
      if (Number(query.get('expectedVersion')) !== found.version) {
        return problem(409, 'PRODUCT_VERSION_CONFLICT')
      }
      if (!found.active) return problem(409, 'PRODUCT_ARCHIVED')
      const setup = applySetup(found, {
        sizes: body?.sizes ?? [],
        options: body?.options ?? [],
        variants: body?.variants ?? [],
        addOns: body?.addOns ?? [],
      })
      if (setup.refused) return setup.refused
      return view(
        replace({
          ...setup.product,
          version: found.version + 1,
          updatedAt: new Date().toISOString(),
        }),
      )
    },
  },
  {
    match: /^\/api\/v1\/products\/([^/]+)\/branch-settings$/,
    reply: ({ params }) => {
      const found = find(params[0])
      return found ? settingsView(found) : problem(404, 'PRODUCT_NOT_FOUND', 'not-found')
    },
  },
  {
    method: 'PUT',
    match: /^\/api\/v1\/products\/([^/]+)\/branch-settings$/,
    reply: ({ params, query, body }) => {
      const found = find(params[0])
      if (!found) return problem(404, 'PRODUCT_NOT_FOUND', 'not-found')
      if (!found.active) return problem(409, 'PRODUCT_ARCHIVED')
      const st = settingsOf(found.id)
      if (Number(query.get('expectedVersion')) !== st.version) {
        return problem(409, 'PRODUCT_BRANCH_SETTINGS_VERSION_CONFLICT')
      }
      const availability = body?.availability
      if (!['ALL_BRANCHES', 'CHOSEN_BRANCHES'].includes(availability)) {
        return problem(400, 'VALIDATION_FAILED')
      }
      const ids = body.branchIds ?? []
      if (availability === 'CHOSEN_BRANCHES' && ids.length === 0) {
        return problem(400, 'PRODUCT_BRANCHES_REQUIRED')
      }
      if (availability === 'ALL_BRANCHES' && ids.length > 0) {
        return problem(400, 'PRODUCT_BRANCHES_NOT_ALLOWED')
      }
      const entries = body.branches ?? []
      const named = [...ids, ...entries.map((e) => e.branchId)]
      if (named.some((id) => !BRANCHES.some((b) => b.id === id))) {
        return problem(404, 'BRANCH_NOT_FOUND', 'not-found')
      }
      if (named.some((id) => !BRANCHES.find((b) => b.id === id).active)) {
        return problem(400, 'BRANCH_NOT_ACTIVE')
      }
      if (new Set(entries.map((e) => e.branchId)).size !== entries.length) {
        return problem(400, 'PRODUCT_BRANCH_DUPLICATE')
      }
      for (const e of entries) {
        if (
          e.branchPrice !== null &&
          e.branchPrice !== undefined &&
          (e.branchPrice < 0 || tooPrecise(e.branchPrice))
        ) {
          return problem(400, 'PRODUCT_BRANCH_PRICE_INVALID')
        }
      }
      const rows = { ...st.rows }
      for (const e of entries) {
        rows[e.branchId] = { branchPrice: e.branchPrice ?? null, onSale: e.onSale ?? true }
      }
      BRANCH_SETTINGS[found.id] = { availability, branchIds: ids, version: st.version + 1, rows }
      return settingsView(found)
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/products\/([^/]+)\/reactivate$/,
    reply: ({ params, query }) => {
      const found = find(params[0])
      if (!found) return problem(404, 'PRODUCT_NOT_FOUND', 'not-found')
      if (found.active) return view(found)
      if (Number(query.get('expectedVersion')) !== found.version) {
        return problem(409, 'PRODUCT_VERSION_CONFLICT')
      }
      const others = PRODUCTS.filter((p) => p.active && p.id !== found.id)
      if (others.some((p) => same(p.code, found.code)))
        return problem(409, 'PRODUCT_CODE_DUPLICATE')
      if (found.barcode && others.some((p) => p.barcode === found.barcode)) {
        return problem(409, 'PRODUCT_BARCODE_DUPLICATE')
      }
      const taken = others.flatMap((p) =>
        [p.code, ...p.variantSettings.map((v) => v.code)].map((c) => c.toUpperCase()),
      )
      if (found.variantSettings.some((v) => taken.includes(v.code.toUpperCase()))) {
        return problem(409, 'PRODUCT_VARIANT_CODE_DUPLICATE')
      }
      return view(replace({ ...found, active: true, archivedAt: null, version: found.version + 1 }))
    },
  },
  {
    method: 'DELETE',
    match: ONE,
    reply: ({ params, query }) => {
      const found = find(params[0])
      if (!found) return problem(404, 'PRODUCT_NOT_FOUND', 'not-found')
      if (!found.active) return view(found)
      if (Number(query.get('expectedVersion')) !== found.version) {
        return problem(409, 'PRODUCT_VERSION_CONFLICT')
      }
      return view(replace({ ...found, active: false, archivedAt: NOW, version: found.version + 1 }))
    },
  },
]

/** For the other catalogue routes (a kind in use, branch settings): the live products. */
export const PRODUCTS_FOR_ROUTES = () => PRODUCTS
