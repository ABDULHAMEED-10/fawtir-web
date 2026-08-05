/**
 * Create quotation (Figma 13:42543).
 *
 * A quotation is not a tax document — nothing is reported to the OTA until it turns
 * into an invoice — so the customer step only needs a name and email, and the VAT /
 * Peppol details stay optional.
 */

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
  items: [
    {
      id: '1',
      description: 'Green beans — Yirgacheffe',
      unitPrice: '10.250',
      vat: '5%',
      qty: '600',
      unit: 'KG',
      discount: '8%',
      total: '5,658.000',
    },
    {
      id: '2',
      description: 'Roasting service — per batch',
      unitPrice: '18.000',
      vat: '5%',
      qty: '24',
      unit: 'EA',
      discount: '0%',
      total: '432.000',
    },
    {
      id: '3',
      description: 'Barista training — 2 day course',
      unitPrice: '345.000',
      vat: '5%',
      qty: '2',
      unit: 'EA',
      discount: '0%',
      total: '690.000',
    },
  ],
  totals: {
    subtotal: '6,780.000',
    discount: '492.000',
    net: '6,288.000',
    vat: '314.400',
    total: '6,602.400',
  },
  terms: {
    paymentTerms: 'Net 30 days',
    expectedDelivery: 'Within 14 days of order',
    leadTimePlaceholder: 'e.g. subject to stock at time of order...',
  },
  notes: {
    customer:
      'Prices held to 29 August 2026 and include delivery to Shatti Al Qurum. Barista training is optional and can be added when you confirm the order.',
    internal:
      'Competing against Nizwa Roasters — 8% volume discount approved by Hafidh. Hold the line on the roasting rate.',
  },
}

/** The trade-chain tracker in the page header — a new quote sits on step 1 as a draft. */
export const NEW_QUOTATION_STEPS = [
  { labelKey: 'quotations.step.quote', state: 'draft' as const },
  { labelKey: 'quotations.step.order', state: 'future' as const },
  { labelKey: 'quotations.step.deliver', state: 'future' as const },
  { labelKey: 'quotations.step.invoice', state: 'future' as const },
]
