import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { ApiError } from '../api'
import { describeApiFailure, isPermissionDenied } from './apiFailure'

const refusal = (feature: unknown) =>
  new ApiError({
    status: 403,
    problemType: 'plan-feature-not-included',
    code: 'PLAN_FEATURE_NOT_INCLUDED',
    correlationId: 'corr-8',
    problem: { feature, detail: 'Your plan does not include trade documents.' },
  })

const sentence = (error: unknown) => {
  const message = describeApiFailure(error)
  return i18n.t(message.key, message.values)
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

// Business Rules PL-8: 403 plan-feature-not-included, worded by its `feature` key in the reader's
// language, never as "ask an administrator", which nobody in the company can fix.
describe('a refusal for a feature the plan does not include', () => {
  it('names the feature, and says what was made before stays', () => {
    expect(sentence(refusal('recurringBills'))).toBe(
      'Your plan does not include recurring bills. What you made before can still be viewed, downloaded and exported.',
    )
    expect(sentence(refusal('tradeDocuments'))).toContain('trade documents')
    expect(describeApiFailure(refusal('tradeDocuments')).reference).toBe('corr-8')
  })

  it('says it in Arabic, never the English detail', async () => {
    await i18n.changeLanguage('ar')
    const text = sentence(refusal('selfBilling'))
    expect(text).toContain('الفوترة الذاتية')
    expect(text).not.toContain('Your plan')
  })

  it('still reads as the plan for a key this build does not know', () => {
    expect(sentence(refusal('somethingNew'))).toBe(
      'Your plan does not include this. What you made before can still be viewed, downloaded and exported.',
    )
  })

  it('is not a permission refusal', () => {
    expect(isPermissionDenied(refusal('approvals'))).toBe(false)
    expect(sentence(refusal('approvals'))).not.toContain('permission')
  })
})
