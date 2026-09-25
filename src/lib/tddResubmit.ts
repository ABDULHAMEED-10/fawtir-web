/**
 * Fixing a turned-down report — Compliance › Activity › Resubmit (Figma 131:14452).
 *
 * A rejection is rarely about the invoice; it is usually one missing field on a record. The
 * screen therefore fixes the record, shows exactly what will differ in the next report, and is
 * honest that every attempt spends a submission from the monthly allowance.
 *
 * The same missing Peppol ID has failed three invoices this week, so the fix is offered for all
 * three at once rather than one at a time.
 */

/** One row of the before/after comparison. */
export type ChangeRow = {
  id: string
  fieldKey: string
  /** What the turned-down report carried. Empty when that was the problem. */
  before?: string
  beforeEmpty?: boolean
  /** Only the field being corrected differs; the rest are carried over. */
  after?: string
  mono?: boolean
  /** A rial figure: drawn with the sign. */
  money?: boolean
}

export const TDD_RESUBMIT = {
  invoice: 'INV-2041',
  customer: 'Barka Beach Resort',
  customerLegal: 'Barka Beach Resort LLC',
  customerInitials: 'BB',
  customerNoteKey: 'tddResubmit.customerNote',
  vat: 'OM1100558840',

  /** What the Authority said, and how much it is costing. */
  rejection: {
    code: 'OTA-E-2041',
    headlineKey: 'tddResubmit.rejection.headline',
    bodyKey: 'tddResubmit.rejection.body',
    raw: 'MISSING_BUYER_ENDPOINT_ID: cac:AccountingCustomerParty/cbc:EndpointID is absent or empty',
    turnedDownAt: '30 Jul, 09:41',
    attemptsSoFar: 1,
    undeclaredForKey: 'tddResubmit.rejection.sevenHours',
    sameCauseCount: 3,
  },

  /** The field that has to be filled in, and what a good value looks like. */
  fix: {
    labelKey: 'tddResubmit.peppolIdLabel',
    /** Oman's Peppol scheme is 0248, followed by the VAT number. */
    suggested: '0248:OM1100558840',
    pattern: /^0248:OM\d{10}$/,
  },

  changes: [
    {
      id: 'endpoint',
      fieldKey: 'tddResubmit.field.buyerParticipantId',
      beforeEmpty: true,
      after: '0248:OM1100558840',
      mono: true,
    },
    { id: 'number', fieldKey: 'tddResubmit.field.invoiceNumber', before: 'INV-2041' },
    {
      id: 'vat',
      fieldKey: 'tddResubmit.field.buyerVat',
      before: 'OM1100558840',
      mono: true,
    },
    { id: 'lines', fieldKey: 'tddResubmit.field.linesAndQuantities', before: '4 lines' },
    {
      id: 'total',
      fieldKey: 'tddResubmit.field.totalIncludingVat',
      before: '1,842.000',
      money: true,
    },
    { id: 'tax', fieldKey: 'tddResubmit.field.vat', before: '87.714', money: true },
  ] satisfies ChangeRow[],

  /** The monthly submission allowance this attempt comes out of. */
  quota: { used: 412, aboutToUse: 3, allowance: 500 },

  /**
   * What not fixing it costs.
   *
   * The sales figure is VAT-inclusive, so the VAT that would go unreported is derived from it
   * rather than stated separately.
   */
  ifYouLeaveIt: {
    undeclaredInclusive: 3035,
    vatRate: 0.05,
    invoices: 3,
  },
}

const round3 = (value: number) => Math.round(value * 1000) / 1000

/** VAT hidden inside the inclusive figure — what would be missing from the return. */
export const UNDECLARED_VAT = round3(
  TDD_RESUBMIT.ifYouLeaveIt.undeclaredInclusive -
    TDD_RESUBMIT.ifYouLeaveIt.undeclaredInclusive / (1 + TDD_RESUBMIT.ifYouLeaveIt.vatRate),
)

export const QUOTA_LEFT =
  TDD_RESUBMIT.quota.allowance - TDD_RESUBMIT.quota.used - TDD_RESUBMIT.quota.aboutToUse

export const formatOmr = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
