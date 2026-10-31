import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { ApiError } from '../api'
import { posRefusalKey } from './posRefusals'

const coded = (status: number, code: string, problem: Record<string, unknown> = {}) =>
  new ApiError({ status, problemType: null, code, problem: { code, ...problem } })

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('POS_REFUND_NOTHING_TO_PAY_BACK (backend fix/refund-edge-cases, probe zeroPieces)', () => {
  it('is worded by its code at 422', () => {
    const error = coded(422, 'POS_REFUND_NOTHING_TO_PAY_BACK', { lines: [1], expected: 0 })
    expect(posRefusalKey(error)).toBe('pos.refusal.POS_REFUND_NOTHING_TO_PAY_BACK')
  })
})

describe('the new till sentences in Arabic', () => {
  it.each(['pos.refusal.POS_REFUND_NOTHING_TO_PAY_BACK', 'pos.warning.POS_REFUND_PIECE_CARRIED'])(
    '%s',
    async (key) => {
      await i18n.changeLanguage('ar')
      expect(i18n.exists(key, { lng: 'ar', fallbackLng: false })).toBe(true)
      expect(i18n.t(key, { line: 1 })).not.toMatch(/[A-Za-z]{4,}/)
    },
  )
})
