import { ApiError } from '../api'
import type { ActivityItemDto } from '../api/compliance/activity'
import type { RefusalCause, RefusalKind } from './activityLedger'

/**
 * The resubmit refusals with a sentence of their own; anything else falls to the shared failure
 * text. TDD_CORRECTION_HELD is a 409, which the shared text reads as "someone changed this,
 * reload", and that is false: the correction was held for an authorised decision and nothing was
 * raised. On backends before #538 the `resubmit` link does not account for a hold, so pressing it
 * again is held again, and the sentence says so. With #538 the link goes once a hold exists, and
 * this still covers the race where a hold appears between reading the row and pressing.
 *
 * The sender-standing codes (backend #640, TddSenderStandingHeldException) are 409s too, with
 * nothing recorded and the obligation still owed. HISTORICAL_ELIGIBLE is held for a Fawtir decision
 * rather than refused (#640 review M1), so it counts with TDD_CORRECTION_HELD as a hold.
 */
const RESUBMIT_REFUSALS: Readonly<Record<string, string>> = {
  TDD_CORRECTION_HELD: 'tddResubmit.refused.held',
  SENDER_NOT_REGISTERED_HISTORICAL_ELIGIBLE: 'tddResubmit.refused.historicalEligible',
  SENDER_PARTICIPANT_NOT_REGISTERED: 'tddResubmit.refused.senderNotRegistered',
  SENDER_PARTICIPANT_CLAIM_CONFLICT: 'tddResubmit.refused.senderClaimConflict',
  SENDER_STANDING_UNKNOWN: 'tddResubmit.refused.senderStandingUnknown',
}

const HOLD_KEYS: ReadonlySet<string> = new Set([
  RESUBMIT_REFUSALS.TDD_CORRECTION_HELD,
  RESUBMIT_REFUSALS.SENDER_NOT_REGISTERED_HISTORICAL_ELIGIBLE,
])

export function tddResubmitRefusalKey(error: unknown): string | null {
  return error instanceof ApiError && error.code ? (RESUBMIT_REFUSALS[error.code] ?? null) : null
}

export type ResubmitSentence = { key: string; values?: Record<string, string> }

/**
 * What a group resubmit says. `refusals` holds the sentence key of each row that was refused, in
 * order; `stopped` is true when a failure that is not a refusal ended the group early, and the
 * caller appends that failure's own sentence after these. Each distinct standing sentence is said
 * once: standing is the tenant's, so it normally refuses every row for the same reason.
 */
export function groupResubmitOutcome(
  sent: number,
  refusals: readonly string[],
  stopped: boolean,
): ResubmitSentence[] {
  const standing = refusals.filter((key) => !HOLD_KEYS.has(key))
  const held = String(refusals.length - standing.length)
  const counts = { sent: String(sent), held }
  if (stopped) {
    if (sent === 0 && refusals.length === 0) return []
    return standing.length === 0
      ? [{ key: 'tddResubmit.refused.partlySent', values: counts }]
      : [...refusedSentences(counts, standing), { key: 'tddResubmit.refused.restNotSent' }]
  }
  if (refusals.length === 0) return []
  if (sent === 0 && refusals.length === 1) return [{ key: refusals[0] }]
  if (standing.length === 0) {
    return sent === 0
      ? [{ key: 'tddResubmit.refused.allHeld', values: { held } }]
      : [{ key: 'tddResubmit.refused.partlyHeld', values: counts }]
  }
  return refusedSentences(counts, standing)
}

function refusedSentences(
  counts: { sent: string; held: string },
  standing: readonly string[],
): ResubmitSentence[] {
  const refused = String(standing.length)
  return [
    // Rows after a standing refusal are still posted: HISTORICAL_ELIGIBLE is decided per correction,
    // so one row's refusal does not say how the next is answered. When none went and none was held,
    // the zero counts are noise.
    counts.sent === '0' && counts.held === '0'
      ? { key: 'tddResubmit.refused.allRefused', values: { refused } }
      : { key: 'tddResubmit.refused.partlyRefused', values: { ...counts, refused } },
    ...[...new Set(standing)].map((key) => ({ key })),
  ]
}

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
  /** A scheme, a colon and the id, in any case; the server and the SMP decide whether it is real. */
  fix: { pattern: /^\d{4}:\S+$/ },
  /**
   * The monthly submission allowance. TODO(backend): ACTIVITY.md 2.18. The design's figures until
   * the tenant's allowance and usage are on the API.
   */
}

/** What this fix uses from the allowance: one report per invoice, or two documents (credit note and new invoice) each reported. */
export function quotaAboutToUse(invoices: number, kind: RefusalKind): number {
  return kind === 'invoice' ? invoices * 2 : invoices
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
