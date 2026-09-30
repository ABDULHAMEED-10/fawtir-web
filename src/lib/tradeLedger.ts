/**
 * Trade documents: the one quantity ledger (ordered, delivered, invoiced) every screen reads.
 *
 * Before this file each screen typed its own figures, and they disagreed: the order said 248.000
 * was delivered and not invoiced while a single drop was worth 372.000, and DN-0124 read "not
 * billed" although the order's activity said INV-2041 billed it. Here the order lines, the
 * delivery notes against them and the invoices that billed those notes are recorded once, and
 * every figure (what is left to deliver, what is delivered and not billed, whether a note has
 * been billed, the percentages) is derived from them.
 *
 * There is no trade-documents API yet, so this is the page's own data. The real ledger belongs to
 * the backend (TODO(backend): TRADE_DOCUMENTS.md rows T.13 to T.16).
 */

/** A trade document line in the shape an invoice line needs (PINT-OM line model). */
export type TradeLine = {
  lineNo: number
  description: string
  /** Goods or service (IBR-078-OM on the invoice this line becomes). */
  itemType: 'goods' | 'service'
  /** UN/ECE Rec. 20 unit code the invoice carries. */
  unitCode: string
  /** The unit as the trade screens print it ("KG", "EA"). */
  unitLabel: string
  /** Exclusive of VAT, in rials. */
  unitPrice: number
  /** Oman VAT category (OMTaxCat): S5, Z0, E0 or O0. */
  taxCode: 'S5' | 'Z0' | 'E0' | 'O0'
  /** VATZR-OM / VATEX-OM reason (IBT-121) on a zero-rated or exempt line. */
  exemptionReasonCode?: string
  /**
   * HS code on a goods line (IBR-079-OM). The trade record keeps no product link yet, so the
   * design's lines carry "Other" (`000000000000`), which PINT-OM always accepts.
   * TODO(backend): TRADE_DOCUMENTS.md row T.3.
   */
  hsCode?: string
  /** CL-12-OM service type on a service line (required only on an export of services). */
  serviceType?: string
}

export type LedgerOrder = {
  id: string
  direction: 'sales' | 'purchase'
  /** The customer record the order was raised for (mock API ids). */
  customerId: string
  party: string
  /** The customer's own purchase order number (IBT-013 on the invoice), when they gave one. */
  customerPo: string | null
  /** A framework contract the order sits under (IBT-012), when there is one. */
  contractReference: string | null
  lines: (TradeLine & { ordered: number })[]
}

export type LedgerDelivery = {
  id: string
  orderId: string
  customerId: string
  /** ISO date the goods changed hands (IBT-072 on the invoice). */
  deliveredOn: string
  /** The customer's own goods-received number, when they gave one (IBT-015). */
  receivingAdviceReference: string | null
  lines: { lineNo: number; qty: number }[]
}

export type LedgerInvoice = {
  id: string
  orderId: string
  /** The delivery notes this invoice billed. */
  deliveryIds: string[]
  lines: { lineNo: number; qty: number }[]
}

/* ------------------------------------------------------------------ data */

const HOUSE_BLEND: TradeLine = {
  lineNo: 1,
  description: 'Green beans, House Blend',
  itemType: 'goods',
  unitCode: 'KGM',
  unitLabel: 'KG',
  unitPrice: 9.5,
  taxCode: 'S5',
  hsCode: '000000000000',
}
const ROASTING: TradeLine = {
  lineNo: 2,
  description: 'Roasting service, per batch',
  itemType: 'service',
  unitCode: 'C62',
  unitLabel: 'EA',
  unitPrice: 4.2,
  taxCode: 'S5',
}
const CUPS: TradeLine = {
  lineNo: 3,
  description: 'Takeaway cups, 500 pack',
  itemType: 'goods',
  unitCode: 'PK',
  unitLabel: 'EA',
  unitPrice: 22.8,
  taxCode: 'S5',
  hsCode: '000000000000',
}

export const LEDGER_ORDERS: LedgerOrder[] = [
  {
    id: 'SO-0073',
    direction: 'sales',
    customerId: 'c-nizwa',
    party: 'Nizwa Souq Café',
    customerPo: null,
    contractReference: null,
    lines: [
      { ...HOUSE_BLEND, ordered: 80 },
      { ...ROASTING, ordered: 60 },
      { ...CUPS, ordered: 10 },
    ],
  },
]

/**
 * Two drops against SO-0073. The first (DN-0121, 25 Jul) was billed by INV-2041; the second
 * (DN-0124, 27 Jul) is signed for and not billed yet. (The design named the first drop DN-0119,
 * which is also the number of an unrelated standalone note to Al Mouj Marina Café.)
 */
export const LEDGER_DELIVERIES: LedgerDelivery[] = [
  {
    id: 'DN-0121',
    orderId: 'SO-0073',
    customerId: 'c-nizwa',
    deliveredOn: '2026-07-25',
    receivingAdviceReference: null,
    lines: [
      { lineNo: 1, qty: 24 },
      { lineNo: 2, qty: 18 },
      { lineNo: 3, qty: 3 },
    ],
  },
  {
    id: 'DN-0124',
    orderId: 'SO-0073',
    customerId: 'c-nizwa',
    deliveredOn: '2026-07-27',
    receivingAdviceReference: null,
    lines: [
      { lineNo: 1, qty: 24 },
      { lineNo: 2, qty: 18 },
      { lineNo: 3, qty: 3 },
    ],
  },
]

export const LEDGER_INVOICES: LedgerInvoice[] = [
  {
    id: 'INV-2041',
    orderId: 'SO-0073',
    deliveryIds: ['DN-0121'],
    lines: [
      { lineNo: 1, qty: 24 },
      { lineNo: 2, qty: 18 },
      { lineNo: 3, qty: 3 },
    ],
  },
]

/* ------------------------------------------------------------- figures */

/** Rials to baisa, so sums never pick up floating point dust. */
const baisa = (rials: number) => Math.round(rials * 1000)

/** 1240 -> "1,240.000". Always three decimals. */
export function rials(value: number): string {
  return (baisa(value) / 1000).toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

export function ledgerOrder(id: string): LedgerOrder | null {
  return LEDGER_ORDERS.find((order) => order.id === id) ?? null
}

export function ledgerDelivery(id: string): LedgerDelivery | null {
  return LEDGER_DELIVERIES.find((note) => note.id === id) ?? null
}

/** The invoice that billed a delivery note, or null while it is unbilled. */
export function invoiceForDelivery(deliveryId: string): LedgerInvoice | null {
  return LEDGER_INVOICES.find((invoice) => invoice.deliveryIds.includes(deliveryId)) ?? null
}

export type LedgerLineState = TradeLine & {
  ordered: number
  delivered: number
  invoiced: number
  /** Delivered and not billed yet. */
  toInvoice: number
  /** Ordered and not delivered yet. */
  toDeliver: number
  /** Ordered quantity at the order price. */
  total: number
}

export type OrderProgress = {
  order: LedgerOrder
  lines: LedgerLineState[]
  deliveries: LedgerDelivery[]
  invoices: LedgerInvoice[]
  /** Net values in rials. */
  net: number
  vat: number
  gross: number
  invoicedValue: number
  deliveredValue: number
  deliveredNotInvoicedValue: number
  toDeliverValue: number
  /** Whole percentages of the net order value. */
  deliveredPct: number
  invoicedPct: number
  deliveredNotInvoicedPct: number
  toDeliverPct: number
}

const VAT_RATE: Record<TradeLine['taxCode'], number> = { S5: 0.05, Z0: 0, E0: 0, O0: 0 }

export function orderProgress(orderId: string): OrderProgress | null {
  const order = ledgerOrder(orderId)
  if (!order) return null
  const deliveries = LEDGER_DELIVERIES.filter((note) => note.orderId === orderId)
  const invoices = LEDGER_INVOICES.filter((invoice) => invoice.orderId === orderId)
  const qty = (rows: { lines: { lineNo: number; qty: number }[] }[], lineNo: number) =>
    sum(rows.flatMap((row) => row.lines.filter((l) => l.lineNo === lineNo).map((l) => l.qty)))

  const lines = order.lines.map((line) => {
    const delivered = qty(deliveries, line.lineNo)
    const invoiced = qty(invoices, line.lineNo)
    return {
      ...line,
      delivered,
      invoiced,
      toInvoice: Math.max(0, delivered - invoiced),
      toDeliver: Math.max(0, line.ordered - delivered),
      total: line.ordered * line.unitPrice,
    }
  })
  const value = (pick: (line: LedgerLineState) => number) =>
    sum(lines.map((line) => baisa(pick(line) * line.unitPrice))) / 1000
  const net = value((l) => l.ordered)
  const vat = sum(lines.map((l) => baisa(l.ordered * l.unitPrice * VAT_RATE[l.taxCode]))) / 1000
  const pct = (part: number) => (net === 0 ? 0 : Math.round((part / net) * 100))
  const invoicedValue = value((l) => l.invoiced)
  const deliveredValue = value((l) => l.delivered)
  const deliveredNotInvoicedValue = value((l) => l.toInvoice)
  const toDeliverValue = value((l) => l.toDeliver)
  return {
    order,
    lines,
    deliveries,
    invoices,
    net,
    vat,
    gross: (baisa(net) + baisa(vat)) / 1000,
    invoicedValue,
    deliveredValue,
    deliveredNotInvoicedValue,
    toDeliverValue,
    deliveredPct: pct(deliveredValue),
    invoicedPct: pct(invoicedValue),
    deliveredNotInvoicedPct: pct(deliveredNotInvoicedValue),
    toDeliverPct: pct(toDeliverValue),
  }
}

/** The value of one delivery note at its order's agreed prices (net of VAT). */
export function deliveryValue(deliveryId: string): number | null {
  const note = ledgerDelivery(deliveryId)
  const order = note ? ledgerOrder(note.orderId) : null
  if (!note || !order) return null
  return (
    sum(
      note.lines.map((l) =>
        baisa(l.qty * (order.lines.find((line) => line.lineNo === l.lineNo)?.unitPrice ?? 0)),
      ),
    ) / 1000
  )
}

/**
 * What each line of an order still owes, for a new delivery note. A note may not take a line
 * past this: over-delivery is refused on the delivery note form.
 */
export function remainingToDeliver(orderId: string): Record<number, number> {
  const progress = orderProgress(orderId)
  if (!progress) return {}
  return Object.fromEntries(progress.lines.map((line) => [line.lineNo, line.toDeliver]))
}

/** The line numbers a proposed note would ship past what the order still owes. */
export function overDeliveredLines(orderId: string, shipping: Record<number, number>): number[] {
  const remaining = remainingToDeliver(orderId)
  return Object.entries(shipping)
    .filter(([lineNo, qty]) => qty > (remaining[Number(lineNo)] ?? 0))
    .map(([lineNo]) => Number(lineNo))
}

/** "24 KG" as the trade screens print quantities. */
export function qtyLabel(qty: number, unitLabel: string): string {
  return qty === 0 ? '-' : `${qty} ${unitLabel}`
}
