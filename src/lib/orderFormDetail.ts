/**
 * Order form detail — sale (Figma 68:39818) and purchase (68:40327).
 *
 * The two directions answer different questions. A sales order asks "how much of this have I
 * shipped, billed and been paid for", so it leads with a fulfilment split and a money bar. A
 * purchase order asks "does what they billed match what I ordered and received", so it leads
 * with a three-way match and an approval trail.
 */

export type LifecycleState = 'done' | 'active' | 'pending' | 'idle'

export type LifecycleStep = {
  labelKey: string
  noteKey?: string
  state: LifecycleState
  /** Which glyph sits in the disc — a tick, a document, or nothing at all. */
  glyph?: 'tick' | 'doc' | 'invoiced' | 'clock'
}

export type TimelineEvent = {
  id: string
  titleKey: string
  detailKey: string
  tone: 'open' | 'done'
}

export type Attachment = {
  id: string
  titleKey: string
  metaKey: string
}

/* ---------------------------------------------------------------- sales */

export const ORDER_FORM_SALE = {
  id: 'SO-0073',
  statusKey: 'orderDetail.sale.status',
  direction: 'sales' as const,
  customer: 'Nizwa Souq Café',
  confirmedKey: 'orderDetail.sale.confirmed',
  /** Six stations; a standing order has three of them live at once. */
  steps: [
    { labelKey: 'orderDetail.sale.steps.quoteSent', noteKey: 'orderDetail.notUsed', state: 'idle' },
    { labelKey: 'orderDetail.sale.steps.accepted', noteKey: 'orderDetail.notUsed', state: 'idle' },
    {
      labelKey: 'orderDetail.sale.steps.orderConfirmed',
      noteKey: 'orderDetail.sale.steps.orderConfirmedNote',
      state: 'done',
      glyph: 'tick',
    },
    {
      labelKey: 'orderDetail.sale.steps.delivered',
      noteKey: 'orderDetail.sale.steps.deliveredNote',
      state: 'active',
      glyph: 'doc',
    },
    {
      labelKey: 'orderDetail.sale.steps.invoiced',
      noteKey: 'orderDetail.sale.steps.invoicedNote',
      state: 'active',
      glyph: 'invoiced',
    },
    {
      labelKey: 'orderDetail.sale.steps.paid',
      noteKey: 'orderDetail.sale.steps.paidNote',
      state: 'done',
      glyph: 'tick',
    },
  ] satisfies LifecycleStep[],
  lifecycleNoteKey: 'orderDetail.sale.lifecycleNote',
  fulfilment: {
    /** The middle box is the one that needs action, so it carries the accent and the button. */
    stats: [
      {
        id: 'invoiced',
        labelKey: 'orderDetail.sale.fulfilment.invoiced',
        amount: '496.000',
        noteKey: 'orderDetail.sale.fulfilment.invoicedNote',
        accent: false,
      },
      {
        id: 'delivered',
        labelKey: 'orderDetail.sale.fulfilment.delivered',
        amount: '248.000',
        noteKey: 'orderDetail.sale.fulfilment.deliveredNote',
        accent: true,
        actionKey: 'orderForms.action.issueInvoice',
      },
      {
        id: 'toDeliver',
        labelKey: 'orderDetail.sale.fulfilment.toDeliver',
        amount: '496.000',
        noteKey: 'orderDetail.sale.fulfilment.toDeliverNote',
        accent: false,
      },
    ],
    /** Widths over a 763px track; blue paints over tan. */
    segments: [
      { width: 444, tone: 'delivered' as const },
      { width: 268, tone: 'invoiced' as const },
    ],
    legend: [
      { tone: 'invoiced' as const, labelKey: 'orderDetail.sale.legend.billed', amount: '496.000' },
      {
        tone: 'delivered' as const,
        labelKey: 'orderDetail.sale.legend.deliveredNotBilled',
        amount: '248.000',
      },
      {
        tone: 'track' as const,
        labelKey: 'orderDetail.sale.legend.stillToDeliver',
        amount: '496.000',
      },
    ],
  },
  value: {
    net: '1,240.000',
    vat: '62.000',
    total: '1,302.000',
    noteKey: 'orderDetail.sale.valueNote',
  },
  lines: [
    {
      id: '1',
      name: 'Green beans — House Blend',
      rate: '9.500 per KG',
      ordered: '80 KG',
      delivered: '48 KG',
      invoiced: '32 KG',
      toInvoice: '16 KG',
      toDeliver: '32KG',
      total: '760.000',
    },
    {
      id: '2',
      name: 'Roasting service — per batch',
      rate: '4.200 each',
      ordered: '60 EA',
      delivered: '36 EA',
      invoiced: '24 EA',
      toInvoice: '12 EA',
      toDeliver: '24 EA',
      total: '252.000',
    },
    {
      id: '3',
      name: 'Takeaway cups — 500 pack',
      rate: '22.800 per pack',
      ordered: '10 EA',
      delivered: '6 EA',
      invoiced: '4 EA',
      toInvoice: '2 EA',
      toDeliver: '4 EA',
      total: '228.000',
    },
  ],
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
  ] satisfies TimelineEvent[],
  attachments: [
    {
      id: 'f1',
      titleKey: 'orderDetail.sale.files.dn0119',
      metaKey: 'orderDetail.sale.files.dn0119Note',
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
    },
  ] satisfies Attachment[],
}

/* ------------------------------------------------------------- purchase */

export const ORDER_FORM_PURCHASE = {
  id: 'PO-0029',
  statusKey: 'orderDetail.purchase.status',
  direction: 'purchase' as const,
  supplier: 'Al Noor Dates LLC',
  requiredKey: 'orderDetail.purchase.required',
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
  lifecycleNoteKey: 'orderDetail.purchase.lifecycleNote',
  /** The three-way match: ordered vs received vs billed. */
  match: {
    titleKey: 'orderDetail.purchase.matchTitle',
    linkKey: 'orderDetail.purchase.viewTheirInvoice',
    stats: [
      {
        id: 'invoiced',
        labelKey: 'orderDetail.purchase.match.invoiced',
        value: '300 KG',
        rate: '300 KG',
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
      name: 'Green beans — Yirgacheffe',
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
      name: 'Jute sacks — 25 kg',
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
    threshold: '2,000',
    rows: [
      {
        id: 'r1',
        titleKey: 'orderDetail.purchase.approvalRaised',
        metaKey: 'orderDetail.purchase.approvalRaisedMeta',
        chipKey: 'orderDetail.purchase.submitted',
        tone: 'neutral' as const,
      },
      {
        id: 'r2',
        titleKey: 'orderDetail.purchase.approvalApproved',
        metaKey: 'orderDetail.purchase.approvalApprovedMeta',
        chipKey: 'orderDetail.purchase.accepted',
        tone: 'success' as const,
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
  ] satisfies TimelineEvent[],
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
  ] satisfies Attachment[],
}
