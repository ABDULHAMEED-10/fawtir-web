import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/errors'
import {
  overrideOf,
  overrideRefused,
  reviewAfterRefusal,
  type DuplicateReview,
} from './billDuplicateOverride'

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
  reason,
  problem: null,
})
const possible = (ids: string[], number = 'INV-1', listed = true) =>
  new ApiError({
    status: 409,
    problemType: 'resource-conflict',
    code: 'BILL_INTAKE_POSSIBLE_DUPLICATE',
    problem: {
      duplicateOf: bill(ids[0], number),
      ...(listed ? { duplicates: ids.map((id) => bill(id, number)) } : {}),
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

  it('keeps one bill on the older field, with no reason', () => {
    expect(overrideOf(review(1, ''))).toEqual({ notDuplicateOf: 'b-0' })
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
})
