/**
 * Order form detail (Figma 13:46203).
 *
 * A standing order runs several lifecycle stages at once — you keep shipping, billing
 * and collecting against the same commitment — so the strip marks more than one stage
 * live, and every line tracks ordered / delivered / invoiced separately.
 */

export type LifecycleState = 'unused' | 'done' | 'active'

export type LifecycleStep = {
  labelKey: string
  /** Sub-line under the label; some steps show an amount instead. */
  note?: string
  amount?: string
  state: LifecycleState
  /** Active steps carry a step-specific glyph; done steps a green tick. */
  glyph?: 'order' | 'invoice'
}

export type OrderLine = {
  id: string
  description: string
  rate: string
  ordered: string
  delivered: string
  invoiced: string
  toInvoice: string
  toDeliver: string
  total: string
}

export type OrderAttachment = {
  id: string
  name: string
  meta: string
  kind: 'pdf' | 'jpg'
}

export const ORDER_FORM_DETAIL = {
  id: 'SO-0073',
  direction: 'sales' as const,
  statusKey: 'orderFormDetail.status.inProgress',
  subject: 'Weekly coffee supply',
  customer: 'Nizwa Souq Café',
  meta: 'next drop 04 Aug 2026',
  /** Six stages; a standing order has Delivered and Invoiced both live. */
  lifecycle: [
    { labelKey: 'orderFormDetail.step.quoteSent', note: 'Not used', state: 'unused' },
    { labelKey: 'orderFormDetail.step.accepted', note: 'Not used', state: 'unused' },
    { labelKey: 'orderFormDetail.step.orderConfirmed', note: '22 Jul', state: 'done' },
    {
      labelKey: 'orderFormDetail.step.delivered',
      note: '60% · 2 notes',
      state: 'active',
      glyph: 'order',
    },
    {
      labelKey: 'orderFormDetail.step.invoiced',
      note: '40% · 1 invoice',
      state: 'active',
      glyph: 'invoice',
    },
    { labelKey: 'orderFormDetail.step.paid', amount: '496.000', state: 'done' },
  ] satisfies LifecycleStep[],
  lifecycleNote:
    'A standing order, so three stages run at once — you keep shipping, billing and collecting against the same commitment. OMR 248.000 has been delivered and not yet invoiced.',
  fulfilment: {
    delivered: { amount: '744.000', note: '60% of the order · 2 delivery notes' },
    readyToInvoice: { amount: '248.000', note: 'Shipped and not yet billed' },
    stillToDeliver: { amount: '496.000', note: '40% outstanding · next drop 04 Aug' },
    /** Bar segments as percentages of the order value — blue billed, sand shipped-unbilled. */
    billedPercent: 40,
    deliveredPercent: 60,
    legend: {
      billed: '496.000',
      deliveredNotBilled: '248.000',
      stillToDeliver: '496.000',
    },
  },
  value: {
    subtotal: '1,180.950',
    vat: '59.050',
    total: '1,240.000',
    vatNote:
      'VAT shown is indicative. It is declared only on the invoices raised against this order.',
  },
  lines: [
    {
      id: '1',
      description: 'Green beans — House Blend',
      rate: '9.500 per KG',
      ordered: '80 KG',
      delivered: '48 KG',
      invoiced: '32 KG',
      toInvoice: '16 KG',
      toDeliver: '32 KG',
      total: '760.000',
    },
    {
      id: '2',
      description: 'Roasting service — per batch',
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
      description: 'Takeaway cups — 500 pack',
      rate: '22.800 per pack',
      ordered: '10 EA',
      delivered: '6 EA',
      invoiced: '4 EA',
      toInvoice: '2 EA',
      toDeliver: '4 EA',
      total: '228.000',
    },
  ] satisfies OrderLine[],
  /** Newest first — the open item sits at the top in sand, the rest in green. */
  activity: [
    {
      id: 'a5',
      title: 'Next drop due 04 Aug',
      detail: '32 KG beans, 24 roasting batches, 4 packs of cups still to ship',
      tone: 'open' as const,
    },
    {
      id: 'a4',
      title: 'INV-2041 issued and paid',
      detail:
        'OMR 496.000 covering the first two deliveries · sent over Peppol, TDD accepted · 28 Jul',
      tone: 'done' as const,
    },
    {
      id: 'a3',
      title: 'DN-0124 delivered and signed',
      detail: '24 KG, 18 batches, 3 packs · received by Khalid at the café · 27 Jul',
      tone: 'done' as const,
    },
    {
      id: 'a2',
      title: 'DN-0119 delivered and signed',
      detail: '24 KG, 18 batches, 3 packs · 25 Jul',
      tone: 'done' as const,
    },
    {
      id: 'a1',
      title: 'Order confirmed',
      detail: 'Entered by Hafidh Saif · quantities committed · 22 Jul',
      tone: 'done' as const,
    },
  ],
  attachments: [
    {
      id: 'f1',
      name: 'Readable copy',
      meta: 'Purchase order · 248 KB · Uploaded 18 Jul 2026',
      kind: 'pdf' as const,
    },
    {
      id: 'f2',
      name: 'Signed delivery note — 18 Jul.jpg',
      meta: 'Delivery note · 1.2 MB · Uploaded 18 Jul 2026',
      kind: 'jpg' as const,
    },
  ] satisfies OrderAttachment[],
}
