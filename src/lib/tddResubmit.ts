import type { ActivityItemDto } from '../api/compliance/activity'
import type { RefusalCause, RefusalKind } from './activityLedger'

/**
 * Putting a turned-down report right: Compliance › Activity › Resubmit (Figma 154:108616).
 *
 * What the page offers follows from what was refused (see `refusalCauseOf` in activityLedger.ts).
 * The TDD carries a full copy of the invoice (TDT-012, IBR-TDD-57), so:
 *
 * - an error in the **invoice itself** (its totals, a tax category, the buyer's Peppol ID) is put
 *   right with a credit note and a new invoice; a changed report would no longer match the invoice
 *   the buyer holds, so nothing is resent;
 * - an error in the **report alone** is put right by sending the report again, and nothing goes to
 *   the customer.
 *
 * Only the fix for the actual cause is drawn. The Peppol ID the design draws is the fix for a
 * missing buyer participant ID and appears only for that cause.
 */

/** One cell of the before/after comparison: a value, a translation key, or "empty". */
export type ChangeCell = {
  text?: string
  key?: string
  /** The refused report carried nothing here: that was the problem. */
  empty?: boolean
  mono?: boolean
  /** A rial figure: drawn with the sign. */
  money?: boolean
}

/** One row of the before/after comparison. `after` null reads "Unchanged". */
export type ChangeRow = {
  id: string
  fieldKey: string
  before: ChangeCell
  after: ChangeCell | null
}

export const TDD_RESUBMIT = {
  /** Oman's Peppol scheme is 0248, followed by the VAT number (OM and ten digits). */
  fix: { pattern: /^0248:OM\d{10}$/ },
  /**
   * The monthly submission allowance. TODO(backend): ACTIVITY.md 2.18. The design's figures until
   * the tenant's allowance and usage are on the API.
   */
  quota: { used: 412, allowance: 500 },
}

/** What this fix uses from the allowance: one report per invoice, or two documents (credit note and new invoice) each reported. */
export function quotaAboutToUse(invoices: number, kind: RefusalKind): number {
  return kind === 'invoice' ? invoices * 2 : invoices
}

export function quotaLeft(aboutToUse: number): number {
  return Math.max(0, TDD_RESUBMIT.quota.allowance - TDD_RESUBMIT.quota.used - aboutToUse)
}

const round3 = (value: number) => Math.round(value * 1000) / 1000

/**
 * The VAT on a row: the invoice total VAT (IBT-110) when the item carries it, otherwise worked out
 * from the VAT-inclusive total at the standard 5%. TODO(backend): ACTIVITY.md 2.34.
 */
export function vatOf(item: ActivityItemDto): number {
  if (item.tax_amount != null) return item.tax_amount
  const amount = item.amount ?? 0
  return round3(amount - amount / 1.05)
}

const NOT_ON_RECORD: ChangeCell = { key: 'activityDetail.route.notOnRecord' }
const CORRECTED_ON_NEW: ChangeCell = { key: 'tddResubmit.correctedOnNew' }

/**
 * The before-and-after table for this cause. What the ledger item carries is shown; the rest reads
 * "Not on the record yet". TODO(backend): ACTIVITY.md 2.17, the report's own fields.
 */
export function changeRows(
  item: ActivityItemDto,
  cause: RefusalCause,
  kind: RefusalKind,
  peppolId: string,
): ChangeRow[] {
  const typed = peppolId.trim()
  return [
    {
      id: 'endpoint',
      fieldKey: 'tddResubmit.field.buyerParticipantId',
      before: item.counterparty_participant_id
        ? { text: item.counterparty_participant_id, mono: true }
        : cause === 'buyerPeppolId'
          ? { empty: true }
          : NOT_ON_RECORD,
      after:
        cause === 'buyerPeppolId'
          ? typed
            ? { text: typed, mono: true }
            : { key: 'tddResubmit.typedAbove' }
          : null,
    },
    {
      id: 'number',
      fieldKey: 'tddResubmit.field.invoiceNumber',
      before: item.invoice_number ? { text: item.invoice_number } : NOT_ON_RECORD,
      // A new invoice takes a new number; a resent report keeps the invoice's.
      after: kind === 'invoice' ? { key: 'tddResubmit.newInvoiceNumber' } : null,
    },
    { id: 'vat', fieldKey: 'tddResubmit.field.buyerVat', before: NOT_ON_RECORD, after: null },
    {
      id: 'lines',
      fieldKey: 'tddResubmit.field.linesAndQuantities',
      before: NOT_ON_RECORD,
      after: cause === 'totals' || cause === 'taxCategory' ? CORRECTED_ON_NEW : null,
    },
    {
      id: 'total',
      fieldKey: 'tddResubmit.field.totalIncludingVat',
      before: item.amount != null ? { text: formatOmr(item.amount), money: true } : NOT_ON_RECORD,
      after: cause === 'totals' ? CORRECTED_ON_NEW : null,
    },
    {
      id: 'tax',
      fieldKey: 'tddResubmit.field.vat',
      before:
        item.tax_amount != null ? { text: formatOmr(item.tax_amount), money: true } : NOT_ON_RECORD,
      after: cause === 'totals' || cause === 'taxCategory' ? CORRECTED_ON_NEW : null,
    },
  ]
}

export const formatOmr = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
