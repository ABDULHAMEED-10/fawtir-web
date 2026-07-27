export const CREDIT_NOTE_DETAIL = {
  id: 'CRN-0087',
  title: 'New credit note',
  status: 'draft' as const,
  reversingId: 'INV-2044',
  customer: {
    name: 'Muscat Grand Hotel LLC',
    vat: 'VAT OM1100447102 · 0248:OM1100447102',
  },
  amount: '35.910',
  creditTotal: '35.910',
  applied: '28.590',
  refundDue: '7.320',
  original: {
    id: 'INV-2044',
    total: '58.590',
    issued: '18 Jul 2026',
  },
  fields: {
    number: 'CRN-0087',
    issueDate: '25 Jul 2026',
    currency: 'OMR — Omani Rial',
    concerning: 'INV-2044',
    poReference: 'PO-88213',
    taxCategory: 'Standard rate · 5%',
    reason: 'Returned goods',
    rma: 'RMA-0142',
  },
  items: [
    {
      id: '1',
      description: 'Coffee Beans 1kg - House Blend',
      note: 'Returned · originally line 2 of INV-2044',
      unitPrice: '9.500',
      vat: '5%',
      qty: '4',
      unit: 'KG',
      discount: '10%',
      total: '34.200',
    },
  ],
  totals: {
    net: '34.200',
    vat: '1.710',
    total: '35.910',
  },
  notes: {
    customer:
      '4 kg of H Blend returned on 22 Jul due to a quality issue. Credited in full including VAT.',
    internal:
      'Return inspected by warehouse. Refund of OMR 7.320 to be paid to client bank account on file.',
  },
  activity: [
    {
      id: 'a1',
      title: 'Ready to send',
      detail: 'Awaiting delivery to Muscat Grand Hotel',
      pending: true,
    },
    {
      id: 'a2',
      title: 'Applied to INV-2044 — balance cleared',
      detail: 'OMR 28.590 offset · 25 Jul 2026, 11:03',
      pending: false,
    },
    {
      id: 'a3',
      title: 'Credit note issued',
      detail: 'Hafidh Saif · reason: returned goods · 25 Jul 2026, 11:03',
      pending: false,
    },
  ],
}
