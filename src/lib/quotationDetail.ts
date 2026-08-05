/**
 * Quotation detail (Figma 13:45754).
 *
 * A quotation binds nobody until the customer answers, so the page leads with the
 * decision actions rather than a payment summary — and nothing here is reported to
 * the OTA until the quote turns into an invoice.
 */

import type { TrackerStep } from '../components/ui'

export type QuotationEvent = {
  id: string
  title: string
  detail: string
  tone: 'open' | 'done'
}

export const QUOTATION_DETAIL = {
  id: 'QUO-0118',
  statusKey: 'quotationDetail.status.sent',
  subject: 'Ramadan 2027 supply',
  customer: 'Muscat Grand Hotel LLC',
  validTo: 'valid to 27 Aug 2026',
  /** The trade chain — sitting on Quote until they accept. */
  steps: [
    { labelKey: 'quotations.step.quote', state: 'current' },
    { labelKey: 'quotations.step.order', state: 'future' },
    { labelKey: 'quotations.step.deliver', state: 'future' },
    { labelKey: 'quotations.step.invoice', state: 'future' },
  ] satisfies TrackerStep[],
  chainNote:
    'Sitting with the customer since 28 July. Nothing else happens until they accept — no order, no delivery, and nothing reported to the Tax Authority.',
  decision: {
    title: 'Waiting on Muscat Grand Hotel',
    detail:
      'Opened three times, most recently yesterday. Record their answer here, or they can accept from the link in the email.',
    stats: [
      { labelKey: 'quotationDetail.sent', value: '28 Jul 2026', tone: 'normal' as const },
      { labelKey: 'quotationDetail.lastOpened', value: '29 Jul, 16:40', tone: 'normal' as const },
      {
        labelKey: 'quotationDetail.validUntil',
        value: '27 Aug · 28 days left',
        tone: 'warning' as const,
      },
      { labelKey: 'quotationDetail.preparedBy', value: 'Hafidh Saif', tone: 'strong' as const },
    ],
  },
  customerCard: {
    name: 'Muscat Grand Hotel LLC',
    vat: 'VAT OM1100447102 · 0248:OM1100447102',
  },
  fields: {
    issueDate: '28 Jul 2026',
    validUntil: '27 Aug 2026',
    paymentTerms: 'Net 30 days',
    expectedDelivery: 'Within 14 days of order',
    branch: 'Al Bahja Coffee (Main)',
    taxCategory: 'Standard rate · 5%',
  },
  items: [
    {
      id: '1',
      description: 'Green beans — Yirgacheffe',
      meta: 'Grade A, delivered in 25 kg sacks',
      unitPrice: '10.250',
      qty: '600 KG',
      discount: '8%',
      total: '5,658.000',
    },
    {
      id: '2',
      description: 'Roasting service — per batch',
      meta: 'Medium roast profile, agreed sample approved',
      unitPrice: '4.200',
      qty: '150 EA',
      discount: '—',
      total: '630.000',
    },
  ],
  totals: {
    subtotal: '6,780.000',
    discount: '492.000',
    vat: '314.400',
    optional: '777.000',
    total: '6,602.400',
  },
  notes: {
    customer:
      'Prices held to 27 August 2026 and include delivery to Shatti Al Qurum. Barista training is optional and can be added when you confirm the order.',
    internal:
      'Competing against Nizwa Roasters — 8% volume discount approved by Hafidh. Hold the line on the roasting rate.',
  },
  /** Newest first — the open item sits at the top in sand, the rest in green. */
  activity: [
    {
      id: 'a4',
      title: 'Awaiting a decision',
      detail: '2 days open · 28 days of validity remaining',
      tone: 'open' as const,
    },
    {
      id: 'a3',
      title: 'Opened by the customer — 3 times',
      detail: 'Most recently 29 Jul 2026, 16:40',
      tone: 'done' as const,
    },
    {
      id: 'a2',
      title: 'Sent to procurement@mgh.om',
      detail: 'With a PDF copy and an accept link · 28 Jul 2026, 11:05',
      tone: 'done' as const,
    },
    {
      id: 'a1',
      title: 'Quotation created',
      detail: 'Hafidh Saif · 28 Jul 2026, 10:41',
      tone: 'done' as const,
    },
  ] satisfies QuotationEvent[],
}
