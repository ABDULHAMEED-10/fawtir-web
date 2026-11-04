import { ApiError } from '../api/errors'
import { possibleDuplicates, type PossibleDuplicateDto } from '../api/expenditure/billIntake'
import type { Entitlements } from './identity/entitlements'
import { can } from './session/session'

/** `BillIntakeService.MAX_DUPLICATE_OVERRIDES`: more ids than this are refused, not trimmed. */
export const MAX_DUPLICATE_OVERRIDES = 20
/** `BillIntakeService.MAX_OVERRIDE_REASON`, counted after trimming. */
export const MAX_OVERRIDE_REASON = 280
/** `BillIntakeService.OVERRIDE_PERMISSION`: who may say a possible duplicate is a different bill. */
export const OVERRIDE_PERMISSION = 'invoice.approve'

/**
 * A confirm the server refused as a possible duplicate, and what the person has said about it.
 *
 * `seen` keeps every bill any refusal named since the supplier or number last changed, not only
 * the latest refusal's: the server lists at most five per answer, so the rest arrive on the next
 * one. Only all of them together record the bill.
 */
export type DuplicateReview = {
  seen: PossibleDuplicateDto[]
  /** The latest refusal carried `duplicates`, so the server takes `notDuplicateOfIds`. */
  listed: boolean
  /**
   * The latest refusal's `heldForReviewIfListed` (round 19): the same listing is recorded held for
   * an approver, so a person without invoice.approve may submit it. False on anything else,
   * including after the server refused such a submission.
   */
  heldForReview: boolean
  reason: string
  /** The sentence (i18n key) of what stopped the last "It's a different bill". */
  problem: string | null
}

/**
 * Always the listed ids with a reason, one bill or many (owner approval, batch 43 round 18,
 * "Frontend Option 1"). The single `notDuplicateOf`, which takes no reason, is never sent: it left
 * no reason beside the override in the bill's history.
 */
export type DuplicateOverride = { notDuplicateOfIds: string[]; overrideReason: string }

/**
 * `unsupported` is a server whose refusal names no list (`duplicates`): it cannot take the ids with
 * a reason, and the reasonless single field is no longer sent, so nothing is offered.
 */
export type DuplicateReviewMode = 'single' | 'many' | 'unsupported' | 'tooMany'

/**
 * Whether to offer "It's a different bill". Display only: the server refuses everyone else
 * (`BILL_INTAKE_OVERRIDE_APPROVER_REQUIRED`). A loaded session is a person's: `/me/entitlements`
 * answers only for a signed-in user (`requireUserId`), never for an API key or another machine
 * credential, so holding the permission in it is holding it as a human.
 */
export function mayDeclareDifferent(session: Entitlements | null): boolean {
  return can(session, OVERRIDE_PERMISSION)
}

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
    heldForReview: found.heldForReview,
    reason: sameQuestion ? previous.reason : '',
    problem: null,
  }
}

export function reviewMode(review: DuplicateReview): DuplicateReviewMode {
  if (!review.listed) return 'unsupported'
  if (review.seen.length > MAX_DUPLICATE_OVERRIDES) return 'tooMany'
  return review.seen.length === 1 ? 'single' : 'many'
}

/** The sentence asking for a reason: the one-bill wording, or the one naming the bills listed. */
function reasonRequiredKey(review: DuplicateReview): string {
  return review.seen.length === 1
    ? 'billIntake.duplicate.reasonRequiredSingle'
    : 'billIntake.duplicate.reasonRequired'
}

/** What "It's a different bill" sends, or the sentence that stops it before asking. */
export function overrideOf(review: DuplicateReview): DuplicateOverride | { problem: string } {
  switch (reviewMode(review)) {
    case 'unsupported':
      return { problem: 'billIntake.duplicate.cannotOverrideMany' }
    case 'tooMany':
      return { problem: 'billIntake.duplicate.tooMany' }
    case 'single':
    case 'many': {
      const reason = review.reason.trim()
      if (!reason) return { problem: reasonRequiredKey(review) }
      if (reason.length > MAX_OVERRIDE_REASON) return { problem: 'billIntake.duplicate.reasonTooLong' }
      return { notDuplicateOfIds: review.seen.map((bill) => bill.billId), overrideReason: reason }
    }
  }
}

/** The refusals of the override itself (`BillIntakeService.requireOwnOverrides` and after), by code. */
export const OVERRIDE_REFUSALS: Record<string, string> = {
  BILL_INTAKE_OVERRIDE_REASON_REQUIRED: 'billIntake.duplicate.reasonRequired',
  BILL_INTAKE_OVERRIDE_REASON_TOO_LONG: 'billIntake.duplicate.reasonTooLong',
  BILL_INTAKE_NOT_DUPLICATE_OF_TOO_MANY: 'billIntake.duplicate.tooMany',
  BILL_INTAKE_NOT_DUPLICATE_OF_UNKNOWN: 'billIntake.duplicate.unknown',
  BILL_INTAKE_OVERRIDE_APPROVER_REQUIRED: 'billIntake.duplicate.approverRequired',
}

/**
 * A refusal of the override: the review as it now stands and the sentence, or null for any other
 * failure. An unknown bill (gone since it was named, no longer a possible duplicate, or not this
 * company's) ends the review: the next save is answered with what is on file now, rather than
 * with a list that holds the stale id.
 */
export function overrideRefused(
  review: DuplicateReview | null,
  error: unknown,
): { review: DuplicateReview | null; key: string } | null {
  if (!(error instanceof ApiError) || !error.code || !Object.hasOwn(OVERRIDE_REFUSALS, error.code))
    return null
  const key =
    error.code === 'BILL_INTAKE_OVERRIDE_REASON_REQUIRED' && review
      ? reasonRequiredKey(review)
      : OVERRIDE_REFUSALS[error.code]
  if (error.code === 'BILL_INTAKE_NOT_DUPLICATE_OF_UNKNOWN' || !review) return { review: null, key }
  // The server has just said this listing is not recorded held, so it is never offered again as a
  // submission for review (owner round 19: never present a refusal as a submission).
  const heldForReview =
    error.code === 'BILL_INTAKE_OVERRIDE_APPROVER_REQUIRED' ? false : review.heldForReview
  return { review: { ...review, heldForReview, problem: key }, key }
}

/** The override as `toConfirmation` extras: no override is `notDuplicateOf: null`, as before. */
export function overrideExtras(override: DuplicateOverride | null): {
  notDuplicateOf: null
  notDuplicateOfIds?: string[]
  overrideReason?: string
} {
  if (!override) return { notDuplicateOf: null }
  return {
    notDuplicateOf: null,
    notDuplicateOfIds: override.notDuplicateOfIds,
    overrideReason: override.overrideReason,
  }
}
