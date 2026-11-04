import { ApiError } from '../api/errors'
import { possibleDuplicates, type PossibleDuplicateDto } from '../api/expenditure/billIntake'
import type { Entitlements } from './identity/entitlements'
import { mayRequest, REQUIRE_SESSION } from './session/session'

/** `BillIntakeService.MAX_DUPLICATE_OVERRIDES`: more ids than this are refused, not trimmed. */
export const MAX_DUPLICATE_OVERRIDES = 20
/** `BillIntakeService.MAX_OVERRIDE_REASON`, counted after trimming. */
export const MAX_OVERRIDE_REASON = 280
/** `BillIntakeService.OVERRIDE_PERMISSION`: who may say a possible duplicate is a different bill. */
export const OVERRIDE_PERMISSION = 'invoice.approve'

/**
 * A bill a refusal named, with that refusal's `figuresOnly` (round 25, residual (1)). Each
 * refusal is homogeneous, but a review gathers several: a same-record copy named first and a
 * figures-only coincidence named next are different evidence, so the flag travels with the bill
 * and not with the review (PRV43-EXP5 M-1). Absent is false, as on an older server.
 */
export type ReviewedDuplicate = PossibleDuplicateDto & { figuresOnly?: boolean }

/**
 * A confirm the server refused as a possible duplicate, and what the person has said about it.
 *
 * `seen` keeps every bill any refusal named since the supplier or number last changed, not only
 * the latest refusal's: the server lists at most five per answer, so the rest arrive on the next
 * one. Only all of them together record the bill.
 */
export type DuplicateReview = {
  seen: ReviewedDuplicate[]
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
 *
 * False while a required session is still loading (owner approval, batch 43 round 20, panel item
 * 6; PRV43-WEBEXP L-4): `can` offers everything to a null session, which showed the override to
 * whoever was there before their permissions arrived. Whether this person recorded one of the
 * bills cannot be known here without a new API field, which round 20 does not add, so maker-checker
 * stays the server's: the decision is refused `BILL_DUPLICATE_DECIDER_IS_RECORDER`.
 */
export function mayDeclareDifferent(session: Entitlements | null): boolean {
  return mayRequest(session, OVERRIDE_PERMISSION)
}

/** Whether the panel knows who is there: a session has loaded, or none is required (dev only). */
export function sessionKnown(session: Entitlements | null): boolean {
  return session !== null || !REQUIRE_SESSION
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
  // A bill keeps the flag of the refusal that first named it: a later refusal is about the bills
  // it adds, and re-reading an earlier one under it would reword evidence already shown.
  for (const match of found.matches)
    if (!seen.some((bill) => bill.billId === match.billId))
      seen.push({ ...match, figuresOnly: found.figuresOnly })
  return {
    seen,
    listed: found.listed,
    // Owner approval, batch 43 round 21, F-2: listing anything beyond the held-against copy needs
    // an approver, so a review that has gathered more than one bill is never a submission, even
    // when an earlier answer named only the copy.
    heldForReview: found.heldForReview && seen.length === 1,
    reason: sameQuestion ? previous.reason : '',
    problem: null,
  }
}

/**
 * The sentence a match is named in. "From this supplier" would answer the very question a
 * figures-only coincidence leaves open, so such a match says it may be a coincidence instead.
 */
export function duplicateBodyKey(bill: ReviewedDuplicate): string {
  return bill.figuresOnly === true
    ? 'billIntake.duplicate.bodyFiguresOnly'
    : 'billIntake.duplicate.body'
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
 * Owner round 23 (L-3 split): the server adds `reason` to an unknown-bill refusal. Only these two
 * exact values pick their own sentence; anything else, including an older server that sends none,
 * keeps the approved combined sentence, which is true of both.
 */
export type DuplicateReferenceReason = 'REFERENCE_NOT_FOUND' | 'REFERENCE_NO_LONGER_MATCHES'

const UNKNOWN_REFERENCE_KEYS: Record<DuplicateReferenceReason, string> = {
  REFERENCE_NOT_FOUND: 'billIntake.duplicate.unknownNotFound',
  REFERENCE_NO_LONGER_MATCHES: 'billIntake.duplicate.unknownNoLongerMatches',
}

function unknownReferenceKey(error: ApiError): string {
  const reason = error.problem.reason
  return typeof reason === 'string' && Object.hasOwn(UNKNOWN_REFERENCE_KEYS, reason)
    ? UNKNOWN_REFERENCE_KEYS[reason as DuplicateReferenceReason]
    : OVERRIDE_REFUSALS.BILL_INTAKE_NOT_DUPLICATE_OF_UNKNOWN
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
      : error.code === 'BILL_INTAKE_NOT_DUPLICATE_OF_UNKNOWN'
        ? unknownReferenceKey(error)
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
