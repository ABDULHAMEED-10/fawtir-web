import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/en.json'
import ar from '../i18n/locales/ar.json'
import { ApiError, NetworkError } from '../api'
import { tddResubmitRefusalKey } from './tddResubmit'

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
