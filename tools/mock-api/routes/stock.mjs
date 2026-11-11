/**
 * Stock (`/v1/stock*`, `src/api/stock/stock.ts`): one shelf per branch, in the `StockRow`,
 * `StockSummary`, `StockItemDetail` and `StockMovement` shapes of openapi.yaml. The same rows answer
 * for every branch; the writes answer `StockAdjustmentResponse` and change nothing, so the
 * screens render the same each time. For screenshots and the responsive harness only.
 */

const SUPPLIER = { supplierId: '00000000-0000-4000-8000-000000000001', name: 'Muscat Roastery Co' }

const row = (productId, code, name, unitCode, extra = {}) => ({
  productId,
  variantId: null,
  code,
  name,
  nameAr: null,
  variantName: null,
  // Backend #808 (P.19): the size in Arabic and the item's group and kind.
  variantNameAr: null,
  kindId: null,
  kindName: null,
  kindNameAr: null,
  groupId: null,
  groupName: null,
  groupNameAr: null,
  variantRetired: false,
  productActive: true,
  keepCount: true,
  unitCode,
  onHand: 0,
  reorderLevel: null,
  state: 'OK',
  perDay: 0,
  daysLeft: null,
  averageCost: null,
  lastCost: null,
  worth: null,
  sellingPrice: null,
  onOrder: [],
  supplier: SUPPLIER,
  lastMovementAt: '2026-10-26T09:12:00Z',
  lastCountedAt: '2026-10-20T06:00:00Z',
  version: 3,
  ...extra,
})

const BEANS_PLACE = {
  kindId: 'k-beans',
  kindName: 'Roasted beans',
  kindNameAr: 'بن محمص',
  groupId: 'g-beans',
  groupName: 'Beans and ground',
  groupNameAr: 'البن الحب والمطحون',
}

const ROWS = [
  row('p-cups', 'CUP-500', 'Takeaway cups - 500 pack', 'PK', {
    nameAr: 'أكواب سفري - عبوة 500',
    onHand: 0,
    reorderLevel: 4,
    state: 'OUT',
    perDay: 0.6,
    averageCost: 14.2,
    lastCost: 14.5,
    sellingPrice: 22.8,
    lastMovementAt: '2026-10-26T14:05:00Z',
  }),
  row('p-beans', 'BEAN-HB-1K', 'Coffee Beans 1kg - House Blend', 'KGM', {
    nameAr: 'حبوب قهوة 1 كغ - الخلطة المنزلية',
    variantId: 'v-beans-1kg',
    variantName: '1 kg',
    variantNameAr: '1 كغ',
    ...BEANS_PLACE,
    onHand: 6,
    reorderLevel: 15,
    state: 'LOW',
    perDay: 3.1,
    daysLeft: 1,
    averageCost: 7.4,
    lastCost: 7.4,
    worth: 44.4,
    sellingPrice: 16.3,
  }),
  row('p-green', 'BEAN-YG', 'Green Beans - Yirgacheffe', 'KGM', {
    nameAr: 'حبوب خضراء - يرغاتشيفي',
    onHand: 9,
    reorderLevel: 15,
    state: 'LOW',
    perDay: 2.2,
    daysLeft: 4,
    averageCost: 8.5,
    lastCost: 8.5,
    worth: 76.5,
    sellingPrice: 10.25,
  }),
  row('p-syrup', 'SYR-VAN', 'Vanilla syrup 750ml', 'EA', {
    nameAr: 'شراب الفانيلا 750 مل',
    onHand: 11,
    reorderLevel: 8,
    perDay: 0.32,
    daysLeft: 34,
    averageCost: 2.9,
    lastCost: 3.05,
    worth: 31.9,
    sellingPrice: 4.75,
    onOrder: [
      {
        purchaseOrderId: 'po-0029',
        number: 'PO-0029',
        quantity: 12,
        wantedBy: '2026-11-04',
      },
    ],
    supplier: { supplierId: '00000000-0000-4000-8000-000000000003', name: 'Sohar Packaging LLC' },
  }),
  row('p-dates', 'DATES-KH', 'Khalas dates 1kg', 'KGM', {
    nameAr: 'تمر خلاص 1 كغ',
    onHand: 84,
    reorderLevel: 30,
    perDay: 3.9,
    daysLeft: 21,
    averageCost: 2.1,
    lastCost: 2.1,
    worth: 176.4,
    sellingPrice: 3.2,
  }),
  row('p-export', 'BEAN-EXP', 'Export beans - Salalah lot', 'KGM', {
    onHand: null,
    state: 'NOT_COUNTED',
    lastMovementAt: null,
    lastCountedAt: null,
    supplier: null,
    version: 0,
  }),
]

const SUMMARY = (branchId) => ({
  branchId,
  counted: 5,
  notCounted: 1,
  worth: 329.2,
  runningLow: 2,
  nothingLeft: 1,
  belowZero: 0,
  needsOrdering: 3,
  sittingStill: 1,
  lastSevenDays: {
    from: '2026-10-22',
    to: '2026-10-28',
    sold: 164,
    received: 48,
    writtenOff: 6,
    corrected: -1,
    returned: 2,
  },
})

const STATUS = {
  ALL: () => true,
  NEEDS_ORDERING: (r) => ['LOW', 'OUT', 'BELOW_ZERO'].includes(r.state),
  OUT: (r) => r.state === 'OUT',
  BELOW_ZERO: (r) => r.state === 'BELOW_ZERO',
  LOW: (r) => r.state === 'LOW',
  SITTING_STILL: (r) => r.onHand !== null && r.perDay < 0.5,
  NOT_COUNTED: (r) => r.onHand === null,
  COUNTED: (r) => r.onHand !== null,
}

const days = (n) => {
  const out = []
  const end = Date.UTC(2026, 9, 28)
  let onHand = 28
  for (let i = n - 1; i >= 0; i -= 1) {
    const date = new Date(end - i * 86400000).toISOString().slice(0, 10)
    const index = n - 1 - i
    if (index === 7) onHand += 25
    else onHand = Math.max(6, onHand - 2)
    out.push({ date, onHandEnd: onHand, sold: 2, received: index === 7 ? 25 : 0, writtenOff: 0 })
  }
  return out
}

const movement = (id, type, quantityChange, onHandAfter, occurredAt, extra = {}) => ({
  id,
  type,
  quantityChange,
  onHandAfter,
  countedQuantity: null,
  unitCost: null,
  averageCostAfter: null,
  source: { type: 'POS_SALE', id: `src-${id}`, number: null, lineRef: '1', link: null },
  supplier: null,
  supplierReference: null,
  reasonCode: null,
  note: null,
  occurredAt,
  recordedAt: occurredAt,
  by: { userId: 'u-1', name: 'Hafidh Saif' },
  customerKind: 'WALK_IN',
  ...extra,
})

const MOVEMENTS = [
  movement('m1', 'SALE', -1, 6, '2026-10-28T10:22:00Z'),
  movement('m2', 'SALE', -2, 7, '2026-10-28T05:05:00Z', {
    source: {
      type: 'INVOICE',
      id: 'inv-2046',
      number: 'INV-2046',
      lineRef: '2',
      link: { kind: 'INVOICE', id: 'inv-2046' },
    },
    customerKind: 'BUSINESS',
  }),
  movement('m3', 'WRITE_OFF', -1, 9, '2026-10-27T12:40:00Z', {
    source: { type: 'WRITE_OFF', id: 'adj-1', number: 'STK-2026-000012', lineRef: '1', link: null },
    reasonCode: 'DAMAGED',
    note: 'Split bag',
    unitCost: 7.4,
  }),
  movement('m4', 'REFUND_RETURN', 1, 10, '2026-10-26T08:18:00Z', {
    source: {
      type: 'CREDIT_NOTE',
      id: 'cn-1',
      number: 'CN-0012',
      lineRef: '1',
      link: { kind: 'CREDIT_NOTE', id: 'cn-1' },
    },
  }),
  // A cancelled invoice gives its stock back (backend #845).
  movement('m4a', 'CANCEL_REVERSAL', 1, 9, '2026-10-25T09:00:00Z', {
    source: {
      type: 'CANCELLATION',
      id: 'inv-2031',
      number: 'INV-2031',
      lineRef: '1',
      link: { kind: 'INVOICE', id: 'inv-2031' },
    },
    customerKind: null,
  }),
  // "Record what came in" with the supplier's own reference (backend #815).
  movement('m4b', 'RECEIPT', 12, 9, '2026-10-24T06:30:00Z', {
    source: { type: 'DELIVERY', id: 'dlv-3', number: 'DLV-2026-000003', lineRef: '1', link: null },
    supplier: SUPPLIER,
    supplierReference: 'RS-INV-7781',
    unitCost: 7.2,
    averageCostAfter: 7.35,
  }),
  movement('m5', 'RECEIPT', 25, 40, '2026-10-21T03:15:00Z', {
    source: {
      type: 'GOODS_RECEIPT',
      id: 'grn-91',
      number: 'GRN-0091',
      lineRef: '1',
      link: { kind: 'PURCHASE_ORDER', id: 'po-0033' },
    },
    supplier: SUPPLIER,
    unitCost: 7.4,
    averageCostAfter: 7.4,
  }),
  movement('m6', 'COUNT_CORRECTION', -1, 15, '2026-10-20T13:02:00Z', {
    source: {
      type: 'STOCK_COUNT',
      id: 'adj-0',
      number: 'STK-2026-000011',
      lineRef: '1',
      link: null,
    },
    countedQuantity: 15,
  }),
]

const findRow = (productId, variantId) =>
  ROWS.find((r) => r.productId === productId && (r.variantId ?? '') === (variantId ?? ''))

const adjustment = (kind, body) => ({
  status: 201,
  body: {
    adjustmentId: 'adj-new',
    number: kind === 'DELIVERY' ? 'DLV-2026-000004' : 'STK-2026-000123',
    kind,
    ...(kind === 'DELIVERY' ? { supplierId: body?.supplierId } : {}),
    lines: (body?.lines ?? []).map((line, index) => ({
      productId: line.productId,
      variantId: line.variantId ?? null,
      onHandAfter: line.countedQuantity ?? line.quantity ?? 0,
      movementId: `mv-${index}`,
    })),
  },
})

/* Opening stock (`/v1/stock/opening*`): the `StockOpeningPage` row shape of openapi.yaml. */
const opening = (r, state, extra = {}) => ({
  productId: r.productId,
  variantId: r.variantId,
  code: r.code,
  variantCode: r.variantId ? `${r.code}-V` : null,
  name: r.name,
  nameAr: r.nameAr,
  variantName: r.variantName,
  variantRetired: false,
  productActive: true,
  keepCount: true,
  unitCode: r.unitCode,
  state,
  opening: null,
  onHand: r.onHand,
  lockedBy: null,
  lockedAt: null,
  ...extra,
})

const SET_BY = { userId: 'u-1', name: 'Hafidh Saif' }

const OPENINGS = [
  opening(ROWS[5], 'NOT_SET', { onHand: null }),
  opening(ROWS[3], 'NOT_SET', { onHand: null }),
  opening(ROWS[4], 'SET', {
    onHand: 84,
    opening: {
      quantity: 84,
      unitCost: 2.1,
      value: 176.4,
      adjustmentId: 'adj-opn-1',
      number: 'OPN-2026-000001',
      movementId: 'mv-opn-1',
      setAt: '2026-10-29T06:00:00Z',
      setBy: SET_BY,
    },
  }),
  opening(ROWS[1], 'LOCKED', {
    opening: {
      quantity: 20,
      unitCost: 7.4,
      value: 148,
      adjustmentId: 'adj-opn-1',
      number: 'OPN-2026-000001',
      movementId: 'mv-opn-2',
      setAt: '2026-10-20T06:00:00Z',
      setBy: SET_BY,
    },
    lockedBy: 'SALE',
    lockedAt: '2026-10-21T09:30:00Z',
  }),
  opening(ROWS[0], 'LOCKED', { lockedBy: 'RECEIPT', lockedAt: '2026-10-06T08:00:00Z' }),
]

const openingAnswer = (lines) => ({
  status: 201,
  body: {
    adjustmentId: 'adj-opn-new',
    number: 'OPN-2026-000002',
    kind: 'OPENING',
    lines,
  },
})

const OPENING_FORMAT =
  'code,variant_code,barcode,item,size,option,opening_quantity,opening_unit_cost\n' +
  'BEAN-HB-1K,BEAN-HB-1K-V,,Coffee Beans 1kg - House Blend,1 kg,,20,7.400\n' +
  'DATES-KH,,,Khalas dates 1kg,,,84,\n'

export default [
  {
    match: '/api/v1/stock/opening/import-format',
    reply: () => ({
      status: 200,
      raw: OPENING_FORMAT,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="opening-stock.csv"',
      },
    }),
  },
  {
    method: 'POST',
    match: '/api/v1/stock/opening/import',
    // The multipart file is not read here: the answer is two rows set.
    reply: () =>
      openingAnswer(
        [ROWS[5], ROWS[3]].map((r, index) => ({
          row: index + 2,
          productId: r.productId,
          variantId: r.variantId,
          previousQuantity: 0,
          quantity: 10,
          unitCost: null,
          value: null,
          averageCostAfter: null,
          onHandAfter: 10,
          movementId: `mv-opn-${index}`,
        })),
      ),
  },
  {
    method: 'POST',
    match: '/api/v1/stock/opening',
    reply: ({ body }) => {
      const items = body?.items ?? []
      const errors = items.flatMap((item, index) => {
        const found = OPENINGS.find(
          (o) => o.productId === item.productId && (o.variantId ?? '') === (item.variantId ?? ''),
        )
        if (found?.state !== 'LOCKED') return []
        return [
          {
            row: index + 1,
            column: null,
            productId: item.productId,
            variantId: item.variantId ?? null,
            code: 'STOCK_OPENING_LOCKED',
            message: 'Use a count',
          },
        ]
      })
      if (errors.length) return { status: 409, body: { code: 'STOCK_OPENING_LOCKED', errors } }
      return openingAnswer(
        items.map((item, index) => ({
          row: index + 1,
          productId: item.productId,
          variantId: item.variantId ?? null,
          previousQuantity: 0,
          quantity: item.quantity,
          unitCost: item.unitCost ?? null,
          value: item.unitCost === undefined ? null : item.quantity * item.unitCost,
          averageCostAfter: item.unitCost ?? null,
          onHandAfter: item.quantity,
          movementId: `mv-opn-${index}`,
        })),
      )
    },
  },
  {
    match: '/api/v1/stock/opening',
    reply: ({ query }) => {
      const state = query.get('state')
      const size = Number(query.get('size') ?? 100)
      const page = Number(query.get('page') ?? 0)
      const rows = OPENINGS.filter((o) => !state || o.state === state)
      return {
        branchId: query.get('branchId'),
        page,
        size,
        totalElements: rows.length,
        content: rows.slice(page * size, page * size + size),
      }
    },
  },
  {
    match: '/api/v1/stock/summary',
    reply: ({ query }) => SUMMARY(query.get('branchId')),
  },
  {
    match: '/api/v1/stock',
    reply: ({ query }) => {
      const status = query.get('status') ?? 'ALL'
      const q = (query.get('q') ?? '').toLowerCase()
      const size = Number(query.get('size') ?? 50)
      const page = Number(query.get('page') ?? 0)
      let rows = ROWS.filter(STATUS[status] ?? STATUS.ALL).filter(
        (r) => !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q),
      )
      const sort = query.get('sort') ?? 'LOWEST_FIRST'
      if (sort === 'NAME') rows = [...rows].sort((a, b) => a.name.localeCompare(b.name))
      if (sort === 'WORTH_MOST') rows = [...rows].sort((a, b) => (b.worth ?? 0) - (a.worth ?? 0))
      return {
        branchId: query.get('branchId'),
        page,
        size,
        totalElements: rows.length,
        content: rows.slice(page * size, page * size + size),
      }
    },
  },
  {
    match: /^\/api\/v1\/stock\/items\/([^/]+)\/movements$/,
    reply: () => ({ content: MOVEMENTS, page: 0, size: 20, totalElements: MOVEMENTS.length }),
  },
  {
    match: /^\/api\/v1\/stock\/items\/([^/]+)$/,
    reply: ({ params, query }) => {
      const found =
        findRow(params[0], query.get('variantId')) ?? ROWS.find((r) => r.productId === params[0])
      if (!found) return { status: 404, body: { code: 'STOCK_ITEM_NOT_FOUND' } }
      return {
        ...found,
        daily: days(30),
        lastReceipt: {
          source: 'GOODS_RECEIPT',
          id: 'grn-91',
          number: 'GRN-0091',
          purchaseOrderId: 'po-0033',
          purchaseOrderNumber: 'PO-0033',
          supplierId: SUPPLIER.supplierId,
          supplierName: SUPPLIER.name,
          receivedOn: '2026-10-06',
          quantity: 25,
          unitCost: 7.4,
        },
        leadDays: 6,
        usualOrderQuantity: 25,
        movements: { content: MOVEMENTS, page: 0, size: 20, totalElements: MOVEMENTS.length },
        dependsOnIt: null,
      }
    },
  },
  { method: 'POST', match: '/api/v1/stock/counts', reply: ({ body }) => adjustment('COUNT', body) },
  {
    method: 'POST',
    match: '/api/v1/stock/write-offs',
    reply: ({ body }) => adjustment('WRITE_OFF', body),
  },
  {
    method: 'POST',
    match: '/api/v1/stock/deliveries',
    reply: ({ body }) => adjustment('DELIVERY', body),
  },
  {
    method: 'PUT',
    match: /^\/api\/v1\/stock\/items\/([^/]+)\/reorder-level$/,
    reply: ({ params, query, body }) => {
      const found = findRow(params[0], query.get('variantId')) ?? ROWS[0]
      return { ...found, reorderLevel: body?.reorderLevel ?? null, version: found.version + 1 }
    },
  },
  {
    method: 'PUT',
    match: '/api/v1/stock/reorder-levels',
    reply: ({ body }) => ({
      branchId: body?.branchId,
      content: (body?.items ?? []).map((item) => ({
        ...(findRow(item.productId, item.variantId) ?? ROWS[0]),
        reorderLevel: item.reorderLevel,
      })),
    }),
  },
]
