/**
 * Create quotation (Figma 13:42543).
 *
 * A quotation is not a tax document (nothing is reported to the OTA until it turns into an
 * invoice), so the customer step only needs a name and email, and the VAT / Peppol details stay
 * optional.
 *
 * The totals are computed from the lines (`quoteTotals`), never typed. The design typed them and
 * took the 8% discount off twice: it printed the discounted line total 6,780.000 as the subtotal
 * and then subtracted 492.000 again. The lines give subtotal 7,272.000, discount 492.000, net
 * 6,780.000, VAT 339.000 and total 7,119.000.
 */

import { quoteTotals, type QuoteItem } from './quotationDetail'

const ITEMS: (QuoteItem & { vat: string })[] = [
  {
    lineNo: 1,
    description: 'Green beans, Yirgacheffe',
    meta: '',
    itemType: 'goods',
    unitCode: 'KGM',
    unitLabel: 'KG',
    unitPrice: 10.25,
    qty: 600,
    discountPct: 8,
    taxCode: 'S5',
    vat: '5%',
  },
  {
    lineNo: 2,
    description: 'Roasting service, per batch',
    meta: '',
    itemType: 'service',
    unitCode: 'C62',
    unitLabel: 'EA',
    unitPrice: 18,
    qty: 24,
    discountPct: 0,
    taxCode: 'S5',
    vat: '5%',
  },
  {
    lineNo: 3,
    description: 'Barista training, 2 day course',
    meta: '',
    itemType: 'service',
    unitCode: 'C62',
    unitLabel: 'EA',
    unitPrice: 345,
    qty: 2,
    discountPct: 0,
    taxCode: 'S5',
    vat: '5%',
  },
]

export const NEW_QUOTATION = {
  number: 'QUO-0119',
  savedLabelKey: 'newQuotation.savedJustNow',
  customer: {
    name: 'Muscat Grand Hotel LLC',
    vat: 'VAT OM1100447102 · 0248:OM1100447102',
  },
  details: {
    issueDate: '30 Jul 2026',
    validUntil: '29 Aug 2026',
    subject: 'Ramadan 2027 coffee supply & barista training',
    branch: 'Al Bahja Coffee (Main)',
  },
  items: ITEMS,
  totals: quoteTotals(ITEMS),
  terms: {
    paymentTerms: 'Net 30 days',
    expectedDelivery: 'Within 14 days of order',
    leadTimePlaceholderKey: 'newQuotation.leadTimePlaceholder',
  },
  notes: {
    customer:
      'Prices held to 29 August 2026 and include delivery to Shatti Al Qurum. Barista training is optional and can be added when you confirm the order.',
    internal:
      'Competing against Nizwa Roasters: 8% volume discount approved by Hafidh. Hold the line on the roasting rate.',
  },
}

/** The trade-chain tracker in the page header: a new quote sits on step 1 as a draft. */
export const NEW_QUOTATION_STEPS = [
  { labelKey: 'quotations.step.quote', state: 'draft' as const },
  { labelKey: 'quotations.step.order', state: 'future' as const },
  { labelKey: 'quotations.step.deliver', state: 'future' as const },
  { labelKey: 'quotations.step.invoice', state: 'future' as const },
]
