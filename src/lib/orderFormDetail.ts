/**
 * Order form detail: sale (Figma 68:39818) and purchase (68:40327).
 *
 * The two directions answer different questions. A sales order asks "how much of this have I
 * shipped, billed and been paid for", so it leads with a fulfilment split and a money bar. A
 * purchase order asks "does what they billed match what I ordered and received", so it leads
 * with a three-way match and an approval trail.
 *
 * The page reads the record named in the address, never a fixed one:
 *   - SO-0073 is the design's sales record, and every figure on it comes from the quantity
 *     ledger (`tradeLedger.ts`), so the page, the list, DN-0124 and the invoice agree;
 *   - PO-0031 is the design's purchase record (its body always described PO-0031, Muscat Roastery
 *     and MR-INV-8821; the header had been pasted from PO-0029);
 *   - every other row of the Order forms list is drawn from what the list knows, with the parts
 *     only the server can give shown as "not available yet".
 * TODO(backend): TRADE_DOCUMENTS.md rows T.1, T.8 and T.13.
 */

import { ORDER_ROWS, type OrderRow } from './orderForms'
import { orderProgress, qtyLabel, rials } from './tradeLedger'

export type LifecycleState = 'done' | 'active' | 'pending' | 'idle'

export type LifecycleStep = {
  labelKey: string
  noteKey?: string
  noteValues?: Record<string, string | number>
  state: LifecycleState
  /** Which glyph sits in the disc: a tick, a document, or nothing at all. */
  glyph?: 'tick' | 'doc' | 'invoiced' | 'clock'
}

export type TimelineEvent = {
  id: string
  titleKey: string
  detailKey: string
  detailValues?: Record<string, string | number>
  tone: 'open' | 'done'
}

export type Attachment = {
  id: string
  titleKey: string
  metaKey: string
  metaValues?: Record<string, string | number>
}

type Text = { key: string; values?: Record<string, string | number> }

/* ---------------------------------------------------------------- sales */

export type SaleOrderDetail = {
  direction: 'sales'
  id: string
  statusKey: string
  customer: string
  customerId: string | null
  tail: Text
  steps: LifecycleStep[]
  lifecycleNote: Text | null
  fulfilment: {
    stats: {
      id: string
      labelKey: string
      amount: string
      note: Text | null
      accent: boolean
      actionKey?: string
    }[]
    /** Percent widths over the track; blue paints over tan. */
    segments: { pct: number; tone: 'delivered' | 'invoiced' }[]
    legend: { tone: 'invoiced' | 'delivered' | 'track'; labelKey: string; amount: string }[]
  }
  value: { net: string; vat: string | null; total: string | null; noteKey: string }
  lines:
    | {
        id: string
        name: string
        rate: string
        ordered: string
        delivered: string
        invoiced: string
        toInvoice: string
        toDeliver: string
        total: string
      }[]
    | null
  activity: TimelineEvent[] | null
  attachments: Attachment[]
}

/** How the design printed each SO-0073 line's rate. */
const SO_0073_RATES: Record<number, string> = {
  1: '9.500 per KG',
  2: '4.200 each',
  3: '22.800 per pack',
}

function so0073(): SaleOrderDetail {
  const p = orderProgress('SO-0073')!
  const pct = (value: number) => value
  return {
    direction: 'sales',
    id: 'SO-0073',
    statusKey: 'orderDetail.sale.status',
    customer: p.order.party,
    customerId: p.order.customerId,
    tail: { key: 'orderDetail.sale.confirmed' },
    /** Six stations; a standing order has three of them live at once. */
    steps: [
      {
        labelKey: 'orderDetail.sale.steps.quoteSent',
        noteKey: 'orderDetail.notUsed',
        state: 'idle',
      },
      {
        labelKey: 'orderDetail.sale.steps.accepted',
        noteKey: 'orderDetail.notUsed',
        state: 'idle',
      },
      {
        labelKey: 'orderDetail.sale.steps.orderConfirmed',
        noteKey: 'orderDetail.sale.steps.orderConfirmedNote',
        state: 'done',
        glyph: 'tick',
      },
      {
        labelKey: 'orderDetail.sale.steps.delivered',
        noteKey: 'orderDetail.sale.steps.deliveredNote',
        noteValues: { pct: p.deliveredPct, count: p.deliveries.length },
        state: 'active',
        glyph: 'doc',
      },
      {
        labelKey: 'orderDetail.sale.steps.invoiced',
        noteKey: 'orderDetail.sale.steps.invoicedNote',
        noteValues: { pct: p.invoicedPct, count: p.invoices.length },
        state: 'active',
        glyph: 'invoiced',
      },
      {
        labelKey: 'orderDetail.sale.steps.paid',
        noteKey: 'orderDetail.sale.steps.paidNote',
        noteValues: { pct: p.invoicedPct },
        state: 'done',
        glyph: 'tick',
      },
    ],
    lifecycleNote: {
      key: 'orderDetail.sale.lifecycleNote',
      values: { amount: rials(p.deliveredNotInvoicedValue) },
    },
    fulfilment: {
      stats: [
        {
          id: 'invoiced',
          labelKey: 'orderDetail.sale.fulfilment.invoiced',
          amount: rials(p.invoicedValue),
          note: {
            key: 'orderDetail.sale.fulfilment.invoicedNote',
            values: { pct: pct(p.invoicedPct), count: p.invoices.length },
          },
          accent: false,
        },
        {
          id: 'delivered',
          labelKey: 'orderDetail.sale.fulfilment.delivered',
          amount: rials(p.deliveredNotInvoicedValue),
          note: {
            key: 'orderDetail.sale.fulfilment.deliveredNote',
            values: { pct: p.deliveredNotInvoicedPct },
          },
          accent: true,
          actionKey: 'orderForms.action.issueInvoice',
        },
        {
          id: 'toDeliver',
          labelKey: 'orderDetail.sale.fulfilment.toDeliver',
          amount: rials(p.toDeliverValue),
          note: {
            key: 'orderDetail.sale.fulfilment.toDeliverNote',
            values: { pct: p.toDeliverPct },
          },
          accent: false,
        },
      ],
      segments: [
        { pct: p.deliveredPct, tone: 'delivered' },
        { pct: p.invoicedPct, tone: 'invoiced' },
      ],
      legend: [
        {
          tone: 'invoiced',
          labelKey: 'orderDetail.sale.legend.billed',
          amount: rials(p.invoicedValue),
        },
        {
          tone: 'delivered',
          labelKey: 'orderDetail.sale.legend.deliveredNotBilled',
          amount: rials(p.deliveredNotInvoicedValue),
        },
        {
          tone: 'track',
          labelKey: 'orderDetail.sale.legend.stillToDeliver',
          amount: rials(p.toDeliverValue),
        },
      ],
    },
    value: {
      net: rials(p.net),
      vat: rials(p.vat),
      total: rials(p.gross),
      noteKey: 'orderDetail.sale.valueNote',
    },
    lines: p.lines.map((line) => ({
      id: String(line.lineNo),
      name: line.description,
      rate: SO_0073_RATES[line.lineNo] ?? rials(line.unitPrice),
      ordered: qtyLabel(line.ordered, line.unitLabel),
      delivered: qtyLabel(line.delivered, line.unitLabel),
      invoiced: qtyLabel(line.invoiced, line.unitLabel),
      toInvoice: qtyLabel(line.toInvoice, line.unitLabel),
      toDeliver: qtyLabel(line.toDeliver, line.unitLabel),
      total: rials(line.total),
    })),
    activity: [
      {
        id: 'a5',
        titleKey: 'orderDetail.sale.activity.nextDrop',
        detailKey: 'orderDetail.sale.activity.nextDropNote',
        tone: 'open',
      },
      {
        id: 'a4',
        titleKey: 'orderDetail.sale.activity.paid',
        detailKey: 'orderDetail.sale.activity.paidNote',
        detailValues: { amount: rials(p.invoicedValue) },
        tone: 'done',
      },
      {
        id: 'a3',
        titleKey: 'orderDetail.sale.activity.issued',
        detailKey: 'orderDetail.sale.activity.issuedNote',
        tone: 'done',
      },
      {
        id: 'a2',
        titleKey: 'orderDetail.sale.activity.delivered',
        detailKey: 'orderDetail.sale.activity.deliveredNote',
        tone: 'done',
      },
      {
        id: 'a1',
        titleKey: 'orderDetail.sale.activity.confirmed',
        detailKey: 'orderDetail.sale.activity.confirmedNote',
        tone: 'done',
      },
    ],
    attachments: [
      {
        id: 'f1',
        titleKey: 'orderDetail.sale.files.dn0121',
        metaKey: 'orderDetail.sale.files.dn0121Note',
      },
      {
        id: 'f2',
        titleKey: 'orderDetail.sale.files.dn0124',
        metaKey: 'orderDetail.sale.files.dn0124Note',
      },
      {
        id: 'f3',
        titleKey: 'orderDetail.sale.files.inv2041',
        metaKey: 'orderDetail.sale.files.inv2041Note',
        metaValues: { amount: rials(p.invoicedValue) },
      },
    ],
  }
}

const valueOf = (row: OrderRow) => Number(row.value.replace(/,/g, ''))

function saleFromRow(row: OrderRow): SaleOrderDetail {
  const net = valueOf(row)
  const toInvoice = row.movedNotBilled
  const toDeliver = row.stillToMove
  const invoiced = Math.max(0, net - toInvoice - toDeliver)
  const pct = (value: number) => (net === 0 ? 0 : Math.round((value / net) * 100))
  const delivered = invoiced + toInvoice
  return {
    direction: 'sales',
    id: row.id,
    statusKey: `orderForms.status.${row.status}`,
    customer: row.party,
    customerId: row.counterpartyId,
    tail: { key: 'orderDetail.tailDue', values: { date: row.due } },
    steps: [
      { labelKey: 'orderDetail.sale.steps.quoteSent', state: 'idle' },
      { labelKey: 'orderDetail.sale.steps.accepted', state: 'idle' },
      { labelKey: 'orderDetail.sale.steps.orderConfirmed', state: 'done', glyph: 'tick' },
      {
        labelKey: 'orderDetail.sale.steps.delivered',
        noteKey: 'orderDetail.pctOnly',
        noteValues: { pct: pct(delivered) },
        state: toDeliver === 0 ? 'done' : 'active',
        glyph: toDeliver === 0 ? 'tick' : 'doc',
      },
      {
        labelKey: 'orderDetail.sale.steps.invoiced',
        noteKey: 'orderDetail.pctOnly',
        noteValues: { pct: pct(invoiced) },
        state: invoiced === net ? 'done' : invoiced > 0 ? 'active' : 'idle',
        glyph: invoiced === net ? 'tick' : invoiced > 0 ? 'invoiced' : undefined,
      },
      { labelKey: 'orderDetail.sale.steps.paid', state: 'idle' },
    ],
    lifecycleNote: null,
    fulfilment: {
      stats: [
        {
          id: 'invoiced',
          labelKey: 'orderDetail.sale.fulfilment.invoiced',
          amount: rials(invoiced),
          note: { key: 'orderDetail.pctOnly', values: { pct: pct(invoiced) } },
          accent: false,
        },
        {
          id: 'delivered',
          labelKey: 'orderDetail.sale.fulfilment.delivered',
          amount: rials(toInvoice),
          note: { key: 'orderDetail.pctOnly', values: { pct: pct(toInvoice) } },
          accent: true,
          actionKey: 'orderForms.action.issueInvoice',
        },
        {
          id: 'toDeliver',
          labelKey: 'orderDetail.sale.fulfilment.toDeliver',
          amount: rials(toDeliver),
          note: { key: 'orderDetail.pctOnly', values: { pct: pct(toDeliver) } },
          accent: false,
        },
      ],
      segments: [
        { pct: pct(delivered), tone: 'delivered' },
        { pct: pct(invoiced), tone: 'invoiced' },
      ],
      legend: [
        { tone: 'invoiced', labelKey: 'orderDetail.sale.legend.billed', amount: rials(invoiced) },
        {
          tone: 'delivered',
          labelKey: 'orderDetail.sale.legend.deliveredNotBilled',
          amount: rials(toInvoice),
        },
        {
          tone: 'track',
          labelKey: 'orderDetail.sale.legend.stillToDeliver',
          amount: rials(toDeliver),
        },
      ],
    },
    value: { net: row.value, vat: null, total: null, noteKey: 'orderDetail.sale.valueNote' },
    lines: null,
    activity: null,
    attachments: [],
  }
}

/* ------------------------------------------------------------- purchase */

export type PurchaseOrderDetail = {
  direction: 'purchase'
  id: string
  statusKey: string
  supplier: string
  tail: Text
  steps: LifecycleStep[]
  lifecycleNote: Text | null
  match: {
    titleKey: string
    linkKey: string
    stats: { id: string; labelKey: string; value: string | null; rate?: string; noteKey: string }[]
  }
  due: {
    titleKey: string
    amount: string | null
    noteKey: string | null
    primaryKey: string
    secondaryKey: string
  }
  cost: {
    titleKey: string
    net: string
    vat: string | null
    total: string | null
    noteKey: string | null
  }
  lines:
    | {
        id: string
        name: string
        rate: string
        rateUnitKey: string
        lineValue: string
        ordered: string
        received: string
        billed: string
        toReceive: string
      }[]
    | null
  approval: {
    titleKey: string
    thresholdKey: string
    threshold: string
    rows: {
      id: string
      titleKey: string
      metaKey: string
      chipKey: string
      tone: 'neutral' | 'success'
    }[]
  }
  activity: TimelineEvent[] | null
  documents: Attachment[]
}

/** The design's purchase record. */
const PO_0031: PurchaseOrderDetail = {
  direction: 'purchase',
  id: 'PO-0031',
  statusKey: 'deliveryDetail.purchase.status',
  supplier: 'Muscat Roastery Co',
  tail: { key: 'orderDetail.tailRequired', values: { date: '28 Jul 2026' } },
  steps: [
    {
      labelKey: 'orderDetail.purchase.steps.theirQuote',
      noteKey: 'orderDetail.purchase.steps.theirQuoteNote',
      state: 'done',
      glyph: 'tick',
    },
    {
      labelKey: 'orderDetail.purchase.steps.youApproved',
      noteKey: 'orderDetail.purchase.steps.youApprovedNote',
      state: 'done',
      glyph: 'tick',
    },
    {
      labelKey: 'orderDetail.purchase.steps.poSent',
      // The design repeated the label ("PO sent") as the note; the activity dates it 20 Jul.
      noteKey: 'orderDetail.purchase.steps.poSentDate',
      state: 'done',
      glyph: 'tick',
    },
    {
      labelKey: 'orderDetail.purchase.steps.received',
      noteKey: 'orderDetail.purchase.steps.receivedNote',
      state: 'done',
      glyph: 'tick',
    },
    {
      labelKey: 'orderDetail.purchase.steps.theyBilled',
      noteKey: 'orderDetail.purchase.steps.theyBilledDate',
      state: 'done',
      glyph: 'tick',
    },
    {
      labelKey: 'orderDetail.purchase.steps.youPaid',
      noteKey: 'orderDetail.purchase.steps.youPaidNote',
      state: 'pending',
      glyph: 'clock',
    },
  ],
  lifecycleNote: { key: 'deliveryDetail.purchase.lifecycleNote' },
  /** The three-way match: ordered vs received vs billed. */
  match: {
    titleKey: 'orderDetail.purchase.matchTitle',
    linkKey: 'orderDetail.purchase.viewTheirInvoice',
    stats: [
      {
        // The design labelled the ordered quantity "Invoiced".
        id: 'ordered',
        labelKey: 'orderDetail.purchase.match.ordered',
        value: '300 KG',
        rate: '7.400',
        noteKey: 'orderDetail.purchase.match.invoicedNote',
      },
      {
        id: 'received',
        labelKey: 'orderDetail.purchase.match.received',
        value: '300 KG',
        noteKey: 'orderDetail.purchase.match.receivedNote',
      },
      {
        id: 'billed',
        labelKey: 'orderDetail.purchase.match.billed',
        value: '300 KG',
        rate: '7.400',
        noteKey: 'orderDetail.purchase.match.billedNote',
      },
    ],
  },
  due: {
    titleKey: 'orderDetail.purchase.dueToPay',
    amount: '2,354.310',
    noteKey: 'orderDetail.purchase.dueNote',
    primaryKey: 'orderDetail.purchase.schedulePayment',
    secondaryKey: 'orderDetail.purchase.markAsPaid',
  },
  cost: {
    titleKey: 'orderDetail.purchase.whatThisCosts',
    net: '2,242.200',
    vat: '112.110',
    total: '2,354.310',
    noteKey: 'orderDetail.purchase.costNote',
  },
  lines: [
    {
      id: '1',
      name: 'Green beans, Yirgacheffe',
      rate: '7.400',
      rateUnitKey: 'orderDetail.purchase.perKg',
      lineValue: '2,220.000',
      ordered: '300 KG',
      received: '300 KG',
      billed: '300 KG',
      toReceive: '-',
    },
    {
      id: '2',
      name: 'Jute sacks, 25 kg',
      rate: '1.850',
      rateUnitKey: 'orderDetail.purchase.each',
      lineValue: '22.200',
      ordered: '12 EA',
      received: '12 EA',
      billed: '12 EA',
      toReceive: '-',
    },
  ],
  approval: {
    titleKey: 'orderDetail.purchase.approval',
    thresholdKey: 'orderDetail.purchase.spendOver',
    threshold: '2,000.000',
    rows: [
      {
        id: 'r1',
        titleKey: 'orderDetail.purchase.approvalRaised',
        metaKey: 'orderDetail.purchase.approvalRaisedMeta',
        chipKey: 'orderDetail.purchase.submitted',
        tone: 'neutral',
      },
      {
        id: 'r2',
        titleKey: 'orderDetail.purchase.approvalApproved',
        metaKey: 'orderDetail.purchase.approvalApprovedMeta',
        chipKey: 'orderDetail.purchase.accepted',
        tone: 'success',
      },
    ],
  },
  activity: [
    {
      id: 'b5',
      titleKey: 'orderDetail.purchase.activity.due',
      detailKey: 'orderDetail.purchase.activity.dueNote',
      tone: 'open',
    },
    {
      id: 'b4',
      titleKey: 'orderDetail.purchase.activity.matched',
      detailKey: 'orderDetail.purchase.activity.matchedNote',
      tone: 'done',
    },
    {
      id: 'b3',
      titleKey: 'orderDetail.purchase.activity.grn',
      detailKey: 'orderDetail.purchase.activity.grnNote',
      tone: 'done',
    },
    {
      id: 'b2',
      titleKey: 'orderDetail.purchase.activity.poSent',
      detailKey: 'orderDetail.purchase.activity.poSentNote',
      tone: 'done',
    },
    {
      id: 'b1',
      titleKey: 'orderDetail.purchase.activity.approved',
      detailKey: 'orderDetail.purchase.activity.approvedNote',
      tone: 'done',
    },
  ],
  documents: [
    {
      id: 'd1',
      titleKey: 'orderDetail.purchase.files.quote',
      metaKey: 'orderDetail.purchase.files.quoteNote',
    },
    {
      id: 'd2',
      titleKey: 'orderDetail.purchase.files.grn',
      metaKey: 'orderDetail.purchase.files.grnNote',
    },
    {
      id: 'd3',
      titleKey: 'orderDetail.purchase.files.invoice',
      metaKey: 'orderDetail.purchase.files.invoiceNote',
    },
  ],
}

function purchaseFromRow(row: OrderRow): PurchaseOrderDetail {
  const received = row.stillToMove === 0
  const billed = row.status === 'completed'
  return {
    direction: 'purchase',
    id: row.id,
    statusKey: `orderForms.status.${row.status}`,
    supplier: row.party,
    tail: { key: 'orderDetail.tailRequired', values: { date: row.due } },
    steps: [
      { labelKey: 'orderDetail.purchase.steps.theirQuote', state: 'done', glyph: 'tick' },
      { labelKey: 'orderDetail.purchase.steps.youApproved', state: 'done', glyph: 'tick' },
      { labelKey: 'orderDetail.purchase.steps.poSent', state: 'done', glyph: 'tick' },
      {
        labelKey: 'orderDetail.purchase.steps.received',
        state: received ? 'done' : 'pending',
        glyph: received ? 'tick' : 'clock',
      },
      {
        labelKey: 'orderDetail.purchase.steps.theyBilled',
        state: billed ? 'done' : 'idle',
        glyph: billed ? 'tick' : undefined,
      },
      { labelKey: 'orderDetail.purchase.steps.youPaid', state: 'idle' },
    ],
    lifecycleNote: null,
    match: {
      titleKey: 'orderDetail.purchase.matchTitleOpen',
      linkKey: 'orderDetail.purchase.viewTheirInvoice',
      stats: [
        {
          id: 'ordered',
          labelKey: 'orderDetail.purchase.match.ordered',
          value: null,
          noteKey: 'tradeDocs.notRecorded',
        },
        {
          id: 'received',
          labelKey: 'orderDetail.purchase.match.received',
          value: null,
          noteKey: 'tradeDocs.notRecorded',
        },
        {
          id: 'billed',
          labelKey: 'orderDetail.purchase.match.billed',
          value: null,
          noteKey: 'tradeDocs.notRecorded',
        },
      ],
    },
    due: {
      titleKey: 'orderDetail.purchase.dueToPay',
      amount: null,
      noteKey: null,
      primaryKey: 'orderDetail.purchase.schedulePayment',
      secondaryKey: 'orderDetail.purchase.markAsPaid',
    },
    cost: {
      titleKey: 'orderDetail.purchase.whatThisCosts',
      net: row.value,
      vat: null,
      total: null,
      noteKey: null,
    },
    lines: null,
    approval: { ...PO_0031.approval, rows: [] },
    activity: null,
    documents: [],
  }
}

export type OrderDetail = SaleOrderDetail | PurchaseOrderDetail

/** The order the address names, or null when there is none. */
export function orderById(id: string | undefined): OrderDetail | null {
  if (!id) return null
  if (id === 'SO-0073') return so0073()
  if (id === PO_0031.id) return PO_0031
  const row = ORDER_ROWS.find((candidate) => candidate.id === id)
  if (!row) return null
  return row.direction === 'sales' ? saleFromRow(row) : purchaseFromRow(row)
}
