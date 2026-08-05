/**
 * New debit note (Figma 13:44385).
 *
 * A debit note bills a shortfall on an invoice that was already issued — it *adds* to
 * what the customer owes, so every figure carries a green "+" and the summary shows the
 * new invoice balance rather than a refund.
 */

export type DebitBasis = 'correctLines' | 'additionalItems' | 'flatCharge'

export const DEBIT_BASES: { id: DebitBasis; titleKey: string; hintKey: string }[] = [
  {
    id: 'correctLines',
    titleKey: 'newDebitNote.basis.correctLines',
    hintKey: 'newDebitNote.basis.correctLinesHint',
  },
  {
    id: 'additionalItems',
    titleKey: 'newDebitNote.basis.additionalItems',
    hintKey: 'newDebitNote.basis.additionalItemsHint',
  },
  {
    id: 'flatCharge',
    titleKey: 'newDebitNote.basis.flatCharge',
    hintKey: 'newDebitNote.basis.flatChargeHint',
  },
]

export const NEW_DEBIT_NOTE = {
  adjustsInvoice: 'INV-2044',
  customer: 'Muscat Grand Hotel LLC',
  customerShort: 'Muscat Grand Hotel',
  original: {
    id: 'INV-2044',
    statusKey: 'newDebitNote.original.partiallyPaid',
    meta: 'Issued 18 Jul 2026 · sent via Peppol',
    invoiceTotal: 'OMR 58.590',
    alreadyCredited: 'OMR 0.000',
    creditable: 'OMR 58.590',
  },
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
  itemTotals: { net: '3.150', vat: '0.150', total: '3.150' },
  amount: {
    total: '3.150',
    net: '3.000',
    vat: '0.150',
    outstanding: '28.590',
    added: '3.150',
    newBalance: '31.740',
  },
  reason: {
    value: 'Undercharged',
    referencePlaceholder: 'e.g. RMA-0142',
    note: 'House Blend was invoiced at the old contract rate of 9.500/kg. The rate agreed from 1 July is 10.250/kg, so this note charges the 0.750/kg difference on 4 kg.',
  },
  details: {
    number: 'DBN-0043',
    issueDate: '30 Jul 2026',
    paymentDue: '29 Aug 2026',
    concerningInvoice: 'INV-2044',
    currency: 'OMR — Omani Rial',
    taxCategory: 'Standard rate - 5%',
    sendOverPeppol: true,
  },
}
