export type CreditMode = 'full' | 'lines' | 'custom'

export const CREDIT_NOTE = {
  reversingId: 'INV-2044',
  customer: 'Muscat Grand Hotel LLC',
  original: {
    id: 'INV-2044',
    issued: 'Issued 18 Jul 2026 · sent via Peppol',
    total: '58.590',
    alreadyCredited: '0.000',
    creditable: '58.590',
  },
  lines: [
    { id: '1', description: 'Cappuccino — Large', amount: '22.680' },
    { id: '2', description: 'Coffee Beans 1kg — H Blend', amount: '35.910' },
  ],
  reason: 'Returned goods',
  reference: 'RMA-4412',
  note:
    'Coffee beans batch BN-002 returned due to quality issue reported on delivery. Full invoice cancelled and re-issued if required.',
  details: {
    number: 'CRN-0087',
    issueDate: '25 Jul 2026',
    concerning: 'INV-2044',
    currency: 'OMR - Omani Rial',
  },
  summary: {
    total: '58.590',
    net: '55.800',
    vat: '2.790',
    outstanding: '28.590',
    applied: '28.590',
    newBalance: '0.000',
    refund: '30.000',
  },
}
