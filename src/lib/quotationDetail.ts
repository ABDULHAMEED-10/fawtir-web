/**
 * Quotation detail (Figma 13:45754).
 *
 * A quotation binds nobody until the customer answers, so the page leads with the decision
 * actions rather than a payment summary, and nothing here is reported to the OTA until the quote
 * turns into an invoice.
 *
 * The page reads the record named in the address. QUO-0118 is the design's own record, in full;
 * the rows of the Quotations list are records too, drawn from what the list knows, with the parts
 * only the server can give (lines, activity, notes) shown as "not available yet".
 * TODO(backend): TRADE_DOCUMENTS.md rows T.1 and T.8 (`GET` one quotation with its lines).
 */

import type { TrackerStep } from '../components/ui'
import { QUOTATION_ROWS, type QuotationRow, type QuotationStatus } from './quotations'
import type { TradeLine } from './tradeLedger'

export type QuotationEvent = {
  id: string
  title: string
  detail: string
  tone: 'open' | 'done'
}

/** A quoted line: the invoice line model plus the quote's own discount. */
export type QuoteItem = TradeLine & {
  meta: string
  qty: number
  discountPct: number
}

const round3 = (value: number) => Math.round(value * 1000) / 1000

/** 6780 -> "6,780.000". */
export function formatRials(value: number): string {
  return round3(value).toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

const VAT_RATE = { S5: 0.05, Z0: 0, E0: 0, O0: 0 } as const

export function quoteItemTotal(item: Pick<QuoteItem, 'unitPrice' | 'qty' | 'discountPct'>): number {
  const gross = round3(item.unitPrice * item.qty)
  return round3(gross - round3((gross * item.discountPct) / 100))
}

/**
 * Subtotal before discounts, the discounts, the net, then VAT on the net. Computed, never typed:
 * the design typed QUO-0119's figures and took the discount off twice.
 */
export function quoteTotals(
  items: Pick<QuoteItem, 'unitPrice' | 'qty' | 'discountPct' | 'taxCode'>[],
) {
  const subtotal = items.reduce((total, item) => total + round3(item.unitPrice * item.qty), 0)
  const net = items.reduce((total, item) => total + quoteItemTotal(item), 0)
  const vat = items.reduce(
    (total, item) => total + round3(quoteItemTotal(item) * VAT_RATE[item.taxCode]),
    0,
  )
  return {
    subtotal: formatRials(subtotal),
    discount: formatRials(subtotal - net),
    net: formatRials(net),
    vat: formatRials(vat),
    total: formatRials(net + vat),
  }
}

type Stat = { labelKey: string; value: string | null; tone: 'normal' | 'warning' | 'strong' }

export type QuotationDetail = {
  id: string
  status: QuotationStatus
  subject: string
  customer: string
  customerId: string
  validUntil: string
  steps: TrackerStep[]
  /** Null where only the server can say it (the list does not carry it). */
  chainNote: string | null
  decision: { title: string | null; detail: string | null; stats: Stat[] }
  customerVat: string | null
  fields: {
    issueDate: string | null
    validUntil: string
    paymentTerms: string | null
    expectedDelivery: string | null
    branch: string
    taxCategory: string | null
  }
  items: QuoteItem[] | null
  /** Quoted but not counted in the total until the customer takes them. */
  optionalValue: number | null
  /** The quoted total when the lines are not known (the list's figure). */
  listedTotal: string
  notes: { customer: string; internal: string } | null
  activity: QuotationEvent[] | null
}

const QUO_0118_ITEMS: QuoteItem[] = [
  {
    lineNo: 1,
    description: 'Green beans, Yirgacheffe',
    meta: 'Grade A, delivered in 25 kg sacks',
    itemType: 'goods',
    unitCode: 'KGM',
    unitLabel: 'KG',
    unitPrice: 10.25,
    qty: 600,
    discountPct: 8,
    taxCode: 'S5',
    hsCode: '000000000000',
  },
  {
    lineNo: 2,
    description: 'Roasting service, per batch',
    meta: 'Medium roast profile, agreed sample approved',
    itemType: 'service',
    unitCode: 'C62',
    unitLabel: 'EA',
    unitPrice: 4.2,
    qty: 150,
    discountPct: 0,
    taxCode: 'S5',
  },
]

/** The design's record. */
const QUO_0118: QuotationDetail = {
  id: 'QUO-0118',
  status: 'sent',
  subject: 'Ramadan 2027 supply',
  customer: 'Muscat Grand Hotel LLC',
  customerId: 'c-grand',
  validUntil: '27 Aug 2026',
  /** The trade chain, sitting on Quote until they accept. */
  steps: [
    { labelKey: 'quotations.step.quote', state: 'current' },
    { labelKey: 'quotations.step.order', state: 'future' },
    { labelKey: 'quotations.step.deliver', state: 'future' },
    { labelKey: 'quotations.step.invoice', state: 'future' },
  ],
  chainNote:
    'Sitting with the customer since 28 July. Nothing else happens until they accept: no order, no delivery, and nothing reported to the Tax Authority.',
  decision: {
    title: 'Waiting on Muscat Grand Hotel',
    detail:
      'Opened three times, most recently yesterday. Record their answer here, or they can accept from the link in the email.',
    stats: [
      { labelKey: 'quotationDetail.sent', value: '28 Jul 2026', tone: 'normal' },
      { labelKey: 'quotationDetail.lastOpened', value: '29 Jul, 16:40', tone: 'normal' },
      { labelKey: 'quotationDetail.validUntil', value: '27 Aug · 28 days left', tone: 'warning' },
      { labelKey: 'quotationDetail.preparedBy', value: 'Hafidh Saif', tone: 'strong' },
    ],
  },
  customerVat: 'VAT OM1100447102 · 0248:OM1100447102',
  fields: {
    issueDate: '28 Jul 2026',
    validUntil: '27 Aug 2026',
    paymentTerms: 'Net 30 days',
    expectedDelivery: 'Within 14 days of order',
    branch: 'Al Bahja Coffee (Main)',
    taxCategory: 'Standard rate · 5%',
  },
  items: QUO_0118_ITEMS,
  optionalValue: 777,
  listedTotal: quoteTotals(QUO_0118_ITEMS).total,
  notes: {
    customer:
      'Prices held to 27 August 2026 and include delivery to Shatti Al Qurum. Barista training is optional and can be added when you confirm the order.',
    internal:
      'Competing against Nizwa Roasters: 8% volume discount approved by Hafidh. Hold the line on the roasting rate.',
  },
  /** Newest first: the open item sits at the top in sand, the rest in green. */
  activity: [
    {
      id: 'a4',
      title: 'Awaiting a decision',
      detail: '2 days open · 28 days of validity remaining',
      tone: 'open',
    },
    {
      id: 'a3',
      title: 'Opened by the customer 3 times',
      detail: 'Most recently 29 Jul 2026, 16:40',
      tone: 'done',
    },
    {
      id: 'a2',
      title: 'Sent to procurement@mgh.om',
      detail: 'With a PDF copy and an accept link · 28 Jul 2026, 11:05',
      tone: 'done',
    },
    {
      id: 'a1',
      title: 'Quotation created',
      detail: 'Hafidh Saif · 28 Jul 2026, 10:41',
      tone: 'done',
    },
  ],
}

function fromRow(row: QuotationRow): QuotationDetail {
  return {
    id: row.id,
    status: row.status,
    subject: row.subject,
    customer: row.customer,
    customerId: row.customerId,
    validUntil: row.validUntil,
    steps: row.steps,
    chainNote: null,
    decision: {
      title: null,
      detail: row.validNote || null,
      stats: [
        { labelKey: 'quotationDetail.sent', value: null, tone: 'normal' },
        { labelKey: 'quotationDetail.lastOpened', value: null, tone: 'normal' },
        {
          labelKey: 'quotationDetail.validUntil',
          value: row.validUntil,
          tone: row.validNoteTone === 'warning' ? 'warning' : 'normal',
        },
        { labelKey: 'quotationDetail.preparedBy', value: null, tone: 'strong' },
      ],
    },
    customerVat: null,
    fields: {
      issueDate: null,
      validUntil: row.validUntil,
      paymentTerms: null,
      expectedDelivery: null,
      branch: row.branch,
      taxCategory: null,
    },
    items: null,
    optionalValue: null,
    listedTotal: row.amount,
    notes: null,
    activity: null,
  }
}

/** The quotation the address names, or null when there is none. */
export function quotationById(id: string | undefined): QuotationDetail | null {
  if (!id) return null
  if (id === QUO_0118.id) return QUO_0118
  const row = QUOTATION_ROWS.find((candidate) => candidate.id === id)
  return row ? fromRow(row) : null
}
