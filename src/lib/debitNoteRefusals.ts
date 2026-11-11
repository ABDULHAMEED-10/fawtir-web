import { ApiError } from '../api'

/**
 * D-26 (owner, 6 Nov 2026), as the server enforces it from 0c2d034d4. An issued debit note is
 * final: no route cancels, amends or credits it, and a legally valid correction workflow is an
 * open PINT-OM/OTA requirement, so none is offered. Both refusals answer 409 resource-conflict,
 * which would otherwise read "reload and try again" or print the bare code in the issue dialog.
 *
 * Keyed on the problem's `code`, never on its English `detail`. Every screen reaches these through
 * `describeApiFailure`, the issue dialog's map, the note composer's map and the cancel map.
 */
export const DEBIT_NOTE_REFUSALS: Record<string, string> = {
  // Any route that reaches an issued debit note: cancel, the HS-code amend, and any added later.
  ISSUED_DEBIT_NOTE_IMMUTABLE: 'salesNote.detail.debitLocked',
  // A credit note that names a debit note as the document it corrects.
  CREDIT_NOTE_ON_DEBIT_NOTE_NOT_ALLOWED: 'salesNote.detail.creditOnDebitRefused',
}

/** The sentence's key for a D-26 refusal, or null for any other failure. */
export function debitNoteRefusalKey(error: unknown): string | null {
  if (!(error instanceof ApiError) || !error.code) return null
  return Object.hasOwn(DEBIT_NOTE_REFUSALS, error.code) ? DEBIT_NOTE_REFUSALS[error.code] : null
}
