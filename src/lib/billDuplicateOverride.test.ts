import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/errors'
import type { Entitlements } from './identity/entitlements'
import {
  mayDeclareDifferent,
  overrideExtras,
  sessionKnown,
  overrideOf,
  overrideRefused,
  reviewAfterRefusal,
  type DuplicateOverride,
  type DuplicateReview,
} from './billDuplicateOverride'

const MANAGER = {
  userId: 'u-1',
  username: 'manager',
  tenantId: 't-1',
  roles: [],
  permissions: [],
  scopes: [],
  featureFlags: {},
}

const bill = (id: string, number = 'INV-1') => ({
  billId: id,
  supplierBillNumber: number,
  issueDate: null,
  total: null,
  currencyCode: null,
  source: 'UPLOADED' as const,
})
const review = (count: number, reason = 'Reissued'): DuplicateReview => ({
  seen: Array.from({ length: count }, (_, index) => bill(`b-${index}`)),
  listed: true,
  heldForReview: false,
  reason,
  problem: null,
})
const possible = (ids: string[], number = 'INV-1', listed = true, heldForReviewIfListed?: unknown) =>
  new ApiError({
    status: 409,
    problemType: 'resource-conflict',
    code: 'BILL_INTAKE_POSSIBLE_DUPLICATE',
    problem: {
      duplicateOf: bill(ids[0], number),
      ...(listed ? { duplicates: ids.map((id) => bill(id, number)) } : {}),
      ...(heldForReviewIfListed === undefined ? {} : { heldForReviewIfListed }),
    },
  })

describe('the duplicate override', () => {
  it('sends 20 bills and refuses the 21st before asking (MAX_DUPLICATE_OVERRIDES)', () => {
    expect(overrideOf(review(20))).toMatchObject({ notDuplicateOfIds: expect.any(Array) })
    expect((overrideOf(review(20)) as { notDuplicateOfIds: string[] }).notDuplicateOfIds).toHaveLength(20)
    expect(overrideOf(review(21))).toEqual({ problem: 'billIntake.duplicate.tooMany' })
  })

  it('measures the reason after trimming, as the server does (MAX_OVERRIDE_REASON)', () => {
    expect(overrideOf(review(2, `  ${'a'.repeat(280)}  `))).toMatchObject({
      overrideReason: 'a'.repeat(280),
    })
    expect(overrideOf(review(2, 'a'.repeat(281)))).toEqual({
      problem: 'billIntake.duplicate.reasonTooLong',
    })
    expect(overrideOf(review(2, '   '))).toEqual({ problem: 'billIntake.duplicate.reasonRequired' })
  })

  it('round 18: sends one bill as the listed id with its reason, never the reasonless single field', () => {
    expect(overrideOf(review(1, ' Second delivery '))).toEqual({
      notDuplicateOfIds: ['b-0'],
      overrideReason: 'Second delivery',
    })
    expect(overrideOf(review(1, '  '))).toEqual({ problem: 'billIntake.duplicate.reasonRequiredSingle' })
    expect(overrideExtras(overrideOf(review(1)) as DuplicateOverride)).toEqual({
      notDuplicateOf: null,
      notDuplicateOfIds: ['b-0'],
      overrideReason: 'Reissued',
    })
  })

  it('round 18: offers nothing for one bill from a server that cannot take a list', () => {
    const only = reviewAfterRefusal(null, possible(['x'], 'INV-1', false))
    expect(overrideOf(only!)).toEqual({ problem: 'billIntake.duplicate.cannotOverrideMany' })
  })

  it('offers nothing for two bills from a server that cannot take a list', () => {
    const first = reviewAfterRefusal(null, possible(['x'], 'INV-1', false))
    const second = reviewAfterRefusal(first, possible(['y'], 'INV-1', false))
    expect(second?.seen.map((seen) => seen.billId)).toEqual(['x', 'y'])
    expect(overrideOf(second!)).toEqual({ problem: 'billIntake.duplicate.cannotOverrideMany' })
  })

  it('starts again for another number, compared without case or spaces', () => {
    const first = reviewAfterRefusal(null, possible(['x'], 'INV-1'))
    expect(reviewAfterRefusal(first, possible(['y'], ' inv-1 '))?.seen).toHaveLength(2)
    expect(reviewAfterRefusal(first, possible(['y'], 'INV-2'))?.seen.map((s) => s.billId)).toEqual([
      'y',
    ])
  })

  it('ends the review on an unknown bill and keeps it on the other override refusals', () => {
    const refused = (code: string) =>
      new ApiError({ status: 400, problemType: 'expenditure-refused', code })
    expect(overrideRefused(review(2), refused('BILL_INTAKE_NOT_DUPLICATE_OF_UNKNOWN'))).toEqual({
      review: null,
      key: 'billIntake.duplicate.unknown',
    })
    expect(
      overrideRefused(review(2), refused('BILL_INTAKE_OVERRIDE_REASON_REQUIRED'))?.review?.problem,
    ).toBe('billIntake.duplicate.reasonRequired')
    expect(overrideRefused(review(2), refused('BILL_INTAKE_TOTAL_INVALID'))).toBeNull()
  })

  it('round 23 L-3: words an unknown bill by the reason the server gives, and falls back without one', () => {
    const unknown = (problem: Record<string, unknown>) =>
      new ApiError({
        status: 400,
        problemType: 'expenditure-refused',
        code: 'BILL_INTAKE_NOT_DUPLICATE_OF_UNKNOWN',
        problem: { error: 'BILL_INTAKE_NOT_DUPLICATE_OF_UNKNOWN', ...problem },
      })
    expect(overrideRefused(review(2), unknown({ reason: 'REFERENCE_NOT_FOUND' }))).toEqual({
      review: null,
      key: 'billIntake.duplicate.unknownNotFound',
    })
    expect(overrideRefused(review(2), unknown({ reason: 'REFERENCE_NO_LONGER_MATCHES' }))).toEqual({
      review: null,
      key: 'billIntake.duplicate.unknownNoLongerMatches',
    })
    for (const older of [{}, { reason: null }, { reason: 'SOMETHING_NEW' }, { reason: 1 }, { reason: 'reference_not_found' }]) {
      expect(overrideRefused(review(2), unknown(older))).toEqual({
        review: null,
        key: 'billIntake.duplicate.unknown',
      })
    }
  })

  it('round 18: names the approver refusal and the one-bill reason refusal', () => {
    const refused = (code: string) =>
      new ApiError({ status: 400, problemType: 'expenditure-refused', code })
    expect(
      overrideRefused(review(1), refused('BILL_INTAKE_OVERRIDE_APPROVER_REQUIRED')),
    ).toEqual({
      review: { ...review(1), problem: 'billIntake.duplicate.approverRequired' },
      key: 'billIntake.duplicate.approverRequired',
    })
    expect(
      overrideRefused(review(1), refused('BILL_INTAKE_OVERRIDE_REASON_REQUIRED'))?.key,
    ).toBe('billIntake.duplicate.reasonRequiredSingle')
  })

  it('round 19: takes held-for-review from the server, and only a literal true', () => {
    expect(reviewAfterRefusal(null, possible(['b-0'], 'INV-1', true, true))?.heldForReview).toBe(true)
    expect(reviewAfterRefusal(null, possible(['b-0'], 'INV-1', true, false))?.heldForReview).toBe(false)
    expect(reviewAfterRefusal(null, possible(['b-0'], 'INV-1', true, 'true'))?.heldForReview).toBe(false)
    // A server from before round 19 sends no flag: never presented as a submission.
    expect(reviewAfterRefusal(null, possible(['b-0']))?.heldForReview).toBe(false)
  })

  it('round 19: the latest refusal decides held-for-review', () => {
    const held = reviewAfterRefusal(null, possible(['b-0'], 'INV-1', true, true))
    expect(reviewAfterRefusal(held, possible(['b-0', 'b-1'], 'INV-1', true, false))?.heldForReview).toBe(false)
  })

  it('round 19: after the approver refusal the listing is no longer offered as a submission', () => {
    const refused = new ApiError({
      status: 400,
      problemType: 'expenditure-refused',
      code: 'BILL_INTAKE_OVERRIDE_APPROVER_REQUIRED',
    })
    const after = overrideRefused({ ...review(1), heldForReview: true }, refused)
    expect(after?.review?.heldForReview).toBe(false)
    expect(after?.key).toBe('billIntake.duplicate.approverRequired')
  })

  it('round 20 L-4: offers nothing while a required session is still loading', () => {
    expect(mayDeclareDifferent(null)).toBe(false)
    expect(sessionKnown(null)).toBe(false)
    expect(sessionKnown(MANAGER as Entitlements)).toBe(true)
  })

  it('round 21 F-2: held-for-review only while the review holds the one held-against copy', () => {
    expect(reviewAfterRefusal(null, possible(['b-0', 'b-1'], 'INV-1', true, true))?.heldForReview).toBe(false)
    const held = reviewAfterRefusal(null, possible(['b-0'], 'INV-1', true, true))
    expect(held?.heldForReview).toBe(true)
    // The next answer names a second bill; the review now lists both, so it is no submission.
    expect(reviewAfterRefusal(held, possible(['b-1'], 'INV-1', true, true))?.heldForReview).toBe(false)
  })

  it('round 18: offers the decision only to a session holding invoice.approve', () => {
    const session = (permissions: string[]) => ({ ...MANAGER, permissions }) as Entitlements
    expect(mayDeclareDifferent(session(['invoice.read', 'invoice.approve']))).toBe(true)
    expect(mayDeclareDifferent(session(['invoice.read', 'invoice.payment.manage']))).toBe(false)
  })
})
