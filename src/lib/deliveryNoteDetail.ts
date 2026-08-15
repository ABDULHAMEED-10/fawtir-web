/**
 * Delivery note detail — sale (Figma 68:40836) and purchase (68:41301).
 *
 * A delivery note is proof, so the screen leads with *who signed for what*: a green proof card
 * carrying the receiver, the timestamp, the place and the driver, plus a captured signature on
 * the sales side. Quantities only — the money lives on the invoice this note becomes.
 */

import type { LifecycleStep, TimelineEvent } from './orderFormDetail'

export type MetaRow = {
  icon: 'user' | 'clock' | 'pin' | 'truck'
  labelKey: string
  valueKey: string
}

export type DeliveredLine = {
  id: string
  name: string
  noteKey: string
  onOrder: string
  thisDrop: string
  stillToCome: string
}

export const DELIVERY_NOTE_SALE = {
  id: 'DN-0124',
  direction: 'sales' as const,
  statusKey: 'deliveryDetail.sale.status',
  leadKey: 'deliveryDetail.sale.deliveredTo',
  party: 'Nizwa Souq Café',
  dateKey: 'deliveryDetail.sale.onDate',
  againstKey: 'deliveryDetail.against',
  against: 'SO-0073',
  steps: [
    { labelKey: 'orderDetail.sale.steps.quoteSent', noteKey: 'orderDetail.notUsed', state: 'idle' },
    { labelKey: 'orderDetail.sale.steps.accepted', noteKey: 'orderDetail.notUsed', state: 'idle' },
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
      noteKey: 'deliveryDetail.sale.steps.invoicedNote',
      state: 'active',
      glyph: 'invoiced',
    },
    { labelKey: 'orderDetail.sale.steps.paid', noteKey: 'deliveryDetail.dash', state: 'idle' },
  ] satisfies LifecycleStep[],
  lifecycleNoteKey: 'deliveryDetail.sale.lifecycleNote',
  proof: {
    titleKey: 'deliveryDetail.sale.proofTitle',
    rows: [
      {
        icon: 'user',
        labelKey: 'deliveryDetail.sale.receivedBy',
        valueKey: 'deliveryDetail.sale.receivedByValue',
      },
      {
        icon: 'clock',
        labelKey: 'deliveryDetail.sale.signedAt',
        valueKey: 'deliveryDetail.sale.signedAtValue',
      },
      {
        icon: 'pin',
        labelKey: 'deliveryDetail.sale.where',
        valueKey: 'deliveryDetail.sale.whereValue',
      },
      {
        icon: 'truck',
        labelKey: 'deliveryDetail.sale.deliveredBy',
        valueKey: 'deliveryDetail.sale.deliveredByValue',
      },
    ] satisfies MetaRow[],
    /** The captured signature is rendered as script type rather than an image asset. */
    signatureLabelKey: 'deliveryDetail.sale.signature',
    signature: 'Salim',
  },
  action: {
    titleKey: 'deliveryDetail.sale.readyToInvoice',
    amount: '248.000',
    noteKey: 'deliveryDetail.sale.readyNote',
    buttonKey: 'deliveryDetail.sale.convertToInvoice',
  },
  progress: {
    titleKey: 'deliveryDetail.sale.progressTitle',
    barLabelKey: 'deliveryDetail.sale.thisDrop',
    percent: 60,
    noteKey: 'deliveryDetail.sale.progressNote',
  },
  details: {
    titleKey: 'deliveryDetail.sale.noteDetails',
    rows: [
      { labelKey: 'deliveryDetail.sale.noteNumber', value: 'DN-0124' },
      { labelKey: 'deliveryDetail.sale.dispatched', value: '27 Jul, 06:35' },
      { labelKey: 'deliveryDetail.sale.delivered', value: '27 Jul, 09:12' },
      { labelKey: 'deliveryDetail.sale.from', value: 'Main store' },
      { labelKey: 'deliveryDetail.sale.driver', value: 'Salim Al Hinai' },
      { labelKey: 'deliveryDetail.sale.createdBy', value: 'Hafidh Saif' },
    ],
  },
  linesTitleKey: 'deliveryDetail.sale.whatWasDelivered',
  thisColumnKey: 'deliveryDetail.sale.thisDropCol',
  lines: [
    {
      id: '1',
      name: 'Green beans — House Blend',
      noteKey: 'deliveryDetail.sale.line1Note',
      onOrder: '80 KG',
      thisDrop: '24 KG',
      stillToCome: '32 KG',
    },
    {
      id: '2',
      name: 'Roasting service — per batch',
      noteKey: 'deliveryDetail.sale.line2Note',
      onOrder: '60 EA',
      thisDrop: '18 EA',
      stillToCome: '24 EA',
    },
    {
      id: '3',
      name: 'Takeaway cups — 500 pack',
      noteKey: 'deliveryDetail.sale.line3Note',
      onOrder: '10 EA',
      thisDrop: '3 EA',
      stillToCome: '4 EA',
    },
  ] satisfies DeliveredLine[],
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
  ] satisfies TimelineEvent[],
  filesTitleKey: 'deliveryDetail.attachments',
  files: [
    { id: 'g1', titleKey: 'deliveryDetail.sale.fileSo', metaKey: 'deliveryDetail.sale.fileSoNote' },
  ],
}

export const DELIVERY_NOTE_PURCHASE = {
  id: 'GRN-0087',
  direction: 'purchase' as const,
  statusKey: 'deliveryDetail.purchase.status',
  leadKey: 'deliveryDetail.purchase.deliveredBy',
  party: 'Muscat Roastery Co',
  dateKey: 'deliveryDetail.purchase.onDate',
  againstKey: 'deliveryDetail.against',
  against: 'PO-0031',
  /** The purchase side only has four stations — no quote or acceptance leg. */
  steps: [
    {
      labelKey: 'orderDetail.purchase.steps.poSent',
      noteKey: 'orderDetail.purchase.steps.poSentNote',
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
      noteKey: 'orderDetail.purchase.steps.theyBilledNote',
      state: 'done',
      glyph: 'tick',
    },
    {
      labelKey: 'orderDetail.purchase.steps.youPaid',
      noteKey: 'orderDetail.purchase.steps.youPaidNote',
      state: 'pending',
      glyph: 'clock',
    },
  ] satisfies LifecycleStep[],
  lifecycleNoteKey: 'deliveryDetail.purchase.lifecycleNote',
  proof: {
    titleKey: 'deliveryDetail.purchase.proofTitle',
    rows: [
      {
        icon: 'user',
        labelKey: 'deliveryDetail.purchase.checkedInBy',
        valueKey: 'deliveryDetail.purchase.checkedInByValue',
      },
      {
        icon: 'clock',
        labelKey: 'deliveryDetail.purchase.arrived',
        valueKey: 'deliveryDetail.purchase.arrivedValue',
      },
      {
        icon: 'pin',
        labelKey: 'deliveryDetail.purchase.receivedAt',
        valueKey: 'deliveryDetail.purchase.receivedAtValue',
      },
      {
        icon: 'truck',
        labelKey: 'deliveryDetail.purchase.theirPaperwork',
        valueKey: 'deliveryDetail.purchase.theirPaperworkValue',
      },
    ] satisfies MetaRow[],
  },
  action: {
    titleKey: 'deliveryDetail.purchase.billedAndMatched',
    amount: '2,354.310',
    noteKey: 'deliveryDetail.purchase.billedNote',
    buttonKey: 'deliveryDetail.purchase.viewTheirInvoice',
  },
  progress: {
    titleKey: 'deliveryDetail.purchase.progressTitle',
    barLabelKey: 'deliveryDetail.purchase.receivedAfter',
    percent: 100,
    noteKey: 'deliveryDetail.purchase.progressNote',
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
      name: 'Green beans — Yirgacheffe',
      noteKey: 'deliveryDetail.purchase.line1Note',
      onOrder: '300 KG',
      thisDrop: '300 KG',
      stillToCome: '—',
    },
    {
      id: '2',
      name: 'Jute sacks — 25 kg',
      noteKey: 'deliveryDetail.purchase.line2Note',
      onOrder: '12 EA',
      thisDrop: '12 EA',
      stillToCome: '—',
    },
  ] satisfies DeliveredLine[],
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
  ] satisfies TimelineEvent[],
  filesTitleKey: 'deliveryDetail.purchase.linkedDocuments',
  files: [
    {
      id: 'h1',
      titleKey: 'deliveryDetail.purchase.filePo',
      metaKey: 'deliveryDetail.purchase.filePoNote',
    },
  ],
}
