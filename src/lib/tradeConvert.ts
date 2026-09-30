/**
 * Turning a trade document into an invoice.
 *
 * "Convert to invoice" (a quotation, an order form, a delivery note) opens the invoice composer
 * at `/invoices/new?from=<number>`, and the composer reads what to fill from here. Before this,
 * nothing was carried: the lines lost their goods/service flag, their classification and their
 * VAT category, and every reference but the customer's order number was dropped.
 *
 * What an invoice built from a trade document should carry (PINT-OM / EN 16931 business terms):
 *   - IBT-013 purchase order reference: the customer's own order number. The draft has a field
 *     for it (`purchaseOrderReference`), so it is filled.
 *   - IBT-012 contract reference, IBT-014 sales order reference, IBT-015 receiving advice
 *     reference, IBT-016 despatch advice reference, and the line-level delivery note reference
 *     (IBT-184 as the review named it): the draft API has no field for them yet (and refuses
 *     IBT-012 outside self-billing), so they are worked out here, kept with the linked documents
 *     on the page, and asked for in TRADE_DOCUMENTS.md rows T.11 and T.12.
 *     TODO(backend): TRADE_DOCUMENTS.md rows T.10 to T.12.
 */

import { DELIVERY_ROWS, type DeliveryRow } from './deliveryNotes'
import type { LinkedDoc } from './linkedDocuments'
import { ORDER_ROWS, type OrderRow } from './orderForms'
import { quotationById } from './quotationDetail'
import {
  invoiceForDelivery,
  LEDGER_DELIVERIES,
  ledgerDelivery,
  ledgerOrder,
  orderProgress,
  type TradeLine,
} from './tradeLedger'

export type PrefillLine = TradeLine & {
  qty: number
  discountPct: number
  /** The delivery note this line was shipped on (line-level despatch reference). */
  deliveryNote: string | null
}

export type TradeReferences = {
  /** IBT-013: filled on the draft. */
  purchaseOrder: string | null
  /** IBT-012. */
  contract: string | null
  /** IBT-014. */
  salesOrder: string | null
  /** IBT-015. */
  receivingAdvice: string | null
  /** IBT-016: one per invoice; several notes are listed on the lines instead. */
  despatchAdvice: string | null
}

export type InvoicePrefill = {
  sourceId: string
  sourceKind: 'quotation' | 'order' | 'delivery'
  /** The customer record (null when the trade document does not name one). */
  customerId: string | null
  customerName: string
  subject: string | null
  /** IBT-072, the actual delivery date: the day the goods changed hands. */
  deliveryDate: string | null
  /** Empty when the trade document's lines are not known here (list-only records). */
  lines: PrefillLine[]
  references: TradeReferences
  /** Order forms and delivery notes the invoice settles, linked on section 4. */
  linked: LinkedDoc[]
}

const NO_REFERENCES: TradeReferences = {
  purchaseOrder: null,
  contract: null,
  salesOrder: null,
  receivingAdvice: null,
  despatchAdvice: null,
}

/* ------------------------------------------------------- linked documents */

/** The design's own wording for its two documents; the rest read from the row. */
function deliveryLink(row: DeliveryRow): LinkedDoc {
  const billed = row.status === 'completed' || invoiceForDelivery(row.id) !== null
  const designed = row.id === 'DN-0124'
  return {
    id: row.id,
    kind: 'delivery',
    titleKey: designed ? 'createInvoice.linked.dn0124' : 'linkModal.docs.deliveryTitle',
    titleValues: { id: row.id },
    metaKey: designed ? 'createInvoice.linked.dn0124Meta' : 'linkModal.docs.deliveryMeta',
    metaValues: { date: row.due, lines: row.lines },
    chipKey: billed ? 'linkModal.closed' : 'createInvoice.linked.notInvoiced',
    chipTone: billed ? 'closed' : 'pending',
    customerId: row.counterpartyId,
  }
}

function orderLink(row: OrderRow): LinkedDoc {
  const done = row.status === 'completed'
  const designed = row.id === 'SO-0073'
  return {
    id: row.id,
    kind: 'order',
    titleKey: designed ? 'createInvoice.linked.so0073' : 'linkModal.docs.orderTitle',
    titleValues: { id: row.id },
    metaKey: designed ? 'createInvoice.linked.so0073Meta' : 'linkModal.docs.orderMeta',
    metaValues: { due: row.due, value: row.value },
    chipKey: done ? 'linkModal.closed' : 'createInvoice.linked.inProgress',
    chipTone: done ? 'closed' : 'progress',
    customerId: row.counterpartyId,
  }
}

/**
 * The customer's own order forms and delivery notes, for the "Link related documents" picker.
 * Only this customer's: the design's list also offered another customer's DN-0131. Nothing is
 * offered until a customer is chosen.
 * TODO(backend): TRADE_DOCUMENTS.md row T.17 (a search route by customer).
 */
export function linkableDocsFor(customerId: string | null): LinkedDoc[] {
  if (!customerId) return []
  const deliveries = DELIVERY_ROWS.filter(
    (row) => row.direction === 'sales' && row.counterpartyId === customerId,
  ).map(deliveryLink)
  const orders = ORDER_ROWS.filter(
    (row) => row.direction === 'sales' && row.counterpartyId === customerId,
  ).map(orderLink)
  const rank = (doc: LinkedDoc) =>
    doc.chipTone === 'pending' ? 0 : doc.chipTone === 'progress' ? 1 : 2
  return [...deliveries, ...orders].sort((a, b) => rank(a) - rank(b))
}

function linksFor(ids: string[]): LinkedDoc[] {
  return ids.flatMap((id) => {
    const delivery = DELIVERY_ROWS.find((row) => row.id === id)
    if (delivery) return [deliveryLink(delivery)]
    const order = ORDER_ROWS.find((row) => row.id === id)
    return order ? [orderLink(order)] : []
  })
}

/* ---------------------------------------------------------------- prefill */

function fromQuotation(id: string): InvoicePrefill | null {
  const quote = quotationById(id)
  if (!quote) return null
  return {
    sourceId: quote.id,
    sourceKind: 'quotation',
    customerId: quote.customerId,
    customerName: quote.customer,
    subject: quote.subject,
    deliveryDate: null,
    lines: (quote.items ?? []).map((item) => ({ ...item, deliveryNote: null })),
    // A quotation is no PINT-OM reference of its own; it becomes one through its order.
    references: NO_REFERENCES,
    linked: [],
  }
}

function fromOrder(id: string): InvoicePrefill | null {
  const row = ORDER_ROWS.find((candidate) => candidate.id === id)
  const order = ledgerOrder(id)
  if (!row && !order) return null
  if (row && row.direction !== 'sales') return null
  const progress = order ? orderProgress(id) : null
  // An order is invoiced for what has been delivered and not billed yet, note by note.
  const unbilled = LEDGER_DELIVERIES.filter(
    (note) => note.orderId === id && invoiceForDelivery(note.id) === null,
  )
  const lines: PrefillLine[] = progress
    ? unbilled.flatMap((note) =>
        note.lines.map((drop) => {
          const line = progress.lines.find((candidate) => candidate.lineNo === drop.lineNo)!
          return { ...line, qty: drop.qty, discountPct: 0, deliveryNote: note.id }
        }),
      )
    : []
  const latest =
    unbilled
      .map((note) => note.deliveredOn)
      .sort()
      .at(-1) ?? null
  return {
    sourceId: id,
    sourceKind: 'order',
    customerId: order?.customerId ?? row?.counterpartyId ?? null,
    customerName: order?.party ?? row?.party ?? '',
    subject: null,
    deliveryDate: latest,
    lines,
    references: {
      purchaseOrder: order?.customerPo ?? null,
      contract: order?.contractReference ?? null,
      salesOrder: id,
      receivingAdvice: unbilled.length === 1 ? unbilled[0].receivingAdviceReference : null,
      despatchAdvice: unbilled.length === 1 ? unbilled[0].id : null,
    },
    linked: linksFor([...unbilled.map((note) => note.id), id]),
  }
}

function fromDelivery(id: string): InvoicePrefill | null {
  const row = DELIVERY_ROWS.find((candidate) => candidate.id === id)
  const note = ledgerDelivery(id)
  if (!row && !note) return null
  if (row && row.direction !== 'sales') return null
  const order = note ? ledgerOrder(note.orderId) : null
  const orderId = note?.orderId ?? row?.orderId ?? null
  const lines: PrefillLine[] =
    note && order
      ? note.lines.map((drop) => {
          const line = order.lines.find((candidate) => candidate.lineNo === drop.lineNo)!
          return { ...line, qty: drop.qty, discountPct: 0, deliveryNote: note.id }
        })
      : []
  return {
    sourceId: id,
    sourceKind: 'delivery',
    customerId: note?.customerId ?? row?.counterpartyId ?? null,
    customerName: order?.party ?? row?.party ?? '',
    subject: null,
    deliveryDate: note?.deliveredOn ?? null,
    lines,
    references: {
      purchaseOrder: order?.customerPo ?? null,
      contract: order?.contractReference ?? null,
      salesOrder: orderId,
      receivingAdvice: note?.receivingAdviceReference ?? null,
      despatchAdvice: id,
    },
    linked: linksFor(orderId ? [id, orderId] : [id]),
  }
}

/** What to fill the invoice composer with, for `/invoices/new?from=<number>`. */
export function invoicePrefill(sourceId: string): InvoicePrefill | null {
  const id = sourceId.trim().toUpperCase()
  if (id.startsWith('QUO-')) return fromQuotation(id)
  if (id.startsWith('SO-')) return fromOrder(id)
  if (id.startsWith('DN-')) return fromDelivery(id)
  return null
}
