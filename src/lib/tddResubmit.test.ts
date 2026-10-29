import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/en.json'
import ar from '../i18n/locales/ar.json'
import { ApiError, NetworkError } from '../api'
import { groupResubmitOutcome, tddResubmitRefusalKey } from './tddResubmit'

describe('tddResubmitRefusalKey', () => {
  it('words a held correction by its code, whatever the held reason', () => {
    for (const held_reason of ['C5_DIFFERS', 'C5_UNREADABLE', 'WINDOW_BOUND']) {
      const held = new ApiError({
        status: 409,
        problemType: 'resource-conflict',
        code: 'TDD_CORRECTION_HELD',
        problem: { held_correction_id: '9f0c1e2d-0000-4000-8000-000000000001', held_reason },
      })
      expect(tddResubmitRefusalKey(held), held_reason).toBe('tddResubmit.refused.held')
    }
  })

  it('leaves every other failure to the shared text', () => {
    expect(
      tddResubmitRefusalKey(new ApiError({ status: 409, problemType: 'resource-conflict', code: null })),
    ).toBeNull()
    expect(
      tddResubmitRefusalKey(new ApiError({ status: 409, problemType: 'x', code: 'DUPLICATE_IDEMPOTENCY' })),
    ).toBeNull()
    expect(tddResubmitRefusalKey(new NetworkError('offline'))).toBeNull()
  })

  it('has the sentence in English and Arabic', () => {
    expect(en.tddResubmit.refused.held).toMatch(/Nothing was sent/)
    expect(ar.tddResubmit.refused.held).not.toMatch(/[A-Za-z]/)
  })
})

describe('the partly-held sentence', () => {
  it('exists in English and Arabic and names both counts', () => {
    for (const sentence of [en.tddResubmit.refused.partlyHeld, ar.tddResubmit.refused.partlyHeld]) {
      expect(sentence).toContain('{{sent}}')
      expect(sentence).toContain('{{held}}')
    }
  })
})

// Backend 69c878d73: TddSenderStandingHeldException, answered through TddCorrectionProblems on both
// resubmit routes as a 409 with `code` (and `original_correlation_id` only for the eligible hold).
describe('sender-standing refusals of a resubmit', () => {
  const refusal = (code: string, problem: Record<string, unknown> = {}) =>
    new ApiError({ status: 409, problemType: 'resource-conflict', code, problem })

  it('words each standing code by its own sentence', () => {
    expect(tddResubmitRefusalKey(refusal('SENDER_PARTICIPANT_NOT_REGISTERED'))).toBe(
      'tddResubmit.refused.senderNotRegistered',
    )
    expect(tddResubmitRefusalKey(refusal('SENDER_PARTICIPANT_CLAIM_CONFLICT'))).toBe(
      'tddResubmit.refused.senderClaimConflict',
    )
    expect(tddResubmitRefusalKey(refusal('SENDER_STANDING_UNKNOWN'))).toBe(
      'tddResubmit.refused.senderStandingUnknown',
    )
    expect(
      tddResubmitRefusalKey(
        refusal('SENDER_NOT_REGISTERED_HISTORICAL_ELIGIBLE', {
          original_correlation_id: '7c0e1d2a-0000-4000-8000-000000000009',
        }),
      ),
    ).toBe('tddResubmit.refused.historicalEligible')
  })

  it('tells the eligible hold from a refusal: held for a decision, linked to the original report', () => {
    const held = en.tddResubmit.refused.historicalEligible
    expect(held).toMatch(/held for a decision at Fawtir/)
    expect(held).toMatch(/pending guidance from the Tax Authority/)
    expect(held).toMatch(/original report/)
    expect(held).toMatch(/Nothing is sent until Fawtir decides/)
    // Once the owner enables the release, the same request succeeds (#640 review M1).
    expect(held).not.toMatch(/will not send/)
    expect(ar.tddResubmit.refused.historicalEligible).not.toMatch(/لن تُرسله/)
    expect(en.tddResubmit.refused.senderNotRegistered).not.toMatch(/held/)
  })

  it('has every sentence in English and Arabic, with no code on screen', () => {
    const keys = [
      'historicalEligible',
      'senderNotRegistered',
      'senderClaimConflict',
      'senderStandingUnknown',
      'partlyRefused',
      'allRefused',
      'restNotSent',
    ] as const
    for (const key of keys) {
      expect(en.tddResubmit.refused[key], key).not.toMatch(/SENDER_|_/)
      // Peppol stays in Latin script, as it does across the Arabic locale; placeholders are tokens.
      const arabic = ar.tddResubmit.refused[key].replace(/Peppol|\{\{\w+\}\}/g, '')
      expect(arabic, key).not.toMatch(/[A-Za-z]/)
    }
    for (const sentence of [en.tddResubmit.refused.partlyRefused, ar.tddResubmit.refused.partlyRefused]) {
      expect(sentence).toContain('{{sent}}')
      expect(sentence).toContain('{{held}}')
      expect(sentence).toContain('{{refused}}')
    }
  })
})

describe('groupResubmitOutcome', () => {
  const HELD = 'tddResubmit.refused.held'
  const ELIGIBLE = 'tddResubmit.refused.historicalEligible'
  const NOT_REGISTERED = 'tddResubmit.refused.senderNotRegistered'

  it('says nothing when every row went', () => {
    expect(groupResubmitOutcome(3, [], false)).toEqual([])
  })

  it('reads a lone refusal as its own sentence', () => {
    expect(groupResubmitOutcome(0, [HELD], false)).toEqual([{ key: HELD }])
    expect(groupResubmitOutcome(0, [NOT_REGISTERED], false)).toEqual([{ key: NOT_REGISTERED }])
  })

  it('keeps the held counts when only decision holds were met, the eligible hold among them', () => {
    expect(groupResubmitOutcome(0, [HELD, ELIGIBLE], false)).toEqual([
      { key: 'tddResubmit.refused.allHeld', values: { held: '2' } },
    ])
    expect(groupResubmitOutcome(1, [ELIGIBLE], false)).toEqual([
      { key: 'tddResubmit.refused.partlyHeld', values: { sent: '1', held: '1' } },
    ])
  })

  it('counts standing refusals apart from holds and says the standing reason once', () => {
    expect(groupResubmitOutcome(1, [NOT_REGISTERED, HELD, NOT_REGISTERED], false)).toEqual([
      { key: 'tddResubmit.refused.partlyRefused', values: { sent: '1', held: '1', refused: '2' } },
      { key: NOT_REGISTERED },
    ])
  })

  it('drops the zero counts when every row was refused for standing', () => {
    expect(groupResubmitOutcome(0, [NOT_REGISTERED, NOT_REGISTERED, NOT_REGISTERED], false)).toEqual([
      { key: 'tddResubmit.refused.allRefused', values: { refused: '3' } },
      { key: NOT_REGISTERED },
    ])
  })

  it('leads into the stopping failure with what had already happened', () => {
    expect(groupResubmitOutcome(0, [], true)).toEqual([])
    expect(groupResubmitOutcome(1, [], true)).toEqual([
      { key: 'tddResubmit.refused.partlySent', values: { sent: '1', held: '0' } },
    ])
    expect(groupResubmitOutcome(0, [NOT_REGISTERED], true)).toEqual([
      { key: 'tddResubmit.refused.allRefused', values: { refused: '1' } },
      { key: NOT_REGISTERED },
      { key: 'tddResubmit.refused.restNotSent' },
    ])
  })
})

describe('a refusal code named like an Object.prototype member', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('is no resubmit refusal: %j', (code) => {
    expect(
      tddResubmitRefusalKey(new ApiError({ status: 409, problemType: 'resource-conflict', code })),
    ).toBeNull()
  })
})
