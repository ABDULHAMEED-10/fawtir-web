/**
 * Delivery note detail: sale (Figma 68:40836) and purchase (68:41301).
 *
 * A delivery note is proof, so the screen leads with *who signed for what*: a green proof card
 * carrying the receiver, the timestamp, the place and the driver, plus a captured signature on
 * the sales side. Quantities only: the money lives on the invoice this note becomes.
 *
 * The page reads the record named in the address. DN-0124 and GRN-0087 are the design's records
 * (DN-0124's value, progress and "still to come" quantities come from the quantity ledger, so it
 * agrees with SO-0073 and INV-2041); every other row of the Delivery notes list is drawn from what
 * the list knows, with the parts only the server can give shown as "not available yet".
 * TODO(backend): TRADE_DOCUMENTS.md rows T.1, T.13 and T.15.
 */

import { DELIVERY_ROWS, type DeliveryRow } from './deliveryNotes'
import type { LifecycleStep, TimelineEvent } from './orderFormDetail'
import {
  deliveryValue,
  invoiceForDelivery,
  ledgerDelivery,
  orderProgress,
  qtyLabel,
  rials,
} from './tradeLedger'

type Text = { key: string; values?: Record<string, string | number> }

export type MetaRow = {
  icon: 'user' | 'clock' | 'pin' | 'truck'
  labelKey: string
  value: Text
}

export type DeliveredLine = {
  id: string
  name: string
  noteKey: string
  onOrder: string
  thisDrop: string
  stillToCome: string
}

export type DeliveryDetail = {
  id: string
  direction: 'sales' | 'purchase'
  status: Text
  leadKey: string
  party: string
  date: Text
  against: string | null
  steps: LifecycleStep[]
  lifecycleNote: Text | null
  proof: { title: Text; rows: MetaRow[]; signature: string | null }
  action: {
    titleKey: string
    amount: string | null
    noteKey: string | null
    buttonKey: string
    /** "convert" opens the invoice composer from this note; "none" says not available yet. */
    kind: 'convert' | 'none'
  }
  progress: { title: Text; barLabelKey: string; percent: number | null; note: Text | null }
  details: { titleKey: string; rows: { labelKey: string; value: string | null }[] }
  linesTitleKey: string
  thisColumnKey: string
  lines: DeliveredLine[] | null
  activity: TimelineEvent[] | null
  filesTitleKey: string
  files: { id: string; titleKey: string; metaKey: string }[]
}

const SALE_LINE_NOTES: Record<number, string> = {
  1: 'deliveryDetail.sale.line1Note',
  2: 'deliveryDetail.sale.line2Note',
  3: 'deliveryDetail.sale.line3Note',
}

function dn0124(): DeliveryDetail {
  const note = ledgerDelivery('DN-0124')!
  const progress = orderProgress(note.orderId)!
  const billedBy = invoiceForDelivery(note.id)
  return {
    id: note.id,
    direction: 'sales',
    status: { key: 'deliveryDetail.sale.status' },
    leadKey: 'deliveryDetail.sale.deliveredTo',
    party: progress.order.party,
    date: { key: 'deliveryDetail.sale.onDate' },
    against: note.orderId,
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
        labelKey: 'deliveryDetail.steps.orderConfirmed',
        noteKey: 'orderDetail.sale.steps.orderConfirmedNote',
        state: 'done',
        glyph: 'tick',
      },
      {
        labelKey: 'orderDetail.sale.steps.delivered',
        noteKey: 'deliveryDetail.sale.steps.deliveredNote',
        state: 'done',
        glyph: 'tick',
      },
      {
        labelKey: 'orderDetail.sale.steps.invoiced',
        noteKey: billedBy
          ? 'deliveryDetail.sale.steps.invoicedOn'
          : 'deliveryDetail.sale.steps.invoicedNote',
        noteValues: billedBy ? { id: billedBy.id } : undefined,
        state: billedBy ? 'done' : 'active',
        glyph: billedBy ? 'tick' : 'invoiced',
      },
      { labelKey: 'orderDetail.sale.steps.paid', noteKey: 'deliveryDetail.dash', state: 'idle' },
    ],
    lifecycleNote: { key: 'deliveryDetail.sale.lifecycleNote' },
    proof: {
      title: { key: 'deliveryDetail.sale.proofTitle' },
      rows: [
        {
          icon: 'user',
          labelKey: 'deliveryDetail.sale.receivedBy',
          value: { key: 'deliveryDetail.sale.receivedByValue' },
        },
        {
          icon: 'clock',
          labelKey: 'deliveryDetail.sale.signedAt',
          value: { key: 'deliveryDetail.sale.signedAtValue' },
        },
        {
          icon: 'pin',
          labelKey: 'deliveryDetail.sale.where',
          value: { key: 'deliveryDetail.sale.whereValue' },
        },
        {
          icon: 'truck',
          labelKey: 'deliveryDetail.sale.deliveredBy',
          value: { key: 'deliveryDetail.sale.deliveredByValue' },
        },
      ],
      /** The captured signature is rendered as script type rather than an image asset. */
      signature: 'Salim',
    },
    action: {
      titleKey: 'deliveryDetail.sale.readyToInvoice',
      // This drop at the order's agreed prices (the design printed 248.000; 24 KG, 18 batches
      // and 3 packs at 9.500, 4.200 and 22.800 come to 372.000).
      amount: rials(deliveryValue(note.id) ?? 0),
      noteKey: 'deliveryDetail.sale.readyNote',
      buttonKey: 'deliveryDetail.sale.convertToInvoice',
      kind: 'convert',
    },
    progress: {
      title: { key: 'deliveryDetail.progressOn', values: { id: note.orderId } },
      barLabelKey: 'deliveryDetail.sale.thisDrop',
      percent: progress.deliveredPct,
      note: {
        key: 'deliveryDetail.sale.progressNote',
        values: {
          pct: progress.deliveredPct,
          count: progress.deliveries.length,
          left: progress.toDeliverPct,
        },
      },
    },
    details: {
      titleKey: 'deliveryDetail.sale.noteDetails',
      rows: [
        { labelKey: 'deliveryDetail.sale.noteNumber', value: note.id },
        { labelKey: 'deliveryDetail.sale.dispatched', value: '27 Jul, 06:35' },
        { labelKey: 'deliveryDetail.sale.delivered', value: '27 Jul, 09:12' },
        { labelKey: 'deliveryDetail.sale.from', value: 'Main store' },
        { labelKey: 'deliveryDetail.sale.driver', value: 'Salim Al Hinai' },
        { labelKey: 'deliveryDetail.sale.createdBy', value: 'Hafidh Saif' },
      ],
    },
    linesTitleKey: 'deliveryDetail.sale.whatWasDelivered',
    thisColumnKey: 'deliveryDetail.sale.thisDropCol',
    lines: note.lines.map((drop) => {
      const line = progress.lines.find((candidate) => candidate.lineNo === drop.lineNo)!
      return {
        id: String(drop.lineNo),
        name: line.description,
        noteKey: SALE_LINE_NOTES[drop.lineNo] ?? 'tradeDocs.notRecorded',
        onOrder: qtyLabel(line.ordered, line.unitLabel),
        thisDrop: qtyLabel(drop.qty, line.unitLabel),
        stillToCome: qtyLabel(line.toDeliver, line.unitLabel),
      }
    }),
    activity: [
      {
        id: 'c5',
        titleKey: 'deliveryDetail.sale.activity.waiting',
        detailKey: 'deliveryDetail.sale.activity.waitingNote',
        tone: 'open',
      },
      {
        id: 'c4',
        titleKey: 'deliveryDetail.sale.activity.signed',
        detailKey: 'deliveryDetail.sale.activity.signedNote',
        tone: 'done',
      },
      {
        id: 'c3',
        titleKey: 'deliveryDetail.sale.activity.arrived',
        detailKey: 'deliveryDetail.sale.activity.arrivedNote',
        tone: 'done',
      },
      {
        id: 'c2',
        titleKey: 'deliveryDetail.sale.activity.left',
        detailKey: 'deliveryDetail.sale.activity.leftNote',
        tone: 'done',
      },
      {
        id: 'c1',
        titleKey: 'deliveryDetail.sale.activity.created',
        detailKey: 'deliveryDetail.sale.activity.createdNote',
        tone: 'done',
      },
    ],
    filesTitleKey: 'deliveryDetail.attachments',
    files: [
      {
        id: 'g1',
        titleKey: 'deliveryDetail.sale.fileSo',
        metaKey: 'deliveryDetail.sale.fileSoNote',
      },
    ],
  }
}

const GRN_0087: DeliveryDetail = {
  id: 'GRN-0087',
  direction: 'purchase',
  status: { key: 'deliveryDetail.purchase.status' },
  leadKey: 'deliveryDetail.purchase.deliveredBy',
  party: 'Muscat Roastery Co',
  date: { key: 'deliveryDetail.purchase.onDate' },
  against: 'PO-0031',
  /** The purchase side only has four stations: no quote or acceptance leg. */
  steps: [
    {
      labelKey: 'orderDetail.purchase.steps.poSent',
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
  proof: {
    title: { key: 'deliveryDetail.purchase.proofTitle' },
    rows: [
      {
        icon: 'user',
        labelKey: 'deliveryDetail.purchase.checkedInBy',
        value: { key: 'deliveryDetail.purchase.checkedInByValue' },
      },
      {
        icon: 'clock',
        labelKey: 'deliveryDetail.purchase.arrived',
        value: { key: 'deliveryDetail.purchase.arrivedValue' },
      },
      {
        icon: 'pin',
        labelKey: 'deliveryDetail.purchase.receivedAt',
        value: { key: 'deliveryDetail.purchase.receivedAtValue' },
      },
      {
        icon: 'truck',
        labelKey: 'deliveryDetail.purchase.theirPaperwork',
        value: { key: 'deliveryDetail.purchase.theirPaperworkValue' },
      },
    ],
    signature: null,
  },
  action: {
    titleKey: 'deliveryDetail.purchase.billedAndMatched',
    amount: '2,354.310',
    noteKey: 'deliveryDetail.purchase.billedNote',
    buttonKey: 'deliveryDetail.purchase.viewTheirInvoice',
    kind: 'none',
  },
  progress: {
    title: { key: 'deliveryDetail.progressOn', values: { id: 'PO-0031' } },
    barLabelKey: 'deliveryDetail.purchase.receivedAfter',
    percent: 100,
    note: { key: 'deliveryDetail.purchase.progressNote' },
  },
  details: {
    titleKey: 'deliveryDetail.purchase.receiptDetails',
    rows: [
      { labelKey: 'deliveryDetail.purchase.receiptNumber', value: 'GRN-0087' },
      { labelKey: 'deliveryDetail.purchase.supplier', value: 'Muscat Roastery Co' },
      { labelKey: 'deliveryDetail.purchase.arrivedRow', value: '28 Jul, 07:45' },
      { labelKey: 'deliveryDetail.purchase.receivedAtRow', value: 'Main store' },
      { labelKey: 'deliveryDetail.purchase.theirNoteRef', value: 'MR-DN-2290' },
      { labelKey: 'deliveryDetail.purchase.checkedInByRow', value: 'Yusuf Al Balushi' },
    ],
  },
  linesTitleKey: 'deliveryDetail.purchase.whatArrived',
  thisColumnKey: 'deliveryDetail.purchase.thisDeliveryCol',
  lines: [
    {
      id: '1',
      name: 'Green beans, Yirgacheffe',
      noteKey: 'deliveryDetail.purchase.line1Note',
      onOrder: '300 KG',
      thisDrop: '300 KG',
      stillToCome: '—',
    },
    {
      id: '2',
      name: 'Jute sacks, 25 kg',
      noteKey: 'deliveryDetail.purchase.line2Note',
      onOrder: '12 EA',
      thisDrop: '12 EA',
      stillToCome: '—',
    },
  ],
  activity: [
    {
      id: 'd5',
      titleKey: 'deliveryDetail.purchase.activity.due',
      detailKey: 'deliveryDetail.purchase.activity.dueNote',
      tone: 'open',
    },
    {
      id: 'd4',
      titleKey: 'deliveryDetail.purchase.activity.matched',
      detailKey: 'deliveryDetail.purchase.activity.matchedNote',
      tone: 'done',
    },
    {
      id: 'd3',
      titleKey: 'deliveryDetail.purchase.activity.checkedIn',
      detailKey: 'deliveryDetail.purchase.activity.checkedInNote',
      tone: 'done',
    },
    {
      id: 'd2',
      titleKey: 'deliveryDetail.purchase.activity.vanArrived',
      detailKey: 'deliveryDetail.purchase.activity.vanArrivedNote',
      tone: 'done',
    },
    {
      id: 'd1',
      titleKey: 'deliveryDetail.purchase.activity.opened',
      detailKey: 'deliveryDetail.purchase.activity.openedNote',
      tone: 'done',
    },
  ],
  filesTitleKey: 'deliveryDetail.purchase.linkedDocuments',
  files: [
    {
      id: 'h1',
      titleKey: 'deliveryDetail.purchase.filePo',
      metaKey: 'deliveryDetail.purchase.filePoNote',
    },
  ],
}

function fromRow(row: DeliveryRow): DeliveryDetail {
  const sales = row.direction === 'sales'
  const moved = row.proof !== 'clock' && row.proof !== 'awaiting'
  return {
    id: row.id,
    direction: row.direction,
    status: { key: `orderForms.status.${row.status}` },
    leadKey: sales ? 'deliveryDetail.sale.deliveredTo' : 'deliveryDetail.purchase.deliveredBy',
    party: row.party,
    date: { key: 'deliveryDetail.onDateValue', values: { date: row.due } },
    against: row.orderId,
    steps: sales
      ? [
          { labelKey: 'orderDetail.sale.steps.quoteSent', state: 'idle' },
          { labelKey: 'orderDetail.sale.steps.accepted', state: 'idle' },
          {
            labelKey: 'deliveryDetail.steps.orderConfirmed',
            state: row.orderId ? 'done' : 'idle',
            glyph: row.orderId ? 'tick' : undefined,
          },
          {
            labelKey: 'orderDetail.sale.steps.delivered',
            state: moved ? 'done' : 'active',
            glyph: moved ? 'tick' : 'doc',
          },
          {
            labelKey: 'orderDetail.sale.steps.invoiced',
            state: row.status === 'completed' ? 'done' : 'idle',
            glyph: row.status === 'completed' ? 'tick' : undefined,
          },
          { labelKey: 'orderDetail.sale.steps.paid', state: 'idle' },
        ]
      : [
          { labelKey: 'orderDetail.purchase.steps.poSent', state: 'done', glyph: 'tick' },
          {
            labelKey: 'orderDetail.purchase.steps.received',
            state: moved ? 'done' : 'pending',
            glyph: moved ? 'tick' : 'clock',
          },
          { labelKey: 'orderDetail.purchase.steps.theyBilled', state: 'idle' },
          { labelKey: 'orderDetail.purchase.steps.youPaid', state: 'idle' },
        ],
    lifecycleNote: null,
    proof: {
      title: { key: row.proofTitleKey },
      rows: [
        {
          icon: 'user',
          labelKey: sales
            ? 'deliveryDetail.sale.receivedBy'
            : 'deliveryDetail.purchase.checkedInBy',
          value: { key: row.proofNoteKey },
        },
        {
          icon: 'clock',
          labelKey: sales ? 'deliveryDetail.sale.signedAt' : 'deliveryDetail.purchase.arrived',
          value: { key: row.dueNoteKey },
        },
        {
          icon: 'pin',
          labelKey: sales ? 'deliveryDetail.sale.where' : 'deliveryDetail.purchase.receivedAt',
          value: { key: 'tradeDocs.notRecorded' },
        },
        {
          icon: 'truck',
          labelKey: sales
            ? 'deliveryDetail.sale.deliveredBy'
            : 'deliveryDetail.purchase.theirPaperwork',
          value: { key: 'tradeDocs.notRecorded' },
        },
      ],
      signature: null,
    },
    action: sales
      ? {
          titleKey: 'deliveryDetail.sale.readyToInvoice',
          amount: null,
          noteKey: 'deliveryDetail.sale.readyNote',
          buttonKey: 'deliveryDetail.sale.convertToInvoice',
          kind: row.status === 'completed' ? 'none' : 'convert',
        }
      : {
          titleKey: 'deliveryDetail.purchase.theirBill',
          amount: null,
          noteKey: null,
          buttonKey: 'deliveryDetail.purchase.viewTheirInvoice',
          kind: 'none',
        },
    progress: {
      title: row.orderId
        ? { key: 'deliveryDetail.progressOn', values: { id: row.orderId } }
        : { key: 'deliveryDetail.standalone' },
      barLabelKey: sales ? 'deliveryDetail.sale.thisDrop' : 'deliveryDetail.purchase.receivedAfter',
      percent: null,
      note: null,
    },
    details: {
      titleKey: sales
        ? 'deliveryDetail.sale.noteDetails'
        : 'deliveryDetail.purchase.receiptDetails',
      rows: [
        {
          labelKey: sales
            ? 'deliveryDetail.sale.noteNumber'
            : 'deliveryDetail.purchase.receiptNumber',
          value: row.id,
        },
        {
          labelKey: sales ? 'deliveryDetail.sale.delivered' : 'deliveryDetail.purchase.arrivedRow',
          value: row.due,
        },
      ],
    },
    linesTitleKey: sales
      ? 'deliveryDetail.sale.whatWasDelivered'
      : 'deliveryDetail.purchase.whatArrived',
    thisColumnKey: sales
      ? 'deliveryDetail.sale.thisDropCol'
      : 'deliveryDetail.purchase.thisDeliveryCol',
    lines: null,
    activity: null,
    filesTitleKey: sales ? 'deliveryDetail.attachments' : 'deliveryDetail.purchase.linkedDocuments',
    files: [],
  }
}

/** The delivery note the address names, or null when there is none. */
export function deliveryById(id: string | undefined): DeliveryDetail | null {
  if (!id) return null
  if (id === 'DN-0124') return dn0124()
  if (id === GRN_0087.id) return GRN_0087
  const row = DELIVERY_ROWS.find((candidate) => candidate.id === id)
  return row ? fromRow(row) : null
}
