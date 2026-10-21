import { ApiError } from '../api'

/**
 * The server's refusals of a line's no-VAT reason (IBT-120 / IBT-121), as sentences a person can
 * act on. A zero-rated line (Z) needs a `VATZR-OM` code and an exempt line (E) a `VATEX-OM` code
 * (IBR-069-OM, CL-10-OM / CL-05-OM); the server now refuses a line without one when the draft is
 * saved or issued and in the older bulk rows, instead of only when the invoice is sent.
 *
 * Keyed on the problem's `code`, never on its English `detail`. Every screen that saves, issues or
 * uploads invoice lines reaches these through `describeApiFailure` and the issue dialog's map.
 */
export const TAX_REASON_REFUSALS: Record<string, string> = {
  // Saving or issuing a draft: a Z or E line with no reason code (IBR-069-OM), or a code that is
  // not on its category's list.
  EXEMPTION_REASON_CODE_REQUIRED: 'taxReasonRefusal.reasonRequired',
  EXEMPTION_REASON_REQUIRED: 'taxReasonRefusal.reasonRequired',
  EXEMPTION_REASON_CODE_INVALID: 'taxReasonRefusal.reasonInvalid',
  EXEMPTION_REASON_CODE_NOT_APPLICABLE: 'taxReasonRefusal.reasonNotApplicable',
  // The compliance gate's name for the same gap, met by a draft saved before the save-time check.
  LINE_TAX_REASON_CODE_MISSING: 'taxReasonRefusal.reasonRequired',
  // The older bulk rows: a zero-rated or exempt line with no reason code in the row.
  BULK_EXEMPTION_REASON_CODE_REQUIRED: 'taxReasonRefusal.bulkReasonRequired',
  BULK_EXEMPTION_REASON_REQUIRED: 'taxReasonRefusal.bulkReasonRequired',
}

/** The sentence's key for a no-VAT reason refusal, or null for any other failure. */
export function taxReasonRefusalKey(error: unknown): string | null {
  if (!(error instanceof ApiError) || !error.code) return null
  return TAX_REASON_REFUSALS[error.code] ?? null
}
