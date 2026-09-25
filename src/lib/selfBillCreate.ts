/**
 * New self-billed invoice (Figma 13:40925).
 *
 * The buyer raises the document on the supplier's behalf, so the money flows *out*:
 * it posts to Expenditure as a payable rather than to sales. An "agreed" self-bill
 * needs a signed agreement on file; a "statutory" one (import / reverse charge) does not.
 */

export type SelfBillKind = 'agreed' | 'statutory'

export const SELF_BILL_KINDS: { id: SelfBillKind; titleKey: string; hintKey: string }[] = [
  { id: 'agreed', titleKey: 'newSelfBill.kinds.agreed', hintKey: 'newSelfBill.kinds.agreedHint' },
  {
    id: 'statutory',
    titleKey: 'newSelfBill.kinds.statutory',
    hintKey: 'newSelfBill.kinds.statutoryHint',
  },
]

export const NEW_SELF_BILL = {
  reference: 'SB-0115 · Draft',
  savedNote: 'Saved just now',
  quotaUsed: '342',
  quotaTotal: '/ 1,000 used',
  quotaPercent: 34.2,
  supplier: {
    name: 'Muscat Grand Hotel LLC',
    vat: 'VAT OM1100447102 · 0248:OM1100447102',
  },
  seller: {
    name: 'Muscat Grand Hotel LLC',
    noteKey: 'newSelfBill.parties.sellerNote',
  },
  buyer: {
    name: 'Al Bahja Coffee',
    noteKey: 'newSelfBill.parties.buyerNote',
  },
  agreementRef: 'SBA-2026-004',
  fields: {
    number: 'SB-0115',
    issueDate: '30/07/2026',
    supplyDate: '24/07/2026',
    paymentTerms: 'Net 30 days',
    paymentDue: '29/08/2026',
    receivingBranch: 'Al Bahja Coffee (Main)',
    currency: 'OMR - Omani Rial',
    taxCategory: 'Standard rate - 5%',
    agreement: 'SBA-2026-004',
    subject: 'Green bean supply & roasting: July batch',
    poReference: 'PO-88317',
  },
  // TODO(backend): the self-bill create request, when it exists, carries `lines[].itemType`,
  // `lines[].hsCode` (goods) and `lines[].serviceType` (service) as the invoice draft asks
  // (PINT_OM_LINE_CLASSIFICATION.md §7.3): a self-billed invoice is always business-to-business,
  // so every line is classified on the page.
  items: [
    {
      id: '1',
      description: 'Cappuccino - Large',
      excl: '1.8',
      vat: '5%',
      qty: '12',
      unit: 'EA',
      discount: '0',
      total: '23.400',
    },
    {
      id: '2',
      description: 'Coffee Beans 1kg - H Blend',
      excl: '9.5',
      vat: '5%',
      qty: '4',
      unit: 'KG',
      discount: '10',
      total: '34.200',
    },
  ],
  itemTotals: {
    excluding: '57.800',
    vat: '17.200',
    total: '65.000',
  },
  payment: {
    method: 'Bank transfer',
    reference: 'MGH-2044-07',
    recordNow: false,
    deliverByEmail: false,
  },
  notes: {
    supplier:
      'Raised under our self-billing agreement SBA-2026-004. Please confirm within 14 days or raise a dispute if any line is incorrect.',
    internal:
      'Goods checked against GRN-4471 by Yusuf on 24 Jul. 12 OMR credit applied for two damaged sacks.',
  },
  summary: {
    subtotal: '59.600',
    discount: '3.800',
    net: '55.800',
    vat: '2.790',
    total: '58.590',
  },
}
