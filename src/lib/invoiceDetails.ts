export type InvoiceDetailItem = {
  id: string
  description: string
  catalog: string
  unitPrice: string
  vat: string
  qty: string
  unit: string
  discount: string
  total: string
}

export type InvoiceAttachment = {
  id: string
  name: string
  meta: string
  type: 'pdf' | 'jpg'
}

export type InvoicePayment = {
  id: string
  method: string
  meta: string
  amount: string
}

export type InvoiceTimelineEvent = {
  id: string
  title: string
  detail: string
  /**
   * Figma colours the timeline per event: the newest sits at the top in brand blue
   * as the invoice's current state, everything already completed below it in green.
   */
  tone?: 'current' | 'done'
}

export const INVOICE_DETAIL = {
  id: 'INV-2044',
  status: 'partial' as const,
  issued: '18 Jul 2026',
  channel: 'Sent via Peppol',
  customer: {
    name: 'Muscat Grand Hotel LLC',
    vat: 'VAT OM1100447102 · 0248:OM1100447102',
  },
  dueBadge: 'Due in 23 days · 17 Aug 2026',
  outstanding: '28.590',
  total: '58.590',
  paid: '30.000',
  paidPercent: 51,
  peppolDelivery: 'Delivered on Peppol to Muscat Grand Hotel LLC · 18 Jul 2026, 14:32',
  fields: {
    issueDate: '18 Jul 2026',
    dueDate: '17 Aug 2026',
    deliveryDate: '18 Jul 2026',
    paymentTerms: 'Net 30 days',
    currency: 'OMR - Omani Rial',
    vatRate: 'Standard rate · 5%',
    branch: 'Al Bahja Coffee (Main)',
    project: 'Ramadan 2026 supply',
    poReference: 'PO-88213',
    subject: 'Monthly coffee supply & barista training — July',
    paymentMethod: 'Bank transfer',
  },
  items: [
    {
      id: '1',
      description: 'Cappuccino - Large',
      catalog: 'EA · Catalog #BV-014',
      unitPrice: '1.8',
      vat: '5%',
      qty: '12',
      unit: 'EA',
      discount: '0',
      total: '23.400',
    },
    {
      id: '2',
      description: 'Coffee Beans 1kg - House Blend',
      catalog: 'KG · Catalog #BN-002',
      unitPrice: '9.500',
      vat: '5%',
      qty: '4',
      unit: 'KG',
      discount: '10%',
      total: '34.200',
    },
  ] satisfies InvoiceDetailItem[],
  totals: {
    subtotal: '59.600',
    discount: '3.800',
    net: '55.800',
    vat: '2.790',
    total: '58.590',
  },
  notes: {
    customer:
      'Thank you for your business. Please settle within 30 days by bank transfer using the reference above.',
    internal: 'Loyalty discount approved by Hafidh on 15 Jul. Follow up if unpaid by 20 Aug.',
  },
  attachments: [
    {
      id: 'a1',
      name: 'PO-88213 — Muscat Grand Hotel.pdf',
      meta: 'Purchase order · 248 KB · Uploaded 18 Jul 2026 by Hafidh Saif',
      type: 'pdf' as const,
    },
    {
      id: 'a2',
      name: 'Signed delivery note — 18 Jul.jpg',
      meta: 'Delivery note · 1.2 MB · Uploaded 18 Jul 2026 by Hafidh Saif',
      type: 'jpg' as const,
    },
  ] satisfies InvoiceAttachment[],
  payments: [
    {
      id: 'p1',
      method: 'Bank transfer',
      meta: '22 Jul 2026 · Ref MGH-2044-07 · Part payment — Ramadan supply',
      amount: '30.000',
    },
  ] satisfies InvoicePayment[],
  /** Newest first, as drawn — the top entry is the invoice's current state. */
  timeline: [
    {
      id: 't6',
      title: 'Partially paid',
      detail: 'Outstanding OMR 28.590 · due in 23 days',
      tone: 'current',
    },
    {
      id: 't4',
      title: 'Payment received — OMR 30.000',
      detail: 'Bank transfer · 22 Jul 2026, 09:14',
      tone: 'done',
    },
    {
      id: 't3b',
      title: "Delivered to recipient's Peppol inbox",
      detail: '18 Jul 2026, 14:32',
      tone: 'done',
    },
    {
      id: 't3',
      title: 'Reported to OTA',
      detail: '18 Jul 2026, 14:33 · Cleared · UUID 7c9e6679-7425-40de-944b-e07fc1f90ae7',
      tone: 'done',
    },
    {
      id: 't2',
      title: 'Sent via Peppol',
      detail: '18 Jul 2026, 14:32 · UUID 550e8400-e29b-41d4-a716-446655440000',
      tone: 'done',
    },
    {
      id: 't1',
      title: 'Invoice created',
      detail: '18 Jul 2026, 09:14 by Hafidh Saif',
      tone: 'done',
    },
  ] satisfies InvoiceTimelineEvent[],
}
