import { ApiError } from '../api/errors'
import { possibleDuplicates, type PossibleDuplicateDto } from '../api/expenditure/billIntake'

/** `BillIntakeService.MAX_DUPLICATE_OVERRIDES`: more ids than this are refused, not trimmed. */
export const MAX_DUPLICATE_OVERRIDES = 20
/** `BillIntakeService.MAX_OVERRIDE_REASON`, counted after trimming. */
export const MAX_OVERRIDE_REASON = 280

/**
 * A confirm the server refused as a possible duplicate, and what the person has said about it.
 *
 * `seen` keeps every bill any refusal named since the supplier or number last changed, not only
 * the latest refusal's. The single `notDuplicateOf` covers one bill, so with two on file the server
 * named the other one each time and the screens swapped between them for ever; the server lists at
 * most five per answer, so the rest arrive on the next one. Only all of them together record the bill.
 */
export type DuplicateReview = {
  seen: PossibleDuplicateDto[]
  /** The latest refusal carried `duplicates`, so the server takes `notDuplicateOfIds`. */
  listed: boolean
  reason: string
  /** The sentence (i18n key) of what stopped the last "It's a different bill". */
  problem: string | null
}

export type DuplicateOverride =
  | { notDuplicateOf: string }
  | { notDuplicateOfIds: string[]; overrideReason: string }

/**
 * `single` keeps the older contract exactly: the one bill as `notDuplicateOf`, with no reason.
 * `unsupported` is two or more bills from a server that cannot take a list: nothing can be sent
 * that would record the bill, so nothing is offered.
 */
export type DuplicateReviewMode = 'single' | 'many' | 'unsupported' | 'tooMany'

/** The review after a refusal, or null when the refusal is not a possible duplicate. */
export function reviewAfterRefusal(
  previous: DuplicateReview | null,
  error: unknown,
): DuplicateReview | null {
  const found = possibleDuplicates(error)
  if (!found) return null
  // Another number is another question; Record a bill keeps the warning while the number is typed
  // over. The server compares numbers without case or surrounding spaces, so this does too.
  const number = (bill: PossibleDuplicateDto) => bill.supplierBillNumber.trim().toLowerCase()
  const sameQuestion =
    previous !== null && previous.seen.every((bill) => number(bill) === number(found.matches[0]))
  const seen = sameQuestion ? [...previous.seen] : []
  for (const match of found.matches)
    if (!seen.some((bill) => bill.billId === match.billId)) seen.push(match)
  return {
    seen,
    listed: found.listed,
    reason: sameQuestion ? previous.reason : '',
    problem: null,
  }
}

export function reviewMode(review: DuplicateReview): DuplicateReviewMode {
  if (review.seen.length === 1) return 'single'
  if (!review.listed) return 'unsupported'
  return review.seen.length > MAX_DUPLICATE_OVERRIDES ? 'tooMany' : 'many'
}

/** What "It's a different bill" sends, or the sentence that stops it before asking. */
export function overrideOf(review: DuplicateReview): DuplicateOverride | { problem: string } {
  switch (reviewMode(review)) {
    case 'single':
      return { notDuplicateOf: review.seen[0].billId }
    case 'unsupported':
      return { problem: 'billIntake.duplicate.cannotOverrideMany' }
    case 'tooMany':
      return { problem: 'billIntake.duplicate.tooMany' }
    case 'many': {
      const reason = review.reason.trim()
      if (!reason) return { problem: 'billIntake.duplicate.reasonRequired' }
      if (reason.length > MAX_OVERRIDE_REASON) return { problem: 'billIntake.duplicate.reasonTooLong' }
      return { notDuplicateOfIds: review.seen.map((bill) => bill.billId), overrideReason: reason }
    }
  }
}

/** The refusals of the override itself (`BillIntakeService.requireOwnOverrides`), by code. */
export const OVERRIDE_REFUSALS: Record<string, string> = {
  BILL_INTAKE_OVERRIDE_REASON_REQUIRED: 'billIntake.duplicate.reasonRequired',
  BILL_INTAKE_OVERRIDE_REASON_TOO_LONG: 'billIntake.duplicate.reasonTooLong',
  BILL_INTAKE_NOT_DUPLICATE_OF_TOO_MANY: 'billIntake.duplicate.tooMany',
  BILL_INTAKE_NOT_DUPLICATE_OF_UNKNOWN: 'billIntake.duplicate.unknown',
}

/**
 * A refusal of the override: the review as it now stands and the sentence, or null for any other
 * failure. An unknown bill (gone since it was named, or not this company's) ends the review: the
 * next save is answered with what is on file now, rather than with a list that holds the stale id.
 */
export function overrideRefused(
  review: DuplicateReview | null,
  error: unknown,
): { review: DuplicateReview | null; key: string } | null {
  if (!(error instanceof ApiError) || !error.code || !Object.hasOwn(OVERRIDE_REFUSALS, error.code))
    return null
  const key = OVERRIDE_REFUSALS[error.code]
  if (error.code === 'BILL_INTAKE_NOT_DUPLICATE_OF_UNKNOWN' || !review) return { review: null, key }
  return { review: { ...review, problem: key }, key }
}

/** The override as `toConfirmation` extras: no override is `notDuplicateOf: null`, as before. */
export function overrideExtras(override: DuplicateOverride | null): {
  notDuplicateOf: string | null
  notDuplicateOfIds?: string[]
  overrideReason?: string
} {
  if (!override) return { notDuplicateOf: null }
  if ('notDuplicateOf' in override) return { notDuplicateOf: override.notDuplicateOf }
  return {
    notDuplicateOf: null,
    notDuplicateOfIds: override.notDuplicateOfIds,
    overrideReason: override.overrideReason,
  }
}
