export type CreditMode = 'full' | 'lines' | 'custom'

/**
 * Credit note against an issued invoice — Income › Credit notes › New.
 *
 * Unlike the invoice, self-bill and debit note, this screen does not price anything: the amounts
 * are the original invoice's own lines, VAT-inclusive, and the job is choosing how much of them
 * to give back. That is also why there is no discount column here — a discount is already baked
 * into the line being credited, and discounting a credit would change what the customer was
 * actually charged.
 */

/** What is still unpaid on the original invoice, which decides refund against write-off. */
const OUTSTANDING = 28.59

export const CREDIT_NOTE = {
  reversingId: 'INV-2044',
  customer: 'Muscat Grand Hotel LLC',
  original: {
    id: 'INV-2044',
    issued: 'Issued 18 Jul 2026 · sent via Peppol',
    alreadyCredited: 0,
    outstanding: OUTSTANDING,
  },
  /** Inclusive of VAT, as the original invoice printed them. */
  lines: [
    { id: '1', description: 'Cappuccino — Large', amount: 22.68 },
    { id: '2', description: 'Coffee Beans 1kg — H Blend', amount: 35.91 },
  ],
  reason: 'Returned goods',
  reference: 'RMA-4412',
  note: 'Coffee beans batch BN-002 returned due to quality issue reported on delivery. Full invoice cancelled and re-issued if required.',
  details: {
    number: 'CRN-0087',
    issueDate: '25 Jul 2026',
    concerning: 'INV-2044',
    currency: 'OMR - Omani Rial',
  },
  /** Every line at 5%; a mixed-rate invoice would carry the rate per line. */
  vatRate: 0.05,
}

const round3 = (value: number) => Math.round(value * 1000) / 1000

export const formatCredit = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

/** The whole of the original invoice, before anything is credited. */
export const CREDITABLE = round3(
  CREDIT_NOTE.lines.reduce((sum, line) => sum + line.amount, 0) -
    CREDIT_NOTE.original.alreadyCredited,
)

/**
 * Works the credit out from what has been chosen.
 *
 * A credit first clears whatever is still unpaid; only what is left over is money that has to go
 * back to the customer, which is the distinction the summary panel is making.
 */
export function deriveCredit(gross: number) {
  const total = round3(Math.min(Math.max(gross, 0), CREDITABLE))
  const net = round3(total / (1 + CREDIT_NOTE.vatRate))
  const applied = round3(Math.min(total, CREDIT_NOTE.original.outstanding))
  return {
    total,
    net,
    vat: round3(total - net),
    outstanding: CREDIT_NOTE.original.outstanding,
    applied,
    newBalance: round3(CREDIT_NOTE.original.outstanding - applied),
    refund: round3(total - applied),
  }
}
