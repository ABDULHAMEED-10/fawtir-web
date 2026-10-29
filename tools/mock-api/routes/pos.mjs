/**
 * The till (`/v1/pos/*`): tills and shifts, the sale and its receipt, Today, closing a shift, the
 * day summary, refunds and bank slips. Shapes follow `src/api/pos/pos.ts`; refusals are problem
 * documents with a top-level `code` (and any figures the screen shows beside it), as
 * `src/api/errors.ts` reads them. In memory, per branch and created on first read, so a restart
 * puts the day back. Money is OMR at three decimals; times are Muscat time (UTC+4).
 *
 * The close preview's figures are the Close-shift frame's (31 cash sales, 61 card…), not a sum of
 * the seven seeded rows: the frame shows a full day, the rows only the Today list's first page.
 */

import { deflateSync } from 'node:zlib'
import { createHash, randomUUID } from 'node:crypto'

const round3 = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000
const sum = (values) => round3(values.reduce((a, b) => a + Number(b ?? 0), 0))
const nowIso = () => new Date().toISOString()

/** Today's business date in the company's time zone. */
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Muscat' })
/** `HH:MM` Muscat time on the business date, as an ISO instant. */
const at = (date, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(`${date}T00:00:00Z`).getTime() + ((h - 4) * 60 + m) * 60_000
}
const iso = (ms) => new Date(ms).toISOString()
const muscatTime = (ms) =>
  new Date(ms).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Muscat',
    hour: '2-digit',
    minute: '2-digit',
  })

const problem = (status, code, extra = {}, slug) => ({
  status,
  headers: { 'Content-Type': 'application/problem+json' },
  body: {
    type: `https://api.fawtir.om/problems/${
      slug ??
      (status === 404 ? 'not-found' : status === 409 ? 'resource-conflict' : 'validation-failed')
    }`,
    title: code,
    status,
    code,
    ...extra,
  },
})

const NASSER = { userId: 'u-nasser', name: 'Nasser Al Habsi' }
const YUSUF = { userId: 'u-yusuf', name: 'Yusuf Al Rawahi' }
const WALK_IN_ID = 'c-walk-in'

const BRANCH_NAMES = {
  'b-main': 'Al Bahja Coffee (Main)',
  'b-nizwa': 'Al Bahja Coffee (Nizwa)',
  'b-seeb': 'Al Bahja Coffee (Seeb)',
  'b-sohar': 'Al Bahja Roastery (Sohar)',
}
const BRANCH_CODES = { 'b-main': 'MCT', 'b-nizwa': 'NIZ', 'b-seeb': 'SEB', 'b-sohar': 'SOH' }
const baseOf = (branchId) =>
  BRANCH_CODES[branchId] ??
  (String(branchId ?? '')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 3)
    .toUpperCase() ||
    'MCT')

/** Names the till can show for a customer id: the directory's company plus those added here. */
const CUSTOMER_NAMES = { 'c-grand': 'Muscat Grand Hotel LLC', [WALK_IN_ID]: null }

const ALLOWED_DENOMINATIONS = [50, 20, 10, 5, 1, 0.5, 0.2, 0.1, 0.05, 0.025, 0.01, 0.005]
/** What the shift's card sales add up to in Fawtir, for the terminal check. */
const FAWTIR_CARD_TOTAL = 608.57

/* ------------------------------------------------------------------- state */

const branches = new Map() // branchId -> { till, shifts: [], }
const tills = new Map() // tillId -> till
const shifts = new Map() // shiftId -> { shift, movements: [], close, closeKey }
const sales = new Map() // saleId -> record
const saleKeys = new Map() // idempotency key -> { body, saleId }
const refundKeys = new Map()
const closeKeys = new Map()
const slips = new Map()

let seq = 1
const newId = (prefix) => `${prefix}-${String(seq++).padStart(4, '0')}`

function shiftDto(entry) {
  return { ...entry.shift }
}

function ensureBranch(branchId) {
  const key = branchId || 'b-main'
  if (branches.has(key)) return branches.get(key)
  const date = today()
  const base = baseOf(key)
  const tillId = `till-${key}-1`
  const yusufShift = {
    shiftId: `shift-${key}-yusuf`,
    tillId,
    branchId: key,
    cashier: YUSUF,
    status: 'CLOSED',
    businessDate: date,
    openedAt: iso(at(date, '06:30')),
    openingFloat: 30,
    openingFloatSource: 'CLOSE',
    endedAt: iso(at(date, '12:30')),
    handedOverFrom: null,
  }
  const nasserShift = {
    shiftId: `shift-${key}-nasser`,
    tillId,
    branchId: key,
    cashier: NASSER,
    status: 'OPEN',
    businessDate: date,
    openedAt: iso(at(date, '12:34')),
    openingFloat: 30,
    openingFloatSource: 'CLOSE',
    endedAt: null,
    handedOverFrom: null,
  }
  const till = {
    id: tillId,
    branchId: key,
    number: 1,
    code: 'T01',
    seriesBase: `${base}-T01`,
    name: 'Till 1',
    status: 'ACTIVE',
    defaultFloat: 30,
    version: 0,
    openShift: { shiftId: nasserShift.shiftId, cashier: NASSER, openedAt: nasserShift.openedAt },
    series: {
      INVOICE: { series: `${base}-T01-INV`, year: 2026, nextValue: 49 },
      CREDIT_NOTE: { series: `${base}-T01-CRN`, year: 2026, nextValue: 8 },
    },
  }
  const state = { branchId: key, till, tills: [till], date }
  branches.set(key, state)
  tills.set(tillId, till)
  const yusufClose = {
    shiftId: yusufShift.shiftId,
    closedAt: iso(at(date, '12:33')),
    countedCash: 31.75,
    expectedCash: 32.1,
    overShort: -0.35,
    floatLeft: 30,
    toBank: 1.75,
    cardTerminalTotal: 3.78,
    cardTerminalDifference: 0,
    cardDifferenceNote: null,
  }
  shifts.set(yusufShift.shiftId, { shift: yusufShift, movements: [], close: yusufClose })
  shifts.set(nasserShift.shiftId, {
    shift: nasserShift,
    movements: [
      {
        movementId: `mv-${key}-1`,
        shiftId: nasserShift.shiftId,
        type: 'PAID_OUT',
        amount: 12,
        note: 'Milk delivery',
        recordedAt: iso(at(date, '13:10')),
      },
    ],
    close: null,
  })
  seedSales(state, yusufShift, nasserShift)
  return state
}

/* ------------------------------------------------------------- the seeded day */

function item(lineNumber, productId, description, quantity, unitPrice, extra = {}) {
  return {
    lineNumber,
    role: 'ITEM',
    productId,
    description,
    quantitySold: quantity,
    quantityRefunded: 0,
    unitPrice,
    discount: null,
    vatRate: 5,
    vatCategory: 'S',
    refundable: true,
    ...extra,
  }
}

function seedSales(state, yusuf, nasser) {
  const { date, till } = state
  const inv = (n) => `${till.series.INVOICE.series}-2026-${String(n).padStart(6, '0')}`
  const card = (amount, code, last4) => ({
    method: 'CARD',
    amount,
    cardApprovalCode: code,
    cardLast4: last4,
  })
  const cash = (amount, tendered) => ({ method: 'CASH', amount, tendered })
  const rows = [
    {
      n: 48,
      time: '14:32',
      shift: nasser,
      summary: 'Flat White ×2, Cortado, Date & walnut slice',
      lines: [
        item(1, 'p-flat', 'Flat White · Large', 2, 1.8),
        item(2, 'p-flat', 'Flat White: + extra shot', 2, 0.3, {
          role: 'ADD_ON',
          refundable: false,
        }),
        item(3, 'p-cortado', 'Cortado', 1, 1.2),
        item(4, 'p-date-slice', 'Date & walnut slice', 1, 0.9),
      ],
      payments: [card(3, '898498', '4417'), cash(3.615, 5)],
    },
    {
      n: 47,
      time: '14:05',
      shift: nasser,
      summary: 'Cappuccino ×3',
      lines: [item(1, 'p-cap', 'Cappuccino · Large', 3, 1.8)],
      payments: [card(5.67, '311946', '0932')],
      tip: { amount: 0.5, method: 'CARD' },
    },
    {
      n: 46,
      time: '13:41',
      shift: nasser,
      summary: 'Coffee Beans 1kg - House Blend ×4',
      kind: 'BUSINESS',
      customerId: 'c-grand',
      lines: [item(1, 'p-beans', 'Coffee Beans 1kg - House Blend', 4, 9.5)],
      payments: [{ method: 'ON_ACCOUNT', amount: 39.9 }],
    },
    {
      n: 45,
      time: '12:58',
      shift: nasser,
      summary: 'Iced Latte, Croissant',
      lines: [
        item(1, 'p-iced', 'Iced Latte', 1, 1.9),
        item(2, 'p-croissant', 'Butter croissant', 1, 1.1),
      ],
      payments: [cash(3.15, 5)],
    },
    {
      n: 44,
      time: '12:20',
      shift: yusuf,
      summary: 'Flat White',
      lines: [item(1, 'p-flat', 'Flat White · Large', 1, 1.8)],
      payments: [cash(1.89, 2)],
      credit: { creditNoteNumber: `${till.series.CREDIT_NOTE.series}-2026-000007` },
    },
    {
      n: 43,
      time: '11:34',
      shift: yusuf,
      summary: 'Iced Latte ×2',
      lines: [item(1, 'p-iced', 'Iced Latte · Large', 2, 2)],
      headerDiscount: { type: 'PERCENTAGE', value: 10 },
      payments: [card(3.78, '551203', '7781')],
    },
    {
      n: 42,
      time: '10:47',
      shift: yusuf,
      summary: 'Espresso, Date & walnut slice',
      lines: [
        item(1, 'p-espresso', 'Espresso · Double', 1, 1.1),
        item(2, 'p-date-slice', 'Date & walnut slice', 1, 0.9),
      ],
      payments: [cash(2.1, 2.1)],
    },
  ]
  for (const r of rows) {
    const record = makeSale({
      branchId: state.branchId,
      till,
      shift: r.shift,
      invoiceNumber: inv(r.n),
      soldAtMs: at(date, r.time),
      kind: r.kind ?? 'WALK_IN',
      customerId: r.customerId ?? WALK_IN_ID,
      customerName: CUSTOMER_NAMES[r.customerId] ?? null,
      lines: r.lines,
      headerDiscount: r.headerDiscount ?? null,
      payments: r.payments,
      tip: r.tip ?? null,
      summary: r.summary,
      queuedOffline: false,
    })
    if (r.credit) {
      record.credited = record.dto.totals.total
      record.creditNoteNumbers = [r.credit.creditNoteNumber]
      record.paidBack = record.dto.totals.total
      for (const line of record.lines) line.quantityRefunded = line.quantitySold
    }
    sales.set(record.dto.saleId, record)
  }
}

/* ------------------------------------------------------------------ one sale */

function discountOf(discount, base) {
  if (!discount || !discount.value) return 0
  return discount.type === 'PERCENTAGE'
    ? round3((base * Number(discount.value)) / 100)
    : round3(Math.min(Number(discount.value), base))
}

/** The totals of lines (lookup-shaped), with a whole-sale discount spread over them by net. */
function totalsOf(lines, headerDiscount, quantityOf = (l) => l.quantitySold) {
  let subtotal = 0
  let itemDiscount = 0
  const nets = lines.map((l) => {
    const q = quantityOf(l)
    const gross = round3(q * l.unitPrice)
    const lineDisc =
      l.discount?.type === 'FIXED_AMOUNT' && l.quantitySold
        ? round3((Number(l.discount.value) * q) / l.quantitySold)
        : discountOf(l.discount, gross)
    subtotal += gross
    itemDiscount += lineDisc
    return { line: l, net: gross - lineDisc }
  })
  subtotal = round3(subtotal)
  itemDiscount = round3(itemDiscount)
  const after = round3(subtotal - itemDiscount)
  const header = discountOf(headerDiscount, after)
  const share = after > 0 ? (after - header) / after : 0
  const vat = round3(
    nets.reduce((a, { line, net }) => a + (net * share * Number(line.vatRate ?? 0)) / 100, 0),
  )
  const taxable = round3(after - header)
  return {
    subtotal,
    itemDiscount,
    headerDiscount: header,
    taxable,
    vat,
    total: round3(taxable + vat),
  }
}

function qrPayload(invoiceNumber, soldAt, totals) {
  const tlv = [
    [1, 'Al Bahja Coffee LLC'],
    [2, 'OM1100223344'],
    [3, invoiceNumber],
    [4, soldAt],
    [5, totals.total.toFixed(3)],
    [6, totals.vat.toFixed(3)],
  ]
  const parts = tlv.map(([tag, value]) => {
    const bytes = Buffer.from(String(value), 'utf8')
    return Buffer.concat([Buffer.from([tag, bytes.length]), bytes])
  })
  return Buffer.concat(parts).toString('base64')
}

/**
 * A sale record: the `PosSaleDto`, the Today row and the refund lookup's lines, kept together so a
 * refund moves all three.
 */
function makeSale({
  branchId,
  till,
  shift,
  invoiceNumber,
  soldAtMs,
  kind,
  customerId,
  customerName,
  lines,
  headerDiscount,
  payments,
  tip,
  summary,
  queuedOffline,
  transactionType,
}) {
  const saleId = newId('sale')
  const totals = totalsOf(lines, headerDiscount)
  const tipCash = tip?.method === 'CASH' ? Number(tip.amount) : 0
  let tipLeft = tipCash
  const paid = payments.map((p, index) => {
    let change = null
    if (p.method === 'CASH') {
      const tendered = p.tendered ?? null
      change = tendered == null ? 0 : round3(tendered - p.amount - tipLeft)
      tipLeft = 0
    }
    return {
      method: p.method,
      amount: round3(p.amount),
      cardApprovalCode: p.cardApprovalCode ?? null,
      cardLast4: p.cardLast4 ?? p.slipFields?.cardLast4 ?? null,
      reference: p.reference ?? null,
      tendered: p.method === 'CASH' ? (p.tendered ?? round3(p.amount)) : null,
      change,
      position: index + 1,
      slip: p.slipFileId
        ? {
            fileId: p.slipFileId,
            authCode: p.slipFields?.authCode ?? null,
            rrn: p.slipFields?.rrn ?? null,
            cardLast4: p.slipFields?.cardLast4 ?? null,
            cardType: p.slipFields?.cardType ?? null,
            amount: p.slipFields?.amount ?? null,
            amountDiffers:
              p.slipFields?.amount != null && round3(p.slipFields.amount) !== round3(p.amount),
          }
        : null,
    }
  })
  const onAccount = sum(paid.filter((p) => p.method === 'ON_ACCOUNT').map((p) => p.amount))
  const tipAmount = round3(tip?.amount ?? 0)
  const type =
    transactionType ?? (kind === 'WALK_IN' || kind === 'CONSUMER' ? 'SIMPLIFIED' : 'FULL_TAX')
  const soldAt = iso(soldAtMs)
  const company = kind === 'BUSINESS' || kind === 'GOVERNMENT'
  const dto = {
    saleId,
    tillId: till.id,
    tillNumber: till.number,
    branchId,
    shiftId: shift.shiftId,
    cashier: shift.cashier,
    invoiceId: `inv-${saleId}`,
    invoiceNumber,
    transactionType: type,
    customerKind: kind,
    customerId,
    issueDate: soldAt.slice(0, 10),
    soldAt,
    receivedAt: soldAt,
    queuedOffline,
    totals,
    payments: paid,
    onAccount,
    tip: tipAmount,
    tipMethod: tip?.method ?? null,
    receipt: {
      invoiceTotal: totals.total,
      tip: tipAmount,
      totalPaid: round3(sum(paid.map((p) => p.amount)) - onAccount + tipAmount),
      onAccount,
      qr:
        type === 'SIMPLIFIED'
          ? {
              status: 'READY',
              payload: qrPayload(invoiceNumber, soldAt, totals),
              pngUrl: `/api/v1/pos/sales/${saleId}/qr`,
            }
          : { status: 'NOT_APPLICABLE', payload: null, pngUrl: null },
    },
    filing: {
      dispatchState: 'DISPATCHED',
      tddStatus: 'ACCEPTED',
      acceptedAt: iso(soldAtMs + 4000),
      channel: company ? 'PEPPOL' : 'TAX_AUTHORITY',
    },
    warnings: [],
  }
  return {
    dto,
    lines: lines.map((l) => ({ ...l })),
    headerDiscount,
    summary,
    customerName,
    credited: 0,
    paidBack: 0,
    creditNoteNumbers: [],
    refunds: [],
  }
}

function rowOf(record) {
  const s = record.dto
  const methods = [...new Set(s.payments.map((p) => p.method))]
  const fully = record.credited > 0 && round3(record.credited) >= round3(s.totals.total)
  const state = record.credited <= 0 ? 'NONE' : fully ? 'FULLY' : 'PARTLY'
  const company = s.customerKind === 'BUSINESS' || s.customerKind === 'GOVERNMENT'
  return {
    saleId: s.saleId,
    invoiceId: s.invoiceId,
    invoiceNumber: s.invoiceNumber,
    soldAt: s.soldAt,
    time: muscatTime(Date.parse(s.soldAt)),
    tillId: s.tillId,
    tillNumber: s.tillNumber,
    shiftId: s.shiftId,
    cashier: s.cashier,
    summary: record.summary,
    items: record.lines
      .filter((l) => l.role !== 'ADD_ON')
      .reduce((a, l) => a + Number(l.quantitySold), 0),
    customer: { kind: s.customerKind, customerId: s.customerId, name: record.customerName },
    transactionType: s.transactionType,
    paymentTerms: s.onAccount > 0 ? 'NET30' : 'NET0',
    payMethod: methods.length > 1 ? 'MIXED' : methods[0],
    payments: s.payments,
    total: s.totals.total,
    tip: s.tip,
    onAccount: s.onAccount,
    changeGiven: sum(s.payments.map((p) => p.change ?? 0)),
    credit: {
      state,
      credited: round3(record.credited),
      creditNoteNumbers: record.creditNoteNumbers,
    },
    // As backend #810 reads the filing: waiting until accepted, failed when it never went.
    displayState: fully
      ? 'credited'
      : ['DEAD_LETTERED', 'CANCELLED'].includes(s.filing.dispatchState) ||
          [
            'GENERATION_FAILED',
            'REJECTED',
            'DEAD_LETTERED',
            'TO_DISREGARD',
            'DISREGARD_SUBMITTED',
          ].includes(s.filing.tddStatus)
        ? 'failed'
        : company
          ? 'peppol'
          : s.filing.tddStatus === 'ACCEPTED'
            ? 'filed'
            : 'waiting',
    filing: s.filing,
    refundable: !fully,
    queuedOffline: s.queuedOffline,
  }
}

const branchRecords = (branchId) =>
  [...sales.values()]
    .filter((r) => r.dto.branchId === branchId)
    .sort((a, b) => Date.parse(b.dto.soldAt) - Date.parse(a.dto.soldAt))

const TAB_TEST = {
  ALL: () => true,
  CASH: (r) => r.payments.some((p) => p.method === 'CASH'),
  CARD: (r) => r.payments.some((p) => p.method === 'CARD'),
  TRANSFER: (r) => r.payments.some((p) => p.method === 'TRANSFER'),
  ON_ACCOUNT: (r) => r.payments.some((p) => p.method === 'ON_ACCOUNT'),
  COMPANY: (r) => r.customer.kind === 'BUSINESS' || r.customer.kind === 'GOVERNMENT',
  REFUNDED: (r) => r.credit.state !== 'NONE',
  MINE: (r) => r.cashier.userId === NASSER.userId,
}

function dayFigures(records) {
  const rows = records.map(rowOf)
  const amount = sum(rows.map((r) => r.total))
  const byMethod = ['CASH', 'CARD', 'TRANSFER', 'ON_ACCOUNT'].map((method) => {
    const parts = rows.flatMap((r) => r.payments.filter((p) => p.method === method))
    return {
      method,
      count: rows.filter((r) => r.payments.some((p) => p.method === method)).length,
      amount: sum(parts.map((p) => p.amount)),
    }
  })
  const refunded = records.filter((r) => r.credited > 0)
  const creditedVat = sum(refunded.map((r) => (r.credited * 5) / 105))
  return {
    rows,
    sales: { count: rows.length, amount, average: rows.length ? round3(amount / rows.length) : 0 },
    byMethod,
    companyInvoices: rows.filter(TAB_TEST.COMPANY).length,
    refunds: {
      count: refunded.reduce((a, r) => a + r.creditNoteNumbers.length, 0),
      amount: sum(refunded.map((r) => r.credited)),
    },
    tips: sum(rows.map((r) => r.tip)),
    discounts: sum(records.map((r) => r.dto.totals.itemDiscount + r.dto.totals.headerDiscount)),
    vat: round3(sum(records.map((r) => r.dto.totals.vat)) - creditedVat),
    notYetAccepted: records.filter((r) => r.dto.filing.tddStatus !== 'ACCEPTED').length,
    onAccountOpen: {
      count: rows.filter((r) => r.onAccount > 0).length,
      amount: sum(rows.map((r) => r.onAccount)),
    },
  }
}

/* ----------------------------------------------------------------- the close */

function previewOf(entry) {
  const { shift, movements } = entry
  const till = tills.get(shift.tillId)
  const paidOut = sum(movements.filter((m) => m.type === 'PAID_OUT').map((m) => m.amount))
  const paidIn = sum(movements.filter((m) => m.type === 'PAID_IN').map((m) => m.amount))
  const cash = { method: 'CASH', sales: 31, taken: 218.45, refunded: 4.2, tips: 5 }
  const expectedCash = round3(
    shift.openingFloat + cash.taken + cash.tips - cash.refunded - paidOut + paidIn,
  )
  return {
    shiftId: shift.shiftId,
    tillId: shift.tillId,
    tillNumber: till?.number ?? 1,
    branchId: shift.branchId,
    cashier: shift.cashier,
    status: shift.status,
    businessDate: shift.businessDate,
    openedAt: shift.openedAt,
    endedAt: shift.endedAt,
    openingFloat: shift.openingFloat,
    openingFloatSource: shift.openingFloatSource,
    salesCount: 96,
    salesAmount: 910.6,
    byMethod: [
      cash,
      { method: 'CARD', sales: 61, taken: 604.15, refunded: 0, tips: 4.42 },
      { method: 'TRANSFER', sales: 0, taken: 0, refunded: 0, tips: 0 },
      { method: 'ON_ACCOUNT', sales: 4, taken: 88, refunded: 0, tips: 0 },
    ],
    companyInvoices: 4,
    vatWithin: 42.913,
    discounts: 62.14,
    tips: 9.42,
    paidOut,
    paidIn,
    cashRefunded: 4.2,
    expectedCash,
    looseEnds: {
      onAccountOpen: { count: 3, amount: 59.588 },
      notYetAccepted: 0,
      cardSalesForTerminalCheck: { count: 61, amount: FAWTIR_CARD_TOTAL },
    },
    movements: [...movements].sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt)),
    at: nowIso(),
  }
}

function summaryOf(entry, records) {
  const { shift, close } = entry
  return {
    shiftId: shift.shiftId,
    tillId: shift.tillId,
    tillNumber: tills.get(shift.tillId)?.number ?? 1,
    cashier: shift.cashier,
    status: shift.status,
    openedAt: shift.openedAt,
    closedAt: close?.closedAt ?? null,
    salesCount: records.filter((r) => r.dto.shiftId === shift.shiftId).length,
    cashExpected: close ? close.expectedCash : null,
    cashCounted: close ? close.countedCash : null,
    overShort: close ? close.overShort : null,
    uncountedHandover: shift.status === 'ENDED_UNCOUNTED',
    cardTerminalDifference: close ? close.cardTerminalDifference : null,
  }
}

const branchShifts = (branchId) =>
  [...shifts.values()]
    .filter((e) => e.shift.branchId === branchId)
    .sort((a, b) => Date.parse(b.shift.openedAt) - Date.parse(a.shift.openedAt))

/* ------------------------------------------------------------------- refunds */

function findByNumber(invoiceNumber) {
  // A refund may be made at another branch: make sure the default branch is seeded.
  ensureBranch('b-main')
  const wanted = String(invoiceNumber ?? '')
    .trim()
    .toUpperCase()
  return [...sales.values()].find((r) => r.dto.invoiceNumber.toUpperCase() === wanted)
}

function lookupOf(record) {
  const s = record.dto
  const byMethod = s.payments.map((p) => ({ method: p.method, amount: p.amount }))
  return {
    saleId: s.saleId,
    invoiceId: s.invoiceId,
    invoiceNumber: s.invoiceNumber,
    soldAt: s.soldAt,
    transactionType: s.transactionType,
    branch: { id: s.branchId, name: BRANCH_NAMES[s.branchId] ?? null },
    customer: { kind: s.customerKind, customerId: s.customerId, name: record.customerName },
    vatMode: 'EXCLUSIVE',
    headerDiscount: record.headerDiscount,
    lines: record.lines.map((l) => ({ ...l })),
    paid: {
      byMethod,
      total: sum(byMethod.filter((p) => p.method !== 'ON_ACCOUNT').map((p) => p.amount)),
      paidBack: round3(record.paidBack),
    },
    total: s.totals.total,
    // Backend #810: the tip paid on top, never refunded.
    tip: s.tip ?? 0,
    tipMethod: s.tip ? (s.tipMethod ?? null) : null,
    credited: round3(record.credited),
    owed: Math.max(0, round3(s.onAccount - record.credited)),
    creditNoteNumbers: record.creditNoteNumbers,
  }
}

/* ----------------------------------------------------------------- QR image */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** A QR-looking PNG (finder squares and a pattern from the payload's hash). Not scannable. */
function qrPng(seed) {
  const modules = 25
  const quiet = 4
  const scale = 6
  const n = modules + quiet * 2
  const hash = createHash('sha256').update(seed).digest()
  const finder = (x, y) => {
    for (const [fx, fy] of [
      [0, 0],
      [modules - 7, 0],
      [0, modules - 7],
    ]) {
      const dx = x - fx
      const dy = y - fy
      if (dx >= -1 && dx <= 7 && dy >= -1 && dy <= 7) {
        if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return 0
        const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3))
        return ring === 2 ? 0 : 1
      }
    }
    return null
  }
  const dark = (x, y) => {
    if (x < 0 || y < 0 || x >= modules || y >= modules) return 0
    const f = finder(x, y)
    if (f !== null) return f
    const i = y * modules + x
    return (hash[i % 32] >> (i % 8)) & 1 ? 1 : (i * 7 + y) % 5 === 0 ? 1 : 0
  }
  const size = n * scale
  const raw = Buffer.alloc((size + 1) * size)
  for (let py = 0; py < size; py++) {
    raw[py * (size + 1)] = 0
    for (let px = 0; px < size; px++) {
      const on = dark(Math.floor(px / scale) - quiet, Math.floor(py / scale) - quiet)
      raw[py * (size + 1) + 1 + px] = on ? 0 : 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 0 // greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* -------------------------------------------------------------------- routes */

const idemKey = (headers) => headers?.['idempotency-key']
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const SALE = /^\/api\/v1\/pos\/sales\/([^/]+)$/
const SHIFT = /^\/api\/v1\/pos\/shifts\/([^/]+)$/

function shiftEntry(id) {
  ensureBranch('b-main')
  return shifts.get(id)
}

export default [
  {
    match: '/api/v1/pos/tills',
    reply: ({ query }) => {
      const branchId = query.get('branchId')
      if (branchId) return ensureBranch(branchId).tills
      ensureBranch('b-main')
      return [...tills.values()]
    },
  },
  {
    method: 'POST',
    match: '/api/v1/pos/tills',
    reply: ({ body }) => {
      if (!body?.branchId) return problem(400, 'VALIDATION_FAILED')
      const state = ensureBranch(body.branchId)
      const number = state.tills.length + 1
      const code = `T${String(number).padStart(2, '0')}`
      const base = baseOf(state.branchId)
      const till = {
        id: `till-${state.branchId}-${number}`,
        branchId: state.branchId,
        number,
        code,
        seriesBase: `${base}-${code}`,
        name: body.name ?? `Till ${number}`,
        status: 'ACTIVE',
        defaultFloat: body.defaultFloat ?? 30,
        version: 0,
        openShift: null,
        series: {
          INVOICE: { series: `${base}-${code}-INV`, year: 2026, nextValue: 1 },
          CREDIT_NOTE: { series: `${base}-${code}-CRN`, year: 2026, nextValue: 1 },
        },
      }
      state.tills.push(till)
      tills.set(till.id, till)
      return { status: 201, body: till }
    },
  },
  {
    match: /^\/api\/v1\/pos\/tills\/([^/]+)$/,
    reply: ({ params }) => {
      ensureBranch('b-main')
      const till = tills.get(params[0])
      return till ?? problem(404, 'POS_TILL_NOT_FOUND')
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/pos\/tills\/([^/]+)\/shifts$/,
    reply: ({ params, body }) => {
      ensureBranch('b-main')
      const till = tills.get(params[0])
      if (!till) return problem(404, 'POS_TILL_NOT_FOUND')
      const openId = till.openShift?.shiftId
      const open = openId ? shifts.get(openId) : null
      if (open && open.shift.cashier.userId === NASSER.userId) {
        if (body?.openingFloat != null) {
          open.shift.openingFloat = round3(body.openingFloat)
          open.shift.openingFloatSource = 'SET'
        }
        return { status: 200, body: shiftDto(open) }
      }
      if (open) {
        open.shift.status = 'ENDED_UNCOUNTED'
        open.shift.endedAt = nowIso()
      }
      const shift = {
        shiftId: newId(`shift-${till.branchId}`),
        tillId: till.id,
        branchId: till.branchId,
        cashier: NASSER,
        status: 'OPEN',
        businessDate: today(),
        openedAt: nowIso(),
        openingFloat: body?.openingFloat != null ? round3(body.openingFloat) : till.defaultFloat,
        openingFloatSource: body?.openingFloat != null ? 'SET' : open ? 'HANDOVER' : 'DEFAULT',
        endedAt: null,
        handedOverFrom: open ? open.shift.shiftId : null,
      }
      shifts.set(shift.shiftId, { shift, movements: [], close: null })
      till.openShift = { shiftId: shift.shiftId, cashier: NASSER, openedAt: shift.openedAt }
      return { status: 201, body: { ...shift } }
    },
  },
  {
    method: 'POST',
    match: '/api/v1/pos/customers',
    reply: ({ body }) => {
      const b = body ?? {}
      const hasVat = Boolean(String(b.vatNumber ?? '').trim())
      const hasId = Boolean(b.identifierScheme && String(b.identifierValue ?? '').trim())
      if (!String(b.name ?? '').trim() || (!hasVat && !hasId)) {
        return problem(400, 'VALIDATION_FAILED', {
          errors: [
            {
              field: hasVat || hasId ? 'name' : 'vatNumber',
              message: 'A VAT number or a buyer identifier is required.',
              code: 'REQUIRED',
            },
          ],
        })
      }
      // Backend #810: a company the till could never invoice is refused before it is created.
      const missing = ['countryCode', 'cityName', 'streetName']
        .filter((part) => !String(b.address?.[part] ?? '').trim())
        .map((part) => `invoiceAddress.${part}`)
      if (missing.length) {
        return problem(
          400,
          'CUSTOMER_NOT_INVOICE_ELIGIBLE',
          {
            detail: `Customer is missing invoice fields: ${missing.join(', ')}`,
            missingInvoiceFields: missing,
          },
          'customer-not-invoice-eligible',
        )
      }
      const id = newId('c-pos')
      const vat = hasVat ? String(b.vatNumber).trim() : null
      CUSTOMER_NAMES[id] = b.name
      return {
        status: 201,
        body: {
          id,
          type: 'BUSINESS',
          displayName: b.name,
          profile: {
            details: {
              vatRegistrationNumber: vat,
              peppolParticipantId: vat ? { scheme: '0248', value: vat } : null,
              buyerIdentifier: hasId
                ? { scheme: b.identifierScheme, value: b.identifierValue }
                : null,
            },
            contact: {
              contactPerson: b.contactPerson ?? null,
              emailRecipients: b.email ? [b.email] : [],
            },
            deliveryPreferences: {
              sendingMethod: vat ? 'PEPPOL' : 'EMAIL_PDF',
              automaticPaymentReminders: true,
            },
            // As the server keeps it: only the address the till sent (E2E 29 Oct 2026, F-1).
            invoiceAddress: b.address ?? null,
          },
          peppolDelivery: vat ? 'PENDING_VERIFICATION' : 'NOT_APPLICABLE',
          invoiceEligible: true,
          missingInvoiceFields: [],
          status: 'ACTIVE',
          updatedAt: nowIso(),
        },
      }
    },
  },
  {
    method: 'POST',
    match: '/api/v1/pos/sales',
    reply: ({ body, headers }) => {
      const key = idemKey(headers)
      if (!key) return problem(400, 'IDEMPOTENCY_KEY_REQUIRED')
      const stored = saleKeys.get(key)
      if (stored) {
        if (!same(stored.body, body)) return problem(409, 'POS_SALE_KEY_REUSED')
        return { status: 200, body: { ...sales.get(stored.saleId).dto, replayed: true } }
      }
      const b = body ?? {}
      ensureBranch('b-main')
      const till = tills.get(b.tillId)
      if (!till) return problem(404, 'POS_TILL_NOT_FOUND')
      ensureBranch(till.branchId)
      const draftLines = b.draft?.lines ?? []
      if (!draftLines.length) return problem(400, 'VALIDATION_FAILED')
      const refs = new Map((b.lineRefs ?? []).map((r) => [r.lineNumber, r]))
      const lines = draftLines.map((l) => ({
        lineNumber: l.lineNumber,
        role: refs.get(l.lineNumber)?.role ?? (l.productId ? 'ITEM' : 'TYPED'),
        productId: l.productId ?? null,
        description: l.description,
        quantitySold: Number(l.quantity),
        quantityRefunded: 0,
        unitPrice: Number(l.unitPrice),
        discount: l.discount?.value ? l.discount : null,
        vatRate: Number(l.taxCategory?.rate ?? 0),
        vatCategory: l.taxCategory?.code ?? null,
        refundable: refs.get(l.lineNumber)?.role !== 'ADD_ON',
      }))
      const header = b.draft?.headerDiscount?.value ? b.draft.headerDiscount : null
      const totals = totalsOf(lines, header)
      const kind = b.customer?.kind ?? 'WALK_IN'
      if (kind === 'WALK_IN' && totals.taxable >= 500) {
        return problem(
          422,
          'SIMPLIFIED_INVOICE_LIMIT',
          {
            limit: 500,
            taxableAmount: totals.taxable,
            alternative: 'FULL_TAX',
            buyerIdentifierSchemes: ['CR', 'TIN', 'CID', 'PASNUM', 'OTHID'],
          },
          'simplified-invoice-limit',
        )
      }
      const payments = b.payments ?? []
      const received = sum(payments.map((p) => p.amount))
      if (received !== totals.total) {
        return problem(422, 'POS_PAYMENTS_DO_NOT_MATCH_TOTAL', {
          expected: totals.total,
          received,
        })
      }
      const shiftId = till.openShift?.shiftId
      const shift = (shiftId && shifts.get(shiftId)?.shift) ?? {
        shiftId: shiftId ?? 'shift-none',
        cashier: NASSER,
      }
      const series = till.series.INVOICE
      const invoiceNumber =
        b.invoiceNumber ??
        `${series.series}-${series.year}-${String(series.nextValue).padStart(6, '0')}`
      if (!b.invoiceNumber) series.nextValue += 1
      const customerId = b.customer?.customerId ?? b.draft?.customerId ?? WALK_IN_ID
      const customerName =
        kind === 'CONSUMER'
          ? (b.customer?.consumer?.name ?? null)
          : (CUSTOMER_NAMES[customerId] ?? null)
      const names = lines.filter((l) => l.role !== 'ADD_ON')
      const summary = names
        .map(
          (l) =>
            `${l.description.split(' · ')[0]}${l.quantitySold > 1 ? ` ×${l.quantitySold}` : ''}`,
        )
        .join(', ')
      const soldAtMs = Number.isFinite(Date.parse(b.soldAt)) ? Date.parse(b.soldAt) : Date.now()
      const record = makeSale({
        branchId: till.branchId,
        till,
        shift,
        invoiceNumber,
        soldAtMs,
        kind,
        customerId,
        customerName,
        lines,
        headerDiscount: header,
        payments,
        tip: b.tip,
        summary,
        queuedOffline: Boolean(b.queuedOffline),
        transactionType: b.draft?.details?.transactionType,
      })
      record.dto.receivedAt = nowIso()
      sales.set(record.dto.saleId, record)
      saleKeys.set(key, { body, saleId: record.dto.saleId })
      return { status: 201, body: record.dto }
    },
  },
  {
    match: '/api/v1/pos/sales',
    reply: ({ query }) => {
      const branchId = query.get('branchId') ?? 'b-main'
      const state = ensureBranch(branchId)
      const tab = query.get('tab') ?? 'ALL'
      const test = TAB_TEST[tab]
      if (!test) return problem(400, 'VALIDATION_FAILED')
      const q = (query.get('q') ?? '').trim().toLowerCase()
      const tillId = query.get('tillId')
      const shiftId = query.get('shiftId')
      const page = Number(query.get('page') ?? 0)
      const size = Number(query.get('size') ?? 50)
      const rows = branchRecords(state.branchId)
        .map(rowOf)
        .filter(
          (r) =>
            test(r) &&
            (!tillId || r.tillId === tillId) &&
            (!shiftId || r.shiftId === shiftId) &&
            (!q ||
              [r.invoiceNumber, r.summary, r.cashier.name, r.customer.name].some((t) =>
                String(t ?? '')
                  .toLowerCase()
                  .includes(q),
              ) ||
              r.payments.some((p) => p.cardLast4 === q)),
        )
      return {
        branchId: state.branchId,
        businessDate: query.get('date') ?? state.date,
        page,
        size,
        totalElements: rows.length,
        content: rows.slice(page * size, page * size + size),
      }
    },
  },
  {
    match: /^\/api\/v1\/pos\/sales\/([^/]+)\/qr$/,
    reply: ({ params }) => {
      ensureBranch('b-main')
      const record = sales.get(params[0])
      if (!record) return problem(404, 'POS_SALE_NOT_FOUND')
      if (record.dto.receipt.qr.status !== 'READY') return problem(404, 'POS_QR_NOT_READY')
      return {
        status: 200,
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
        raw: qrPng(record.dto.receipt.qr.payload),
      }
    },
  },
  {
    match: SALE,
    reply: ({ params }) => {
      ensureBranch('b-main')
      const record = sales.get(params[0])
      return record ? record.dto : problem(404, 'POS_SALE_NOT_FOUND')
    },
  },
  {
    match: '/api/v1/pos/today',
    reply: ({ query }) => {
      const state = ensureBranch(query.get('branchId') ?? 'b-main')
      const tillId = query.get('tillId')
      const records = branchRecords(state.branchId).filter(
        (r) => !tillId || r.dto.tillId === tillId,
      )
      const f = dayFigures(records)
      const count = (tab) => f.rows.filter(TAB_TEST[tab]).length
      return {
        branchId: state.branchId,
        businessDate: query.get('date') ?? state.date,
        sales: f.sales,
        byMethod: f.byMethod,
        companyInvoices: f.companyInvoices,
        refunds: f.refunds,
        tips: f.tips,
        discounts: f.discounts,
        vat: f.vat,
        busiestHour: { from: '08:00', to: '09:00', sales: 14, amount: 29.41 },
        bestSeller: { productId: 'p-flat', name: 'Flat White', quantity: 31, takings: 68.2 },
        tabs: {
          all: f.rows.length,
          cash: count('CASH'),
          card: count('CARD'),
          transfer: count('TRANSFER'),
          onAccount: count('ON_ACCOUNT'),
          company: count('COMPANY'),
          refunded: count('REFUNDED'),
          mine: count('MINE'),
        },
        notYetAccepted: f.notYetAccepted,
        lastSaleTime: f.rows[0]?.time ?? null,
      }
    },
  },
  {
    match: '/api/v1/pos/shifts',
    reply: ({ query }) => {
      const branchId = query.get('branchId')
      if (branchId) ensureBranch(branchId)
      else ensureBranch('b-main')
      const date = query.get('date')
      const tillId = query.get('tillId')
      const status = query.get('status')
      return [...shifts.values()]
        .filter(
          (e) =>
            (!branchId || e.shift.branchId === branchId) &&
            (!date || e.shift.businessDate === date) &&
            (!tillId || e.shift.tillId === tillId) &&
            (!status || e.shift.status === status),
        )
        .sort((a, b) => Date.parse(b.shift.openedAt) - Date.parse(a.shift.openedAt))
        .map((e) => summaryOf(e, branchRecords(e.shift.branchId)))
    },
  },
  {
    match: /^\/api\/v1\/pos\/shifts\/([^/]+)\/close-preview$/,
    reply: ({ params }) => {
      const entry = shiftEntry(params[0])
      return entry ? previewOf(entry) : problem(404, 'POS_SHIFT_NOT_FOUND')
    },
  },
  {
    match: SHIFT,
    reply: ({ params }) => {
      const entry = shiftEntry(params[0])
      return entry
        ? { ...shiftDto(entry), close: entry.close }
        : problem(404, 'POS_SHIFT_NOT_FOUND')
    },
  },
  {
    method: 'PUT',
    match: /^\/api\/v1\/pos\/shifts\/([^/]+)\/float$/,
    reply: ({ params, body }) => {
      const entry = shiftEntry(params[0])
      if (!entry) return problem(404, 'POS_SHIFT_NOT_FOUND')
      const amount = Number(body?.amount)
      if (!Number.isFinite(amount) || amount < 0 || round3(amount) !== amount) {
        return problem(400, 'POS_SHIFT_FLOAT_INVALID')
      }
      if (entry.shift.status !== 'OPEN') return problem(409, 'POS_SHIFT_NOT_OPEN')
      entry.shift.openingFloat = amount
      entry.shift.openingFloatSource = 'SET'
      entry.movements.push({
        movementId: newId('mv'),
        shiftId: entry.shift.shiftId,
        type: 'FLOAT_SET',
        amount,
        note: null,
        recordedAt: nowIso(),
      })
      return shiftDto(entry)
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/pos\/shifts\/([^/]+)\/cash-movements$/,
    reply: ({ params, body }) => {
      const entry = shiftEntry(params[0])
      if (!entry) return problem(404, 'POS_SHIFT_NOT_FOUND')
      const type = body?.type
      const amount = Number(body?.amount)
      if (!['PAID_OUT', 'PAID_IN'].includes(type) || !Number.isFinite(amount) || amount <= 0) {
        return problem(400, 'VALIDATION_FAILED')
      }
      const note = String(body?.note ?? '').trim() || null
      if (type === 'PAID_OUT' && !note) return problem(400, 'POS_PAID_OUT_NOTE_REQUIRED')
      if (entry.shift.status !== 'OPEN') return problem(409, 'POS_SHIFT_NOT_OPEN')
      const movement = {
        movementId: newId('mv'),
        shiftId: entry.shift.shiftId,
        type,
        amount: round3(amount),
        note,
        recordedAt: nowIso(),
      }
      entry.movements.push(movement)
      return { status: 201, body: movement }
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/pos\/shifts\/([^/]+)\/close$/,
    reply: ({ params, body, headers }) => {
      const key = idemKey(headers)
      if (!key) return problem(400, 'IDEMPOTENCY_KEY_REQUIRED')
      const stored = closeKeys.get(key)
      if (stored) {
        if (!same(stored.body, body)) return problem(409, 'POS_CLOSE_KEY_REUSED')
        return { status: 200, body: { ...stored.close, replayed: true } }
      }
      const entry = shiftEntry(params[0])
      if (!entry) return problem(404, 'POS_SHIFT_NOT_FOUND')
      if (entry.shift.status === 'CLOSED') return problem(409, 'POS_SHIFT_ALREADY_CLOSED')
      const b = body ?? {}
      const counting = b.counting
      if (!counting) return problem(400, 'VALIDATION_FAILED')
      let counted
      if (counting.mode === 'DENOMINATIONS') {
        const rows = counting.denominations ?? []
        const unknown = rows.find((d) => !ALLOWED_DENOMINATIONS.includes(Number(d.value)))
        if (unknown) return problem(400, 'POS_DENOMINATION_UNKNOWN', { value: unknown.value })
        counted = sum(rows.map((d) => Number(d.value) * Number(d.count)))
      } else {
        counted = round3(counting.total ?? 0)
      }
      const preview = previewOf(entry)
      const expected = preview.expectedCash
      const overShort = round3(counted - expected)
      if (overShort !== 0 && !b.overShortReason) {
        return problem(400, 'POS_OVER_SHORT_REASON_REQUIRED', { expected, counted, overShort })
      }
      let cardDifference = null
      if (b.cardTerminalTotal != null) {
        cardDifference = round3(Number(b.cardTerminalTotal) - FAWTIR_CARD_TOTAL)
        if (cardDifference !== 0 && !String(b.cardDifferenceNote ?? '').trim()) {
          return problem(400, 'POS_CARD_DIFFERENCE_NOTE_REQUIRED', {
            cardTerminalTotal: round3(b.cardTerminalTotal),
            fawtirCardTotal: FAWTIR_CARD_TOTAL,
            cardDifference,
          })
        }
      }
      const till = tills.get(entry.shift.tillId)
      const floatLeft =
        b.floatLeft != null ? round3(b.floatLeft) : Math.min(till?.defaultFloat ?? 30, counted)
      if (floatLeft > counted) {
        return problem(400, 'POS_FLOAT_LEFT_EXCEEDS_COUNTED', { floatLeft, counted })
      }
      const close = {
        shiftId: entry.shift.shiftId,
        closedAt: nowIso(),
        countedCash: counted,
        expectedCash: expected,
        overShort,
        floatLeft,
        toBank: round3(counted - floatLeft),
        cardTerminalTotal: b.cardTerminalTotal != null ? round3(b.cardTerminalTotal) : null,
        cardTerminalDifference: cardDifference,
        cardDifferenceNote: b.cardDifferenceNote ?? null,
      }
      entry.close = close
      entry.shift.status = 'CLOSED'
      entry.shift.endedAt = close.closedAt
      if (till?.openShift?.shiftId === entry.shift.shiftId) till.openShift = null
      closeKeys.set(key, { body, close })
      return { status: 201, body: close }
    },
  },
  {
    match: /^\/api\/v1\/pos\/days\/([^/]+)$/,
    reply: ({ params, query }) => {
      const state = ensureBranch(query.get('branchId') ?? 'b-main')
      const records = branchRecords(state.branchId)
      const f = dayFigures(records)
      const entries = branchShifts(state.branchId)
      const movements = entries.flatMap((e) => e.movements)
      const summaries = entries.map((e) => summaryOf(e, records))
      return {
        businessDate: params[0],
        branchId: state.branchId,
        totals: {
          sales: f.sales,
          byMethod: f.byMethod,
          companyInvoices: f.companyInvoices,
          refunds: f.refunds,
          tips: f.tips,
          discounts: f.discounts,
          vat: f.vat,
          paidOut: sum(movements.filter((m) => m.type === 'PAID_OUT').map((m) => m.amount)),
          paidIn: sum(movements.filter((m) => m.type === 'PAID_IN').map((m) => m.amount)),
          notYetAccepted: f.notYetAccepted,
          onAccountOpen: f.onAccountOpen,
        },
        shifts: summaries,
        openShifts: summaries.filter((s) => s.status === 'OPEN').length,
        uncountedHandovers: summaries.filter((s) => s.uncountedHandover).length,
        lateOfflineSales: [],
        filedPastRestriction: 0,
        overShortTotal: sum(summaries.map((s) => s.overShort ?? 0)),
        cardDifferenceTotal: sum(summaries.map((s) => s.cardTerminalDifference ?? 0)),
      }
    },
  },
  {
    match: '/api/v1/pos/refund-lookup',
    reply: ({ query }) => {
      const record = findByNumber(query.get('invoiceNumber'))
      return record ? lookupOf(record) : problem(404, 'POS_SALE_NOT_FOUND')
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/pos\/sales\/([^/]+)\/refunds$/,
    reply: ({ params, body, headers }) => {
      const key = idemKey(headers)
      if (!key) return problem(400, 'IDEMPOTENCY_KEY_REQUIRED')
      const stored = refundKeys.get(key)
      if (stored) {
        if (!same(stored.body, body)) return problem(409, 'POS_REFUND_KEY_REUSED')
        return { status: 200, body: { ...stored.refund, replayed: true } }
      }
      ensureBranch('b-main')
      const record = sales.get(params[0])
      if (!record) return problem(404, 'POS_SALE_NOT_FOUND')
      const b = body ?? {}
      if (b.reason === 'OTHER' && !String(b.reasonNote ?? '').trim()) {
        return problem(400, 'POS_REFUND_REASON_NOTE_REQUIRED')
      }
      const asked = new Map((b.lines ?? []).map((l) => [l.lineNumber, l]))
      if (!asked.size) return problem(400, 'POS_REFUND_LINE_INVALID')
      for (const l of asked.values()) {
        const line = record.lines.find((x) => x.lineNumber === l.lineNumber)
        if (
          !line ||
          !(Number(l.quantity) > 0) ||
          Number(l.quantity) > line.quantitySold - line.quantityRefunded
        ) {
          return problem(422, 'POS_REFUND_LINE_INVALID', { line: l.lineNumber })
        }
      }
      const chosen = record.lines.filter((l) => asked.has(l.lineNumber))
      const totals = totalsOf(chosen, record.headerDiscount, (l) =>
        Number(asked.get(l.lineNumber).quantity),
      )
      const received = sum((b.moneyBack ?? []).map((m) => m.amount))
      if (received !== totals.total) {
        return problem(422, 'POS_REFUND_MONEY_DOES_NOT_MATCH', { expected: totals.total, received })
      }
      const till = tills.get(b.tillId) ?? tills.get(record.dto.tillId)
      const series = till.series.CREDIT_NOTE
      const creditNoteNumber = `${series.series}-${series.year}-${String(series.nextValue).padStart(6, '0')}`
      series.nextValue += 1
      const warnings = chosen
        .filter((l) => asked.get(l.lineNumber).backOnShelf && l.description.includes('Flat White'))
        .map((l) => ({
          code: 'STOCK_UNIT_MISMATCH',
          line: l.lineNumber,
          message: 'Sold in another unit than the counted product; nothing went back on the shelf.',
        }))
      for (const l of chosen)
        l.quantityRefunded = round3(l.quantityRefunded + Number(asked.get(l.lineNumber).quantity))
      record.credited = round3(record.credited + totals.total)
      record.paidBack = round3(
        record.paidBack +
          sum(
            (b.moneyBack ?? []).filter((m) => m.method !== 'REDUCE_BALANCE').map((m) => m.amount),
          ),
      )
      record.creditNoteNumbers.push(creditNoteNumber)
      const refund = {
        refundId: newId('refund'),
        saleId: record.dto.saleId,
        creditNoteId: newId('crn'),
        creditNoteNumber,
        totals,
        warnings,
      }
      record.refunds.push(refund)
      refundKeys.set(key, { body, refund })
      return { status: 201, body: refund }
    },
  },
  {
    method: 'POST',
    match: '/api/v1/pos/slips',
    reply: ({ query, headers }) => {
      ensureBranch('b-main')
      const tillId = query.get('tillId')
      const till = tills.get(tillId)
      if (!till) return problem(404, 'POS_TILL_NOT_FOUND')
      const fileId = randomUUID()
      const slip = {
        fileId,
        tillId,
        branchId: till.branchId,
        contentType: 'image/jpeg',
        byteSize: Number(headers?.['content-length'] ?? 0),
        sha256: createHash('sha256').update(fileId).digest('hex'),
        uploadedAt: nowIso(),
      }
      slips.set(fileId, slip)
      return { status: 201, body: slip }
    },
  },
  {
    method: 'POST',
    match: '/api/v1/pos/slips/read',
    reply: ({ body }) => {
      const fileId = body?.fileId
      if (!fileId) return problem(400, 'VALIDATION_FAILED')
      if (!slips.has(fileId)) return problem(404, 'POS_SLIP_NOT_FOUND')
      const empty = { value: null, confidence: 0 }
      return {
        fileId,
        reason: 'READING_UNAVAILABLE',
        authCode: empty,
        rrn: empty,
        cardLast4: empty,
        cardType: empty,
        amount: empty,
        currency: empty,
      }
    },
  },
]
